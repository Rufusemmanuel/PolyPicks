import { NextResponse, type NextRequest } from 'next/server';
import { BuilderSigner } from '@polymarket/builder-signing-sdk';

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
const HEX_RE = /^0x[0-9a-fA-F]*$/;

const readBuilderCredentials = () => {
  const key = process.env.POLYMARKET_BUILDER_API_KEY;
  const secret = process.env.POLYMARKET_BUILDER_SECRET;
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE;
  if (!key || !secret || !passphrase) {
    return null;
  }
  return { key, secret, passphrase };
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
  if (!type) errors.push('type is required.');
  if (!from || !ADDRESS_RE.test(from)) errors.push('from must be the connected wallet address.');
  if (!to || !ADDRESS_RE.test(to)) errors.push('to must be an address.');
  if (!data || !HEX_RE.test(data)) errors.push('data must be hex.');
  if (!signature) errors.push('signature is required.');

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

  const creds = readBuilderCredentials();
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Missing Polymarket builder relayer credentials on server',
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
  const builderHeaders = new BuilderSigner(creds).createBuilderHeaderPayload(
    'POST',
    '/submit',
    body,
  );
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
        ...builderHeaders,
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
