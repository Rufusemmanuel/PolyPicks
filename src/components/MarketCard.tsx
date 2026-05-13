import { differenceInMilliseconds, formatDistanceToNow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { MarketSummary } from '@/lib/polymarket/types';
import { isTradableMarket } from '@/lib/polymarket/marketStatus';
import { SafeRemoteImage } from '@/components/ui/SafeRemoteImage';
import {
  bodyText,
  buttonGroup,
  buttonPrimaryEmphasis,
  buttonSecondary,
  buttonSecondaryLight,
  cardBase,
  cardHover,
  cardLabel,
  cardSurfaceDark,
  cardSurfaceLight,
  chipLive,
  chipMutedDark,
  chipMutedLight,
  chipSuccess,
} from '@/lib/ui/classes';
import { CTA_DETAILS, CTA_TRADE, CTA_VIEW } from '@/lib/ui/labels';

type MarketForCard = Omit<MarketSummary, 'endDate' | 'closedTime'> & {
  endDate: string | Date;
  closedTime?: string | Date | null;
};

type Props = {
  market: MarketForCard;
  isDark: boolean;
  onOpenDetails?: (marketId: string) => void;
  onTradeWithPolypicks?: (market: MarketForCard) => void;
  tradingDisabled?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: (data: {
    marketId: string;
    entryPrice: number;
    title: string;
    category: string;
    marketUrl: string;
    outcomeId?: string | null;
    outcomeLabel?: string | null;
  }) => void;
};

export function MarketCard({
  market,
  isDark,
  onOpenDetails,
  onTradeWithPolypicks,
  tradingDisabled = false,
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
  const thumbUrl = market.thumbnailUrl ?? null;

  const isMarketTradable = isTradableMarket(market);
  const isClosed = !isMarketTradable || countdownLabel === 'Closed';
  const buttonSecondaryClass = isDark ? buttonSecondary : buttonSecondaryLight;
  const secondaryTone = isDark ? 'border-white/15 bg-white/[0.07] text-white/90 hover:bg-white/10' : '';
  const chipMuted = isDark ? chipMutedDark : chipMutedLight;

  return (
    <div
      className={`${cardBase} ${isDark ? cardSurfaceDark : cardSurfaceLight} ${cardHover}`}
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {thumbUrl && (
              <div
                className={`relative h-12 w-12 overflow-hidden rounded-xl border ${
                  isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-slate-100'
                }`}
              >
                <SafeRemoteImage
                  src={thumbUrl}
                  alt={market.title}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
            )}
            <div>
              <p className={`${cardLabel} ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                {market.category}
              </p>
              <h3
                className={`text-xl font-semibold leading-tight ${
                  isDark ? 'text-slate-50' : 'text-slate-900'
                } line-clamp-2`}
              >
                {market.title}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={isMarketTradable ? chipLive : chipMuted}>
              {isMarketTradable ? 'Live' : 'Closed'}
            </span>
            <button
              type="button"
              aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              aria-pressed={isBookmarked}
              onClick={() =>
                onToggleBookmark?.({
                  marketId: market.id,
                  entryPrice: market.price.price,
                  title: market.title,
                  category: market.category ?? 'Unknown',
                  marketUrl: market.url,
                  outcomeLabel: market.price.leadingOutcome,
                  outcomeId: (() => {
                    const outcomes = market.outcomes ?? [];
                    const tokenIds = market.outcomeTokenIds ?? [];
                    const idx = outcomes.findIndex(
                      (label) =>
                        label.trim().toLowerCase() ===
                        market.price.leadingOutcome.trim().toLowerCase(),
                    );
                    return idx >= 0 ? tokenIds[idx] ?? null : null;
                  })(),
                })
              }
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
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

        <div
          className={`rounded-xl border px-4 py-3 ${
            isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center">
            <div>
              <p className={`${bodyText} ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                Leading side
              </p>
              <div className={`mt-2 ${chipSuccess}`}>
                <span>{market.price.leadingOutcome}</span>
                <span className="h-3 w-px bg-current/30" />
                <span>{(market.price.price * 100).toFixed(1)}c</span>
              </div>
            </div>
            <div>
              <p className={`${bodyText} ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                Volume
              </p>
              <p
                className={`text-lg font-semibold ${
                  isDark ? 'text-slate-50' : 'text-slate-900'
                }`}
              >
                ${Intl.NumberFormat().format(market.volume)}
              </p>
            </div>
            <div>
              <p className={`${bodyText} ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                Closes
              </p>
              <p
                className={`text-sm font-semibold ${
                  isDark ? 'text-slate-50' : 'text-slate-900'
                }`}
              >
                {formatDistanceToNow(new Date(market.endDate), { addSuffix: true })}
              </p>
            </div>
            <div className="sm:text-right">
              <p className={`${bodyText} ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                {isClosed ? 'Status' : 'Time left'}
              </p>
              {isClosed ? (
                <span className={`mt-2 ${chipMuted}`}>Closed</span>
              ) : (
                <p
                  className={`text-lg font-semibold ${
                    isDark ? 'text-slate-50' : 'text-slate-900'
                  }`}
                >
                  {countdownLabel}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className={`${buttonGroup} w-full max-w-[360px] sm:w-auto`}>
            <div className="grid w-full grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onTradeWithPolypicks?.(market)}
              disabled={tradingDisabled || !isMarketTradable}
              className={`${buttonPrimaryEmphasis} h-9 w-full justify-center px-4 text-sm font-medium`}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
                {CTA_TRADE}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onOpenDetails?.(market.id)}
              className={`${buttonSecondaryClass} ${secondaryTone} h-9 w-full justify-center px-4 text-sm font-medium`}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                {CTA_DETAILS}
              </span>
            </button>
            <a
              href={market.url}
              target="_blank"
              rel="noreferrer"
              className={`${buttonSecondaryClass} ${secondaryTone} h-9 w-full justify-center px-4 text-sm font-medium`}
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 3h7v7" />
                  <path d="M10 14L21 3" />
                  <path d="M21 14v7h-7" />
                  <path d="M3 10V3h7" />
                </svg>
                {CTA_VIEW}
              </span>
            </a>
            </div>
          </div>
          <span
            className={`whitespace-nowrap text-xs ${isDark ? 'text-white/40' : 'text-slate-500'}`}
          >
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


