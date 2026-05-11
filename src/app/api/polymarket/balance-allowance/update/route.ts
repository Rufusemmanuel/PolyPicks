import { NextResponse, type NextRequest } from 'next/server';
import { getSession, isSessionExpired } from '@/lib/server/session';
import {
  AssetType,
  Chain,
  ClobClient,
  type ApiKeyCreds,
  type BalanceAllowanceParams,
  type SignatureTypeV2,
} from '@polymarket/clob-client-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CLOB_HOST = process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';
const ASSET_TYPES = new Set(['COLLATERAL', 'CONDITIONAL']);
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

const normalizeAddress = (value: unknown) =>
  typeof value === 'string' && ADDRESS_RE.test(value) ? value : null;

const hasCompleteL2Creds = (session: Awaited<ReturnType<typeof getSession>>) =>
  Boolean(session.l2?.apiKey && session.l2.secret && session.l2.passphrase);

const createAddressOnlySigner = (address: string) => ({
  getAddress: async () => address,
  _signTypedData: async () => {
    throw new Error('This signer only supports CLOB L2 auth headers.');
  },
});

const buildClobClient = ({
  walletAddress,
  creds,
  signatureType,
  tradingWalletAddress,
}: {
  walletAddress: string;
  creds: ApiKeyCreds;
  signatureType: number;
  tradingWalletAddress: string;
}) =>
  new ClobClient({
    host: CLOB_HOST,
    chain: Chain.POLYGON,
    signer: createAddressOnlySigner(walletAddress),
    creds,
    signatureType: signatureType as SignatureTypeV2,
    funderAddress: tradingWalletAddress,
    retryOnError: true,
  });

const normalizeClobResult = (value: unknown) => {
  if (value && typeof value === 'object') {
    const candidate = value as { error?: unknown; status?: unknown; data?: unknown };
    if (candidate.error != null || candidate.status != null) {
      return candidate;
    }
  }
  return null;
};

const isInvalidL2AuthResult = (value: unknown) => {
  const result = normalizeClobResult(value);
  const status = Number(result?.status ?? 0);
  const errorText = String(result?.error ?? result?.data ?? '').toLowerCase();
  return (
    status === 401 ||
    /unauthorized|invalid api key|invalid authorization|api key/.test(errorText)
  );
};

