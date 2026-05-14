// src/lib/polymarket/api.ts

import { POLYMARKET_CONFIG } from '../config';
import { getTopOfBook } from './clob';
import { resolveCategory } from './category';
import { isTradableMarket } from './marketStatus';
import { getPolymarketMarketUrl } from './url';
import type {
  MarketDetailsResponse,
  MarketPrice,
  MarketSummary,
  OutcomeSide,
  RawEvent,
  RawMarket,
} from './types';

type GammaQueryValue = string | number | boolean | null | undefined;
type GammaQueryParams = Record<string, GammaQueryValue>;

const GAMMA_EVENTS_REVALIDATE_SECONDS = 30;
const GAMMA_REQUEST_TIMEOUT_MS = 9000;
const GAMMA_EVENTS_LIMIT = 100;
const GAMMA_EVENTS_MAX_LIMIT = 500;
const DEFAULT_GAMMA_EVENTS_MAX_PAGES = 20;
const GAMMA_EVENTS_ORDER_FIELDS = new Set([
  'id',
  'volume_24hr',
  'volume',
  'liquidity',
  'start_date',
  'end_date',
  'competitive',
  'closed_time',
]);
const GAMMA_EVENTS_BOOLEAN_FILTERS = new Set(['ascending', 'active', 'closed']);

class PolymarketRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'PolymarketRequestError';
  }
}

const toQueryLog = (url: string) => {
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.entries());
  } catch {
    return [];
  }
};

const readResponseBody = async (res: Response) => {
  try {
    return await res.text();
  } catch {
    return null;
  }
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';

const fetchJson = async <T>(
  url: string,
  options: { revalidate?: number } = {},
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GAMMA_REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate: options.revalidate ?? 0 },
      signal: controller.signal,
    });
  } catch (error) {
    console.error('[Polymarket] Gamma request failed', {
      status: null,
      url,
      queryParams: toQueryLog(url),
      responseBody: null,
      error,
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const responseBody = await readResponseBody(res);
    console.error('[Polymarket] Gamma request failed', {
      status: res.status,
      url,
      queryParams: toQueryLog(url),
      responseBody,
    });
    throw new PolymarketRequestError(
      `Polymarket request failed (${res.status})`,
      res.status,
      url,
    );
  }
  return (await res.json()) as T;
};

const sanitizeGammaParams = (params: GammaQueryParams): GammaQueryParams => {
  const sanitized: GammaQueryParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    sanitized[key] = value;
  }
  return sanitized;
};

const clampEventsLimit = (limit: number) => {
  if (!Number.isFinite(limit)) return GAMMA_EVENTS_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), GAMMA_EVENTS_MAX_LIMIT);
};

const validateEventsParams = (params: GammaQueryParams): GammaQueryParams => {
  const validated = sanitizeGammaParams(params);
  validated.limit = clampEventsLimit(Number(validated.limit ?? GAMMA_EVENTS_LIMIT));

  const order = typeof validated.order === 'string' ? validated.order : null;
  if (!order || !GAMMA_EVENTS_ORDER_FIELDS.has(order)) {
    delete validated.order;
    delete validated.ascending;
  }

  delete validated.resolved;

  if (validated.offset != null) {
    const offset = Number(validated.offset);
    validated.offset = Number.isFinite(offset) ? Math.max(Math.trunc(offset), 0) : 0;
  }

  for (const key of GAMMA_EVENTS_BOOLEAN_FILTERS) {
    const value = validated[key];
    if (value == null) continue;
    if (typeof value === 'boolean') continue;
    if (value === 'true' || value === 'false') continue;
    delete validated[key];
  }

  return validated;
};

const buildGammaUrl = (path: string, params: GammaQueryParams = {}) => {
  const url = new URL(path, POLYMARKET_CONFIG.gammaBaseUrl);
  for (const [key, value] of Object.entries(sanitizeGammaParams(params))) {
    url.searchParams.set(key, typeof value === 'boolean' ? String(value) : String(value));
  }
  return url.toString();
};

const buildEventsUrl = (params: GammaQueryParams) =>
  buildGammaUrl('/events', validateEventsParams(params));

