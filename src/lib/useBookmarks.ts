'use client';

import { useQuery } from '@tanstack/react-query';

type BookmarkRecord = {
  marketId: string;
  createdAt: string;
  initialPrice: number | null;
};

type BookmarksResponse = {
  bookmarks: BookmarkRecord[];
};

const fetchBookmarks = async (): Promise<BookmarksResponse> => {
  const res = await fetch('/api/bookmarks');
  if (!res.ok) throw new Error('Unable to load bookmarks');
  return (await res.json()) as BookmarksResponse;
};

export const useBookmarks = (enabled: boolean) =>
  useQuery({
    queryKey: ['bookmarks'],
    queryFn: fetchBookmarks,
    enabled,
    staleTime: 1000 * 60,
  });
