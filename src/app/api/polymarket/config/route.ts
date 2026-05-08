import { NextResponse } from 'next/server';
import { getPolymarketBuilderCode } from '@/lib/server/polymarketRuntimeConfig';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, builderCode: getPolymarketBuilderCode() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Invalid Polymarket config.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
