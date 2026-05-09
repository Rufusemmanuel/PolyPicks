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
  code?: string;
  data?: unknown;
  error?: string;
  details?: unknown;
};

const DEPOSIT_WALLET_REQUIRED_MESSAGE =
  'This account must trade through a Polymarket deposit wallet. Please deploy/fund your deposit wallet before trading.';

const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

const normalizeOrderErrorMessage = (message: string, details?: unknown) => {
  const haystack = `${message} ${details ? JSON.stringify(details) : ''}`;
  if (/maker address not allowed|deposit wallet flow/i.test(haystack)) {
    return DEPOSIT_WALLET_REQUIRED_MESSAGE;
  }
  return message;
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
  options?: { force?: boolean },
) => {
  const address = await signer.getAddress();
  if (!options?.force) {
    const statusRes = await fetch(`/api/polymarket/auth/status?address=${address}`, {
      cache: 'no-store',
    });
    const statusData = await safeJson<{ ok?: boolean }>(statusRes);
    if (statusRes.ok && statusData?.ok) return true;
  }
  const l1Headers = await createL1Headers(
    signer as Parameters<typeof createL1Headers>[0],
    chainId,
  );
  const initRes = await fetch('/api/polymarket/auth/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...l1Headers,
      forceRefresh: options?.force === true,
    }),
  });
  const initData = await safeJson<{ ok?: boolean; error?: string }>(initRes);
  if (!initRes.ok || !initData?.ok) {
    throw new Error(initData?.error ?? 'Unable to initialize trading session.');
  }
  return true;
};

const createAndPostOrderOnce = async ({
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
  forceSessionRefresh = false,
}: CreateAndPostArgs & { forceSessionRefresh?: boolean }): Promise<OrderResponse> => {
  let execution = executionInput;
  await ensureTradingSession(signer, TRADE_CONFIG.chainId, { force: forceSessionRefresh });
  const authAddress = await signer.getAddress();
  const builderCode = await fetchBuilderCode();
  assertBuilderCodeReady(builderCode);
  console.info('[polymarket]', {
    event: 'order_client_auth_context',
    component: 'trade_service',
    signatureType,
    authAddress,
    signer: authAddress,
    funderAddress,
    tokenIdPrefix: tokenId.slice(0, 12),
    forceSessionRefresh,
  });
  const clobClient = createClobClient({
    signer,
    signatureType,
    proxyWalletAddress: funderAddress,
    host: TRADE_CONFIG.clobHost,
    builderConfig: { builderCode },
  });
  console.info('[polymarket]', {
    event: signatureType === 3 ? 'signing_clob_poly_1271_order' : 'signing_clob_order',
    component: 'trade_service',
    signatureType,
    authAddress,
    funderAddress,
    tokenIdPrefix: tokenId.slice(0, 12),
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
  if (signatureType === 3) {
    if (
      normalized.signatureType !== 3 ||
      !sameAddress(normalized.maker, funderAddress) ||
      !sameAddress(normalized.signer, funderAddress) ||
      normalized.signature.length <= 132
    ) {
      console.error('[polymarket]', {
        event: 'deposit_wallet_order_shape_invalid',
        component: 'trade_service',
        expectedSignatureType: 3,
        actualSignatureType: normalized.signatureType,
        maker: normalized.maker,
        signer: normalized.signer,
        funderAddress,
        signatureType: normalized.signatureType,
        signatureLength: normalized.signature.length,
      });
      throw new Error('Deposit wallet order was not signed as POLY_1271.');
    }
  }
  console.info('[polymarket]', {
    event: 'signed_order_ready',
    component: 'trade_service',
    builderCode,
    finalBuilder: normalized.builder,
    orderType: execution,
    tradeMode,
    signatureType: normalized.signatureType,
    maker: normalized.maker,
    signer: normalized.signer,
    depositWalletAddress: signatureType === 3 ? funderAddress : null,
    authAddress,
    funderAddress,
    signatureLength: normalized.signature.length,
  });
  const res = await fetch('/api/polymarket/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tradeMode,
      execution,
      order: normalized,
      signatureType,
      funderAddress,
      authAddress,
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
      code: (data as { code?: string })?.code,
      error: normalizeOrderErrorMessage(errorText, details),
      ...(details ? { details } : {}),
      data,
    };
  }
  return { ok: true, data };
};

export const createAndPostOrder = async (
  args: CreateAndPostArgs,
): Promise<OrderResponse> => {
  const first = await createAndPostOrderOnce(args);
  if (first.ok || first.code !== 'AUTH_INVALID_SESSION') {
    return first;
  }
  console.info('[polymarket]', {
    event: 'retrying_after_invalid_l2_auth',
    component: 'trade_service',
    signatureType: args.signatureType,
    funderAddress: args.funderAddress,
  });
  return createAndPostOrderOnce({ ...args, forceSessionRefresh: true });
};
