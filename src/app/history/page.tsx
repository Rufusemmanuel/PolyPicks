'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function HistoryPage() {
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]['value']>(
    'all',
  );

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

  const rows = useMemo(() => {
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
      const status = bookmark.removedAt
        ? 'Removed'
        : bookmark.isClosed
          ? 'Closed'
          : 'Active';
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
    const avgReturn = scored.length
      ? scored.reduce((sum, row) => sum + (row.returnPct ?? 0), 0) / scored.length
      : null;
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
      avgReturn,
      totalPL,
      best,
      worst,
    };
  }, [rows]);

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

        <div className="grid gap-4 md:grid-cols-5">
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
            <p className="text-xs uppercase tracking-wide text-slate-400">Avg return</p>
            <p className="mt-2 text-2xl font-semibold">
              {summary.avgReturn == null ? 'N/A' : formatPct(summary.avgReturn)}
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
          <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Best / Worst</p>
            <p className="mt-2 text-sm text-slate-200">
              {summary.best?.title ?? 'N/A'}
            </p>
            <p className="text-xs text-slate-500">
              {summary.best?.returnPct != null
                ? formatPct(summary.best.returnPct)
                : 'N/A'}
            </p>
            <p className="mt-3 text-sm text-slate-200">
              {summary.worst?.title ?? 'N/A'}
            </p>
            <p className="text-xs text-slate-500">
              {summary.worst?.returnPct != null
                ? formatPct(summary.worst.returnPct)
                : 'N/A'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              History
            </h2>
            {historyQuery.isLoading && (
              <span className="text-xs text-slate-400">Loading...</span>
            )}
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
            <div className="mt-4 overflow-x-auto">
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
          )}
        </div>
      </div>
    </main>
  );
}
