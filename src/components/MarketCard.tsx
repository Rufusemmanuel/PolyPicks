import { differenceInMilliseconds, formatDistanceToNow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { MarketSummary } from '@/lib/polymarket/types';

type MarketForCard = Omit<MarketSummary, 'endDate' | 'closedTime'> & {
  endDate: string | Date;
  closedTime?: string | Date | null;
};

type Props = {
  market: MarketForCard;
  isDark: boolean;
  onOpenDetails?: (marketId: string) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: (marketId: string, initialPrice: number) => void;
};

export function MarketCard({
  market,
  isDark,
  onOpenDetails,
  isBookmarked = false,
  onToggleBookmark,
}: Props) {
  const [remaining, setRemaining] = useState(() =>
    differenceInMilliseconds(new Date(market.endDate), Date.now()),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(differenceInMilliseconds(new Date(market.endDate), Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [market.endDate]);

  const countdownLabel = useMemo(() => {
    if (remaining <= 0) return 'Closed';
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }

    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }, [remaining]);

  return (
    <div
      className={`rounded-2xl border shadow-md transition hover:-translate-y-0.5 hover:shadow-lg ${
        isDark
          ? 'border-slate-800 bg-[#0f182c] shadow-slate-900/60 hover:shadow-slate-900/70'
          : 'border-slate-200 bg-white shadow-slate-200 hover:shadow-slate-300'
      }`}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p
              className={`text-xs uppercase tracking-wide ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {market.category}
            </p>
            <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
              {market.title}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                isDark
                  ? 'border-blue-800 bg-blue-900/40 text-blue-100'
                  : 'border-blue-200 bg-blue-50 text-[#002cff]'
              }`}
            >
              Live
            </span>
            <button
              type="button"
              aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              aria-pressed={isBookmarked}
              onClick={() => onToggleBookmark?.(market.id, market.price.price)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition ${
                isBookmarked
                  ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-500'
                  : isDark
                    ? 'border-slate-700 text-slate-300 hover:border-slate-400 hover:text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-500 hover:text-slate-900'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill={isBookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Leading side</p>
            <p className={`text-lg font-semibold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
              {(market.price.price * 100).toFixed(1)}c ({market.price.leadingOutcome})
            </p>
          </div>
          <div>
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Volume</p>
            <p className={`text-lg font-semibold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
              ${Intl.NumberFormat().format(market.volume)}
            </p>
          </div>
          <div>
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Closes</p>
            <p className={`text-sm font-semibold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
              {formatDistanceToNow(new Date(market.endDate), { addSuffix: true })}
            </p>
          </div>
          <div className="ml-auto">
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Time left</p>
            <p className={`text-lg font-semibold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
              {countdownLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <a
            href={market.url}
            target="_blank"
            rel="noreferrer"
            className="w-full whitespace-nowrap rounded-full bg-[#002cff] px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 sm:w-auto sm:px-4 sm:text-sm"
          >
            Trade on Polymarket
          </a>
          <button
            type="button"
            onClick={() => onOpenDetails?.(market.id)}
            className={`w-full whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition sm:w-auto sm:px-4 sm:text-sm ${
              isDark
                ? 'border-slate-600 text-slate-200 hover:border-slate-400'
                : 'border-slate-300 text-slate-700 hover:border-slate-500'
            }`}
          >
            Market details
          </button>
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            ID:{' '}
            <span className={`font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {market.id}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
