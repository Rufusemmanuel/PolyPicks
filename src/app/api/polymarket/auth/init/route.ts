import { NextResponse, type NextRequest } from 'next/server';
import { clearSession, getSession, isSessionExpired } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CLOB_HOST =
  process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type L1Headers = {
  POLY_ADDRESS: string;
  POLY_SIGNATURE: string;
  POLY_TIMESTAMP: string;
  POLY_NONCE: string;
};

const redact = (value: string | undefined) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : null;

const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

const normalizeAddress = (value: unknown) =>
  typeof value === 'string' && ADDRESS_RE.test(value) ? value : null;

const normalizeSignatureType = (value: unknown) => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3 ? parsed : null;
};

const normalizeL1Headers = (payload: Record<string, unknown>): L1Headers | null => {
  const address =
    typeof payload.POLY_ADDRESS === 'string'
      ? payload.POLY_ADDRESS
      : typeof payload.address === 'string'
        ? payload.address
        : null;
  const signature =
    typeof payload.POLY_SIGNATURE === 'string'
      ? payload.POLY_SIGNATURE
      : typeof payload.signature === 'string'
        ? payload.signature
        : null;
  const timestamp =
    typeof payload.POLY_TIMESTAMP === 'string'
      ? payload.POLY_TIMESTAMP
      : typeof payload.timestamp === 'string' || typeof payload.timestamp === 'number'
        ? String(payload.timestamp)
        : null;
  const nonce =
    typeof payload.POLY_NONCE === 'string'
      ? payload.POLY_NONCE
      : typeof payload.nonce === 'string' || typeof payload.nonce === 'number'
        ? String(payload.nonce)
        : null;

  if (!address || !signature || !timestamp || !nonce) return null;
  if (!ADDRESS_RE.test(address)) return null;
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  if (!/^\d+$/.test(timestamp)) return null;
  if (!/^\d+$/.test(nonce)) return null;
  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: nonce,
  };
};

export async function POST(request: NextRequest) {
  const rawHeaders = Array.from(request.headers.keys());
  if (rawHeaders.some((key) => key.toLowerCase().startsWith('poly_'))) {
    return NextResponse.json(
      { ok: false, error: 'Unexpected auth headers.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const l1Headers = normalizeL1Headers(payload);
  if (!l1Headers) {
    return NextResponse.json(
      { ok: false, error: 'Invalid auth payload.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const forceRefresh = payload.forceRefresh === true;
  const tradingWalletAddress = normalizeAddress(
    payload.tradingWalletAddress ?? payload.funderAddress,
  );
  const signatureType = normalizeSignatureType(
    payload.signatureType ?? payload.signature_type,
  );

  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Server session not configured.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (session.l2 && session.walletAddress && !sameAddress(session.walletAddress, l1Headers.POLY_ADDRESS)) {
    clearSession(session);
  }
  if (forceRefresh && session.l2) {
    session.l2 = undefined;
    session.walletAddress = undefined;
    session.tradingWalletAddress = undefined;
    session.signatureType = undefined;
    session.createdAt = undefined;
  }
  if (
    !forceRefresh &&
    session.l2 &&
    sameAddress(session.walletAddress ?? '', l1Headers.POLY_ADDRESS) &&
    !isSessionExpired(session)
  ) {
    let changed = false;
    if (
      tradingWalletAddress &&
      (!session.tradingWalletAddress ||
        !sameAddress(session.tradingWalletAddress, tradingWalletAddress))
    ) {
      session.tradingWalletAddress = tradingWalletAddress;
      changed = true;
    }
    if (signatureType && session.signatureType !== signatureType) {
      session.signatureType = signatureType;
      changed = true;
    }
    if (changed) {
      await session.save();
    }
    console.info('[polymarket]', {
      event: 'l2_creds_reused',
      component: 'auth_init',
      connectedEoa: l1Headers.POLY_ADDRESS,
      sessionInitialized: true,
      tradingWalletAddress: session.tradingWalletAddress ?? null,
      signatureType: session.signatureType ?? null,
      hasApiCreds: Boolean(session.l2.apiKey && session.l2.secret && session.l2.passphrase),
      apiKey: redact(session.l2.apiKey),
    });
    return NextResponse.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (isSessionExpired(session)) {
    clearSession(session);
  }

  const tryDerive = async () => {
    const res = await fetch(`${CLOB_HOST}/auth/derive-api-key`, {
      method: 'GET',
      headers: l1Headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      apiKey?: string;
      secret?: string;
      passphrase?: string;
    };
  };

  const tryCreate = async () => {
    const res = await fetch(`${CLOB_HOST}/auth/api-key`, {
      method: 'POST',
      headers: l1Headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      apiKey?: string;
      secret?: string;
      passphrase?: string;
    };
  };

  let source: 'derive' | 'create' | null = 'derive';
  let creds = await tryDerive();
  if (!creds) {
    source = 'create';
    creds = await tryCreate();
  }
  if (!creds?.apiKey || !creds.secret || !creds.passphrase) {
    console.info('[polymarket]', {
      event: 'l2_creds_init_failed',
      component: 'auth_init',
      connectedEoa: l1Headers.POLY_ADDRESS,
      sessionInitialized: false,
      tradingWalletAddress,
      signatureType,
      hasApiCreds: false,
      source,
      forceRefresh,
    });
    return NextResponse.json(
      { ok: false, error: 'Unable to initialize session.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  session.l2 = {
    apiKey: creds.apiKey,
    secret: creds.secret,
    passphrase: creds.passphrase,
  };
  session.walletAddress = l1Headers.POLY_ADDRESS;
  if (tradingWalletAddress) session.tradingWalletAddress = tradingWalletAddress;
  if (signatureType) session.signatureType = signatureType;
  session.createdAt = Date.now();
  await session.save();

  console.info('[polymarket]', {
    event: 'l2_creds_initialized',
    component: 'auth_init',
    connectedEoa: l1Headers.POLY_ADDRESS,
    sessionInitialized: true,
    tradingWalletAddress: session.tradingWalletAddress ?? null,
    signatureType: session.signatureType ?? null,
    hasApiCreds: Boolean(creds.apiKey && creds.secret && creds.passphrase),
    source,
    forceRefresh,
    apiKey: redact(creds.apiKey),
    passphrase: redact(creds.passphrase),
    hasSecret: Boolean(creds.secret),
  });

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
