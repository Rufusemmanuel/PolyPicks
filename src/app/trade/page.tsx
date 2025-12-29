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
  const [removeError, setRemoveError] = useState<string | null>(null);

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
    return bookmarks.map((bookmark) => ({
      market: marketMap.get(bookmark.marketId),
      bookmark,
    }));
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
                return (
                <div
                  key={bookmark.marketId}
                  className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#0b1224] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm text-slate-400">{category}</p>
                    <p
                      className="truncate text-base font-semibold text-slate-100"
                      title={title}
                    >
                      {title}
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:w-[420px] sm:flex-shrink-0 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedAnalytics({
                          marketId: bookmark.marketId,
                          bookmarkedAt: bookmark.createdAt,
                          initialPrice: bookmark.initialPrice,
                        })
                      }
                      className="h-10 min-w-[130px] whitespace-nowrap rounded-full border border-slate-700 px-4 text-xs font-semibold text-slate-200 transition hover:border-slate-400"
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
                      className="h-10 min-w-[110px] whitespace-nowrap rounded-full border border-red-500/60 px-4 text-xs font-semibold text-red-200 transition hover:border-red-400"
                    >
                      Remove
                    </button>
                    <a
                      href={marketUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="h-10 min-w-[180px] whitespace-nowrap rounded-full bg-[#002cff] px-5 text-xs font-semibold text-white transition hover:bg-blue-700"
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
          initialPrice={selectedAnalytics.initialPrice}
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
  initialPrice,
  onClose,
}: {
  market?: MarketWithStrings;
  marketId: string;
  bookmarkedAt: string;
  initialPrice: number | null;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<{
    closesAt: string;
    price: number;
    title: string;
    category: string;
  } | null>(null);
  const bookmarkedDate = new Date(bookmarkedAt);
  const initial = initialPrice ?? null;

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
  const modalTitle = market?.title ?? details?.title ?? 'Market analytics';
  const modalCategory = market?.category ?? details?.category ?? '';

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
      </div>
    </div>
  );
}
