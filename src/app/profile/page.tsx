'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { useBookmarks } from '@/lib/useBookmarks';
import { useTheme } from '@/components/theme-context';

export default function ProfilePage() {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const user = sessionQuery.data?.user ?? null;
  const bookmarksQuery = useBookmarks(Boolean(user));
  const router = useRouter();
  const queryClient = useQueryClient();
  type AnyRoute = Parameters<typeof router.push>[0];
  const asRoute = (href: string) => href as unknown as AnyRoute;

  useEffect(() => {
    if (sessionQuery.isLoading) return;
    if (!user) {
      router.push(asRoute('/?auth=login'));
    }
  }, [sessionQuery.isLoading, user, router]);

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

  return (
    <main
      className={
        isDark
          ? 'min-h-screen bg-[#0b1224] text-slate-100'
          : 'min-h-screen bg-slate-50 text-slate-900'
      }
    >
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Profile</p>
          <h1 className="text-3xl font-semibold">{user.name}</h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Manage your PolyPicks account.
          </p>
        </div>
        <div
          className={`rounded-2xl border p-6 space-y-4 ${
            isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
          }`}
        >
          <div>
            <p
              className={`text-xs uppercase tracking-wide ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Username
            </p>
            <p className="text-lg font-semibold">{user.name}</p>
          </div>
          <div>
            <p
              className={`text-xs uppercase tracking-wide ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Bookmarked markets
            </p>
            <p className="text-lg font-semibold">
              {bookmarksQuery.data?.bookmarks.length ?? 0}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              isDark
                ? 'border-slate-600 text-slate-200 hover:border-slate-400'
                : 'border-slate-300 text-slate-700 hover:border-slate-400'
            }`}
          >
            Log out
          </button>
        </div>
      </div>
    </main>
  );
}
