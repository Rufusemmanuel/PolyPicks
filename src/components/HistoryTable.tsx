import { format } from 'date-fns';
import type { HistoryEntryDto } from '@/lib/polymarket/types';

type Props = {
  entries: HistoryEntryDto[];
  isDark: boolean;
};

export function HistoryTable({ entries, isDark }: Props) {
  if (!entries.length) {
    return (
      <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
        No resolved signals yet.
      </p>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border shadow-md ${
        isDark ? 'border-slate-800 shadow-slate-900/60' : 'border-slate-200 shadow-slate-200'
      }`}
    >
      <table
        className={`min-w-full divide-y text-sm ${
          isDark ? 'divide-slate-800 bg-[#0f182c]' : 'divide-slate-200 bg-white'
        }`}
      >
        <thead
          className={`text-left font-semibold ${
            isDark ? 'bg-[#111d36] text-slate-200' : 'bg-slate-50 text-slate-700'
          }`}
        >
          <tr>
            <th className="px-4 py-3">Market</th>
            <th className="px-4 py-3">Outcome</th>
            <th className="px-4 py-3">Entry</th>
            <th className="px-4 py-3">Resolved</th>
            <th className="px-4 py-3">Closed</th>
            <th className="px-4 py-3">Link</th>
          </tr>
        </thead>
        <tbody className={isDark ? 'divide-y divide-slate-800' : 'divide-y divide-slate-200'}>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={isDark ? 'hover:bg-[#142544]' : 'hover:bg-slate-50'}
            >
              <td className="px-4 py-3">
                <div className={`font-semibold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
                  {entry.title}
                </div>
                <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {entry.category}
                </div>
              </td>
              <td
                className={`px-4 py-3 font-semibold ${
                  isDark ? 'text-emerald-300' : 'text-emerald-700'
                }`}
              >
                {entry.resolvedOutcome}
              </td>
              <td className={`px-4 py-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {(entry.entryPrice * 100).toFixed(1)}c
              </td>
              <td className={`px-4 py-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {format(new Date(entry.resolvedAt), 'yyyy-MM-dd HH:mm')}
              </td>
              <td className={`px-4 py-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {entry.closedAt ? format(new Date(entry.closedAt), 'yyyy-MM-dd HH:mm') : '-'}
              </td>
              <td className="px-4 py-3">
                <a
                  href={entry.marketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={
                    isDark
                      ? 'text-blue-300 hover:text-blue-200 hover:underline'
                      : 'text-[#002cff] hover:underline'
                  }
                >
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
