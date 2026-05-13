'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { HistoryExportDom } from '@/components/exports/HistoryExportDom';
import { useTheme } from '@/components/theme-context';
import type {
  HistoryExportRow,
  HistoryExportSummary,
  HistoryStatus as ExportStatus,
} from '@/components/exports/historyExportTypes';

type HistoryBookmark = {
  id: string;
  marketId: string;
  title?: string | null;
  category?: string | null;
  marketUrl?: string | null;
  outcomeId?: string | null;
  outcomeLabel?: string | null;
  entryPrice: number;
  createdAt: string;
  removedAt?: string | null;
  lastKnownPrice?: number | null;
  lastPriceAt?: string | null;
  finalPrice?: number | null;
  closedAt?: string | null;
  currentPrice?: number | null;
  isClosed: boolean;
  isResolved?: boolean;
};

type HistoryResponse = {
  bookmarks: HistoryBookmark[];
  total: number;
};

type RoutedTrade = {
  id: string;
  marketId: string;
  conditionId?: string | null;
  outcome: string;
  outcomeTokenId?: string | null;
  side: string;
  size: number;
  price: number;
  orderId?: string | null;
  status?: string | null;
  createdAt: string;
};

type RoutedTradesResponse = {
  trades: RoutedTrade[];
};

const TIMEFRAMES = [
  { label: '1D', value: '1d' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'All', value: 'all' },
] as const;

const fetchHistory = async (timeframe: string): Promise<HistoryResponse> => {
  const res = await fetch(`/api/history?timeframe=${encodeURIComponent(timeframe)}`);
  if (!res.ok) throw new Error('Unable to load history');
  return (await res.json()) as HistoryResponse;
};

const fetchRoutedTrades = async (): Promise<RoutedTradesResponse> => {
  const res = await fetch('/api/routed-trades');
  if (!res.ok) throw new Error('Unable to load routed trades');
  return (await res.json()) as RoutedTradesResponse;
};

const formatPrice = (price: number | null) =>
  price != null ? `${(price * 100).toFixed(1)}c` : 'N/A';

