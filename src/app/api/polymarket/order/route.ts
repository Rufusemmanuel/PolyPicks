import type { NextRequest } from 'next/server';
import { getSession, isSessionExpired } from '@/lib/server/session';
import { buildL2Headers } from '@/lib/server/polymarketHeaders';
import { createOrderHandler } from '@/lib/server/polymarketOrderHandler';

export const runtime = 'nodejs';

const CLOB_HOST = process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';

const handleOrder = createOrderHandler({
  getSession,
  isSessionExpired,
  buildL2Headers,
  clobHost: CLOB_HOST,
});

export async function POST(request: NextRequest) {
  return handleOrder(request);
}
