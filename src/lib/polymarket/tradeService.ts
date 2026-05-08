'use client';

import {
  ClobClient,
  OrderType,
  Side,
  createL1Headers,
} from '@polymarket/clob-client-v2';
import { normalizeSignedOrder } from '@/lib/polymarket/normalizeSignedOrder';
import {
  assertBuilderCodeReady,
  assertSignedOrderBuilder,
} from '@/lib/polymarket/assertBuilderAttribution';
import { createClobClient } from './clobClientFactory';
import { TRADE_CONFIG } from './tradeConfig';
import type { ViemSigner } from '@/lib/wallet/viemSigner';

type TickSizeParam = NonNullable<Parameters<ClobClient['createOrder']>[1]>['tickSize'];

type CreateAndPostArgs = {
  signer: ViemSigner;
  tokenId: string;
  side: Side;
  price: number;
  size: number | null;
  amount: number | null;
  tradeMode: 'market' | 'limit';
  execution: OrderType;
  signatureType: number;
  funderAddress: string;
  tickSize?: number | string | null;
  negRisk?: boolean | null;
  expiration?: number | null;
  clientMeta?: Record<string, unknown>;
};

type OrderResponse = {
  ok: boolean;
  data?: unknown;
  error?: string;
  details?: unknown;
};

const safeJson = async <T,>(res: Response): Promise<T | null> => {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const fetchBuilderCode = async () => {
  const res = await fetch('/api/polymarket/config', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await safeJson<{ ok?: boolean; builderCode?: string; error?: string }>(res);
  if (!res.ok || !data?.ok || !data.builderCode) {
    throw new Error(data?.error ?? 'Polymarket builder code is not configured.');
  }
  return assertBuilderCodeReady(data.builderCode);
};

export const ensureTradingSession = async (
  signer: ViemSigner,
  chainId = TRADE_CONFIG.chainId,
) => {
  const address = await signer.getAddress();
  const statusRes = await fetch(`/api/polymarket/auth/status?address=${address}`);
  const statusData = await safeJson<{ ok?: boolean }>(statusRes);
  if (statusRes.ok && statusData?.ok) return true;
  const l1Headers = await createL1Headers(
    signer as Parameters<typeof createL1Headers>[0],
    chainId,
  );
  const initRes = await fetch('/api/polymarket/auth/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(l1Headers),
  });
  const initData = await safeJson<{ ok?: boolean; error?: string }>(initRes);
  if (!initRes.ok || !initData?.ok) {
    throw new Error(initData?.error ?? 'Unable to initialize trading session.');
  }
  return true;
};

export const createAndPostOrder = async ({
  signer,
  tokenId,
  side,
  price,
  size,
  amount,
  tradeMode,
  execution: executionInput,
  signatureType,
  funderAddress,
  tickSize,
  negRisk,
  expiration,
  clientMeta,
}: CreateAndPostArgs): Promise<OrderResponse> => {
  let execution = executionInput;
  await ensureTradingSession(signer);
  const builderCode = await fetchBuilderCode();
  assertBuilderCodeReady(builderCode);
  const clobClient = createClobClient({
    signer,
    signatureType,
    proxyWalletAddress: funderAddress,
    host: TRADE_CONFIG.clobHost,
    builderConfig: { builderCode },
  });

  const tickSizeValue =
    typeof tickSize === 'number'
      ? (tickSize.toString() as TickSizeParam)
      : tickSize != null
        ? (tickSize as TickSizeParam)
        : await (clobClient as ClobClient).getTickSize(tokenId);
  const negRiskValue =
    typeof negRisk === 'boolean'
      ? negRisk
      : await (clobClient as ClobClient).getNegRisk(tokenId);

  const isMarketOrder = tradeMode === 'market';
  if (isMarketOrder && execution !== OrderType.FOK && execution !== OrderType.FAK) {
    const fallback = OrderType.FOK;
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[trade] invalid execution for market order, defaulting to FOK');
    }
    execution = fallback;
  }
  if (!isMarketOrder && execution !== OrderType.GTC && execution !== OrderType.GTD) {
    const fallback = OrderType.GTC;
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[trade] invalid execution for limit order, defaulting to GTC');
    }
    execution = fallback;
  }

  if (isMarketOrder && (amount == null || amount <= 0)) {
    throw new Error('Market order amount is required.');
  }
  if (!isMarketOrder && (size == null || size <= 0)) {
    throw new Error('Limit order size is required.');
  }

  if (side === Side.SELL) {
    return {
      ok: false,
      error: 'Sell is disabled on this platform.',
    };
  }

  const signedOrder = isMarketOrder
    ? await clobClient.createMarketOrder({
        tokenID: tokenId,
        side,
        price,
        amount: amount ?? 0,
        builderCode,
        orderType:
          execution === OrderType.FOK || execution === OrderType.FAK
            ? execution
            : undefined,
      })
    : await clobClient.createOrder(
        {
          tokenID: tokenId,
          side,
          price,
          size: size ?? 0,
          builderCode,
          ...(expiration ? { expiration } : {}),
        },
        { tickSize: tickSizeValue, negRisk: negRiskValue },
      );

  const normalized = normalizeSignedOrder(signedOrder);
  assertSignedOrderBuilder(normalized.builder, builderCode);
  if (process.env.NODE_ENV !== 'production') {
    console.info('[polymarket] signed order attribution', {
      builderCode,
      finalBuilder: normalized.builder,
      orderType: execution,
      tradeMode,
    });
  }
  const res = await fetch('/api/polymarket/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tradeMode,
      execution,
      order: normalized,
      signatureType,
      funderAddress,
      ...(clientMeta ? { clientMeta } : {}),
    }),
  });
  const data = await safeJson(res);

  if (!res.ok) {
    const details = (data as { details?: unknown })?.details;
    const errorText =
      (data as { error?: string })?.error ??
      (data as { message?: string })?.message ??
      'Order rejected.';
    return {
      ok: false,
      error: errorText,
      ...(details ? { details } : {}),
      data,
    };
  }
  return { ok: true, data };
};
