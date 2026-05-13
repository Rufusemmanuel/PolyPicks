'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useSession } from '@/lib/useSession';
import { useBookmarks } from '@/lib/useBookmarks';
import { useTheme } from '@/components/theme-context';
import { useInjectedWallet } from '@/hooks/useInjectedWallet';
import { usePolymarketSession } from '@/lib/polymarket/usePolymarketSession';
import WalletPage from '@/app/wallet/page';
import HistoryPage from '@/app/history/page';
import { GeneratedProfileAvatar } from '@/components/GeneratedProfileAvatar';
import {
  bodyText,
  buttonPrimary,
  buttonSecondaryDark,
  buttonSecondaryLight,
  cardBase,
  cardLabel,
  cardSurfaceDark,
  cardSurfaceLight,
  pageTitle,
  sectionTitle,
} from '@/lib/ui/classes';

type AccountTab = 'overview' | 'wallet' | 'bookmarks' | 'history' | 'settings';

type PositionMetric = {
  balanceBase: bigint;
  price: number | null;
};

const accountTabs: Array<{ id: AccountTab; label: string; icon: AccountTab }> = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmarks' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const isAccountTab = (value: string | null): value is AccountTab =>
  Boolean(value && accountTabs.some((tab) => tab.id === value));

const fetchPositionMetrics = async (address: string): Promise<PositionMetric[]> => {
  const params = new URLSearchParams({ user: address });
  const res = await fetch(`/api/positions?${params.toString()}`);
  const data = (await res.json()) as
    | { ok: boolean; positions?: Array<Record<string, unknown>>; error?: string }
    | Array<Record<string, unknown>>;
  if (!res.ok || ('ok' in data && !data.ok)) {
    throw new Error('Unable to load positions.');
  }
  const rows = Array.isArray(data) ? data : data.positions ?? [];
  return rows
    .map((row) => {
      const rawSize = (row.size ?? row.balance ?? row.shares ?? '0') as string | number;
      const balanceBase = BigInt(Math.round(Number(rawSize) * 1_000_000));
      const price = typeof row.curPrice === 'number' ? row.curPrice : null;
      return { balanceBase, price };
    })
    .filter((row) => row.balanceBase > 0n);
};

