// src/lib/polymarket/api.ts

import { POLYMARKET_CONFIG } from '../config';
import { getTopOfBook } from './clob';
import type { MarketPrice, MarketSummary, OutcomeSide, RawEvent, RawMarket } from './types';

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Polymarket request failed (${res.status})`);
  }
  return (await res.json()) as T;
};

const parseOutcomePrices = (outcomes?: string, outcomePrices?: string): MarketPrice | null => {
  if (!outcomes || !outcomePrices) return null;

  let labels: string[];
  let prices: string[];

  try {
    labels = JSON.parse(outcomes) as string[];
    prices = JSON.parse(outcomePrices) as string[];
  } catch {
    return null;
  }

  if (!labels.length || !prices.length) return null;

  const numeric = prices.map((p) => Number(p));
  if (!numeric.length || numeric.some((n) => Number.isNaN(n))) return null;

  const maxIdx = numeric.reduce(
    (max, price, idx) => (price > numeric[max] ? idx : max),
    0,
  );

  return {
    leadingOutcome: (labels[maxIdx] ?? 'Yes') as OutcomeSide,
    price: numeric[maxIdx],
  };
};

// Very simple slug → category guesser used only when Polymarket
// doesn’t give us a category or tag.
const inferCategoryFromSlug = (slug?: string): string | undefined => {
  if (!slug) return undefined;
  const s = slug.toLowerCase();

  if (s.includes('btc') || s.includes('bitcoin') || s.includes('eth') || s.includes('ethereum')) {
    return 'Crypto';
  }
  if (s.includes('election') || s.includes('president') || s.includes('vote')) {
    return 'Politics';
  }
  if (s.includes('gdp') || s.includes('inflation') || s.includes('rate') || s.includes('fed')) {
    return 'Economy';
  }
  if (s.includes('nfl') || s.includes('nba') || s.includes('premier-league') || s.includes('f1')) {
    return 'Sports';
  }

  return undefined;
};

const resolveCategory = (market: RawMarket): string => {
  const direct = market.category?.trim();
  const tag =
    market.tags?.[0]?.label?.trim() ??
    market.events?.[0]?.tags?.[0]?.label?.trim();
  const slugGuess = direct || tag ? undefined : inferCategoryFromSlug(market.slug);

  return (direct || tag || slugGuess || 'Uncategorized').replace(/-/g, ' ');
};

export const getActiveMarkets = async (): Promise<MarketSummary[]> => {
  const limit = 200;
  let offset = 0;
  const allEvents: RawEvent[] = [];

  while (true) {
    const pageUrl =
      `${POLYMARKET_CONFIG.gammaBaseUrl}/events?` +
      `closed=false&order=id&ascending=false&limit=${limit}&offset=${offset}`;

    const page = await fetchJson<RawEvent[]>(pageUrl);

    if (!page.length) break;

    allEvents.push(...page);
    offset += limit;
  }

  const rawMarkets: RawMarket[] = [];

  for (const event of allEvents) {
    for (const market of event.markets ?? []) {
      rawMarkets.push({
        ...market,
        tags: market.tags ?? event.tags,
        events: market.events ?? [{ slug: event.slug, tags: event.tags }],
      });
    }
  }

  const mapped = rawMarkets
    .map((m) => {
      const endDate = new Date(m.endDate);
      if (Number.isNaN(endDate.getTime())) return null;

      const closedTime = m.closedTime ? new Date(m.closedTime) : undefined;

      const fallbackBestBid =
        m.bestBid != null && !Number.isNaN(Number(m.bestBid))
          ? Number(m.bestBid)
          : null;

      const parsedPrice =
        parseOutcomePrices(m.outcomes, m.outcomePrices) ??
        (fallbackBestBid != null
          ? { leadingOutcome: 'Yes' as OutcomeSide, price: fallbackBestBid }
          : null);
      if (!parsedPrice) return null;

      // Use event slug when available (grouped markets), otherwise fall back to market slug.
      const eventSlug = m.events?.[0]?.slug ?? m.slug;
      const marketUrl =
        eventSlug && m.conditionId
          ? `${POLYMARKET_CONFIG.marketPageBase}${eventSlug}?tid=${m.conditionId}`
          : `${POLYMARKET_CONFIG.marketPageBase}${eventSlug ?? ''}`;

      const title = m.question ?? m.title ?? m.slug;

      return {
        id: m.id,
        title,
        slug: m.slug,
        category: resolveCategory(m),
        endDate,
        gameStartTime: m.gameStartTime ?? null,
        lowerBoundDate: m.lowerBoundDate ?? null,
        upperBoundDate: m.upperBoundDate ?? null,
        yesTokenId: m.yesTokenId ?? null,
        noTokenId: m.noTokenId ?? null,
        closedTime,
        price: parsedPrice,
        volume: Number(m.volume ?? m.volumeNum ?? 0),
        url: marketUrl,
        conditionId: m.conditionId,
      } satisfies MarketSummary;
    })
    .filter(Boolean) as MarketSummary[];

  const enriched = await Promise.all(
    mapped.map(async (market) => {
      const tokenId = market.yesTokenId ?? market.noTokenId;
      if (!tokenId) return market;

      try {
        const top = await getTopOfBook(tokenId);
        return { ...market, bestBid: top.bestBid, bestAsk: top.bestAsk, spreadBps: top.spreadBps };
      } catch (error) {
        console.error('[Polybet] getTopOfBook error', { marketId: market.id, tokenId, error });
        return market;
      }
    }),
  );

  // Soonest to close first
  return enriched.sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
};

export const getMarketDetails = async (
  marketId: string,
): Promise<MarketSummary | null> => {
  const url = `${POLYMARKET_CONFIG.gammaBaseUrl}/markets/${marketId}`;
  const market = await fetchJson<RawMarket>(url);

  const price =
    parseOutcomePrices(market.outcomes, market.outcomePrices) ??
    (market.bestBid
      ? { leadingOutcome: 'Yes' as OutcomeSide, price: Number(market.bestBid) }
      : null);
  if (!price) return null;

  const eventSlug = market.events?.[0]?.slug ?? market.slug;
  const marketUrl =
    eventSlug && market.conditionId
      ? `${POLYMARKET_CONFIG.marketPageBase}${eventSlug}?tid=${market.conditionId}`
      : `${POLYMARKET_CONFIG.marketPageBase}${eventSlug ?? ''}`;

  const base: MarketSummary = {
    id: market.id,
    title: market.question,
    slug: market.slug,
    category: resolveCategory(market),
    endDate: new Date(market.endDate),
    gameStartTime: market.gameStartTime ?? null,
    lowerBoundDate: market.lowerBoundDate ?? null,
    upperBoundDate: market.upperBoundDate ?? null,
    yesTokenId: market.yesTokenId ?? null,
    noTokenId: market.noTokenId ?? null,
    closedTime: market.closedTime ? new Date(market.closedTime) : undefined,
    price,
    volume: Number(market.volume ?? market.volumeNum ?? 0),
    url: marketUrl,
    conditionId: market.conditionId,
  };

  const tokenId = base.yesTokenId ?? base.noTokenId;
  if (!tokenId) return base;

  try {
    const top = await getTopOfBook(tokenId);
    return { ...base, bestBid: top.bestBid, bestAsk: top.bestAsk, spreadBps: top.spreadBps };
  } catch (error) {
    console.error('[Polybet] getTopOfBook error', { marketId: market.id, tokenId, error });
    return base;
  }
};

export const getResolvedStatus = async (marketId: string): Promise<{
  resolved: boolean;
  winningOutcome?: OutcomeSide;
  closedAt?: Date;
}> => {
  const details = await getMarketDetails(marketId);
  if (!details) return { resolved: false };

  const now = Date.now();
  const isClosed = details.endDate.getTime() <= now || !!details.closedTime;

  if (!isClosed) return { resolved: false };

  // Very naive “winner” inference; you can improve this later.
  const inferredWinner =
    details.price.price >= 0.99 ? details.price.leadingOutcome : details.price.leadingOutcome;

  return {
    resolved: true,
    winningOutcome: inferredWinner,
    closedAt: details.closedTime ?? details.endDate,
  };
};
