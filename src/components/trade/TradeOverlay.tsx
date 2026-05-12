'use client';

import { useEffect, useMemo, useState } from 'react';
import { TradeExperience } from './TradeExperience';
import { useTheme } from '@/components/theme-context';
import type { MarketDetailsResponse } from '@/lib/polymarket/types';
import { SafeRemoteImage } from '@/components/ui/SafeRemoteImage';

type InitialTradeState = {
  outcome?: 'yes' | 'no';
  orderType?: 'market' | 'limit';
  side?: 'buy' | 'sell';
  tokenId?: string;
  maxShares?: string;
  limitPriceCents?: number;
  suggestedPriceCents?: number;
  amountUsd?: string;
};

type Props = {
  marketId: string;
  initialTradeState?: InitialTradeState;
  initialTradeKey?: string;
  onClose: () => void;
};

const resolveThumbnail = (market: MarketDetailsResponse | null) =>
  market?.thumbnailUrl ?? null;

export function TradeOverlay({
  marketId,
  initialTradeState,
  initialTradeKey,
  onClose,
}: Props) {
  const { isDark } = useTheme();
  const [market, setMarket] = useState<MarketDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/markets/${marketId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load market.');
        return (await res.json()) as MarketDetailsResponse;
      })
      .then((data) => {
        if (isMounted) setMarket(data);
      })
      .catch((err: Error) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [marketId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const thumbnail = useMemo(() => resolveThumbnail(market), [market]);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close trade overlay"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full items-start justify-center px-4 py-6 md:py-10">
        <div
          role="dialog"
          aria-modal="true"
          className={`w-full max-w-6xl overflow-hidden rounded-2xl border shadow-2xl ${
            isDark ? 'border-slate-800 bg-[#0b1224] text-slate-100' : 'border-slate-200 bg-white text-slate-900'
          }`}
        >
          <div
            className={`flex items-start justify-between gap-4 border-b px-5 py-4 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {thumbnail && (
                <div
                  className={`relative h-12 w-12 overflow-hidden rounded-xl border ${
                    isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-slate-100'
                  }`}
                >
                  <SafeRemoteImage
                    src={thumbnail}
                    alt={market?.title ?? 'Market'}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
              )}
              <div>
                <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Trade
                </p>
                <h2 className="text-lg font-semibold">
                  {market?.title ?? 'Loading market...'}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                isDark ? 'border-slate-700 text-slate-200 hover:border-slate-500' : 'border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-5 py-6">
            {loading && (
              <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Loading market...</p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!loading && !error && (
              <TradeExperience
                marketId={marketId}
                market={market}
                initialTradeState={initialTradeState}
                initialTradeKey={initialTradeKey}
                overlayMode
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
