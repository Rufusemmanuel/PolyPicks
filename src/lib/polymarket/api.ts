// src/lib/polymarket/api.ts

import { POLYMARKET_CONFIG } from '../config';
import { getTopOfBook } from './clob';
import { resolveCategory } from './category';
import { getPolymarketMarketUrl } from './url';
import type {
  MarketDetailsResponse,
  MarketPrice,
  MarketSummary,
  OutcomeSide,
  RawEvent,
  RawMarket,
} from './types';

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Polymarket request failed (${res.status})`);
  }
  return (await res.json()) as T;
};

const CONDITION_ID_RE = /^0x[0-9a-fA-F]{64}$/;

type ParsedOutcomes = {
  labels: string[];
  prices: number[];
  tokenIds: string[];
};

const parseOutcomeData = (
  outcomes?: string,
  outcomePrices?: string,
  clobTokenIds?: string,
): ParsedOutcomes => {
  let labels: string[] = [];
  let prices: number[] = [];
  let tokenIds: string[] = [];

  if (outcomes) {
    try {
      labels = JSON.parse(outcomes) as string[];
    } catch {
      labels = [];
    }
  }

  if (outcomePrices) {
    try {
      const parsed = JSON.parse(outcomePrices) as string[];
      const numeric = parsed.map((p) => Number(p));
      prices = numeric.some((n) => Number.isNaN(n)) ? [] : numeric;
    } catch {
      prices = [];
    }
  }

  if (clobTokenIds) {
    try {
      tokenIds = JSON.parse(clobTokenIds) as string[];
    } catch {
      tokenIds = [];
    }
  }

  return { labels, prices, tokenIds };
};

const resolveLeadingPrice = (
  outcomeData: ParsedOutcomes,
  fallbackBestBid: number | null,
): MarketPrice | null => {
  const { labels, prices } = outcomeData;
  if (labels.length && prices.length) {
    const maxIdx = prices.reduce(
      (max, price, idx) => (price > prices[max] ? idx : max),
      0,
    );
    return {
      leadingOutcome: (labels[maxIdx] ?? 'Yes') as OutcomeSide,
      price: prices[maxIdx],
    };
  }
  if (fallbackBestBid != null) {
    return { leadingOutcome: 'Yes' as OutcomeSide, price: fallbackBestBid };
  }
  return null;
};

const resolveThumbnailUrl = (market: RawMarket): string | null => {
  const candidates = [market.image, market.imageUrl, market.icon]
    .filter((value) => typeof value === 'string')
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
  return candidates[0] ?? null;
};

let loggedThumbnailHosts = false;

const normalizeOutcomeLabel = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const findOutcomeIndex = (labels: string[], target: string | null) => {
  if (!target) return null;
  const normalized = target.trim().toLowerCase();
  if (!normalized) return null;
  const idx = labels.findIndex((label) => label.trim().toLowerCase() === normalized);
  return idx >= 0 ? idx : null;
};

const inferResolvedOutcomeIndex = (prices: number[]) => {
  if (!prices.length) return null;
  const maxIdx = prices.reduce(
    (max, price, idx) => (price > prices[max] ? idx : max),
    0,
  );
  const maxPrice = prices[maxIdx] ?? 0;
  if (maxPrice < 0.99) return null;
  const othersBelow = prices.every((price, idx) => (idx === maxIdx ? true : price <= 0.01));
  return othersBelow ? maxIdx : null;
};

const resolveMarketOutcome = (
  market: RawMarket,
  outcomeData: ParsedOutcomes,
): { resolved: boolean; winningOutcome?: string | null; winningOutcomeId?: string | null } => {
  const labels = outcomeData.labels ?? [];
  const tokenIds = outcomeData.tokenIds ?? [];

  let winningOutcomeId = normalizeOutcomeLabel(market.winningOutcomeId);
  let winningOutcome = normalizeOutcomeLabel(market.winningOutcome);
  const resolutionLabel =
    normalizeOutcomeLabel(market.resolution) ?? normalizeOutcomeLabel(market.outcome);
  if (!winningOutcome && resolutionLabel) {
    winningOutcome = resolutionLabel;
  }

  const labelIndex = findOutcomeIndex(labels, winningOutcome);
  if (!winningOutcomeId && labelIndex != null) {
    winningOutcomeId = tokenIds[labelIndex] ?? null;
  }

  if (!winningOutcome && winningOutcomeId) {
    const idIndex = tokenIds.findIndex((id) => id === winningOutcomeId);
    winningOutcome = idIndex >= 0 ? labels[idIndex] ?? null : null;
  }

  if (!winningOutcome && !winningOutcomeId) {
    const inferredIndex = inferResolvedOutcomeIndex(outcomeData.prices);
    if (inferredIndex != null) {
      winningOutcome = labels[inferredIndex] ?? null;
      winningOutcomeId = tokenIds[inferredIndex] ?? null;
    }
  }

  const resolved = Boolean(market.resolved) || Boolean(winningOutcome || winningOutcomeId);
  return { resolved, winningOutcome, winningOutcomeId };
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

      const outcomeData = parseOutcomeData(m.outcomes, m.outcomePrices, m.clobTokenIds);
      const parsedPrice = resolveLeadingPrice(outcomeData, fallbackBestBid);
      if (!parsedPrice) return null;
      const outcomeResolution = resolveMarketOutcome(m, outcomeData);

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
        closed: Boolean(m.closed),
        outcomes: outcomeData.labels.length ? outcomeData.labels : null,
        outcomePrices: outcomeData.prices.length ? outcomeData.prices : null,
        outcomeTokenIds: outcomeData.tokenIds.length ? outcomeData.tokenIds : null,
        resolved: outcomeResolution.resolved,
        winningOutcome: outcomeResolution.winningOutcome ?? null,
        winningOutcomeId: outcomeResolution.winningOutcomeId ?? null,
        price: parsedPrice,
        volume: Number(m.volume ?? m.volumeNum ?? 0),
        url: marketUrl,
        conditionId: m.conditionId,
        thumbnailUrl: resolveThumbnailUrl(m),
      } satisfies MarketSummary;
    })
    .filter(Boolean) as MarketSummary[];

  if (process.env.NODE_ENV !== 'production' && !loggedThumbnailHosts) {
    const hosts = new Set<string>();
    for (const market of mapped.slice(0, 50)) {
      if (!market.thumbnailUrl) continue;
      try {
        hosts.add(new URL(market.thumbnailUrl).hostname);
      } catch {
        continue;
      }
    }
    if (hosts.size) {
      console.log('[PolyPicks] thumbnail hosts:', Array.from(hosts));
    }
    loggedThumbnailHosts = true;
  }

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

  const outcomeData = parseOutcomeData(
    market.outcomes,
    market.outcomePrices,
    market.clobTokenIds,
  );
  const price = resolveLeadingPrice(
    outcomeData,
    market.bestBid ? Number(market.bestBid) : null,
  );
  if (!price) return null;
  const outcomeResolution = resolveMarketOutcome(market, outcomeData);

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
    closed: Boolean(market.closed),
    outcomes: outcomeData.labels.length ? outcomeData.labels : null,
    outcomePrices: outcomeData.prices.length ? outcomeData.prices : null,
    outcomeTokenIds: outcomeData.tokenIds.length ? outcomeData.tokenIds : null,
    resolved: outcomeResolution.resolved,
    winningOutcome: outcomeResolution.winningOutcome ?? null,
    winningOutcomeId: outcomeResolution.winningOutcomeId ?? null,
    price,
    volume: Number(market.volume ?? market.volumeNum ?? 0),
    url: marketUrl,
    conditionId: market.conditionId,
    thumbnailUrl: resolveThumbnailUrl(market),
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
  let market: RawMarket | null = null;
  if (CONDITION_ID_RE.test(marketId)) {
    const url =
      `${POLYMARKET_CONFIG.gammaBaseUrl}/markets?condition_ids=` +
      `${encodeURIComponent(marketId)}&limit=1`;
    const markets = await fetchJson<RawMarket[]>(url);
    market = markets[0] ?? null;
  } else {
    const url = `${POLYMARKET_CONFIG.gammaBaseUrl}/markets/${marketId}`;
    market = await fetchJson<RawMarket>(url);
  }

  if (!market) return null;

  const outcomeData = parseOutcomeData(
    market.outcomes,
    market.outcomePrices,
    market.clobTokenIds,
  );
  const price = resolveLeadingPrice(
    outcomeData,
    market.bestBid ? Number(market.bestBid) : null,
  );
  if (!price) return null;
  const outcomeResolution = resolveMarketOutcome(market, outcomeData);

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
    closed: Boolean(market.closed),
    closedTime: market.closedTime ?? null,
    outcomes: outcomeData.labels.length ? outcomeData.labels : null,
    outcomePrices: outcomeData.prices.length ? outcomeData.prices : null,
    outcomeTokenIds: outcomeData.tokenIds.length ? outcomeData.tokenIds : null,
    resolved: outcomeResolution.resolved,
    winningOutcome: outcomeResolution.winningOutcome ?? null,
    winningOutcomeId: outcomeResolution.winningOutcomeId ?? null,
    conditionId: market.conditionId ?? null,
    thumbnailUrl: resolveThumbnailUrl(market),
    leading: {
      outcome: price.leadingOutcome,
      price: price.price,
      prob: currentProb,
    },
    about: {
      description,
      resolution: resolutionRules,
    },
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
  const isClosed =
    details.endDate.getTime() <= now || !!details.closedTime || details.closed;

  if (!isClosed) return { resolved: false };

  if (!details.resolved || !details.winningOutcome) {
    return { resolved: false };
  }

  return {
    resolved: true,
    winningOutcome: details.winningOutcome as OutcomeSide,
    closedAt: details.closedTime ?? details.endDate,
  };
};
