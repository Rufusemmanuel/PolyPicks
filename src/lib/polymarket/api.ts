// src/lib/polymarket/api.ts

import { POLYMARKET_CONFIG } from '../config';
import { getTopOfBook } from './clob';
import { resolveCategory } from './category';
import { getPolymarketMarketUrl } from './url';
import type { MarketDetailsResponse, MarketPrice, MarketSummary, OutcomeSide, RawEvent, RawMarket } from './types';

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

const normalizeToText = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length ? cleaned.join('\n') : null;
  }
  return null;
};

const collectTagLabels = (market: RawMarket): string[] => {
  const labels: string[] = [];
  for (const tag of market.tags ?? []) {
    if (tag.label) labels.push(tag.label);
  }
  for (const event of market.events ?? []) {
    for (const tag of event.tags ?? []) {
      if (tag.label) labels.push(tag.label);
    }
  }
  return labels;
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
      const marketUrl = getPolymarketMarketUrl(eventSlug, m.conditionId);

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
        console.error('[PolyPicks] getTopOfBook error', { marketId: market.id, tokenId, error });
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
  const marketUrl = getPolymarketMarketUrl(eventSlug, market.conditionId);

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
    console.error('[PolyPicks] getTopOfBook error', { marketId: market.id, tokenId, error });
    return base;
  }
};

export const getMarketDetailsPayload = async (
  marketId: string,
): Promise<MarketDetailsResponse | null> => {
  const url = `${POLYMARKET_CONFIG.gammaBaseUrl}/markets/${marketId}`;
  const market = await fetchJson<RawMarket>(url);

  if (!market) return null;

  const price =
    parseOutcomePrices(market.outcomes, market.outcomePrices) ??
    (market.bestBid
      ? { leadingOutcome: 'Yes' as OutcomeSide, price: Number(market.bestBid) }
      : null);
  if (!price) return null;

  const eventSlug = market.events?.[0]?.slug ?? market.slug;
  const marketUrl = getPolymarketMarketUrl(eventSlug, market.conditionId);

  const description =
    normalizeToText(market.description) ??
    normalizeToText(market.events?.[0]?.description) ??
    normalizeToText(market.events?.[0]?.title);

  const resolutionRules =
    normalizeToText(market.resolutionRules) ??
    normalizeToText(market.rules) ??
    normalizeToText(market.resolutionCriteria) ??
    normalizeToText(market.marketRules);

  const tagLabels = collectTagLabels(market);
  const currentProb = price.price;

  return {
    id: market.id,
    title: market.question ?? market.title ?? market.slug,
    slug: market.slug,
    categoryResolved: resolveCategory(market),
    directCategory: market.category ?? null,
    tags: tagLabels,
    volume: Number(market.volume ?? market.volumeNum ?? 0),
    closesAt: market.endDate,
    leading: {
      outcome: price.leadingOutcome,
      price: price.price,
      prob: currentProb,
    },
    about: {
      description,
      resolution: resolutionRules,
      sourceUrl: marketUrl,
    },
    url: marketUrl,
    highConfidence: {
      min: 0.75,
      max: 0.95,
      currentProb,
      whyText: 'Shown because implied probability is between 75% and 95%.',
    },
  };
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
