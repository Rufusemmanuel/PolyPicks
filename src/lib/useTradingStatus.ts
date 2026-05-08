'use client';

import { useQuery } from '@tanstack/react-query';

type TradingStatus = {
  enabled: boolean;
  tradingFlag: boolean;
  hasRuntimeConfig: boolean;
  missing: string[];
  disabledReasons: string[];
};

const fetchTradingStatus = async (): Promise<TradingStatus> => {
  const res = await fetch('/api/polymarket/trading-status', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as TradingStatus | null;
  if (!res.ok || !data) throw new Error('Unable to load trading status');
  return data;
};

export const useTradingStatus = () =>
  useQuery({
    queryKey: ['trading-status'],
    queryFn: fetchTradingStatus,
    staleTime: 1000 * 30,
  });
