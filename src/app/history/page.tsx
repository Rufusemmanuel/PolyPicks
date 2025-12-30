'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';

type HistoryBookmark = {
  id: string;
  marketId: string;
  title?: string | null;
  category?: string | null;
  marketUrl?: string | null;
  entryPrice: number;
  createdAt: string;
  removedAt?: string | null;
  lastKnownPrice?: number | null;
  lastPriceAt?: string | null;
  finalPrice?: number | null;
  closedAt?: string | null;
  currentPrice?: number | null;
  isClosed: boolean;
};

type HistoryResponse = {
  bookmarks: HistoryBookmark[];
  total: number;
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

type HistoryStatus = 'Closed' | 'Removed' | 'Active';

const toHistoryStatus = (
  s: string | null | undefined,
  isClosed?: boolean,
): HistoryStatus => {
  const v = (s ?? '').trim().toLowerCase();
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
  const plClass =
    row.profitDelta == null
      ? 'text-slate-300'
      : row.profitDelta > 0
        ? 'text-emerald-300'
        : row.profitDelta < 0
          ? 'text-red-300'
          : 'text-slate-200';
  const statusClass =
    row.status === 'Removed'
      ? 'border-red-500/40 text-red-200'
      : row.status === 'Closed'
        ? 'border-emerald-500/40 text-emerald-200'
        : 'border-blue-500/40 text-blue-200';

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 break-words">
            {row.title ?? 'Unknown market'}
          </p>
          <p className="mt-1 text-xs text-slate-400 break-words">
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
        <span className="text-slate-500">Bookmarked</span>
        <span className="text-slate-200">
          {new Date(row.createdAt).toLocaleDateString()} -{' '}
          <span className="text-slate-400">
            {new Date(row.createdAt).toLocaleTimeString()}
          </span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 max-[380px]:grid-cols-1">
        <div className="rounded-xl border border-slate-800 bg-[#111b33] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Entry</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {formatPrice(row.entryPrice)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111b33] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Final / Current
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {formatPrice(row.latestPrice)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 max-[380px]:grid-cols-1">
        <div className="rounded-xl border border-slate-800 bg-[#111b33] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">P/L</p>
          <p className={`mt-1 text-sm font-semibold ${plClass}`}>
            {formatSigned(row.profitDelta != null ? row.profitDelta * 100 : null)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111b33] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Return</p>
          <p className={`mt-1 text-sm font-semibold ${plClass}`}>
            {formatPct(row.returnPct)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const router = useRouter();
  const exportRef = useRef<HTMLDivElement | null>(null);
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

  const rows: HistoryRow[] = useMemo(() => {
    const bookmarks = historyQuery.data?.bookmarks ?? [];
    return bookmarks.map((bookmark) => {
      const latestPrice =
        bookmark.isClosed && bookmark.finalPrice != null
          ? bookmark.finalPrice
          : bookmark.currentPrice ?? bookmark.lastKnownPrice ?? null;
      const profitDelta =
        latestPrice != null ? latestPrice - bookmark.entryPrice : null;
      const returnPct =
        profitDelta != null && bookmark.entryPrice > 0
          ? (profitDelta / bookmark.entryPrice) * 100
          : null;
      const status = toHistoryStatus(
        bookmark.removedAt ? 'Removed' : bookmark.isClosed ? 'Closed' : 'Active',
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
      best,
      worst,
    };
  }, [rows]);

  const buildFileName = (ext: 'png' | 'pdf') => {
    const date = new Date().toISOString().slice(0, 10);
    return `polypicks-history-${timeframe}-${date}.${ext}`;
  };

  const exportAsPng = async () => {
    if (!exportRef.current) return;
    setIsExporting('png');
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        backgroundColor: '#0b1224',
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
    if (!exportRef.current) return;
    setIsExporting('pdf');
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        backgroundColor: '#0b1224',
      });
      const image = new Image();
      const imageLoaded = new Promise<{ width: number; height: number }>((resolve) => {
        image.onload = () => resolve({ width: image.width, height: image.height });
      });
      image.src = dataUrl;
      const { width, height } = await imageLoaded;
      const { jsPDF } = await import('jspdf');
      const orientation = width >= height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'px', format: [width, height] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
      pdf.save(buildFileName('pdf'));
    } finally {
      setIsExporting(null);
    }
  };

  if (!user) {
    return (
      <main className="min-h-screen bg-[#0b1224] text-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <p className="text-sm text-slate-300">Redirecting to login...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1224] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-12 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              History
            </p>
            <h1 className="text-3xl font-semibold">Bookmarked trades</h1>
            <p className="text-sm text-slate-400">
              Track performance across all bookmarks, even removed ones.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TIMEFRAMES.map((option) => {
              const isActive = option.value === timeframe;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTimeframe(option.value)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                    isActive
                      ? 'border-blue-400 bg-blue-500/20 text-blue-100'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div ref={exportRef} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Trades</p>
              <p className="mt-2 text-2xl font-semibold">{summary.count}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Win rate</p>
              <p className="mt-2 text-2xl font-semibold">
                {summary.winRate == null ? 'N/A' : `${summary.winRate.toFixed(1)}%`}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Total P/L</p>
              <p
                className={`mt-2 text-2xl font-semibold ${
                  summary.totalPL > 0
                    ? 'text-emerald-300'
                    : summary.totalPL < 0
                      ? 'text-red-300'
                      : 'text-slate-100'
                }`}
              >
                {formatSigned(summary.totalPL * 100)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-4 md:col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-slate-400">Best trade</p>
                <span className="text-xs text-slate-500">
                  {summary.best?.returnPct != null
                    ? formatPct(summary.best.returnPct)
                    : 'N/A'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-100">
                {summary.best?.title ?? 'N/A'}
              </p>
              <p className="mt-4 text-xs uppercase tracking-wide text-slate-400">
                Worst trade
              </p>
              <div className="mt-2 flex items-center justify-between gap-4">
                <p className="text-sm text-slate-200">
                  {summary.worst?.title ?? 'N/A'}
                </p>
                <span className="text-xs text-slate-500">
                  {summary.worst?.returnPct != null
                    ? formatPct(summary.worst.returnPct)
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  History
                </h2>
                {historyQuery.isLoading && (
                  <span className="text-xs text-slate-400">Loading...</span>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={exportAsPng}
                  disabled={isExporting != null}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isExporting === 'png' ? 'Exporting...' : 'Download PNG'}
                </button>
                <button
                  type="button"
                  onClick={exportAsPdf}
                  disabled={isExporting != null}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {isExporting === 'pdf' ? 'Exporting...' : 'Download PDF'}
                </button>
              </div>
            </div>

            {historyQuery.isError && (
              <p className="mt-4 text-sm text-red-300">
                Unable to load history. Please try again.
              </p>
            )}

            {!historyQuery.isLoading && rows.length === 0 && (
              <p className="mt-4 text-sm text-slate-400">
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
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Market</th>
                        <th className="px-3 py-2">Bookmarked</th>
                        <th className="px-3 py-2">Entry</th>
                        <th className="px-3 py-2">Final / Current</th>
                        <th className="px-3 py-2">P/L</th>
                        <th className="px-3 py-2">Return</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {rows.map((row) => {
                        const plClass =
                          row.profitDelta == null
                            ? 'text-slate-300'
                            : row.profitDelta > 0
                              ? 'text-emerald-300'
                              : row.profitDelta < 0
                                ? 'text-red-300'
                                : 'text-slate-200';
                        const statusClass =
                          row.status === 'Removed'
                            ? 'border-red-500/40 text-red-200'
                            : row.status === 'Closed'
                              ? 'border-emerald-500/40 text-emerald-200'
                              : 'border-blue-500/40 text-blue-200';
                        return (
                          <tr key={row.id} className="hover:bg-[#111b33]">
                            <td className="px-3 py-3">
                              <div className="text-sm font-semibold text-slate-100">
                                {row.title ?? 'Unknown market'}
                              </div>
                              <div className="text-xs text-slate-400">
                                {row.category ?? 'Unknown'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-300">
                              <div>{new Date(row.createdAt).toLocaleDateString()}</div>
                              <div className="text-xs text-slate-500">
                                {new Date(row.createdAt).toLocaleTimeString()}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-200">
                              {formatPrice(row.entryPrice)}
                            </td>
                            <td className="px-3 py-3 text-slate-200">
                              {formatPrice(row.latestPrice)}
                            </td>
                            <td className={`px-3 py-3 font-semibold ${plClass}`}>
                              {formatSigned(
                                row.profitDelta != null ? row.profitDelta * 100 : null,
                              )}
                            </td>
                            <td className={`px-3 py-3 font-semibold ${plClass}`}>
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
    </main>
  );
}
