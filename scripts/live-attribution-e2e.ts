import {
  Chain,
  ClobClient,
  OrderType,
  Side,
  isV2Order,
  orderToJsonV2,
  type SignedOrder,
  type TickSize,
} from '@polymarket/clob-client-v2';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

for (const envFile of ['.env.local', '.env']) {
  if (!existsSync(envFile)) continue;
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

const requireEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const host = process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';
const builderCode = requireEnv('POLYMARKET_BUILDER_CODE');
if (!/^0x[0-9a-fA-F]{64}$/.test(builderCode)) {
  throw new Error('POLYMARKET_BUILDER_CODE must be a bytes32 hex value.');
}

const amount = Number(process.env.POLYMARKET_TEST_USDC_AMOUNT ?? '1');
if (!Number.isFinite(amount) || amount <= 0 || amount > 5) {
  throw new Error('POLYMARKET_TEST_USDC_AMOUNT must be > 0 and <= 5.');
}

const account = privateKeyToAccount(requireEnv('POLYMARKET_PRIVATE_KEY') as Hex);
const walletClient = createWalletClient({
  account,
  chain: polygon,
  transport: http(process.env.POLYGON_RPC_URL ?? process.env.NEXT_PUBLIC_POLYGON_RPC_URL),
});

const client = new ClobClient({
  host,
  chain: Chain.POLYGON,
  signer: walletClient,
  creds: {
    key: requireEnv('POLYMARKET_API_KEY'),
    secret: requireEnv('POLYMARKET_SECRET'),
    passphrase: requireEnv('POLYMARKET_PASSPHRASE'),
  },
  signatureType: Number(process.env.POLYMARKET_SIGNATURE_TYPE ?? '0') as never,
  funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS,
  builderConfig: { builderCode },
  useServerTime: true,
  retryOnError: true,
  throwOnError: false,
});

type CapturedPost = {
  url: string;
  data: unknown;
  response?: unknown;
};

const capturedPosts: CapturedPost[] = [];
const rawPost = (client as unknown as { post: (...args: unknown[]) => Promise<unknown> }).post;
(client as unknown as { post: (...args: unknown[]) => Promise<unknown> }).post = async (
  url: unknown,
  init: unknown,
  throwOnError?: unknown,
) => {
  const captured: CapturedPost = {
    url: String(url),
    data: init && typeof init === 'object' && 'data' in init ? (init as { data: unknown }).data : null,
  };
  capturedPosts.push(captured);
  const response = await rawPost.call(client, url, init, throwOnError);
  captured.response = response;
  return response;
};

const selectToken = async () => {
  if (process.env.POLYMARKET_TEST_TOKEN_ID) {
    return {
      tokenID: process.env.POLYMARKET_TEST_TOKEN_ID,
      tickSize: (process.env.POLYMARKET_TEST_TICK_SIZE ?? '0.01') as TickSize,
      negRisk: process.env.POLYMARKET_TEST_NEG_RISK === '1',
      price: process.env.POLYMARKET_TEST_PRICE
        ? Number(process.env.POLYMARKET_TEST_PRICE)
        : undefined,
      source: 'env',
    };
  }

  if (process.env.POLYMARKET_LIVE_TEST_ALLOW_AUTO_MARKET !== '1') {
    throw new Error(
      'Set POLYMARKET_TEST_TOKEN_ID or POLYMARKET_LIVE_TEST_ALLOW_AUTO_MARKET=1 before placing a live test order.',
    );
  }

  const markets = await client.getSamplingSimplifiedMarkets();
  for (const market of markets.data as Array<Record<string, unknown>>) {
    const tokens = market.tokens as Array<{ token_id?: string; price?: number }> | undefined;
    const tokenID = tokens?.find((token) => token.token_id)?.token_id;
    if (!tokenID) continue;
    try {
      const book = await client.getOrderBook(tokenID);
      const ask = book.asks?.[0]?.price ? Number(book.asks[0].price) : NaN;
      if (Number.isFinite(ask) && ask > 0.01 && ask < 0.99) {
        return {
          tokenID,
          tickSize: book.tick_size as TickSize,
          negRisk: Boolean(book.neg_risk),
          price: ask,
          source: 'auto',
          market: {
            condition_id: market.condition_id,
            question: market.question,
            tokenID,
          },
        };
      }
    } catch {
      continue;
    }
  }
  throw new Error('Unable to auto-select a market with a usable ask.');
};

const main = async () => {
  const selected = await selectToken();
  const price =
    selected.price ??
    Number((await client.getOrderBook(selected.tokenID)).asks?.[0]?.price);
  if (!Number.isFinite(price) || price <= 0 || price >= 1) {
    throw new Error('Unable to resolve a valid marketable test price.');
  }

  const preSignOrder = {
    tokenID: selected.tokenID,
    side: Side.BUY,
    amount,
    price,
    orderType: OrderType.FAK as OrderType.FAK,
    builderCode,
  };

  const signedOrder = await client.createMarketOrder(preSignOrder, {
    tickSize: selected.tickSize,
    negRisk: selected.negRisk,
  });
  if (!isV2Order(signedOrder)) throw new Error('SDK produced a non-V2 signed order.');
  if (signedOrder.builder.toLowerCase() !== builderCode.toLowerCase()) {
    throw new Error('SDK stripped or changed builder attribution during signing.');
  }

  const finalPayload = orderToJsonV2(
    signedOrder,
    requireEnv('POLYMARKET_API_KEY'),
    OrderType.FAK,
  );
  if (finalPayload.order.builder.toLowerCase() !== builderCode.toLowerCase()) {
    throw new Error('SDK serialization stripped or changed order.builder.');
  }

  const exchangeResponse = await client.postOrder(signedOrder as SignedOrder, OrderType.FAK);
  const builderTrades = await client.getBuilderTrades({ builder_code: builderCode });

  const responseOrderId =
    exchangeResponse && typeof exchangeResponse === 'object' && 'orderID' in exchangeResponse
      ? String((exchangeResponse as { orderID?: unknown }).orderID)
      : null;
  const responseTradeIds =
    exchangeResponse && typeof exchangeResponse === 'object' && 'tradeIDs' in exchangeResponse
      ? ((exchangeResponse as { tradeIDs?: unknown }).tradeIDs as unknown[])
      : [];
  const matchedBuilderTrades = builderTrades.trades.filter((trade) => {
    if (responseTradeIds?.some((id) => String(id) === trade.id)) return true;
    if (responseOrderId && trade.takerOrderHash === responseOrderId) return true;
    return false;
  });

  const report = {
    ok: true,
    selected,
    checks: {
      preSignHasBuilderCode: preSignOrder.builderCode === builderCode,
      signedHasBuilder: signedOrder.builder.toLowerCase() === builderCode.toLowerCase(),
      finalPayloadHasBuilder: finalPayload.order.builder.toLowerCase() === builderCode.toLowerCase(),
      capturedHttpPayloadHasBuilder:
        capturedPosts.some((post) => {
          const data = post.data as { order?: { builder?: string } } | null;
          return data?.order?.builder?.toLowerCase() === builderCode.toLowerCase();
        }),
      exchangeAccepted:
        exchangeResponse &&
        typeof exchangeResponse === 'object' &&
        (exchangeResponse as { success?: unknown }).success !== false,
      matchedTradeAttributed: matchedBuilderTrades.length > 0,
    },
    preSignOrder,
    signedOrder,
    finalPayload,
    capturedPosts,
    exchangeResponse,
    builderTrades: {
      count: builderTrades.count,
      next_cursor: builderTrades.next_cursor,
      matched: matchedBuilderTrades,
      latest: builderTrades.trades.slice(0, 5),
    },
  };

  mkdirSync('.tmp-polymarket', { recursive: true });
  const reportPath = join(
    '.tmp-polymarket',
    `live-attribution-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, checks: report.checks }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
