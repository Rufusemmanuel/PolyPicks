import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const getRelayerSubmitUrl = () => {
  const raw =
    process.env.POLYMARKET_RELAYER_URL ??
    'https://relayer-v2.polymarket.com/submit';
  return raw.endsWith('/submit') ? raw : `${raw.replace(/\/+$/, '')}/submit`;
};

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SAFE_RELAYER_TYPES = new Set(['SAFE', 'PROXY', 'SAFE-CREATE']);

const readRelayerCredentials = () => {
  const apiKey = process.env.POLYMARKET_RELAYER_API_KEY;
  const apiKeyAddress = process.env.POLYMARKET_RELAYER_API_KEY_ADDRESS;
  if (!apiKey || !apiKeyAddress) {
    return null;
  }
  return { apiKey, apiKeyAddress };
};

const sanitizeRelayerPayload = (payload: Record<string, unknown>) => {
  const type = typeof payload.type === 'string' ? payload.type : null;
  const from = typeof payload.from === 'string' ? payload.from : null;
  const to = typeof payload.to === 'string' ? payload.to : null;
  const data = typeof payload.data === 'string' ? payload.data : null;
  const signature = typeof payload.signature === 'string' ? payload.signature : null;
  const proxyWallet =
    typeof payload.proxyWallet === 'string' ? payload.proxyWallet : undefined;

  const errors: string[] = [];
  if (!type || !SAFE_RELAYER_TYPES.has(type)) errors.push('type must be SAFE, PROXY, or SAFE-CREATE.');
  if (!from || !ADDRESS_RE.test(from)) errors.push('from must be the connected wallet address.');
  if (!to || !ADDRESS_RE.test(to)) errors.push('to must be an address.');
  if (!data || !data.startsWith('0x')) errors.push('data must be hex.');
  if (!signature || !signature.startsWith('0x')) errors.push('signature must be hex.');

  if ((type === 'SAFE' || type === 'PROXY' || type === 'SAFE-CREATE') && !proxyWallet) {
    errors.push('proxyWallet is required for Safe/proxy relayer submissions.');
  }
  if (proxyWallet && !ADDRESS_RE.test(proxyWallet)) {
    errors.push('proxyWallet must be an address.');
  }

  return {
    errors,
    debug: {
      type,
      from,
      to,
      proxyWallet: proxyWallet ?? null,
      hasSignature: Boolean(signature),
      dataLength: data?.length ?? 0,
    },
  };
};

export async function POST(request: NextRequest) {
  const rawHeaders = Array.from(request.headers.keys());
  if (
    rawHeaders.some((key) => {
      const normalized = key.toLowerCase();
      return (
        normalized.startsWith('relayer_api_key') ||
        normalized.startsWith('relayer-api-key') ||
        normalized.startsWith('poly_')
      );
    })
  ) {
    return NextResponse.json(
      { ok: false, error: 'Unexpected auth headers.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const creds = readRelayerCredentials();
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Missing Polymarket relayer credentials on server',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
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

  const validation = sanitizeRelayerPayload(payload);
  if (validation.errors.length) {
    return NextResponse.json(
      { ok: false, error: 'Invalid relayer submit payload.', details: validation.errors },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const body = JSON.stringify(payload);
  try {
    console.info('[polymarket]', {
      event: 'relayer_submit_forwarded',
      component: 'relayer_submit',
      ...validation.debug,
    });

    const upstream = await fetch(getRelayerSubmitUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        RELAYER_API_KEY: creds.apiKey,
        RELAYER_API_KEY_ADDRESS: creds.apiKeyAddress,
      },
      body,
    });
    const text = await upstream.text();
    const data = text
      ? (() => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return { raw: text };
          }
        })()
      : null;

    if (!upstream.ok) {
      console.error('[polymarket]', {
        event: 'relayer_submit_rejected',
        component: 'relayer_submit',
        status: upstream.status,
        body: data,
        sent: validation.debug,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            data && typeof data === 'object' && 'error' in data
              ? String((data as { error?: unknown }).error)
              : 'Polymarket relayer rejected the request.',
          details: {
            status: upstream.status,
            body: data,
          },
        },
        { status: upstream.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(data ?? { ok: true }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[polymarket]', {
      event: 'relayer_submit_failed',
      component: 'relayer_submit',
      error: error instanceof Error ? error.message : String(error),
      sent: validation.debug,
    });
    return NextResponse.json(
      { ok: false, error: 'Polymarket relayer request failed.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
