'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { useAlerts } from '@/lib/useAlerts';
import { useBookmarks } from '@/lib/useBookmarks';
import { useMarkets } from '@/lib/useMarkets';
import type { MarketSummary } from '@/lib/polymarket/types';

type MarketWithStrings = Omit<MarketSummary, 'endDate' | 'closedTime'> & {
  endDate: string;
  closedTime?: string | null;
};

export default function TradeClient() {
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
      initialTab: tab === 'alerts' ? 'alerts' : 'analytics',
    });
    router.replace(asRoute('/trade'), { scroll: false });
  }, [bookmarksQuery.data?.bookmarks, searchParams, router, asRoute]);

  if (!user) {
    return (
      <main className="min-h-screen bg-[#0b1224] text-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <p className="text-sm text-slate-300">Redirecting to login...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1224] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-12 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Trade</p>
          <h1 className="text-3xl font-semibold">Trade</h1>
          <p className="text-sm text-slate-400">
            Coming soon. Start with your bookmarked markets.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Bookmarked markets
          </h2>
          {removeError && <p className="text-sm text-red-300">{removeError}</p>}
          {bookmarkedMarkets.length === 0 && (
            <p className="text-sm text-slate-400">No bookmarks yet.</p>
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
                  className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#0b1224] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm text-slate-400">{category}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className="truncate text-base font-semibold text-slate-100"
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
                              initialTab: 'alerts',
                            })
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            alert.enabled
                              ? 'border-blue-500/60 text-blue-100 hover:border-blue-400'
                              : 'border-slate-700 text-slate-400 hover:border-slate-500'
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
                        })
                      }
                      className="inline-flex h-10 min-w-[130px] items-center justify-center whitespace-nowrap rounded-full border border-slate-700 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-400"
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
                      className="inline-flex h-10 min-w-[110px] items-center justify-center whitespace-nowrap rounded-full border border-red-500/60 px-4 text-xs font-semibold text-red-200 transition hover:border-red-400"
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
  initialTab,
  alertsQuery,
  onClose,
}: {
  market?: MarketWithStrings;
  marketId: string;
  bookmarkedAt: string;
  entryPrice: number;
  initialTab?: 'analytics' | 'alerts';
  alertsQuery: ReturnType<typeof useAlerts>;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<{
    closesAt: string;
    price: number;
    title: string;
    category: string;
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
        });
      })
      .catch((error) => {
        console.warn('[analytics] unable to load market details', error);
      });

    return () => {
      isMounted = false;
    };
  }, [market, marketId]);

  const currentPrice = market?.price.price ?? details?.price ?? null;
  const delta = initial != null && currentPrice != null ? currentPrice - initial : null;
  const changeCents = delta != null ? delta * 100 : null;
  const changeClass =
    delta == null
      ? 'text-slate-300'
      : delta > 0
        ? 'text-emerald-400'
        : delta < 0
          ? 'text-red-400'
          : 'text-slate-300';
  const changeLabel =
    delta == null
      ? 'N/A'
      : `${delta > 0 ? '+' : ''}${changeCents?.toFixed(1)}c`;
  const closedAt = market?.closedTime ?? market?.endDate ?? details?.closesAt ?? null;
  const closedDate = closedAt ? new Date(closedAt) : null;
  const isClosed = closedDate ? closedDate.getTime() <= Date.now() : false;
  const finalPrice = isClosed && currentPrice != null ? currentPrice : null;
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
      ? 'border-white/10 bg-white/5 text-slate-300'
      : plDeltaCents > 0
        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
        : plDeltaCents < 0
          ? 'border-red-400/20 bg-red-500/10 text-red-200'
          : 'border-white/10 bg-white/5 text-slate-300';
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
  const [enabled, setEnabled] = useState(true);
  const [profitInput, setProfitInput] = useState('');
  const [lossInput, setLossInput] = useState('');
  const [triggerOnce, setTriggerOnce] = useState(true);
  const [cooldownInput, setCooldownInput] = useState('60');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const alert = alertsQuery.data?.alerts.find((item) => item.marketId === marketId);
    setEnabled(alert?.enabled ?? true);
    setProfitInput(
      alert?.profitThresholdPct != null ? String(alert.profitThresholdPct) : '',
    );
    setLossInput(alert?.lossThresholdPct != null ? String(alert.lossThresholdPct) : '');
    setTriggerOnce(alert?.triggerOnce ?? true);
    setCooldownInput(
      alert?.cooldownMinutes != null ? String(alert.cooldownMinutes) : '60',
    );
    setMessage(null);
  }, [alertsQuery.data?.alerts, marketId]);

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
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#0b1224] p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              Market analytics
            </p>
            <h2 className="text-xl font-semibold">{modalTitle}</h2>
            {modalCategory && <p className="text-sm text-slate-400">{modalCategory}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-slate-400"
          >
            Close
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {(['analytics', 'alerts'] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
                  isActive
                    ? 'border-blue-400 text-blue-200'
                    : 'border-slate-700 text-slate-300'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {activeTab === 'analytics' && (
          <div className="mt-5 grid grid-cols-1 gap-6 text-sm sm:grid-cols-[1fr_220px]">
            <div className="space-y-3">
              <div>
                <p className="text-slate-400">Bookmarked</p>
                <p className="font-semibold">
                  {formatDistanceToNow(bookmarkedDate, { addSuffix: true })}
                </p>
                <p className="text-xs text-slate-500">{bookmarkedDate.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-400">Price at bookmark</p>
                <p className="font-semibold">
                  {initial != null ? `${(initial * 100).toFixed(1)}c` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Current price</p>
                <p className="font-semibold">
                  {currentPrice != null ? `${(currentPrice * 100).toFixed(1)}c` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Change</p>
                <p className={`font-semibold ${changeClass}`}>{changeLabel}</p>
              </div>
              <div>
                <p className="text-slate-400">Market status</p>
                <p className="font-semibold">{isClosed ? 'Closed' : 'Live'}</p>
                {isClosed && closedDate && (
                  <p className="text-xs text-slate-500">{closedDate.toLocaleString()}</p>
                )}
              </div>
              {isClosed && (
                <div>
                  <p className="text-slate-400">Final price</p>
                  <p className="font-semibold">
                    {currentPrice != null ? `${(currentPrice * 100).toFixed(1)}c` : 'N/A'}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {isClosed && plDeltaCents != null && plPct != null && (
                <div className={`h-fit rounded-2xl border p-4 ${plClass}`}>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-300">
                    <span>P/L</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-inherit">
                      {plStatus}
                    </span>
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-inherit">
                    {plDeltaLabel}
                  </div>
                  <p className="mt-1 text-xs text-inherit">
                    {plPctLabel} {plStatus?.toLowerCase()}
                  </p>
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Entry
                        </p>
                        <p className="text-sm font-semibold text-slate-100">
                          {entryCents?.toFixed(1)}c
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Exit
                        </p>
                        <p className="text-sm font-semibold text-slate-100">
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
            <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0f182c] px-4 py-3">
              <span className="text-sm text-slate-200">Alerts enabled</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
            </label>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Profit threshold (%)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={profitInput}
                onChange={(event) => setProfitInput(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                placeholder="e.g. 25"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Loss threshold (%)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={lossInput}
                onChange={(event) => setLossInput(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                placeholder="e.g. 10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Trigger mode
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTriggerOnce(true)}
                  className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                    triggerOnce
                      ? 'border-blue-400 text-blue-100'
                      : 'border-slate-700 text-slate-300'
                  }`}
                >
                  Notify once
                </button>
                <button
                  type="button"
                  onClick={() => setTriggerOnce(false)}
                  className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                    !triggerOnce
                      ? 'border-blue-400 text-blue-100'
                      : 'border-slate-700 text-slate-300'
                  }`}
                >
                  Notify repeatedly
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Cooldown (minutes)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={cooldownInput}
                onChange={(event) => setCooldownInput(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                placeholder="60"
              />
            </div>

            {message && <p className="text-xs text-slate-400">{message}</p>}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveAlerts}
                disabled={alertsQuery.isSaving}
                className="flex-1 rounded-full border border-blue-500/60 px-4 py-2 text-xs font-semibold text-blue-100 transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {alertsQuery.isSaving ? 'Saving...' : 'Save alerts'}
              </button>
              <button
                type="button"
                onClick={handleDeleteAlerts}
                disabled={alertsQuery.isDeleting}
                className="flex-1 rounded-full border border-red-500/60 px-4 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
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
