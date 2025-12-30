import { forwardRef } from 'react';
import { EXPORT_BRAND } from './historyExportBrand';
import {
  formatDate,
  formatPct,
  formatPrice,
  formatSignedCents,
  formatTime,
  formatTimestamp,
} from './historyExportFormat';
import type { HistoryExportRow, HistoryExportSummary } from './historyExportTypes';

type Props = {
  rows: HistoryExportRow[];
  summary: HistoryExportSummary;
  userName?: string | null;
  generatedAt: string;
};

const statusStyles: Record<HistoryExportRow['status'], { bg: string; text: string }> = {
  Closed: { bg: '#dcfce7', text: '#166534' },
  Removed: { bg: '#fee2e2', text: '#991b1b' },
  Active: { bg: '#dbeafe', text: '#1e40af' },
};

export const HistoryExportDom = forwardRef<HTMLDivElement, Props>(
  ({ rows, summary, userName, generatedAt }, ref) => {
    return (
      <div
        ref={ref}
        className="w-[794px] bg-white text-slate-900"
        style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' }}
      >
        <div className="px-10 pb-10 pt-12">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
                PolyPicks
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Trade History
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {userName ? `${userName} · ` : ''}
                {formatTimestamp(generatedAt)}
              </p>
            </div>
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: EXPORT_BRAND.primary }}
            >
              <span className="text-xs font-semibold">PP</span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Trades
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {summary.count}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Win rate
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {summary.winRate == null ? 'N/A' : `${summary.winRate.toFixed(1)}%`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Total P/L
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatSignedCents(summary.totalPL)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Best / Worst
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {summary.best?.title ?? 'N/A'}
              </p>
              <p className="text-xs text-slate-500">
                {summary.worst?.title ?? 'N/A'}
              </p>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead style={{ backgroundColor: EXPORT_BRAND.primary }} className="text-white">
                <tr>
                  <th className="px-3 py-2 font-semibold">Market</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Bookmarked</th>
                  <th className="px-3 py-2 font-semibold">Entry</th>
                  <th className="px-3 py-2 font-semibold">Final / Current</th>
                  <th className="px-3 py-2 font-semibold">P/L</th>
                  <th className="px-3 py-2 font-semibold">Return</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const stripe = index % 2 === 0;
                  const statusStyle = statusStyles[row.status];
                  return (
                    <tr
                      key={row.id}
                      style={{ backgroundColor: stripe ? EXPORT_BRAND.stripe : 'white' }}
                    >
                      <td className="px-3 py-2 align-top text-slate-900">
                        <div className="font-semibold break-words">
                          {row.title ?? 'Unknown market'}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-600 break-words">
                        {row.category ?? 'Unknown'}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-600">
                        <div>{formatDate(row.createdAt)}</div>
                        <div className="text-[11px] text-slate-400">
                          {formatTime(row.createdAt)}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">
                        {formatPrice(row.entryPrice)}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">
                        {formatPrice(row.latestPrice)}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">
                        {formatSignedCents(row.profitDelta)}
                      </td>
                      <td className="px-3 py-2 align-top text-slate-700">
                        {formatPct(row.returnPct)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold"
                          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
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

          <div className="mt-8 flex items-center justify-between text-xs text-slate-400">
            <span>Generated by PolyPicks</span>
            <span>polypicks.app</span>
          </div>
        </div>
      </div>
    );
  },
);

HistoryExportDom.displayName = 'HistoryExportDom';