const parseBody = async (request: NextRequest) => {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export async function POST(request: NextRequest) {
  const rawHeaders = Array.from(request.headers.keys());
  if (rawHeaders.some((key) => key.toLowerCase().startsWith('poly_'))) {
    return NextResponse.json(
      { ok: false, error: 'Unexpected auth headers.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const body = await parseBody(request);
  if (!body) {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const assetType =
    typeof body.assetType === 'string'
      ? body.assetType
      : typeof body.asset_type === 'string'
        ? body.asset_type
        : 'COLLATERAL';
  const tokenId =
    typeof body.tokenId === 'string'
      ? body.tokenId
      : typeof body.token_id === 'string'
        ? body.token_id
        : null;
  const signatureType = Number(body.signatureType ?? body.signature_type);
  const tradingWalletAddress = normalizeAddress(
    body.tradingWalletAddress ?? body.funderAddress ?? body.funder,
  );
  const connectedEoa = normalizeAddress(body.connectedEoa ?? body.authAddress);
  if (!ASSET_TYPES.has(assetType)) {
    return NextResponse.json(
      { ok: false, error: 'assetType must be COLLATERAL or CONDITIONAL.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!Number.isInteger(signatureType) || (signatureType !== 2 && signatureType !== 3)) {
    return NextResponse.json(
      { ok: false, error: 'signatureType must be 2 for proxy/Safe or 3 for deposit wallet.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!tradingWalletAddress) {
    return NextResponse.json(
      { ok: false, error: 'tradingWalletAddress is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Server session not configured.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const expired = isSessionExpired(session);
  const sessionInitialized = Boolean(
    hasCompleteL2Creds(session) && session.walletAddress && !expired,
  );
  console.info('[polymarket]', {
    event: 'balance_allowance_update_requested',
    component: 'balance_allowance',
    connectedEoa: connectedEoa ?? session.walletAddress ?? null,
    sessionInitialized,
    signatureType,
    tradingWalletAddress,
    hasApiCreds: hasCompleteL2Creds(session),
  });
  if (!sessionInitialized) {
    if (expired) session.destroy();
    return NextResponse.json(
      {
        ok: false,
        error: 'Trading session is not initialized. Reconnect your wallet and approve the trading session prompt.',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (connectedEoa && session.walletAddress && !sameAddress(connectedEoa, session.walletAddress)) {
    return NextResponse.json(
      { ok: false, error: 'Connected wallet does not match active trading session.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (
    session.tradingWalletAddress &&
    !sameAddress(session.tradingWalletAddress, tradingWalletAddress)
  ) {
    return NextResponse.json(
      { ok: false, error: 'Trading wallet does not match active trading session.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (session.signatureType && session.signatureType !== signatureType) {
    return NextResponse.json(
      { ok: false, error: 'Signature type does not match active trading session.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  session.tradingWalletAddress = tradingWalletAddress;
  session.signatureType = signatureType;
  await session.save();

  const allowanceParams: BalanceAllowanceParams = {
    asset_type:
      assetType === AssetType.CONDITIONAL ? AssetType.CONDITIONAL : AssetType.COLLATERAL,
    ...(tokenId ? { token_id: tokenId } : {}),
  };
  const creds: ApiKeyCreds = {
    key: session.l2!.apiKey,
    secret: session.l2!.secret,
    passphrase: session.l2!.passphrase,
  };

  try {
    const clobClient = buildClobClient({
      walletAddress: session.walletAddress!,
      creds,
      signatureType,
      tradingWalletAddress,
    });
    const update = await clobClient.updateBalanceAllowance(allowanceParams);
    if (isInvalidL2AuthResult(update)) {
      console.error('[polymarket]', {
        event: 'balance_allowance_update_auth_invalid',
        component: 'balance_allowance',
        signatureType,
        assetType,
        tradingWalletAddress,
        connectedEoa: session.walletAddress,
        hasApiCreds: hasCompleteL2Creds(session),
      });
      return NextResponse.json(
        {
          ok: false,
          code: 'AUTH_INVALID_SESSION',
          error: 'CLOB API credentials are invalid. Reinitializing trading session.',
          details: update,
        },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const updateError = normalizeClobResult(update);
    if (updateError) {
      console.error('[polymarket]', {
        event: 'balance_allowance_update_rejected',
        component: 'balance_allowance',
        body: updateError,
        signatureType,
        assetType,
        tradingWalletAddress,
        connectedEoa: session.walletAddress,
        hasApiCreds: hasCompleteL2Creds(session),
      });
      return NextResponse.json(
        { ok: false, error: 'Balance allowance update failed.', details: updateError },
        {
          status: Number(updateError.status) || 502,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const balanceAllowance = await clobClient.getBalanceAllowance(allowanceParams);
    if (isInvalidL2AuthResult(balanceAllowance)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'AUTH_INVALID_SESSION',
          error: 'CLOB API credentials are invalid. Reinitializing trading session.',
          details: balanceAllowance,
        },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const verifyError = normalizeClobResult(balanceAllowance);
    if (verifyError) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Balance allowance verification failed.',
          details: verifyError,
        },
        {
          status: Number(verifyError.status) || 502,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    console.info('[polymarket]', {
      event: 'balance_allowance_updated',
      component: 'balance_allowance',
      signatureType,
      assetType,
      tradingWalletAddress,
      connectedEoa: session.walletAddress,
      hasApiCreds: hasCompleteL2Creds(session),
      tokenId: tokenId ? `${tokenId.slice(0, 12)}...` : null,
    });
    return NextResponse.json({
      ok: true,
      data: {
        update,
        balanceAllowance,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[polymarket]', {
      event: 'balance_allowance_update_failed',
      component: 'balance_allowance',
      error: error instanceof Error ? error.message : String(error),
      signatureType,
      assetType,
      tradingWalletAddress,
      connectedEoa: session.walletAddress,
      hasApiCreds: hasCompleteL2Creds(session),
    });
    return NextResponse.json(
      { ok: false, error: 'Balance allowance update failed.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
