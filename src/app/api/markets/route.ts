// src/app/api/markets/route.ts
import { NextResponse } from 'next/server';
import { getActiveMarkets } from '@/lib/polymarket/api';
import { isTradableMarket } from '@/lib/polymarket/marketStatus';
import type { MarketSummary } from '@/lib/polymarket/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MIN_PRICE = 0.75;
const MAX_PRICE = 0.95;
const LOG_SAMPLE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function getEffectiveDate(m: MarketSummary): Date | null {
  const raw =
    (m as MarketSummary & { upperBoundDate?: string | Date | null }).upperBoundDate ??
    (m as MarketSummary & { gameStartTime?: string | Date | null }).gameStartTime ??
    m.endDate;

  if (!raw) return null;

  try {
    const d = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function logMarketFilterError(m: MarketSummary | null | undefined, error: unknown) {
  console.error('[markets_filter_error]', {
    marketId: m?.id,
    slug: m?.slug,
    error,
  });
}

function passesClosedFilter(m: MarketSummary, now: number): boolean {
  try {
    if (!isTradableMarket(m)) return false;
    if (m.closedTime && m.closedTime.getTime() < now) return false;
    return true;
  } catch (error) {
    logMarketFilterError(m, error);
    return false;
  }
}

function passesPriceFilter(m: MarketSummary): boolean {
  try {
    const p = m.price?.price;
    return typeof p === 'number' && p >= MIN_PRICE && p <= MAX_PRICE;
  } catch (error) {
    logMarketFilterError(m, error);
    return false;
  }
}

function filterByWindow(
  markets: MarketSummary[],
  minWindowMs: number,
  maxWindowMs: number,
  now: number,
): MarketSummary[] {
  return markets.filter((m) => {
    try {
      const eff = getEffectiveDate(m);
      if (!eff) return false;

      const deltaMs = eff.getTime() - now;
      if (deltaMs < 0) return false;

      if (deltaMs <= minWindowMs) return false;
      if (deltaMs > maxWindowMs) return false;

      return true;
    } catch (error) {
      logMarketFilterError(m, error);
      return false;
    }
  });
}

export async function GET() {
  try {
    const debugRelaxEnv = process.env.POLYPICKS_DEBUG_RELAX ?? process.env.POLYBET_DEBUG_RELAX;
    const debugRelax =
      debugRelaxEnv === '1' || debugRelaxEnv?.toString().toLowerCase() === 'true';
    const markets = await getActiveMarkets();
    const now = Date.now();

    const afterClosedFilter = markets.filter((m) => passesClosedFilter(m, now));
    const afterPriceFilter = afterClosedFilter.filter(passesPriceFilter);

    console.log('[PolyPicks] debugRelax:', debugRelax);
    console.log('[PolyPicks] raw markets fetched:', markets.length);
    console.log('[PolyPicks] raw markets sample:', markets.slice(0, LOG_SAMPLE_SIZE));
    console.log('[PolyPicks] after closed filter:', afterClosedFilter.length);
    console.log('[PolyPicks] after price filter 0.75-0.95:', afterPriceFilter.length);

    if (debugRelax) {
      console.log('[PolyPicks] debugRelax sample:', afterPriceFilter.slice(0, LOG_SAMPLE_SIZE));
      return NextResponse.json<MarketSummary[]>(afterPriceFilter);
    }

    const window24 = filterByWindow(afterPriceFilter, -1, DAY_MS, now);
    const window48 = filterByWindow(afterPriceFilter, DAY_MS, 2 * DAY_MS, now);

    console.log('[PolyPicks] window24 count:', window24.length);
    console.log('[PolyPicks] window24 sample:', window24.slice(0, LOG_SAMPLE_SIZE));
    console.log('[PolyPicks] window48 count:', window48.length);
    console.log('[PolyPicks] window48 sample:', window48.slice(0, LOG_SAMPLE_SIZE));

    return NextResponse.json({ window24, window48 });
  } catch (err) {
    console.error('[PolyPicks] /api/markets error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
