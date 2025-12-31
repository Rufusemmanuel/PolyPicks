'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { useAlerts } from '@/lib/useAlerts';
import { useBookmarks } from '@/lib/useBookmarks';
import { useMarkets } from '@/lib/useMarkets';
import type { MarketSummary } from '@/lib/polymarket/types';
import { resolveFinalPrice, resolveOutcomePrice } from '@/lib/polymarket/settlement';
import { useTheme } from '@/components/theme-context';

type MarketWithStrings = Omit<MarketSummary, 'endDate' | 'closedTime'> & {
  endDate: string;
  closedTime?: string | null;
};

export default function TradeClient() {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const bookmarksQuery = useBookmarks(Boolean(user));
  const marketsQuery = useMarkets();
  const router = useRouter();
  const searchParams = useSearchParams();
  type AnyRoute = Parameters<typeof router.push>[0];
  const asRoute = (href: string) => href as unknown as AnyRoute;
  const [selectedAnalytics, setSelectedAnalytics] = useState<{
    marketId: string;
    bookmarkedAt: string;
    entryPrice: number;
    outcomeId?: string | null;
    outcomeLabel?: string | null;
    initialTab?: 'analytics' | 'alerts';
  } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const alertsQuery = useAlerts(Boolean(user));
  const handledDeepLink = useRef(false);

  useEffect(() => {
    if (!user) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runCheck = () => {
      fetch('/api/cron/check-alerts', { method: 'POST' }).catch(() => null);
    };

    const startPolling = () => {
      if (document.hidden) return;
      if (!intervalId) {
        runCheck();
        intervalId = setInterval(runCheck, 60_000);
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user]);

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!user) {
      router.push(asRoute('/?auth=login'));
    }
  }, [sessionQuery.isLoading, user, router, asRoute]);

  const marketMap = useMemo(() => {
    const all = [
      ...(marketsQuery.data?.window24 ?? []),
      ...(marketsQuery.data?.window48 ?? []),
    ];
    return new Map(all.map((market) => [market.id, market]));
  }, [marketsQuery.data?.window24, marketsQuery.data?.window48]);

  const bookmarkedMarkets = useMemo(() => {
    const bookmarks = bookmarksQuery.data?.bookmarks ?? [];
    return bookmarks.map((bookmark) => ({
      market: marketMap.get(bookmark.marketId),
      bookmark,
    }));
  }, [bookmarksQuery.data?.bookmarks, marketMap]);

  const alertMap = useMemo(() => {
    const alerts = alertsQuery.data?.alerts ?? [];
    return new Map(alerts.map((alert) => [alert.marketId, alert]));
  }, [alertsQuery.data?.alerts]);

  useEffect(() => {
    if (handledDeepLink.current) return;
    const marketId = searchParams.get('marketId');
    if (!marketId) return;
    const tab = searchParams.get('tab');
    const bookmark = bookmarksQuery.data?.bookmarks.find(
      (item) => item.marketId === marketId,
    );
    if (!bookmark) return;
    handledDeepLink.current = true;
    setSelectedAnalytics({
      marketId,
      bookmarkedAt: bookmark.createdAt,
      entryPrice: bookmark.entryPrice,
      outcomeId: bookmark.outcomeId ?? null,
      outcomeLabel: bookmark.outcomeLabel ?? null,
      initialTab: tab === 'alerts' ? 'alerts' : 'analytics',
    });
    router.replace(asRoute('/trade'), { scroll: false });
  }, [bookmarksQuery.data?.bookmarks, searchParams, router, asRoute]);

  if (!user) {
    return (
      <main
        className={
          isDark
            ? 'min-h-screen bg-[#0b1224] text-slate-100'
            : 'min-h-screen bg-slate-50 text-slate-900'
        }
      >
        <div className="mx-auto max-w-4xl px-4 py-12">
          <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Redirecting to login...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={
        isDark
          ? 'min-h-screen bg-[#0b1224] text-slate-100'
          : 'min-h-screen bg-slate-50 text-slate-900'
      }
    >
      <div className="mx-auto max-w-5xl px-4 py-12 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Trade</p>
          <h1 className="text-3xl font-semibold">Trade</h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Coming soon. Start with your bookmarked markets.
          </p>
        </div>

        <div
          className={`rounded-2xl border p-6 space-y-4 ${
            isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
          }`}
        >
          <h2
            className={`text-sm font-semibold uppercase tracking-wide ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            Bookmarked markets
          </h2>
          {removeError && (
            <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
              {removeError}
            </p>
          )}
          {bookmarkedMarkets.length === 0 && (
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              No bookmarks yet.
            </p>
          )}
          {bookmarkedMarkets.length > 0 && (
            <div className="space-y-3">
              {bookmarkedMarkets.map(({ market, bookmark }) => {
                const title = market?.title ?? bookmark.title ?? 'Unknown market';
                const category = market?.category ?? bookmark.category ?? 'Unknown';
                const marketUrl = market?.url ?? bookmark.marketUrl ?? '#';
                const alert = alertMap.get(bookmark.marketId);
                return (
                <div
                  key={bookmark.marketId}
                  className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    isDark ? 'border-slate-800 bg-[#0b1224]' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {category}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`truncate text-base font-semibold ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}
                        title={title}
                      >
                        {title}
                      </p>
                      {alert && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedAnalytics({
                              marketId: bookmark.marketId,
                              bookmarkedAt: bookmark.createdAt,
                              entryPrice: bookmark.entryPrice,
                              outcomeId: bookmark.outcomeId ?? null,
                              outcomeLabel: bookmark.outcomeLabel ?? null,
                              initialTab: 'alerts',
                            })
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            alert.enabled
                              ? isDark
                                ? 'border-blue-500/60 text-blue-100 hover:border-blue-400'
                                : 'border-blue-200 text-blue-700 hover:border-blue-300'
                              : isDark
                                ? 'border-slate-700 text-slate-400 hover:border-slate-500'
                                : 'border-slate-300 text-slate-500 hover:border-slate-400'
                          }`}
                        >
                          <span aria-hidden="true">🔔</span>
                          <span>
                            {[
                              alert.profitThresholdPct != null
                                ? `+${alert.profitThresholdPct.toFixed(0)}`
                                : null,
                              alert.lossThresholdPct != null
                                ? `-${alert.lossThresholdPct.toFixed(0)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' / ') || 'Alert'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:w-[420px] sm:flex-shrink-0 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedAnalytics({
                          marketId: bookmark.marketId,
                          bookmarkedAt: bookmark.createdAt,
                          entryPrice: bookmark.entryPrice,
                          outcomeId: bookmark.outcomeId ?? null,
                          outcomeLabel: bookmark.outcomeLabel ?? null,
                        })
                      }
                      className={`inline-flex h-10 min-w-[130px] items-center justify-center whitespace-nowrap rounded-full border px-4 text-xs font-semibold transition hover:border-slate-400 ${
                        isDark
                          ? 'border-slate-700 text-slate-200'
                          : 'border-slate-300 text-slate-700'
                      }`}
                    >
                      Analytics
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setRemoveError(null);
                        try {
                          await bookmarksQuery.removeBookmark(bookmark.marketId);
                        } catch (error) {
                          console.error('[trade] remove bookmark error', error);
                          setRemoveError('Unable to remove bookmark. Please try again.');
                        }
                      }}
                      className={`inline-flex h-10 min-w-[110px] items-center justify-center whitespace-nowrap rounded-full border px-4 text-xs font-semibold transition hover:border-red-400 ${
                        isDark
                          ? 'border-red-500/60 text-red-200'
                          : 'border-red-300 text-red-600'
                      }`}
                    >
                      Remove
                    </button>
                    <a
                      href={marketUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 min-w-[180px] items-center justify-center whitespace-nowrap rounded-full bg-[#002cff] px-4 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Trade on Polymarket
                    </a>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
      {selectedAnalytics && (
        <AnalyticsModal
          market={marketMap.get(selectedAnalytics.marketId)}
          marketId={selectedAnalytics.marketId}
          bookmarkedAt={selectedAnalytics.bookmarkedAt}
          entryPrice={selectedAnalytics.entryPrice}
          outcomeId={selectedAnalytics.outcomeId}
          outcomeLabel={selectedAnalytics.outcomeLabel}
          alertsQuery={alertsQuery}
          initialTab={selectedAnalytics.initialTab}
          onClose={() => setSelectedAnalytics(null)}
        />
      )}
    </main>
  );
}

