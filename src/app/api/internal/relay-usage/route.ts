import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DAILY_RELAY_LIMIT = 100;

const getUtcDayRange = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const isAuthorized = (request: NextRequest) => {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const expectedKey = process.env.INTERNAL_ADMIN_KEY;
  const providedKey = request.headers.get('x-admin-key');
  return Boolean(expectedKey) && providedKey === expectedKey;
};

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const { start, end } = getUtcDayRange();
    const usedToday = await prisma.relayEvent.count({
      where: {
        success: true,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });
    const remaining = Math.max(0, DAILY_RELAY_LIMIT - usedToday);
    const updatedAt = new Date().toISOString();

    console.info(`[relay_usage_debug] usedToday=${usedToday} remaining=${remaining}`);

    return NextResponse.json(
      {
        usedToday,
        remaining,
        limit: DAILY_RELAY_LIMIT,
        updatedAt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[polymarket]', {
      event: 'relay_usage_read_failed',
      component: 'internal_relay_usage',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Unable to load relay usage.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
