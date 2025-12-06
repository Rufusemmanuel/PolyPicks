export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const history = await prisma.historyEntry.findMany({
      orderBy: { resolvedAt: 'desc' },
    });

    return NextResponse.json({
      history: history.map((h) => ({
        ...h,
        resolvedAt: h.resolvedAt.toISOString(),
        closedAt: h.closedAt ? h.closedAt.toISOString() : null,
        appearedAt: h.appearedAt.toISOString(),
      })),
      total: history.length,
    });
  } catch (error) {
    console.error('/api/history error', error);
    console.error('DATABASE_URL', process.env.DATABASE_URL);
    return NextResponse.json(
      { error: 'Failed to load history. Check DATABASE_URL and that ./data/polybet.db is accessible.' },
      { status: 500 },
    );
  }
}
