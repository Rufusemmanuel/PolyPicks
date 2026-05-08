import { NextResponse, type NextRequest } from 'next/server';
import { getSession, isSessionExpired } from '@/lib/server/session';
import { buildL2Headers } from '@/lib/server/polymarketHeaders';
import { sanitizeOrderPayload } from '@/lib/server/polymarketOrder';
import { getPolymarketBuilderCode } from '@/lib/server/polymarketRuntimeConfig';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rawHeaderKeys = Array.from(request.headers.keys());
  if (rawHeaderKeys.some((k) => k.toLowerCase().startsWith('poly_'))) {
    return NextResponse.json(
      { ok: false, error: 'Unexpected auth headers.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let session: Awaited<ReturnType<typeof getSession>>;
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

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'owner')) {
    return NextResponse.json(
      { ok: false, error: 'Owner must not be provided by client.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let sanitized: ReturnType<typeof sanitizeOrderPayload>;
  try {
    sanitized = sanitizeOrderPayload(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Invalid order payload.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const builderCode = getPolymarketBuilderCode();
  if (sanitized.order.builder.toLowerCase() !== builderCode.toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: 'Order builder code mismatch.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const outgoingPayload = {
    order: sanitized.order,
    orderType: sanitized.orderType,
    owner: session.l2.apiKey,
    ...(sanitized.postOnly ? { postOnly: sanitized.postOnly } : {}),
  };
  const orderKeyTypes = Object.fromEntries(
    Object.entries(outgoingPayload.order).map(([key, value]) => [key, typeof value]),
  );
  console.info('[polymarket] /order diagnostics payload shape', {
    topLevelKeys: Object.keys(outgoingPayload),
    orderKeys: Object.keys(outgoingPayload.order),
    orderKeyTypes,
    owner: `${session.l2.apiKey.slice(0, 6)}...`,
    builderCode: sanitized.order.builder,
  });

  const l2Headers = await buildL2Headers(session, {
    method: 'POST',
    requestPath: '/order',
    body: JSON.stringify(outgoingPayload),
  });
  const requiredL2Headers = [
    'POLY_ADDRESS',
    'POLY_SIGNATURE',
    'POLY_TIMESTAMP',
    'POLY_API_KEY',
    'POLY_PASSPHRASE',
  ] as const;
  const missingL2Headers = requiredL2Headers.filter((key) => !l2Headers[key]);
  console.info('[polymarket] /order diagnostics L2 headers present', {
    POLY_ADDRESS: Boolean(l2Headers.POLY_ADDRESS),
    POLY_SIGNATURE: Boolean(l2Headers.POLY_SIGNATURE),
    POLY_TIMESTAMP: Boolean(l2Headers.POLY_TIMESTAMP),
    POLY_API_KEY: Boolean(l2Headers.POLY_API_KEY),
    POLY_PASSPHRASE: Boolean(l2Headers.POLY_PASSPHRASE),
  });

  if (missingL2Headers.length) {
    return NextResponse.json(
      { ok: false, error: `Missing L2 headers: ${missingL2Headers.join(', ')}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
