import { NextResponse, type NextRequest } from 'next/server';
import { getSession, isSessionExpired } from '@/lib/server/session';
import { buildL2Headers } from '@/lib/server/polymarketHeaders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CLOB_HOST = process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';
const ENDPOINT = '/balance-allowance/update';
const ASSET_TYPES = new Set(['COLLATERAL', 'CONDITIONAL']);
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

const normalizeAddress = (value: unknown) =>
  typeof value === 'string' && ADDRESS_RE.test(value) ? value : null;

const hasCompleteL2Creds = (session: Awaited<ReturnType<typeof getSession>>) =>
  Boolean(session.l2?.apiKey && session.l2.secret && session.l2.passphrase);

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
  if (!Number.isInteger(signatureType) || signatureType < 1 || signatureType > 3) {
    return NextResponse.json(
      { ok: false, error: 'signatureType must be 1, 2, or 3.' },
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

  const params = new URLSearchParams({
    asset_type: assetType,
    signature_type: String(signatureType),
  });
  if (tokenId) params.set('token_id', tokenId);
  const requestPath = `${ENDPOINT}?${params.toString()}`;

  try {
    const headers = await buildL2Headers(session, {
      method: 'GET',
      requestPath,
    });
    const res = await fetch(`${CLOB_HOST}${requestPath}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
    });
    const text = await res.text();
    const data = text
      ? (() => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return { raw: text };
          }
        })()
      : null;

    if (!res.ok) {
      console.error('[polymarket]', {
        event: 'balance_allowance_update_rejected',
        component: 'balance_allowance',
        status: res.status,
        body: data,
        signatureType,
        assetType,
        tradingWalletAddress,
        connectedEoa: session.walletAddress,
        hasApiCreds: hasCompleteL2Creds(session),
      });
      return NextResponse.json(
        { ok: false, error: 'Balance allowance update failed.', details: data },
        { status: res.status, headers: { 'Cache-Control': 'no-store' } },
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
    return NextResponse.json({ ok: true, data }, {
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
