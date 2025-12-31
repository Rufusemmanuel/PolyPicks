// src/app/page.tsx
'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Footer } from '@/components/Footer';
import { useMarkets } from '@/lib/useMarkets';
import { MarketCard } from '@/components/MarketCard';
import { Skeleton } from '@/components/Skeleton';
import { MarketDetailsDrawer } from '@/components/MarketDetailsDrawer';
import { SignUpModal } from '@/components/SignUpModal';
import type { MarketSummary } from '@/lib/polymarket/types';
import { useSession } from '@/lib/useSession';
import { useBookmarks } from '@/lib/useBookmarks';
import { useTheme } from '@/components/theme-context';

type MarketWithStrings = Omit<MarketSummary, 'endDate' | 'closedTime'> & {
  endDate: string;
  closedTime?: string | null;
};

type WindowMode = '24' | '48';

type Subdivision =
  | 'Politics'
  | 'Sports'
  | 'Finance'
  | 'Crypto'
  | 'Geopolitics'
  | 'Earnings'
  | 'Tech'
  | 'Culture'
  | 'World'
  | 'Economy'
  | 'Elections';

const SUBDIVISIONS: Subdivision[] = [
  'Politics',
  'Sports',
  'Finance',
  'Crypto',
  'Geopolitics',
  'Earnings',
  'Tech',
  'Culture',
  'World',
  'Economy',
  'Elections',
];

function mapToSubdivision(market: MarketWithStrings): Subdivision {
  const category = (market.category || '').toLowerCase();
  const hasWord = (text: string, word: string) =>
    new RegExp(`\\b${word}\\b`, 'i').test(text);

  if (category.includes('election')) return 'Elections';
  if (category.includes('politic')) return 'Politics';

  if (
    category.includes('sport') ||
    hasWord(category, 'nba') ||
    hasWord(category, 'nfl') ||
    hasWord(category, 'mlb') ||
    category.includes('soccer') ||
    hasWord(category, 'f1')
  ) {
    return 'Sports';
  }

  if (
    category.includes('crypto') ||
    category.includes('bitcoin') ||
    category.includes('eth') ||
    category.includes('solana') ||
    category.includes('ethereum') ||
    category.includes('xrp') ||
    category.includes('ripple')
  ) {
    return 'Crypto';
  }

  if (
    category.includes('finance') ||
    category.includes('stock') ||
    category.includes('equity') ||
    category.includes('fx') ||
    category.includes('forex') ||
    category.includes('index')
  ) {
    return 'Finance';
  }

  if (category.includes('earning')) return 'Earnings';
  if (category.includes('tech') || category.includes('ai')) return 'Tech';

  if (category.includes('geopolitic') || category.includes('war') || category.includes('conflict')) {
    return 'Geopolitics';
  }

  if (
    category.includes('economy') ||
    category.includes('gdp') ||
    category.includes('inflation') ||
    category.includes('cpi')
  ) {
    return 'Economy';
  }

  if (category.includes('culture') || category.includes('entertainment')) return 'Culture';
  if (category.includes('world')) return 'World';

  return 'World';
}

export default function Page() {
  return <PageContent />;
}

function PageContent() {
  const marketsQuery = useMarkets();
  const liveMarketsTotal = useMemo(
    () => (marketsQuery.data?.window24?.length ?? 0) + (marketsQuery.data?.window48?.length ?? 0),
    [marketsQuery.data?.window24, marketsQuery.data?.window48],
  );
  const { isDark } = useTheme();

  return (
    <>
      <main className={isDark ? 'bg-[#0b1224] text-slate-100' : 'bg-white text-slate-900'}>
        <Hero
          liveMarketsTotal={liveMarketsTotal}
          isLoading={marketsQuery.isLoading}
          isDark={isDark}
        />
        <MarketsSection marketsQuery={marketsQuery} isDark={isDark} />
        <HistorySection isDark={isDark} />
        <AboutSection isDark={isDark} />
      </main>
      <Footer />
    </>
  );
}

