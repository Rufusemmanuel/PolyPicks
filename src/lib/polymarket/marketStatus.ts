type MarketLike = {
  id?: unknown;
  slug?: unknown;
  status?: unknown;
  closed?: unknown;
  isClosed?: unknown;
  resolved?: unknown;
  active?: unknown;
  acceptingOrders?: unknown;
  tradingEnabled?: unknown;
  endDate?: unknown;
  end_date?: unknown;
  end_time?: unknown;
  closeTime?: unknown;
  closedTime?: unknown;
  closesAt?: unknown;
  secondsDelay?: unknown;
};

const CLOSED_STATUSES = new Set(['closed', 'resolved', 'finalized', 'settled']);

const readMarketField = (market: MarketLike | null | undefined, key: keyof MarketLike) => {
  if (!market || typeof market !== 'object') return undefined;
  try {
    return market[key];
  } catch {
    return undefined;
  }
};

const parseDateValue = (value: unknown) => {
  try {
    if (value == null) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

export const isMarketClosed = (market?: MarketLike | null) => {
  if (!market || typeof market !== 'object') return false;
  const statusValue = readMarketField(market, 'status');
  const status =
    typeof statusValue === 'string' ? statusValue.toLowerCase() : null;
  const statusClosed = status ? CLOSED_STATUSES.has(status) : false;
  if (statusClosed) return true;
  if (readMarketField(market, 'closed') === true) return true;
  if (readMarketField(market, 'isClosed') === true) return true;
  if (readMarketField(market, 'resolved') === true) return true;

  const closeValue =
    readMarketField(market, 'closedTime') ??
    readMarketField(market, 'closeTime') ??
    readMarketField(market, 'endDate') ??
    readMarketField(market, 'end_date') ??
    readMarketField(market, 'end_time') ??
    readMarketField(market, 'closesAt');
  const closeDate = parseDateValue(closeValue);
  if (!closeDate) return false;
  return closeDate.getTime() <= Date.now();
};

export const isTradableMarket = (market?: MarketLike | null) => {
  try {
    if (!market || typeof market !== 'object') return true;
    if (isMarketClosed(market)) return false;
    if (readMarketField(market, 'active') === false) return false;
    if (readMarketField(market, 'acceptingOrders') === false) return false;
    if (readMarketField(market, 'tradingEnabled') === false) return false;
    return true;
  } catch (error) {
    console.error('[markets_filter_error]', {
      marketId: readMarketField(market, 'id'),
      slug: readMarketField(market, 'slug'),
      error,
    });
    return true;
  }
};
