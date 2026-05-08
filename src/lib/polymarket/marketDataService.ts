'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrderBookSummary } from '@polymarket/clob-client-v2';
import { createClobClient } from './clobClientFactory';
import { TRADE_CONFIG } from './tradeConfig';

type RawLevel =
  | [number | string, number | string]
  | { price?: number | string; size?: number | string };

export type OrderBookLevel = {
  price: number;
  size: number;
  cumulativeSize: number;
};

export type OrderBookState = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  minOrderSize: number | null;
  tickSize: number | null;
  negRisk: boolean | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
};

const toNumber = (value: number | string | undefined | null) => {
  if (value == null) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLevels = (levels: unknown, isBid: boolean): OrderBookLevel[] => {
  if (!Array.isArray(levels)) return [];
  const parsed = (levels as RawLevel[])
    .map((level) => {
      if (Array.isArray(level)) {
        const price = toNumber(level[0]);
        const size = toNumber(level[1]);
        if (price == null || size == null) return null;
        return { price, size };
      }
      if (level && typeof level === 'object') {
        const price = toNumber(level.price);
        const size = toNumber(level.size);
        if (price == null || size == null) return null;
        return { price, size };
      }
      return null;
    })
    .filter((level): level is { price: number; size: number } => level != null)
    .sort((a, b) => (isBid ? b.price - a.price : a.price - b.price));

  let running = 0;
  return parsed.map((level) => {
    running += level.size;
    return {
      ...level,
      cumulativeSize: running,
    };
  });
};

const extractBest = (levels: OrderBookLevel[], isBid: boolean) => {
  if (!levels.length) return null;
  return levels.reduce<number | null>((best, level) => {
    if (best == null) return level.price;
    return isBid ? Math.max(best, level.price) : Math.min(best, level.price);
  }, null);
};

export const useOrderBook = (
  tokenId: string | null,
  pollMs: number = TRADE_CONFIG.orderbookPollMs,
): OrderBookState => {
  const [state, setState] = useState<OrderBookState>({
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    minOrderSize: null,
    tickSize: null,
    negRisk: null,
    isLoading: Boolean(tokenId),
    error: null,
    lastUpdated: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const client = useMemo(() => createClobClient({ host: TRADE_CONFIG.clobHost }), []);

  useEffect(() => {
    if (!tokenId) {
      setState((prev) => ({
        ...prev,
        bids: [],
        asks: [],
        bestBid: null,
        bestAsk: null,
        minOrderSize: null,
        tickSize: null,
        negRisk: null,
        isLoading: false,
        error: null,
        lastUpdated: null,
      }));
      return undefined;
    }

    let active = true;
    const poll = async () => {
      try {
        if (!active) return;
        setState((prev) => ({ ...prev, isLoading: prev.lastUpdated == null }));
        const book = (await client.getOrderBook(tokenId)) as OrderBookSummary & {
          min_order_size?: string | number;
          tick_size?: string | number;
          neg_risk?: boolean;
        };
        if (!active) return;
        const bids = normalizeLevels(book?.bids ?? [], true);
        const asks = normalizeLevels(book?.asks ?? [], false);
        setState({
          bids,
          asks,
          bestBid: extractBest(bids, true),
          bestAsk: extractBest(asks, false),
          minOrderSize: toNumber(book?.min_order_size),
          tickSize: toNumber(book?.tick_size),
          negRisk: typeof book?.neg_risk === 'boolean' ? book.neg_risk : null,
          isLoading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (error) {
        if (!active) return;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unable to fetch order book.',
        }));
      }
    };

    poll();
    timerRef.current = setInterval(poll, Math.max(5000, pollMs));

    return () => {
      active = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [client, pollMs, tokenId]);

  return state;
};