function Hero({
  liveMarketsTotal,
  isLoading,
  isDark,
}: {
  liveMarketsTotal: number;
  isLoading: boolean;
  isDark: boolean;
}) {

  return (
    <section
      className={
        isDark
          ? 'bg-gradient-to-br from-[#0b1224] via-[#0f1a34] to-[#0b1224]'
          : 'bg-gradient-to-br from-white via-slate-50 to-white'
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 md:flex-row md:items-center md:justify-between">
        <div className="max-w-3xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#002cff]">PolyPicks</p>
          <h1 className={`text-4xl font-bold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
            High-confidence Polymarket signals, refreshed in real time.
          </h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <LiveMarketsOrb liveMarketsTotal={liveMarketsTotal} isLoading={isLoading} />
        </div>
      </div>
    </section>
  );
}

function LiveMarketsOrb({
  liveMarketsTotal,
  isLoading,
}: {
  liveMarketsTotal: number;
  isLoading: boolean;
}) {
  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-40 flex h-28 w-28 shrink-0 items-center justify-center md:relative md:bottom-auto md:right-auto md:z-auto">
      <div
        aria-hidden
        className="absolute h-24 w-24 rounded-full bg-[#1f4bff] opacity-25 blur-md animate-ping"
      />
      <div
        aria-hidden
        className="absolute inset-0 rounded-full border-2 border-white/30 animate-pulse"
      />
      <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full bg-[#0a4dff] text-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] ring-4 ring-blue-500/40">
        <span className="text-[11px] uppercase tracking-[0.18em] text-blue-100">Live</span>
        <span className="text-3xl font-black leading-none drop-shadow-sm">
          {isLoading ? '...' : liveMarketsTotal}
        </span>
      </div>
      <span className="sr-only">
        {isLoading
          ? 'Live markets loading'
          : `${liveMarketsTotal} live markets in 24 and 48 hour windows`}
      </span>
    </div>
  );
}

function MarketsSection({
  marketsQuery,
  isDark,
}: {
  marketsQuery: ReturnType<typeof useMarkets>;
  isDark: boolean;
}) {
  const { data, isLoading, isError } = marketsQuery;
  const sessionQuery = useSession();
  const queryClient = useQueryClient();
  const user = sessionQuery.data?.user ?? null;
  const bookmarksQuery = useBookmarks(Boolean(user));
  const [activeSubdivision, setActiveSubdivision] = useState<'All' | Subdivision>('All');
  const [windowMode, setWindowMode] = useState<WindowMode>('24');
  const [search, setSearch] = useState('');
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [pendingBookmark, setPendingBookmark] = useState<{
    marketId: string;
    entryPrice: number;
    title: string;
    category: string;
    marketUrl: string;
    outcomeId?: string | null;
    outcomeLabel?: string | null;
  } | null>(null);

  const bookmarkedIds = useMemo(
    () => new Set(bookmarksQuery.data?.bookmarks.map((b) => b.marketId) ?? []),
    [bookmarksQuery.data?.bookmarks],
  );

  const toggleBookmark = useMutation({
    mutationFn: async ({
      marketId,
      isBookmarked,
      entryPrice,
      title,
      category,
      marketUrl,
      outcomeId,
      outcomeLabel,
    }: {
      marketId: string;
      isBookmarked: boolean;
      entryPrice: number;
      title: string;
      category: string;
      marketUrl: string;
      outcomeId?: string | null;
      outcomeLabel?: string | null;
    }) => {
      const res = await fetch(
        isBookmarked ? `/api/bookmarks/${marketId}` : '/api/bookmarks',
        {
          method: isBookmarked ? 'DELETE' : 'POST',
          headers: isBookmarked ? undefined : { 'Content-Type': 'application/json' },
          body: isBookmarked
            ? undefined
            : JSON.stringify({
                marketId,
                entryPrice,
                title,
                category,
                marketUrl,
                outcomeId,
                outcomeLabel,
              }),
        },
      );
      if (!res.ok) throw new Error('Unable to update bookmark');
      return res.json();
    },
    onMutate: async ({
      marketId,
      isBookmarked,
      entryPrice,
      title,
      category,
      marketUrl,
      outcomeId,
      outcomeLabel,
    }) => {
      await queryClient.cancelQueries({ queryKey: ['bookmarks'] });
      const previous = queryClient.getQueryData<{
        bookmarks: {
          marketId: string;
          createdAt: string;
          entryPrice: number;
          title: string | null;
          category: string | null;
          marketUrl: string | null;
          outcomeId?: string | null;
          outcomeLabel?: string | null;
        }[];
      }>(['bookmarks']);
      const prevBookmarks = previous?.bookmarks ?? [];
      const nextBookmarks = isBookmarked
        ? prevBookmarks.filter((b) => b.marketId !== marketId)
        : [
            ...prevBookmarks,
            {
              marketId,
              createdAt: new Date().toISOString(),
              entryPrice,
              title,
              category,
              marketUrl,
              outcomeId,
              outcomeLabel,
            },
          ];
      queryClient.setQueryData(['bookmarks'], { bookmarks: nextBookmarks });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['bookmarks'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  const handleToggleBookmark = (data: {
    marketId: string;
    entryPrice: number;
    title: string;
    category: string;
    marketUrl: string;
    outcomeId?: string | null;
    outcomeLabel?: string | null;
  }) => {
    if (!user) {
      setPendingBookmark(data);
      setIsSignUpOpen(true);
      return;
    }

    const isBookmarked = bookmarkedIds.has(data.marketId);
    toggleBookmark.mutate({ ...data, isBookmarked });
  };

  const handleSignUpSuccess = (nextUser: { id: string; name: string }) => {
    queryClient.setQueryData(['session'], { user: nextUser });
    setIsSignUpOpen(false);

    if (pendingBookmark) {
      toggleBookmark.mutate({
        marketId: pendingBookmark.marketId,
        isBookmarked: false,
        entryPrice: pendingBookmark.entryPrice,
        title: pendingBookmark.title,
        category: pendingBookmark.category,
        marketUrl: pendingBookmark.marketUrl,
        outcomeId: pendingBookmark.outcomeId ?? null,
        outcomeLabel: pendingBookmark.outcomeLabel ?? null,
      });
      setPendingBookmark(null);
    }
  };

  const marketsByWindow = useMemo<MarketWithStrings[]>(() => {
    if (!data) return [];
    return windowMode === '24' ? data.window24 : data.window48;
  }, [data, windowMode]);

  const searchFiltered = useMemo<MarketWithStrings[]>(() => {
    const term = search.trim().toLowerCase();
    if (!term) return marketsByWindow;
    return marketsByWindow.filter(
      (m) =>
        m.title.toLowerCase().includes(term) ||
        (m.category || '').toLowerCase().includes(term),
    );
  }, [marketsByWindow, search]);

  const subdivisionCounts = useMemo(() => {
    const counts: Record<Subdivision, number> = {
      Politics: 0,
      Sports: 0,
      Finance: 0,
      Crypto: 0,
      Geopolitics: 0,
      Earnings: 0,
      Tech: 0,
      Culture: 0,
      World: 0,
      Economy: 0,
      Elections: 0,
    };

    searchFiltered.forEach((m) => {
      const sub = mapToSubdivision(m);
      counts[sub] += 1;
    });

    return counts;
  }, [searchFiltered]);

  const visibleMarkets = useMemo<MarketWithStrings[]>(() => {
    if (activeSubdivision === 'All') return searchFiltered;
    return searchFiltered.filter((m) => mapToSubdivision(m) === activeSubdivision);
  }, [activeSubdivision, searchFiltered]);

  return (
    <section id="markets" className={isDark ? 'bg-[#0d1428]' : 'bg-slate-50'}>
      <div className="mx-auto max-w-6xl px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className={`text-2xl font-bold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
              Live Markets
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex rounded-full border p-1 shadow-sm ${
                isDark
                  ? 'border-slate-700 bg-[#0f1a32] shadow-slate-900/50'
                  : 'border-slate-200 bg-white shadow-slate-200'
              }`}
            >
              <button
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                  windowMode === '24'
                    ? 'bg-[#002cff] text-white shadow-sm'
                    : isDark
                      ? 'text-slate-200 hover:text-white'
                      : 'text-slate-700 hover:text-slate-900'
                }`}
                onClick={() => setWindowMode('24')}
              >
                24 hours
              </button>
              <button
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                  windowMode === '48'
                    ? 'bg-[#002cff] text-white shadow-sm'
                    : isDark
                      ? 'text-slate-200 hover:text-white'
                      : 'text-slate-700 hover:text-slate-900'
                }`}
                onClick={() => setWindowMode('48')}
              >
                48 hours
              </button>
            </div>
            <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
              {visibleMarkets.length} live markets
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs md:text-sm font-semibold transition ${
                activeSubdivision === 'All'
                  ? 'border-[#4a6fff] bg-[#002cff] text-white shadow-sm'
                  : 'border-slate-700 bg-[#111a33] text-slate-200 hover:text-white'
              }`}
              onClick={() => setActiveSubdivision('All')}
            >
              All ({searchFiltered.length})
            </button>
            {SUBDIVISIONS.map((sub) => {
              const count = subdivisionCounts[sub];
              const isActive = activeSubdivision === sub;
              return (
                <button
                  key={sub}
                  className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs md:text-sm font-semibold transition ${
                    isActive
                      ? 'border-[#4a6fff] bg-[#002cff] text-white shadow-sm'
                      : isDark
                        ? 'border-slate-700 bg-[#111a33] text-slate-200 hover:text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:text-slate-900'
                  } ${count === 0 ? 'cursor-not-allowed opacity-40' : ''}`}
                  onClick={() => count > 0 && setActiveSubdivision(sub)}
                  disabled={count === 0}
                >
                  {sub} ({count})
                </button>
              );
            })}
          </div>

          <div
            className={`flex items-center gap-3 rounded-full border px-3 py-2 shadow-sm ${
              isDark
                ? 'border-slate-700 bg-[#0f1a32] shadow-slate-900/50'
                : 'border-slate-200 bg-white shadow-slate-200'
            }`}
          >
            <div
              className={`flex items-center gap-2 text-sm font-semibold ${
                isDark ? 'text-slate-100' : 'text-slate-800'
              }`}
            >
              <Image src="/polypicks.png" alt="PolyPicks logo" width={20} height={20} />
              <span>PolyPicks</span>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets"
              className={`w-48 bg-transparent text-sm ${
                isDark ? 'text-slate-100 placeholder:text-slate-400' : 'text-slate-800 placeholder:text-slate-400'
              } focus:outline-none`}
            />
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        )}

        {isError && (
          <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
            Could not load markets. Please refresh or try again later.
          </p>
        )}

        {!isLoading && !isError && visibleMarkets.length === 0 && (
          <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            No markets are currently available in this window.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {visibleMarkets.map((m) => (
            <MarketCard
              key={m.id}
              market={m as MarketWithStrings}
              isDark={isDark}
              onOpenDetails={(marketId) => {
                setSelectedMarketId(marketId);
                setIsDetailsOpen(true);
              }}
              isBookmarked={bookmarkedIds.has(m.id)}
              onToggleBookmark={handleToggleBookmark}
            />
          ))}
        </div>
      </div>
      <MarketDetailsDrawer
        marketId={selectedMarketId}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        isDark={isDark}
      />
      <SignUpModal
        isOpen={isSignUpOpen}
        isDark={isDark}
        onClose={() => {
          setIsSignUpOpen(false);
          setPendingBookmark(null);
        }}
        onSuccess={handleSignUpSuccess}
      />
    </section>
  );
}

function HistorySection(_: { isDark: boolean }) {
  return null;
}

function AboutSection({ isDark }: { isDark: boolean }) {
  return (
    <section id="about" className={isDark ? 'bg-[#0d1428]' : 'bg-slate-50'}>
      <div className="mx-auto max-w-6xl px-4 py-12 space-y-4">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
          About PolyPicks
        </h2>
        <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
          PolyPicks is a powerful tool designed to help individuals and traders secure the best live bets. We refine and narrow down the odds to deliver top-tier selections.
        </p>
      </div>
    </section>
  );
}


