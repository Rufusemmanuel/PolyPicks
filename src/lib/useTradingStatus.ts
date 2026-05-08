'use client';

import { useQuery } from '@tanstack/react-query';

type TradingStatus = {
  enabled: boolean;
  tradingFlag: boolean;
  hasRuntimeConfig: boolean;
  missing: string[];
};

const fetchTradingStatus = async (): Promise<TradingStatus> => {
  const res = await fetch('/api/polymarket/trading-status');
  if (!res.ok) throw new Error('Unable to load trading status');
  return (await res.json()) as TradingStatus;
};

export const useTradingStatus = () =>
  useQuery({
    queryKey: ['trading-status'],
    queryFn: fetchTradingStatus,
    staleTime: 1000 * 30,
  });
