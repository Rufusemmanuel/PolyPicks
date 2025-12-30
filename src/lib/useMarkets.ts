'use client';

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subscribeToMarketsBrowser } from './polymarket/realtime-browser';
import type { BookmarkHistoryDto, MarketSummary } from './polymarket/types';

type MarketWithStrings = Omit<MarketSummary, 'endDate' | 'closedTime'> & {
  endDate: string;
  closedTime?: string | null;
};

type MarketsResponse = {
  window24: MarketWithStrings[];
  window48: MarketWithStrings[];
};

const fetchMarkets = async (): Promise<MarketsResponse> => {
  const res = await fetch('/api/markets');
  if (!res.ok) throw new Error('Unable to load markets');
  const body = await res.json();

  // In debugRelax mode the API may return a plain array. Normalize to windowed shape for the UI.
  if (Array.isArray(body)) {
    return {
      window24: body as MarketWithStrings[],
      window48: body as MarketWithStrings[],
    };
  }

  return body as MarketsResponse;
};

export const useMarkets = () => {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['markets'],
    queryFn: fetchMarkets,
    refetchInterval: 10000,
  });

  const marketIds = useMemo(() => {
    const all = [...(query.data?.window24 ?? []), ...(query.data?.window48 ?? [])];
    return Array.from(new Set(all.map((m) => m.id)));
  }, [query.data?.window24, query.data?.window48]);

  useEffect(() => {
    if (!marketIds.length) return;
    const stop = subscribeToMarketsBrowser(marketIds, (update) => {
      client.setQueryData<MarketsResponse>(['markets'], (prev) => {
        if (!prev) return prev;
        const updateMarkets = (markets: MarketWithStrings[]) =>
          markets.map((m) =>
            m.id === update.marketId && update.price ? { ...m, price: update.price } : m,
          );

        return {
          ...prev,
          window24: updateMarkets(prev.window24),
          window48: updateMarkets(prev.window48),
        };
      });
    });

    return stop;
  }, [client, marketIds]);

  return query;
};

type HistoryResponse = { bookmarks: BookmarkHistoryDto[]; total: number };

export const useHistory = (timeframe: string = 'all') =>
  useQuery<HistoryResponse>({
    queryKey: ['history', timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/history?timeframe=${encodeURIComponent(timeframe)}`);
      if (!res.ok) throw new Error('Unable to load history');
      return (await res.json()) as HistoryResponse;
    },
    refetchInterval: 30000,
  });
