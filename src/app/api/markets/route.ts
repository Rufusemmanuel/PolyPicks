// src/app/api/markets/route.ts
import { NextResponse } from 'next/server';
import { getActiveMarkets } from '@/lib/polymarket/api';
import { isTradableMarket } from '@/lib/polymarket/marketStatus';
import type { MarketSummary } from '@/lib/polymarket/types';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

const LOG_SAMPLE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_MARKET_COUNT = 50;
const CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=30';

function marketsJson<T>(body: T) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': CACHE_CONTROL,
    },
  });
}

function getEffectiveDate(m: MarketSummary): Date | null {
  const raw: any =
    (m as any).upperBoundDate ??
    (m as any).gameStartTime ??
    m.endDate;

  if (!raw) return null;

  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readMarketLogField(
  m: MarketSummary | null | undefined,
  key: 'id' | 'slug',
) {
  try {
    return m?.[key];
  } catch {
    return undefined;
  }
}

function logMarketFilterError(m: MarketSummary | null | undefined, error: unknown) {
  console.error('[markets_filter_error]', {
    marketId: readMarketLogField(m, 'id'),
    slug: readMarketLogField(m, 'slug'),
    error,
  });
}

function safeBaseFilterMarket(m: MarketSummary): boolean {
  try {
    if (!isTradableMarket(m)) return false;
    return true;
  } catch (error) {
    logMarketFilterError(m, error);
    return false;
  }
}

function baseFilter(markets: MarketSummary[]): MarketSummary[] {
  return markets.filter(safeBaseFilterMarket);
}

function filterByWindow(
  markets: MarketSummary[],
  minWindowMs: number,
  maxWindowMs: number,
  now: number,
): MarketSummary[] {
  return baseFilter(markets).filter((m) => {
    let eff: Date | null = null;
    try {
      eff = getEffectiveDate(m);
      if (!eff) return false;
    } catch (error) {
      logMarketFilterError(m, error);
      return false;
    }

    const deltaMs = eff.getTime() - now;
    if (deltaMs < 0) return false;

    // minWindowMs exclusive, maxWindowMs inclusive
    if (deltaMs <= minWindowMs) return false;
    if (deltaMs > maxWindowMs) return false;

    return true;
  });
}

export async function GET() {
  try {
    const debugRelaxEnv = process.env.POLYPICKS_DEBUG_RELAX ?? process.env.POLYBET_DEBUG_RELAX;
    const debugRelax =
      debugRelaxEnv === '1' || debugRelaxEnv?.toString().toLowerCase() === 'true';
    const markets = await getActiveMarkets();
    const now = Date.now();

    console.log('[PolyPicks] debugRelax:', debugRelax);
    console.log('[PolyPicks] /api/markets fetched tradable markets count:', markets.length);
    console.log('[PolyPicks] /api/markets fetched tradable sample:', markets.slice(0, LOG_SAMPLE_SIZE));

    if (debugRelax) {
      // Base filters only; no time windows
      const relaxed = baseFilter(markets);
      console.log('[PolyPicks] debugRelax base-filtered length:', relaxed.length);
      console.log('[PolyPicks] debugRelax sample:', relaxed.slice(0, LOG_SAMPLE_SIZE));
      return marketsJson<MarketSummary[]>(relaxed);
    }

    // 0–24h inclusive
    const window24 = baseFilter(markets).filter((m) => {
      let eff: Date | null = null;
      try {
        eff = getEffectiveDate(m);
        if (!eff) return false;
      } catch (error) {
        logMarketFilterError(m, error);
        return false;
      }
      const deltaMs = eff.getTime() - now;
      return deltaMs >= 0 && deltaMs <= DAY_MS;
    });

    // >24h–48h inclusive
    const window48 = filterByWindow(markets, DAY_MS, 2 * DAY_MS, now);
    const fallbackMarkets =
      window24.length === 0 && window48.length === 0
        ? baseFilter(markets).slice(0, FALLBACK_MARKET_COUNT)
        : [];
    const finalWindow24 = fallbackMarkets.length ? fallbackMarkets : window24;
    const finalWindow48 = window48;

    console.log('[PolyPicks] filtered markets 24h length:', window24.length);
    console.log('[PolyPicks] filtered markets 24h sample:', window24.slice(0, LOG_SAMPLE_SIZE));
    console.log('[PolyPicks] filtered markets 48h length:', window48.length);
    console.log('[PolyPicks] filtered markets 48h sample:', window48.slice(0, LOG_SAMPLE_SIZE));
    console.log('[PolyPicks] fallback markets length:', fallbackMarkets.length);
    console.log('[PolyPicks] final window24/window48 counts:', {
      window24: finalWindow24.length,
      window48: finalWindow48.length,
    });

    return marketsJson({ window24: finalWindow24, window48: finalWindow48 });
  } catch (err) {
    console.error('[PolyPicks] /api/markets error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
