'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type BookmarkRecord = {
  marketId: string;
  createdAt: string;
  initialPrice: number | null;
  title: string | null;
  category: string | null;
  marketUrl: string | null;
};

type BookmarksResponse = {
  bookmarks: BookmarkRecord[];
};

const fetchBookmarks = async (): Promise<BookmarksResponse> => {
  const res = await fetch('/api/bookmarks');
  if (!res.ok) throw new Error('Unable to load bookmarks');
  return (await res.json()) as BookmarksResponse;
};

export const useBookmarks = (enabled: boolean) => {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['bookmarks'],
    queryFn: fetchBookmarks,
    enabled,
    staleTime: 1000 * 60,
  });

  const removeMutation = useMutation({
    mutationFn: async (marketId: string) => {
      const res = await fetch(`/api/bookmarks/${marketId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Unable to remove bookmark');
      return res.json();
    },
    onMutate: async (marketId) => {
      await client.cancelQueries({ queryKey: ['bookmarks'] });
      const previous = client.getQueryData<BookmarksResponse>(['bookmarks']);
      const prevBookmarks = previous?.bookmarks ?? [];
      const nextBookmarks = prevBookmarks.filter((b) => b.marketId !== marketId);
      client.setQueryData(['bookmarks'], { bookmarks: nextBookmarks });
      return { previous };
    },
    onError: (_error, _marketId, context) => {
      if (context?.previous) {
        client.setQueryData(['bookmarks'], context.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  return {
    ...query,
    removeBookmark: (marketId: string) => removeMutation.mutateAsync(marketId),
    isRemoving: removeMutation.isPending,
  };
};
