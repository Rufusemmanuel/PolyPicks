import { POLYMARKET_CONFIG } from '../config';

type OrderBookLevel = [number | string, number | string];

type OrderBookResponse = {
  bids?: OrderBookLevel[];
  asks?: OrderBookLevel[];
};

const toNumber = (value: number | string | undefined): number | null => {
  if (value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
};

const extractBestBid = (bids?: OrderBookLevel[]): number | null => {
  if (!bids?.length) return null;
  return bids.reduce<number | null>((best, [price]) => {
    const p = toNumber(price);
    if (p === null) return best;
    if (best === null) return p;
    return p > best ? p : best;
  }, null);
};

const extractBestAsk = (asks?: OrderBookLevel[]): number | null => {
  if (!asks?.length) return null;
  return asks.reduce<number | null>((best, [price]) => {
    const p = toNumber(price);
    if (p === null) return best;
    if (best === null) return p;
    return p < best ? p : best;
  }, null);
};

const computeSpreadBps = (bestBid: number | null, bestAsk: number | null): number | null => {
  if (bestBid === null || bestAsk === null) return null;
  const mid = (bestAsk + bestBid) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return null;
  return ((bestAsk - bestBid) / mid) * 10000;
};

export const getOrderBookSummary = async (tokenId: string): Promise<OrderBookResponse> => {
  const url = `${POLYMARKET_CONFIG.clobBaseUrl}/book?token_id=${encodeURIComponent(tokenId)}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`CLOB book request failed (${res.status})`);
  }
  return (await res.json()) as OrderBookResponse;
};

export const getTopOfBook = async (
  tokenId: string,
): Promise<{ bestBid: number | null; bestAsk: number | null; spreadBps: number | null }> => {
  const ob = await getOrderBookSummary(tokenId);
  const bestBid = extractBestBid(ob.bids);
  const bestAsk = extractBestAsk(ob.asks);
  const spreadBps = computeSpreadBps(bestBid, bestAsk);

  return { bestBid, bestAsk, spreadBps };
};