const fetchEventsPage = async (
  params: GammaQueryParams,
): Promise<{ events: RawEvent[]; failed: boolean; timedOut: boolean }> => {
  const url = buildEventsUrl(params);
  try {
    return {
      events: await fetchJson<RawEvent[]>(url, {
        revalidate: GAMMA_EVENTS_REVALIDATE_SECONDS,
      }),
      failed: false,
      timedOut: false,
    };
  } catch (error) {
    if (!(error instanceof PolymarketRequestError) || error.status !== 422) {
      console.error('[Polymarket] Gamma events page failed; using empty page', {
        url,
        error,
      });
      return { events: [], failed: true, timedOut: isAbortError(error) };
    }

    const fallbackUrl = buildEventsUrl({
      limit: params.limit ?? GAMMA_EVENTS_LIMIT,
      offset: params.offset,
      active: true,
      closed: false,
      order: 'end_date',
      ascending: true,
    });
    console.error('[Polymarket] Gamma events 422; retrying with minimal params', {
      url,
      fallbackUrl,
    });

    try {
      return {
        events: await fetchJson<RawEvent[]>(fallbackUrl, {
          revalidate: GAMMA_EVENTS_REVALIDATE_SECONDS,
        }),
        failed: false,
        timedOut: false,
      };
    } catch (fallbackError) {
      console.error('[Polymarket] Gamma events fallback failed; using empty page', {
        url,
        fallbackUrl,
        error: fallbackError,
      });
      return { events: [], failed: true, timedOut: isAbortError(fallbackError) };
    }
  }
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

const getGammaEventsMaxPages = () => {
  const parsed = Number(process.env.POLYPICKS_GAMMA_EVENTS_MAX_PAGES);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_GAMMA_EVENTS_MAX_PAGES;
  return Math.trunc(parsed);
};

export const getActiveMarkets = async (): Promise<MarketSummary[]> => {
  const limit = GAMMA_EVENTS_LIMIT;
  let offset = 0;
  let pageCount = 0;
  const maxPages = getGammaEventsMaxPages();
  const allEvents: RawEvent[] = [];

  try {
    while (pageCount < maxPages) {
      const { events: page, failed, timedOut } = await fetchEventsPage({
        closed: false,
        order: 'id',
        ascending: false,
        limit,
        offset,
      });
      pageCount += 1;

      console.log('[PolyPicks] Gamma events page fetched', {
        offset,
        limit,
        count: page.length,
        failed,
        timedOut,
      });

      if (timedOut) break;
      if (!failed && !page.length) break;

      allEvents.push(...page);
      if (!failed && page.length < limit) break;
      offset += limit;
    }
  } catch (error) {
    if (error instanceof PolymarketRequestError && error.status === 422) {
      console.error('[Polymarket] Gamma events returned 422; using empty list', {
        url: error.url,
      });
      return [];
    }
    throw error;
  }

  if (pageCount >= maxPages) {
    console.log('[PolyPicks] Gamma events pagination stopped at max pages', {
      maxPages,
      totalEvents: allEvents.length,
    });
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

  console.log('[PolyPicks] Gamma events raw fetched count:', allEvents.length);
  console.log('[PolyPicks] Gamma raw market count before filtering:', rawMarkets.length);

  const mapped = rawMarkets
    .map((m) => {
      const rawEndDate =
        m.endDate ??
        (m as RawMarket & { end_date?: string | null }).end_date ??
        (m as RawMarket & { end_time?: string | null }).end_time;
      const parsedEndDate = rawEndDate ? new Date(rawEndDate) : null;
      const endDate =
        parsedEndDate && !Number.isNaN(parsedEndDate.getTime())
          ? parsedEndDate
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const closedTime = m.closedTime ? new Date(m.closedTime) : undefined;

      const fallbackBestBid =
        m.bestBid != null && !Number.isNaN(Number(m.bestBid))
          ? Number(m.bestBid)
          : null;

      const outcomeData = parseOutcomeData(m.outcomes, m.outcomePrices, m.clobTokenIds);
      const parsedPrice = resolveLeadingPrice(outcomeData, fallbackBestBid);
      if (!parsedPrice) return null;
      const outcomeResolution = resolveMarketOutcome(m, outcomeData);
      const explicitlyResolved = Boolean(
        m.resolved ||
          normalizeOutcomeLabel(m.winningOutcome) ||
          normalizeOutcomeLabel(m.winningOutcomeId) ||
          normalizeOutcomeLabel(m.resolution) ||
          normalizeOutcomeLabel(m.outcome),
      );

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
        active: typeof m.active === 'boolean' ? m.active : undefined,
        acceptingOrders:
          typeof m.acceptingOrders === 'boolean' ? m.acceptingOrders : undefined,
        outcomes: outcomeData.labels.length ? outcomeData.labels : null,
        outcomePrices: outcomeData.prices.length ? outcomeData.prices : null,
        outcomeTokenIds: outcomeData.tokenIds.length ? outcomeData.tokenIds : null,
        resolved: explicitlyResolved,
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

  console.log('[PolyPicks] mapped market count before route filtering:', mapped.length);

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
    active: typeof market.active === 'boolean' ? market.active : undefined,
    acceptingOrders:
      typeof market.acceptingOrders === 'boolean' ? market.acceptingOrders : undefined,
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
    active: typeof market.active === 'boolean' ? market.active : undefined,
    acceptingOrders:
      typeof market.acceptingOrders === 'boolean' ? market.acceptingOrders : undefined,
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
    !isTradableMarket(details) ||
    details.endDate.getTime() <= now ||
    !!details.closedTime ||
    details.closed;

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
