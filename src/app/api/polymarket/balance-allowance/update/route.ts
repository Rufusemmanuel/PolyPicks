import { NextResponse, type NextRequest } from 'next/server';
import { getSession, isSessionExpired } from '@/lib/server/session';
import { buildL2Headers } from '@/lib/server/polymarketHeaders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CLOB_HOST = process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';
const ENDPOINT = '/balance-allowance/update';
const ASSET_TYPES = new Set(['COLLATERAL', 'CONDITIONAL']);

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

  const assetType = typeof body.assetType === 'string' ? body.assetType : 'COLLATERAL';
  const tokenId = typeof body.tokenId === 'string' ? body.tokenId : null;
  const signatureType = Number(body.signatureType ?? 3);
  if (!ASSET_TYPES.has(assetType)) {
    return NextResponse.json(
      { ok: false, error: 'assetType must be COLLATERAL or CONDITIONAL.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!Number.isInteger(signatureType) || signatureType < 0 || signatureType > 3) {
    return NextResponse.json(
      { ok: false, error: 'signatureType must be 0, 1, 2, or 3.' },
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
  if (!session.l2 || !session.walletAddress || isSessionExpired(session)) {
    if (isSessionExpired(session)) session.destroy();
    return NextResponse.json(
      { ok: false, error: 'Session not initialized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const params = new URLSearchParams({
    asset_type: assetType,
    signature_type: String(signatureType),
  });
  if (tokenId) params.set('token_id', tokenId);

  try {
    const headers = await buildL2Headers(session, {
      method: 'GET',
      requestPath: ENDPOINT,
    });
    const res = await fetch(`${CLOB_HOST}${ENDPOINT}?${params.toString()}`, {
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
    });
    return NextResponse.json(
      { ok: false, error: 'Balance allowance update failed.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