const formatSigned = (value: number | null) => {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)}c`;
};

const formatPct = (value: number | null) => {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
};

const formatPeriodDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);

const getTimeZoneLabel = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(
    date,
  );
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'Local';
};

const buildPeriodLabel = (timeframe: string, now: Date) => {
  if (timeframe === 'all') return 'All time';
  const daysMap: Record<string, number> = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
  };
  const days = daysMap[timeframe];
  if (!days) {
    return `Up to ${formatPeriodDate(now)}`;
  }
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return `Last ${days} days (${formatPeriodDate(start)} - ${formatPeriodDate(now)})`;
};

type HistoryStatus = ExportStatus;

const toHistoryStatus = (
  s: string | null | undefined,
  isClosed?: boolean,
): HistoryStatus => {
  const v = (s ?? '').trim().toLowerCase();
  if (v === 'pending') return 'Pending resolution';
  if (v === 'closed') return 'Closed';
  if (v === 'removed') return 'Removed';
  if (v === 'active') return 'Active';
  if (typeof isClosed === 'boolean') return isClosed ? 'Closed' : 'Active';
  return 'Active';
};

type HistoryRow = HistoryBookmark & {
  latestPrice: number | null;
  profitDelta: number | null;
  returnPct: number | null;
  status: HistoryStatus;
};

function TradeHistoryMobileCard({ row }: { row: HistoryRow }) {
  const { isDark } = useTheme();
  const plClass =
    row.profitDelta == null
      ? isDark
        ? 'text-slate-300'
        : 'text-slate-600'
      : row.profitDelta > 0
        ? isDark
          ? 'text-emerald-300'
          : 'text-emerald-600'
        : row.profitDelta < 0
          ? isDark
            ? 'text-red-300'
            : 'text-red-600'
          : isDark
            ? 'text-slate-200'
            : 'text-slate-700';
  const statusClass =
    row.status === 'Removed'
      ? isDark
        ? 'border-white/10 text-slate-300'
        : 'border-slate-200 text-slate-600'
      : row.status === 'Closed'
        ? isDark
          ? 'border-emerald-500/40 text-emerald-200'
          : 'border-emerald-200 text-emerald-700'
        : row.status === 'Pending resolution'
          ? isDark
            ? 'border-amber-400/40 text-amber-200'
            : 'border-amber-200 text-amber-700'
          : isDark
            ? 'border-blue-500/40 text-blue-200'
            : 'border-blue-200 text-blue-700';

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold break-words ${
              isDark ? 'text-slate-100' : 'text-slate-900'
            }`}
          >
            {row.title ?? 'Unknown market'}
          </p>
          <p
            className={`mt-1 text-xs break-words ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {row.category ?? 'Unknown'}
          </p>
        </div>
        <span
          className={`inline-flex min-h-[28px] items-center rounded-full border px-2.5 text-[11px] font-semibold ${statusClass}`}
        >
          {row.status}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>Bookmarked</span>
        <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
          {new Date(row.createdAt).toLocaleDateString()} -{' '}
          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
            {new Date(row.createdAt).toLocaleTimeString()}
          </span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 max-[380px]:grid-cols-1">
        <div
          className={`rounded-xl border px-3 py-2 ${
            isDark ? 'border-slate-800 bg-[#111b33]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <p
            className={`text-[11px] uppercase tracking-wide ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Entry
          </p>
          <p className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {formatPrice(row.entryPrice)}
          </p>
        </div>
        <div
          className={`rounded-xl border px-3 py-2 ${
            isDark ? 'border-slate-800 bg-[#111b33]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <p
            className={`text-[11px] uppercase tracking-wide ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Final / Current
          </p>
          <p className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {formatPrice(row.latestPrice)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 max-[380px]:grid-cols-1">
        <div
          className={`rounded-xl border px-3 py-2 ${
            isDark ? 'border-slate-800 bg-[#111b33]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <p
            className={`text-[11px] uppercase tracking-wide ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            P/L
          </p>
          <p className={`mt-1 text-sm font-semibold ${plClass}`}>
            {formatSigned(row.profitDelta != null ? row.profitDelta * 100 : null)}
          </p>
        </div>
        <div
          className={`rounded-xl border px-3 py-2 ${
            isDark ? 'border-slate-800 bg-[#111b33]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <p
            className={`text-[11px] uppercase tracking-wide ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Return
          </p>
          <p className={`mt-1 text-sm font-semibold ${plClass}`}>
            {formatPct(row.returnPct)}
          </p>
        </div>
      </div>
    </div>
  );
}

type HistoryContentProps = {
  embedded?: boolean;
};

function HistoryContent({ embedded = false }: HistoryContentProps) {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const router = useRouter();
  const exportDomRef = useRef<HTMLDivElement | null>(null);
  const [exportedAt, setExportedAt] = useState<string>(new Date().toISOString());
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]['value']>(
    'all',
  );
  const [isExporting, setIsExporting] = useState<null | 'png' | 'pdf'>(null);

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!user) {
      router.push('/?auth=login');
    }
  }, [sessionQuery.isLoading, user, router]);

  const historyQuery = useQuery({
    queryKey: ['history', timeframe],
    queryFn: () => fetchHistory(timeframe),
    enabled: Boolean(user),
    staleTime: 1000 * 30,
  });
  const routedTradesQuery = useQuery({
    queryKey: ['routed-trades'],
    queryFn: fetchRoutedTrades,
    enabled: Boolean(user),
    staleTime: 1000 * 30,
  });

  const rows: HistoryRow[] = useMemo(() => {
    const bookmarks = historyQuery.data?.bookmarks ?? [];
    return bookmarks.map((bookmark) => {
      const latestPrice =
        bookmark.isResolved && bookmark.finalPrice != null
          ? bookmark.finalPrice
          : bookmark.currentPrice ?? bookmark.lastKnownPrice ?? null;
      const profitDelta =
        latestPrice != null ? latestPrice - bookmark.entryPrice : null;
      const returnPct =
        profitDelta != null && bookmark.entryPrice > 0
          ? (profitDelta / bookmark.entryPrice) * 100
          : null;
      const status = toHistoryStatus(
        bookmark.removedAt
          ? 'Removed'
          : bookmark.isClosed
            ? bookmark.isResolved
              ? 'Closed'
              : 'Pending'
            : 'Active',
        bookmark.isClosed,
      );
      return {
        ...bookmark,
        latestPrice,
        profitDelta,
        returnPct,
        status,
      };
    });
  }, [historyQuery.data?.bookmarks]);

  const summary = useMemo(() => {
    const count = rows.length;
    const scored = rows.filter(
      (row) => row.profitDelta != null && row.returnPct != null,
    );
    const wins = scored.filter((row) => (row.profitDelta ?? 0) > 0).length;
    const winRate = scored.length ? (wins / scored.length) * 100 : null;
    const totalPL = scored.reduce((sum, row) => sum + (row.profitDelta ?? 0), 0);
    const totalEntry = scored.reduce((sum, row) => sum + row.entryPrice, 0);
    const netReturnPct = totalEntry > 0 ? (totalPL / totalEntry) * 100 : null;
    const best = scored.reduce(
      (acc, row) =>
        acc && (acc.returnPct ?? 0) > (row.returnPct ?? 0) ? acc : row,
      scored[0],
    );
    const worst = scored.reduce(
      (acc, row) =>
        acc && (acc.returnPct ?? 0) < (row.returnPct ?? 0) ? acc : row,
      scored[0],
    );
    return {
      count,
      winRate,
      totalPL,
      netReturnPct,
      best,
      worst,
    };
  }, [rows]);

  const exportRows = useMemo<HistoryExportRow[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        title: row.title ?? null,
        category: row.category ?? null,
        createdAt: row.createdAt,
        entryPrice: row.entryPrice,
        latestPrice: row.latestPrice,
        profitDelta: row.profitDelta,
        returnPct: row.returnPct,
        status: row.status,
      })),
    [rows],
  );

  const exportSummary = useMemo<HistoryExportSummary>(
    () => ({
      count: summary.count,
      winRate: summary.winRate,
      totalPL: summary.totalPL,
      netReturnPct: summary.netReturnPct,
      best: summary.best
        ? { title: summary.best.title ?? null, returnPct: summary.best.returnPct ?? null }
        : null,
      worst: summary.worst
        ? { title: summary.worst.title ?? null, returnPct: summary.worst.returnPct ?? null }
        : null,
    }),
    [summary],
  );

  const exportMeta = useMemo(() => {
    const date = new Date(exportedAt);
    return {
      periodLabel: buildPeriodLabel(timeframe, date),
      timeZoneLabel: getTimeZoneLabel(date),
    };
  }, [exportedAt, timeframe]);

  const exportLogoSrc =
    typeof window !== 'undefined'
      ? `${window.location.origin}/polypicks-favicon.png`
      : '/polypicks-favicon.png';

  const buildFileName = (ext: 'png' | 'pdf') => {
    const date = new Date().toISOString().slice(0, 10);
    return `polypicks-history-${timeframe}-${date}.${ext}`;
  };

  const exportAsPng = async () => {
    if (!exportDomRef.current) return;
    setIsExporting('png');
    try {
      const timestamp = new Date().toISOString();
      setExportedAt(timestamp);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await document.fonts.ready;
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(exportDomRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 3,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = buildFileName('png');
      link.click();
    } finally {
      setIsExporting(null);
    }
  };

  const exportAsPdf = async () => {
    setIsExporting('pdf');
    try {
      const [{ pdf }, { HistoryPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/exports/HistoryPdf'),
      ]);
      const timestamp = new Date().toISOString();
      const now = new Date(timestamp);
      const periodLabel = buildPeriodLabel(timeframe, now);
      const timeZoneLabel = getTimeZoneLabel(now);
      const instance = pdf(
        <HistoryPdf
          rows={exportRows}
          summary={exportSummary}
          userName={user?.name ?? null}
          generatedAt={timestamp}
          periodLabel={periodLabel}
          timeZoneLabel={timeZoneLabel}
          logoSrc={exportLogoSrc}
        />,
      );
      const blob = await instance.toBlob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = buildFileName('pdf');
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setIsExporting(null);
    }
  };

  if (!user) {
    return (
      <main
        className={
          isDark
            ? 'min-h-screen bg-[#0b1224] text-slate-100'
            : 'min-h-screen bg-slate-50 text-slate-900'
        }
      >
        <div className="mx-auto max-w-5xl px-4 py-12">
          <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Redirecting to login...
          </p>
        </div>
      </main>
    );
  }

  const content = (
    <>
      <div className={embedded ? 'space-y-6' : 'mx-auto max-w-6xl px-4 py-12 space-y-6'}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              History
            </p>
            <h1 className="text-3xl font-semibold">Trading history</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Review routed trades, bookmarked outcomes, and performance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {TIMEFRAMES.map((option) => {
              const isActive = option.value === timeframe;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTimeframe(option.value)}
                  className={`h-9 rounded-full border px-4 text-xs font-semibold uppercase tracking-wide transition ${
                    isActive
                      ? isDark
                        ? 'border-blue-400/60 bg-blue-500/20 text-blue-100'
                        : 'border-blue-300 bg-blue-100 text-blue-700'
                      : isDark
                        ? 'border-slate-700 text-slate-300 hover:border-slate-500'
                        : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div
              className={`rounded-2xl border p-5 ${
                isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
              }`}
            >
              <p
                className={`text-xs uppercase tracking-wide ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Trades
              </p>
              <p className="mt-3 text-2xl font-semibold">{summary.count}</p>
            </div>
            <div
              className={`rounded-2xl border p-5 ${
                isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
              }`}
            >
              <p
                className={`text-xs uppercase tracking-wide ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Win rate
              </p>
              <p className="mt-3 text-2xl font-semibold">
                {summary.winRate == null ? 'N/A' : `${summary.winRate.toFixed(1)}%`}
              </p>
            </div>
            <div
              className={`rounded-2xl border p-5 ${
                isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
              }`}
            >
              <p
                className={`text-xs uppercase tracking-wide ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Total P/L
              </p>
              <p
                className={`mt-3 text-2xl font-semibold ${
                  summary.totalPL > 0
                    ? isDark
                      ? 'text-emerald-300'
                      : 'text-emerald-600'
                    : summary.totalPL < 0
                      ? isDark
                        ? 'text-red-300'
                        : 'text-red-600'
                      : isDark
                        ? 'text-slate-100'
                        : 'text-slate-900'
                }`}
              >
                {formatSigned(summary.totalPL * 100)}
              </p>
            </div>
          </div>

          <div
            className={`rounded-2xl border p-6 ${
              isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2
                className={`text-sm font-semibold uppercase tracking-wide ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                Executed trades
              </h2>
              {routedTradesQuery.isLoading && (
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Loading...
                </span>
              )}
            </div>
            {routedTradesQuery.isError && (
              <p className={`mt-3 text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                Unable to load executed trades.
              </p>
            )}
            {!routedTradesQuery.isLoading &&
              (routedTradesQuery.data?.trades.length ?? 0) === 0 && (
                <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  No routed trades yet.
                </p>
              )}
            {routedTradesQuery.data?.trades.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead
                    className={`text-left text-xs uppercase tracking-wide ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    <tr
                      className={`sticky top-0 ${
                        isDark ? 'bg-[#0f182c]' : 'bg-white'
                      }`}
                    >
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Market</th>
                      <th className="px-3 py-2">Outcome</th>
                      <th className="px-3 py-2">Side</th>
                      <th className="px-3 py-2 text-right">Size</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                    {routedTradesQuery.data.trades.map((trade) => (
                      <tr
                        key={trade.id}
                        className={isDark ? 'hover:bg-[#111b33]' : 'hover:bg-slate-50'}
                      >
                        <td className={`px-3 py-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          {new Date(trade.createdAt).toLocaleString()}
                        </td>
                        <td className={`px-3 py-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          <span className="block max-w-[200px] truncate font-mono text-xs">
                            {trade.marketId}
                          </span>
                        </td>
                        <td className={`px-3 py-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          {trade.outcome}
                        </td>
                        <td className={`px-3 py-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          {trade.side}
                        </td>
                        <td className={`px-3 py-3 text-right ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          {trade.size}
                        </td>
                        <td className={`px-3 py-3 text-right ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                          {formatPrice(trade.price)}
                        </td>
                        <td className="px-3 py-3">
                          {(() => {
                            const normalized = (trade.status ?? 'submitted').toLowerCase();
                            const badgeClass =
                              normalized === 'matched'
                                ? isDark
                                  ? 'border-emerald-400/30 text-emerald-200'
                                  : 'border-emerald-200 text-emerald-700'
                                : normalized === 'submitted'
                                  ? isDark
                                    ? 'border-white/10 text-slate-300'
                                    : 'border-slate-200 text-slate-600'
                                  : isDark
                                    ? 'border-white/10 text-slate-300'
                                    : 'border-slate-200 text-slate-600';
                            return (
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}
                              >
                                {trade.status ?? 'Submitted'}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div
            className={`rounded-2xl border p-6 ${
              isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h2
                  className={`text-sm font-semibold uppercase tracking-wide ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  History
                </h2>
                {historyQuery.isLoading && (
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Loading...
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportAsPng}
                  disabled={isExporting != null}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border px-4 text-xs font-semibold transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isDark
                      ? 'border-slate-700 text-slate-200'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {isExporting === 'png' ? 'Exporting...' : 'Download PNG'}
                </button>
                <button
                  type="button"
                  onClick={exportAsPdf}
                  disabled={isExporting != null}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border px-4 text-xs font-semibold transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isDark
                      ? 'border-slate-700 text-slate-200'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {isExporting === 'pdf' ? 'Exporting...' : 'Download PDF'}
                </button>
              </div>
            </div>

            {historyQuery.isError && (
              <p className={`mt-4 text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                Unable to load history. Please try again.
              </p>
            )}

            {!historyQuery.isLoading && rows.length === 0 && (
              <p className={`mt-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                No bookmarked trades in this timeframe.
              </p>
            )}

            {rows.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="space-y-3 md:hidden">
                  {rows.map((row) => (
                    <TradeHistoryMobileCard key={row.id} row={row} />
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-sm">
                    <thead
                      className={`text-left text-xs uppercase tracking-wide ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      <tr className={`${isDark ? 'bg-[#0f182c]' : 'bg-white'} sticky top-0`}>
                        <th className="px-3 py-2">Market</th>
                        <th className="px-3 py-2">Bookmarked</th>
                        <th className="px-3 py-2 text-right">Entry</th>
                        <th className="px-3 py-2 text-right">Final / Current</th>
                        <th className="px-3 py-2 text-right">P/L</th>
                        <th className="px-3 py-2 text-right">Return</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                      {rows.map((row) => {
                        const plClass =
                          row.profitDelta == null
                            ? isDark
                              ? 'text-slate-300'
                              : 'text-slate-600'
                            : row.profitDelta > 0
                              ? isDark
                                ? 'text-emerald-300'
                                : 'text-emerald-600'
                              : row.profitDelta < 0
                                ? isDark
                                  ? 'text-red-300'
                                  : 'text-red-600'
                                : isDark
                                  ? 'text-slate-200'
                                  : 'text-slate-700';
                        const statusClass =
                          row.status === 'Removed'
                            ? isDark
                              ? 'border-white/10 text-slate-300'
                              : 'border-slate-200 text-slate-600'
                            : row.status === 'Closed'
                              ? isDark
                                ? 'border-emerald-500/40 text-emerald-200'
                                : 'border-emerald-200 text-emerald-700'
                              : row.status === 'Pending resolution'
                                ? isDark
                                  ? 'border-amber-400/40 text-amber-200'
                                  : 'border-amber-200 text-amber-700'
                                : isDark
                                  ? 'border-blue-500/40 text-blue-200'
                                  : 'border-blue-200 text-blue-700';
                        return (
                          <tr
                            key={row.id}
                            className={isDark ? 'hover:bg-[#111b33]' : 'hover:bg-slate-50'}
                          >
                            <td className="px-3 py-3">
                              <div
                                className={`text-sm font-semibold ${
                                  isDark ? 'text-slate-100' : 'text-slate-900'
                                }`}
                              >
                                {row.title ?? 'Unknown market'}
                              </div>
                              <div
                                className={`text-xs ${
                                  isDark ? 'text-slate-400' : 'text-slate-500'
                                }`}
                              >
                                {row.category ?? 'Unknown'}
                              </div>
                            </td>
                            <td className={`px-3 py-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              <div>{new Date(row.createdAt).toLocaleDateString()}</div>
                              <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                {new Date(row.createdAt).toLocaleTimeString()}
                              </div>
                            </td>
                            <td className={`px-3 py-3 text-right ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                              {formatPrice(row.entryPrice)}
                            </td>
                            <td className={`px-3 py-3 text-right ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                              {formatPrice(row.latestPrice)}
                            </td>
                            <td className={`px-3 py-3 text-right font-semibold ${plClass}`}>
                              {formatSigned(
                                row.profitDelta != null ? row.profitDelta * 100 : null,
                              )}
                            </td>
                            <td className={`px-3 py-3 text-right font-semibold ${plClass}`}>
                              {formatPct(row.returnPct)}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass}`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="fixed left-[-10000px] top-0 z-[-1]">
        <HistoryExportDom
          ref={exportDomRef}
          rows={exportRows}
          summary={exportSummary}
          userName={user?.name ?? null}
          generatedAt={exportedAt}
          periodLabel={exportMeta.periodLabel}
          timeZoneLabel={exportMeta.timeZoneLabel}
          logoSrc={exportLogoSrc}
        />
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <main
      className={
        isDark
          ? 'min-h-screen bg-[#0b1224] text-slate-100'
          : 'min-h-screen bg-slate-50 text-slate-900'
      }
    >
      {content}
    </main>
  );
}

export default function HistoryPage() {
  return <HistoryContent />;
}