function AnalyticsModal({
  market,
  marketId,
  bookmarkedAt,
  entryPrice,
  outcomeId,
  outcomeLabel,
  initialTab,
  alertsQuery,
  onClose,
}: {
  market?: MarketWithStrings;
  marketId: string;
  bookmarkedAt: string;
  entryPrice: number;
  outcomeId?: string | null;
  outcomeLabel?: string | null;
  initialTab?: 'analytics' | 'alerts';
  alertsQuery: ReturnType<typeof useAlerts>;
  onClose: () => void;
}) {
  const { isDark } = useTheme();
  const [details, setDetails] = useState<{
    closesAt: string;
    price: number;
    title: string;
    category: string;
    outcomes?: string[] | null;
    outcomePrices?: number[] | null;
    outcomeTokenIds?: string[] | null;
    resolved?: boolean;
    winningOutcome?: string | null;
    winningOutcomeId?: string | null;
  } | null>(null);
  const bookmarkedDate = new Date(bookmarkedAt);
  const initial = Number.isFinite(entryPrice) ? entryPrice : null;

  useEffect(() => {
    if (market) return;
    let isMounted = true;
    fetch(`/api/market/${marketId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setDetails({
          closesAt: data.closesAt,
          price: data.leading?.price ?? data.leading?.prob ?? 0,
          title: data.title ?? 'Unknown market',
          category: data.categoryResolved ?? 'Unknown',
          outcomes: data.outcomes ?? null,
          outcomePrices: data.outcomePrices ?? null,
          outcomeTokenIds: data.outcomeTokenIds ?? null,
          resolved: data.resolved ?? false,
          winningOutcome: data.winningOutcome ?? null,
          winningOutcomeId: data.winningOutcomeId ?? null,
        });
      })
      .catch((error) => {
        console.warn('[analytics] unable to load market details', error);
      });

    return () => {
      isMounted = false;
    };
  }, [market, marketId]);

  const closedAt = market?.closedTime ?? market?.endDate ?? details?.closesAt ?? null;
  const closedDate = closedAt ? new Date(closedAt) : null;
  const isClosed = closedDate ? closedDate.getTime() <= Date.now() : false;
  const outcomeLabels = market?.outcomes ?? details?.outcomes ?? null;
  const outcomePrices = market?.outcomePrices ?? details?.outcomePrices ?? null;
  const outcomeTokenIds = market?.outcomeTokenIds ?? details?.outcomeTokenIds ?? null;
  const currentPrice =
    resolveOutcomePrice({
      outcomeId,
      outcomeLabel,
      outcomeLabels,
      outcomeTokenIds,
      outcomePrices,
    }) ?? null;
  const delta = initial != null && currentPrice != null ? currentPrice - initial : null;
  const changeCents = delta != null ? delta * 100 : null;
  const changeClass =
    delta == null
      ? isDark
        ? 'text-slate-300'
        : 'text-slate-600'
      : delta > 0
        ? isDark
          ? 'text-emerald-400'
          : 'text-emerald-600'
        : delta < 0
          ? isDark
            ? 'text-red-400'
            : 'text-red-600'
          : isDark
            ? 'text-slate-300'
            : 'text-slate-600';
  const changeLabel =
    delta == null
      ? 'N/A'
      : `${delta > 0 ? '+' : ''}${changeCents?.toFixed(1)}c`;
  const winningOutcomeId = market?.winningOutcomeId ?? details?.winningOutcomeId ?? null;
  const winningOutcomeLabel = market?.winningOutcome ?? details?.winningOutcome ?? null;
  const settlementPrice = resolveFinalPrice({
    bookmarkOutcomeId: outcomeId,
    bookmarkOutcomeLabel: outcomeLabel,
    winningOutcomeId,
    winningOutcomeLabel,
    outcomeLabels,
    outcomeTokenIds,
  });
  const resolvedFlag = market?.resolved ?? details?.resolved ?? false;
  const isResolved = settlementPrice != null && resolvedFlag;
  const pendingResolution = isClosed && !isResolved;
  const finalPrice = isResolved ? settlementPrice : null;
  const entryCents = initial != null ? initial * 100 : null;
  const exitCents = finalPrice != null ? finalPrice * 100 : null;
  const plDeltaCents =
    entryCents != null && exitCents != null ? exitCents - entryCents : null;
  const plPct =
    entryCents != null && entryCents > 0 && plDeltaCents != null
      ? (plDeltaCents / entryCents) * 100
      : entryCents != null
        ? 0
        : null;
  const plStatus =
    plDeltaCents == null
      ? null
      : plDeltaCents > 0
        ? 'Profit'
        : plDeltaCents < 0
          ? 'Loss'
          : 'Break-even';
  const plClass =
    plDeltaCents == null
      ? isDark
        ? 'border-white/10 bg-white/5 text-slate-300'
        : 'border-slate-200 bg-slate-50 text-slate-700'
      : plDeltaCents > 0
        ? isDark
          ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : plDeltaCents < 0
          ? isDark
            ? 'border-red-400/20 bg-red-500/10 text-red-200'
            : 'border-red-200 bg-red-50 text-red-700'
          : isDark
            ? 'border-white/10 bg-white/5 text-slate-300'
            : 'border-slate-200 bg-slate-50 text-slate-700';
  const plDeltaLabel =
    plDeltaCents == null
      ? null
      : `${plDeltaCents > 0 ? '+' : ''}${plDeltaCents.toFixed(1)}c`;
  const plPctLabel =
    plPct == null ? null : `${plPct > 0 ? '+' : ''}${plPct.toFixed(1)}%`;
  const modalTitle = market?.title ?? details?.title ?? 'Market analytics';
  const modalCategory = market?.category ?? details?.category ?? '';
  const [activeTab, setActiveTab] = useState<'analytics' | 'alerts'>(
    initialTab ?? 'analytics',
  );
  const existingAlert = alertsQuery.data?.alerts.find(
    (item) => item.marketId === marketId,
  );
  const alertsDisabled = isClosed;
  const [enabled, setEnabled] = useState(true);
  const [profitInput, setProfitInput] = useState('');
  const [lossInput, setLossInput] = useState('');
  const [triggerOnce, setTriggerOnce] = useState(true);
  const [cooldownInput, setCooldownInput] = useState('60');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(existingAlert?.enabled ?? true);
    setProfitInput(
      existingAlert?.profitThresholdPct != null
        ? String(existingAlert.profitThresholdPct)
        : '',
    );
    setLossInput(
      existingAlert?.lossThresholdPct != null
        ? String(existingAlert.lossThresholdPct)
        : '',
    );
    setTriggerOnce(existingAlert?.triggerOnce ?? true);
    setCooldownInput(
      existingAlert?.cooldownMinutes != null
        ? String(existingAlert.cooldownMinutes)
        : '60',
    );
    setMessage(null);
  }, [existingAlert, marketId]);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab]);

  const parsePctInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { value: null, error: false };
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num <= 0) return { value: null, error: true };
    return { value: num, error: false };
  };

  const parseCooldown = (value: string) => {
    const trimmed = value.trim();
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num <= 0) return { value: 60, error: true };
    return { value: Math.floor(num), error: false };
  };

  const handleSaveAlerts = async () => {
    const profit = parsePctInput(profitInput);
    const loss = parsePctInput(lossInput);
    const cooldown = parseCooldown(cooldownInput);
    if (profit.error || loss.error) {
      setMessage('Thresholds must be greater than 0.');
      return;
    }
    if (cooldown.error) {
      setMessage('Cooldown must be a positive number of minutes.');
      return;
    }
    if (profit.value == null && loss.value == null) {
      setMessage('Add at least one threshold.');
      return;
    }
    setMessage(null);
    try {
      await alertsQuery.saveAlert({
        marketId,
        profitThresholdPct: profit.value,
        lossThresholdPct: loss.value,
        triggerOnce,
        cooldownMinutes: cooldown.value,
        enabled,
      });
      setMessage('Alerts saved.');
    } catch (error) {
      console.error('[alerts] save error', error);
      const errorMessage = error instanceof Error ? error.message : 'Unable to save alerts.';
      setMessage(errorMessage);
    }
  };

  const handleDeleteAlerts = async () => {
    setMessage(null);
    try {
      await alertsQuery.deleteAlert(marketId);
      setMessage('Alerts deleted.');
    } catch (error) {
      console.error('[alerts] delete error', error);
      const errorMessage = error instanceof Error ? error.message : 'Unable to delete alerts.';
      setMessage(errorMessage);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close analytics"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
          isDark ? 'border-slate-800 bg-[#0b1224] text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              Market analytics
            </p>
            <h2 className="text-xl font-semibold">{modalTitle}</h2>
            {modalCategory && (
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {modalCategory}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full border px-3 py-1 text-xs font-semibold hover:border-slate-400 ${
              isDark ? 'border-slate-600 text-slate-200' : 'border-slate-300 text-slate-700'
            }`}
          >
            Close
          </button>
        </div>

        <div
          className={`mt-5 flex flex-wrap gap-2 border-b pb-3 ${
            isDark ? 'border-white/10' : 'border-slate-200'
          }`}
        >
          {(['analytics', 'alerts'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const isAlertsTab = tab === 'alerts';
            const isDisabled = isAlertsTab && alertsDisabled;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                disabled={isDisabled}
                className={`rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
                  isActive
                    ? isDark
                      ? 'border-blue-400 text-blue-200'
                      : 'border-blue-300 text-blue-700'
                    : isDark
                      ? 'border-slate-700 text-slate-300'
                      : 'border-slate-300 text-slate-600'
                } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {tab}
              </button>
            );
          })}
        </div>
        {alertsDisabled && (
          <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Alerts are disabled for closed markets.
          </p>
        )}

        {activeTab === 'analytics' && (
          <div className="mt-5 grid grid-cols-1 gap-6 text-sm sm:grid-cols-[1fr_220px]">
            <div className="space-y-3">
              <div>
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>Bookmarked</p>
                <p className="font-semibold">
                  {formatDistanceToNow(bookmarkedDate, { addSuffix: true })}
                </p>
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                  {bookmarkedDate.toLocaleString()}
                </p>
              </div>
              <div>
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  Price at bookmark
                </p>
                <p className="font-semibold">
                  {initial != null ? `${(initial * 100).toFixed(1)}c` : 'N/A'}
                </p>
              </div>
              <div>
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  Tracked outcome
                </p>
                <p className="font-semibold">{outcomeLabel ?? 'Unknown'}</p>
              </div>
              <div>
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  Current price
                </p>
                <p className="font-semibold">
                  {currentPrice != null ? `${(currentPrice * 100).toFixed(1)}c` : 'N/A'}
                </p>
              </div>
              <div>
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>Change</p>
                <p className={`font-semibold ${changeClass}`}>{changeLabel}</p>
              </div>
              <div>
                <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                  Market status
                </p>
                <p className="font-semibold">{isClosed ? 'Closed' : 'Live'}</p>
                {isClosed && closedDate && (
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    {closedDate.toLocaleString()}
                  </p>
                )}
                {pendingResolution && (
                  <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>
                    Pending resolution
                  </p>
                )}
              </div>
              {isResolved && (
                <div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Final price
                  </p>
                  <p className="font-semibold">
                    {finalPrice != null ? `${(finalPrice * 100).toFixed(1)}c` : 'N/A'}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {isResolved && plDeltaCents != null && plPct != null && (
                <div className={`h-fit rounded-2xl border p-4 ${plClass}`}>
                  <div
                    className={`flex items-center justify-between text-xs font-semibold uppercase tracking-wide ${
                      isDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    <span>P/L</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] text-inherit ${
                        isDark ? 'border-white/10' : 'border-slate-200'
                      }`}
                    >
                      {plStatus}
                    </span>
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-inherit">
                    {plDeltaLabel}
                  </div>
                  <p className="mt-1 text-xs text-inherit">
                    {plPctLabel} {plStatus?.toLowerCase()}
                  </p>
                  <div
                    className={`mt-4 border-t pt-3 ${
                      isDark ? 'border-white/10' : 'border-slate-200'
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p
                          className={`text-xs uppercase tracking-wide ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          Entry
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            isDark ? 'text-slate-100' : 'text-slate-900'
                          }`}
                        >
                          {entryCents?.toFixed(1)}c
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xs uppercase tracking-wide ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          Exit
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            isDark ? 'text-slate-100' : 'text-slate-900'
                          }`}
                        >
                          {exitCents?.toFixed(1)}c
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="mt-5 space-y-4 text-sm">
            {alertsDisabled && (
              <p
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isDark
                    ? 'border-slate-700/60 bg-slate-800/40 text-slate-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                Alerts are disabled for closed markets.
              </p>
            )}
            <label
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                Alerts enabled
              </span>
              <input
                type="checkbox"
                checked={enabled}
                disabled={alertsDisabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
            </label>

            <div className="space-y-2">
              <label
                className={`text-xs uppercase tracking-wide ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Profit threshold (%)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={profitInput}
                disabled={alertsDisabled}
                onChange={(event) => setProfitInput(event.target.value)}
                className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:border-blue-400 focus:outline-none ${
                  isDark
                    ? 'border-slate-700 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-300 text-slate-900 placeholder:text-slate-400'
                }`}
                placeholder="e.g. 25"
              />
            </div>

            <div className="space-y-2">
              <label
                className={`text-xs uppercase tracking-wide ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Loss threshold (%)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={lossInput}
                disabled={alertsDisabled}
                onChange={(event) => setLossInput(event.target.value)}
                className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:border-blue-400 focus:outline-none ${
                  isDark
                    ? 'border-slate-700 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-300 text-slate-900 placeholder:text-slate-400'
                }`}
                placeholder="e.g. 10"
              />
            </div>

            <div className="space-y-2">
              <label
                className={`text-xs uppercase tracking-wide ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Trigger mode
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTriggerOnce(true)}
                  disabled={alertsDisabled}
                  className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                    triggerOnce
                      ? isDark
                        ? 'border-blue-400 text-blue-100'
                        : 'border-blue-300 text-blue-700'
                      : isDark
                        ? 'border-slate-700 text-slate-300'
                        : 'border-slate-300 text-slate-600'
                  }`}
                >
                  Notify once
                </button>
                <button
                  type="button"
                  onClick={() => setTriggerOnce(false)}
                  disabled={alertsDisabled}
                  className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                    !triggerOnce
                      ? isDark
                        ? 'border-blue-400 text-blue-100'
                        : 'border-blue-300 text-blue-700'
                      : isDark
                        ? 'border-slate-700 text-slate-300'
                        : 'border-slate-300 text-slate-600'
                  }`}
                >
                  Notify repeatedly
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                className={`text-xs uppercase tracking-wide ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Cooldown (minutes)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={cooldownInput}
                disabled={alertsDisabled}
                onChange={(event) => setCooldownInput(event.target.value)}
                className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:border-blue-400 focus:outline-none ${
                  isDark
                    ? 'border-slate-700 text-slate-100 placeholder:text-slate-500'
                    : 'border-slate-300 text-slate-900 placeholder:text-slate-400'
                }`}
                placeholder="60"
              />
            </div>

            {message && (
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {message}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveAlerts}
                disabled={alertsDisabled || alertsQuery.isSaving}
                className={`flex-1 rounded-full border px-4 py-2 text-xs font-semibold transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isDark ? 'border-blue-500/60 text-blue-100' : 'border-blue-300 text-blue-700'
                }`}
              >
                {alertsQuery.isSaving ? 'Saving...' : 'Save alerts'}
              </button>
              <button
                type="button"
                onClick={handleDeleteAlerts}
                disabled={alertsQuery.isDeleting || !existingAlert}
                className={`flex-1 rounded-full border px-4 py-2 text-xs font-semibold transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isDark ? 'border-red-500/60 text-red-200' : 'border-red-300 text-red-600'
                }`}
              >
                {alertsQuery.isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
