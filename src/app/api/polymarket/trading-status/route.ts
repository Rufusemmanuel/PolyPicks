import { NextResponse } from 'next/server';
import { resolveTradingStatus } from '@/lib/polymarket/trading';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const status = resolveTradingStatus();
  if (!status.enabled) {
    console.info('[polymarket]', {
      event: 'trading_status_disabled',
      component: 'trading_status',
      tradingFlag: status.tradingFlag,
      hasRuntimeConfig: status.hasRuntimeConfig,
      missing: status.missing,
      disabledReasons: status.disabledReasons,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
    });
  }
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
