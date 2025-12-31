'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { useAlerts } from '@/lib/useAlerts';
import { useTheme } from '@/components/theme-context';

type EditableAlert = {
  marketId: string;
  title: string | null;
  category: string | null;
  enabled: boolean;
  profitThresholdPct: number | null;
  lossThresholdPct: number | null;
  triggerOnce: boolean;
  cooldownMinutes: number;
};

export default function AlertsPage() {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const alertsQuery = useAlerts(Boolean(user));
  const router = useRouter();
  type AnyRoute = Parameters<typeof router.push>[0];
  const asRoute = (href: string) => href as unknown as AnyRoute;
  const [drafts, setDrafts] = useState<Record<string, EditableAlert>>({});

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!user) {
      router.push(asRoute('/?auth=login'));
    }
  }, [sessionQuery.isLoading, user, router, asRoute]);

  const alerts = useMemo(() => alertsQuery.data?.alerts ?? [], [alertsQuery.data?.alerts]);

  useEffect(() => {
    if (!alerts.length) return;
    setDrafts((prev) => {
      const next = { ...prev };
      alerts.forEach((alert) => {
        if (next[alert.marketId]) return;
        next[alert.marketId] = {
          marketId: alert.marketId,
          title: alert.title,
          category: alert.category,
          enabled: alert.enabled,
          profitThresholdPct: alert.profitThresholdPct,
          lossThresholdPct: alert.lossThresholdPct,
          triggerOnce: alert.triggerOnce,
          cooldownMinutes: alert.cooldownMinutes,
        };
      });
      return next;
    });
  }, [alerts]);

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
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
            Alerts
          </p>
          <h1 className="text-3xl font-semibold">My alerts</h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Manage alert thresholds for your bookmarked markets.
          </p>
        </div>

        <div
          className={`rounded-2xl border p-6 space-y-4 ${
            isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
          }`}
        >
          {alerts.length === 0 && (
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              No alerts yet.
            </p>
          )}
          {alerts.length > 0 && (
            <div className="space-y-4">
              {alerts.map((alert) => {
                const draft = drafts[alert.marketId] ?? {
                  marketId: alert.marketId,
                  title: alert.title,
                  category: alert.category,
                  enabled: alert.enabled,
                  profitThresholdPct: alert.profitThresholdPct,
                  lossThresholdPct: alert.lossThresholdPct,
                  triggerOnce: alert.triggerOnce,
                  cooldownMinutes: alert.cooldownMinutes,
                };
                const title = draft.title ?? 'Unknown market';
                const category = draft.category ?? 'Unknown';
                return (
                  <div
                    key={alert.marketId}
                    className={`rounded-xl border p-4 space-y-4 ${
                      isDark ? 'border-slate-800 bg-[#0b1224]' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p
                          className={`text-xs uppercase tracking-wide ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {category}
                        </p>
                        <p
                          className={`text-base font-semibold ${
                            isDark ? 'text-slate-100' : 'text-slate-900'
                          }`}
                        >
                          {title}
                        </p>
                      </div>
                      <Link
                        href={`/trade?marketId=${encodeURIComponent(
                          alert.marketId,
                        )}&tab=alerts`}
                        className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold hover:border-slate-400 ${
                          isDark
                            ? 'border-slate-700 text-slate-200'
                            : 'border-slate-300 text-slate-700'
                        }`}
                      >
                        Open in trade
                      </Link>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                          isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                          Enabled
                        </span>
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [alert.marketId]: {
                                ...draft,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                          className="h-4 w-4 accent-blue-500"
                        />
                      </label>
                      <div className="space-y-2">
                        <label
                          className={`text-xs uppercase tracking-wide ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          Trigger mode
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [alert.marketId]: { ...draft, triggerOnce: true },
                              }))
                            }
                            className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                              draft.triggerOnce
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
                            onClick={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [alert.marketId]: { ...draft, triggerOnce: false },
                              }))
                            }
                            className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                              !draft.triggerOnce
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
                          Profit threshold (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={draft.profitThresholdPct ?? ''}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [alert.marketId]: {
                                ...draft,
                                profitThresholdPct: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              },
                            }))
                          }
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
                          value={draft.lossThresholdPct ?? ''}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [alert.marketId]: {
                                ...draft,
                                lossThresholdPct: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              },
                            }))
                          }
                          className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:border-blue-400 focus:outline-none ${
                            isDark
                              ? 'border-slate-700 text-slate-100 placeholder:text-slate-500'
                              : 'border-slate-300 text-slate-900 placeholder:text-slate-400'
                          }`}
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
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
                          value={draft.cooldownMinutes}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [alert.marketId]: {
                                ...draft,
                                cooldownMinutes: event.target.value
                                  ? Number(event.target.value)
                                  : 60,
                              },
                            }))
                          }
                          className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:border-blue-400 focus:outline-none ${
                            isDark
                              ? 'border-slate-700 text-slate-100 placeholder:text-slate-500'
                              : 'border-slate-300 text-slate-900 placeholder:text-slate-400'
                          }`}
                          placeholder="60"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await alertsQuery.saveAlert({
                            marketId: alert.marketId,
                            profitThresholdPct: draft.profitThresholdPct,
                            lossThresholdPct: draft.lossThresholdPct,
                            triggerOnce: draft.triggerOnce,
                            cooldownMinutes: draft.cooldownMinutes,
                            enabled: draft.enabled,
                          });
                        }}
                        className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold transition hover:border-blue-400 ${
                          isDark ? 'border-blue-500/60 text-blue-100' : 'border-blue-300 text-blue-700'
                        }`}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await alertsQuery.deleteAlert(alert.marketId);
                        }}
                        className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold transition hover:border-red-400 ${
                          isDark ? 'border-red-500/60 text-red-200' : 'border-red-300 text-red-600'
                        }`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
