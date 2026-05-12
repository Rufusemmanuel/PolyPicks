import { NextResponse } from 'next/server';
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

export async function GET() {
  try {
    const { start, end } = getUtcDayRange();
    const todayRelayTransactions = await prisma.relayEvent.count({
      where: {
        success: true,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });

    return NextResponse.json(
      {
        todayRelayTransactions,
        remainingEstimated: Math.max(0, DAILY_RELAY_LIMIT - todayRelayTransactions),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[polymarket]', {
      event: 'relay_usage_read_failed',
      component: 'admin_relay_usage',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Unable to load relay usage.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
