import { NextResponse, type NextRequest } from 'next/server';
import { clearSession, getSession, isSessionExpired } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const rawHeaders = Array.from(request.headers.keys());
  if (rawHeaders.some((key) => key.toLowerCase().startsWith('poly_'))) {
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
  const expired = isSessionExpired(session);
  if (expired) {
    clearSession(session);
  }
  const address = request.nextUrl.searchParams.get('address');
  const addressMatches =
    address && session.walletAddress
      ? address.toLowerCase() === session.walletAddress.toLowerCase()
      : true;
  const ok = Boolean(
    session.l2 && session.walletAddress && !expired && addressMatches,
  );
  return NextResponse.json(
    { ok, expired, addressMatches, walletAddress: session.walletAddress ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
