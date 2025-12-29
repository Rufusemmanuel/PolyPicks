'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';
import { useBookmarks } from '@/lib/useBookmarks';
import { useMarkets } from '@/lib/useMarkets';
import type { MarketSummary } from '@/lib/polymarket/types';

type MarketWithStrings = Omit<MarketSummary, 'endDate' | 'closedTime'> & {
  endDate: string;
  closedTime?: string | null;
};

export default function TradePage() {
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const bookmarksQuery = useBookmarks(Boolean(user));
  const marketsQuery = useMarkets();
  const router = useRouter();
  type AnyRoute = Parameters<typeof router.push>[0];
  const asRoute = (href: string) => href as unknown as AnyRoute;
  const [selectedAnalytics, setSelectedAnalytics] = useState<{
    marketId: string;
    bookmarkedAt: string;
    initialPrice: number | null;
  } | null>(null);

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!user) {
      router.push(asRoute('/?auth=login'));
    }
  }, [sessionQuery.isLoading, user, router]);

  const marketMap = useMemo(() => {
    const all = [
      ...(marketsQuery.data?.window24 ?? []),
      ...(marketsQuery.data?.window48 ?? []),
    ];
    return new Map(all.map((market) => [market.id, market]));
  }, [marketsQuery.data?.window24, marketsQuery.data?.window48]);

  const bookmarkedMarkets = useMemo(() => {
    const bookmarks = bookmarksQuery.data?.bookmarks ?? [];
    return bookmarks
      .map((bookmark) => ({
        market: marketMap.get(bookmark.marketId),
        bookmark,
      }))
      .filter((entry) => Boolean(entry.market));
  }, [bookmarksQuery.data?.bookmarks, marketMap]);

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
          <p className="text-sm text-slate-400">Coming soon. Start with your bookmarked markets.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0f182c] p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Bookmarked markets
          </h2>
          {bookmarkedMarkets.length === 0 && (
            <p className="text-sm text-slate-400">No bookmarks yet.</p>
          )}
          {bookmarkedMarkets.length > 0 && (
            <div className="space-y-3">
              {bookmarkedMarkets.map(({ market, bookmark }) => (
                <div
                  key={market!.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-[#0b1224] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm text-slate-400">{market!.category}</p>
                    <p className="text-base font-semibold">{market!.title}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedAnalytics({
                          marketId: market!.id,
                          bookmarkedAt: bookmark.createdAt,
                          initialPrice: bookmark.initialPrice,
                        })
                      }
                      className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-400"
                    >
                      Analytics
                    </button>
                    <a
                      href={market!.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-[#002cff] px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Trade on Polymarket
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedAnalytics && (
        <AnalyticsModal
          market={marketMap.get(selectedAnalytics.marketId) as MarketWithStrings}
          bookmarkedAt={selectedAnalytics.bookmarkedAt}
          initialPrice={selectedAnalytics.initialPrice}
          onClose={() => setSelectedAnalytics(null)}
        />
      )}
    </main>
  );
}

function AnalyticsModal({
  market,
  bookmarkedAt,
  initialPrice,
  onClose,
}: {
  market: MarketWithStrings;
  bookmarkedAt: string;
  initialPrice: number | null;
  onClose: () => void;
}) {
  const bookmarkedDate = new Date(bookmarkedAt);
  const currentPrice = market.price.price;
  const initial = initialPrice ?? null;
  const delta = initial != null ? currentPrice - initial : null;
  const closedAt = market.closedTime ?? market.endDate;
  const closedDate = closedAt ? new Date(closedAt) : null;
  const isClosed = closedDate ? closedDate.getTime() <= Date.now() : false;

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
            <h2 className="text-xl font-semibold">{market.title}</h2>
            <p className="text-sm text-slate-400">{market.category}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-slate-400"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-3 text-sm">
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
            <p className="font-semibold">{(currentPrice * 100).toFixed(1)}c</p>
          </div>
          <div>
            <p className="text-slate-400">Change</p>
            <p className="font-semibold">
              {delta != null ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}c` : 'N/A'}
            </p>
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
              <p className="font-semibold">{(currentPrice * 100).toFixed(1)}c</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