function ProfileHub() {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const bookmarksQuery = useBookmarks(Boolean(user));
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const {
    address,
    chainId,
    walletClient,
    isConnected,
    isCorrectNetwork,
    providerAvailable,
    connect,
    ensurePolygon,
  } = useInjectedWallet();
  const polymarketSession = usePolymarketSession(walletClient, address, chainId);
  type AnyRoute = Parameters<typeof router.push>[0];
  const asRoute = useCallback((href: string) => href as unknown as AnyRoute, []);
  const tabParam = searchParams.get('tab');
  const activeTab: AccountTab =
    tabParam === 'positions' ? 'wallet' : isAccountTab(tabParam) ? tabParam : 'overview';
  const cardSurface = isDark ? cardSurfaceDark : cardSurfaceLight;
  const buttonSecondary = isDark ? buttonSecondaryDark : buttonSecondaryLight;

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!user) {
      router.push(asRoute('/?auth=login'));
    }
  }, [asRoute, sessionQuery.isLoading, user, router]);

  useEffect(() => {
    if (tabParam === 'positions') {
      router.replace(asRoute('/profile?tab=wallet'), { scroll: false });
    }
  }, [asRoute, router, tabParam]);

  const positionsQuery = useQuery({
    queryKey: ['account-position-metrics', polymarketSession.tradingWalletAddress],
    enabled: Boolean(user && polymarketSession.tradingWalletAddress),
    queryFn: async () => fetchPositionMetrics(polymarketSession.tradingWalletAddress!),
    staleTime: 30_000,
  });

  const usdcBalanceQuery = useQuery({
    queryKey: ['account-usdc-balance', polymarketSession.tradingWalletAddress],
    enabled: Boolean(user && polymarketSession.tradingWalletAddress),
    queryFn: polymarketSession.getUsdcBalance,
    staleTime: 30_000,
  });

  const positionsValue = useMemo(() => {
    const positions = positionsQuery.data ?? [];
    return positions.reduce((sum, row) => {
      const amount = Number(formatUnits(row.balanceBase, 6));
      return sum + amount * (row.price ?? 0);
    }, 0);
  }, [positionsQuery.data]);

  const recentBookmarks = bookmarksQuery.data?.bookmarks.slice(0, 4) ?? [];
  const bookmarkCount = bookmarksQuery.data?.bookmarks.length ?? 0;

  const setTab = (tab: AccountTab) => {
    router.push(asRoute(`/profile?tab=${tab}`), { scroll: false });
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.setQueryData(['session'], { user: null });
    queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    router.push(asRoute('/'));
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
        <div className="mx-auto max-w-4xl px-4 py-12">
          <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Redirecting to login...
          </p>
        </div>
      </main>
    );
  }

  const statCards = [
    {
      label: 'Trading wallet balance',
      value: usdcBalanceQuery.data
        ? `$${Number(formatUnits(usdcBalanceQuery.data, 6)).toFixed(2)}`
        : '-',
      detail: polymarketSession.tradingWalletAddress
        ? 'USDC on Polygon'
        : 'Connect wallet to sync',
    },
    {
      label: 'Positions value',
      value: positionsQuery.isLoading ? '-' : `$${positionsValue.toFixed(2)}`,
      detail: `${positionsQuery.data?.length ?? 0} open positions`,
    },
    {
      label: 'Bookmarked markets',
      value: bookmarkCount.toString(),
      detail: 'Saved opportunities',
    },
  ];

  return (
    <main
      className={
        isDark
          ? 'min-h-screen bg-[#0b1224] text-slate-100'
          : 'min-h-screen bg-slate-50 text-slate-900'
      }
    >
      <div className="mx-auto max-w-7xl px-4 py-7 space-y-5">
        <section
          className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
            isDark
              ? 'border-white/10 bg-[linear-gradient(135deg,rgba(0,44,255,0.18),rgba(15,24,44,0.85))]'
              : 'border-slate-200 bg-[linear-gradient(135deg,#eef4ff,#ffffff)]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <GeneratedProfileAvatar name={user.name} size={72} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className={`${pageTitle} tracking-tight`}>Account Hub</h1>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      isDark
                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    Active
                  </span>
                </div>
                <p className={`${bodyText} mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  <span className="font-semibold">{user.name}</span>{' '}
                  Manage your wallet, saved markets, and trading history.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {providerAvailable && !isConnected && (
                <button
                  type="button"
                  onClick={() => connect().catch(() => null)}
                  className={`${buttonPrimary} h-9 px-4 text-xs font-semibold`}
                >
                  Connect wallet
                </button>
              )}
              {isConnected && !isCorrectNetwork && (
                <button
                  type="button"
                  onClick={() => ensurePolygon().catch(() => null)}
                  className={`${buttonSecondary} h-9 px-4 text-xs font-semibold`}
                >
                  Switch to Polygon
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className={`${buttonSecondary} h-9 px-4 text-xs font-semibold`}
              >
                Log out
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside
            className={`rounded-2xl border p-2 shadow-sm lg:sticky lg:top-24 lg:self-start ${
              isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white'
            }`}
          >
            <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Account sections">
              {accountTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTab(tab.id)}
                    className={`group flex min-w-max items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-semibold transition lg:min-w-0 ${
                      active
                        ? isDark
                          ? 'bg-blue-500/20 text-blue-100 shadow-sm'
                          : 'bg-blue-50 text-blue-700 shadow-sm'
                        : isDark
                          ? 'text-slate-300 hover:bg-white/5 hover:text-white'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <AccountTabIcon tab={tab.icon} active={active} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {statCards.map((card) => (
                    <div key={card.label} className={`${cardBase} ${cardSurface} p-5`}>
                      <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {card.label}
                      </p>
                      <p className="mt-3 text-2xl font-semibold">{card.value}</p>
                      <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {card.detail}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className={`${cardBase} ${cardSurface} p-5`}>
                    <div className="flex items-center justify-between">
                      <p className={sectionTitle}>Recent activity</p>
                      <button
                        type="button"
                        onClick={() => setTab('history')}
                        className={`${buttonSecondary} h-8 px-3 text-xs font-semibold`}
                      >
                        View history
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      {recentBookmarks.length === 0 && (
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          No recent account activity yet.
                        </p>
                      )}
                      {recentBookmarks.map((bookmark) => (
                        <div
                          key={bookmark.marketId}
                          className={`rounded-xl border p-3 ${
                            isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <p className="text-sm font-semibold">{bookmark.title ?? 'Saved market'}</p>
                          <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Bookmarked {new Date(bookmark.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`${cardBase} ${cardSurface} p-5`}>
                    <p className={sectionTitle}>Quick actions</p>
                    <div className="mt-4 grid gap-2">
                      <button type="button" onClick={() => setTab('wallet')} className={`${buttonPrimary} h-10 px-4 text-sm font-semibold`}>
                        Wallet
                      </button>
                      <Link href="/" className={`${buttonSecondary} inline-flex h-10 items-center justify-center px-4 text-sm font-semibold`}>
                        Browse Markets
                      </Link>
                      <button type="button" onClick={() => setTab('history')} className={`${buttonSecondary} h-10 px-4 text-sm font-semibold`}>
                        History
                      </button>
                      <button type="button" onClick={handleLogout} className={`${buttonSecondary} h-10 px-4 text-sm font-semibold`}>
                        Log out
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'wallet' && <WalletPage />}
            {activeTab === 'history' && <HistoryPage />}
            {activeTab === 'bookmarks' && (
              <div className={`${cardBase} ${cardSurface} p-5`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${cardLabel} text-blue-400`}>Bookmarks</p>
                    <h2 className="mt-1 text-2xl font-semibold">Saved markets</h2>
                  </div>
                  <Link href="/" className={`${buttonSecondary} inline-flex h-9 items-center px-4 text-xs font-semibold`}>
                    Browse Markets
                  </Link>
                </div>
                <div className="mt-5 space-y-3">
                  {!bookmarksQuery.isLoading && bookmarkCount === 0 && (
                    <div className={`rounded-xl border border-dashed px-4 py-8 text-center text-sm ${
                      isDark ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-600'
                    }`}>
                      No saved markets yet. Bookmark markets to track opportunities here.
                    </div>
                  )}
                  {bookmarksQuery.data?.bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.marketId}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
                        isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{bookmark.title ?? 'Saved market'}</p>
                        <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {bookmark.category ?? 'Market'} · Entry {(bookmark.entryPrice * 100).toFixed(1)}c
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {bookmark.marketUrl && (
                          <a href={bookmark.marketUrl} target="_blank" rel="noreferrer" className={`${buttonSecondary} h-8 px-3 text-xs font-semibold`}>
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => bookmarksQuery.removeBookmark(bookmark.marketId).catch(() => null)}
                          className={`${buttonSecondary} h-8 px-3 text-xs font-semibold`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className={`${cardBase} ${cardSurface} p-5`}>
                <p className={`${cardLabel} text-blue-400`}>Settings</p>
                <h2 className="mt-1 text-2xl font-semibold">Account settings</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'}`}>
                    <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Username</p>
                    <p className="mt-2 font-semibold">{user.name}</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'}`}>
                    <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Session</p>
                    <p className="mt-2 font-semibold">Active</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function AccountTabIcon({ tab, active }: { tab: AccountTab; active: boolean }) {
  const iconClass = active ? 'text-current' : 'text-current opacity-70 group-hover:opacity-100';
  const common = {
    className: `h-4 w-4 ${iconClass}`,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (tab === 'overview') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M4 13h6V4H4v9Z" />
        <path d="M14 20h6V4h-6v16Z" />
        <path d="M4 20h6v-3H4v3Z" />
      </svg>
    );
  }
  if (tab === 'wallet') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h13" />
        <path d="M16 13h3" />
      </svg>
    );
  }
  if (tab === 'bookmarks') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M6 4h12v16l-6-3-6 3V4Z" />
      </svg>
    );
  }
  if (tab === 'history') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 5v5h5" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...common}>
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
    </svg>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileHub />
    </Suspense>
  );
}
