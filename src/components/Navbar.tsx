'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { useNotifications } from '@/lib/useNotifications';
import { SignUpModal } from '@/components/SignUpModal';
import { LoginModal } from '@/components/LoginModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/components/theme-context';

const navItems = [
  { label: 'Markets', href: '/' as const, kind: 'link' as const },
  { label: 'About', href: '#about', kind: 'anchor' as const },
];

export function Navbar() {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const queryClient = useQueryClient();
  const user = sessionQuery.data?.user ?? null;
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const notificationsQuery = useNotifications(Boolean(user));
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  type AnyRoute = Parameters<typeof router.replace>[0];
  const asRoute = (href: string) => href as unknown as AnyRoute;

  useEffect(() => {
    const auth = searchParams.get('auth');
    if (auth === 'login') {
      setIsLoginOpen(true);
    }
    if (auth === 'signup') {
      setIsSignUpOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isMenuOpen && !isNotificationsOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideMenu = menuRef.current && !menuRef.current.contains(target);
      const isOutsideNotifications =
        notificationsRef.current && !notificationsRef.current.contains(target);
      if (isOutsideMenu) setIsMenuOpen(false);
      if (isOutsideNotifications) setIsNotificationsOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isMenuOpen, isNotificationsOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) return;
    if ((notificationsQuery.data?.unreadCount ?? 0) > 0) {
      notificationsQuery.markAllRead().catch(() => null);
    }
  }, [isNotificationsOpen, notificationsQuery]);

  const initials = useMemo(() => {
    if (!user?.name) return '?';
    return user.name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }, [user?.name]);

  const clearAuthParam = () => {
    if (!searchParams.get('auth') || !pathname) return;
    const params = new URLSearchParams(searchParams);
    params.delete('auth');
    const href = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(asRoute(href), { scroll: false });
  };

  const handleLoginSuccess = (nextUser: { id: string; name: string }) => {
    queryClient.setQueryData(['session'], { user: nextUser });
    setIsLoginOpen(false);
    clearAuthParam();
  };

  const handleSignUpSuccess = (nextUser: { id: string; name: string }) => {
    queryClient.setQueryData(['session'], { user: nextUser });
    setIsSignUpOpen(false);
    clearAuthParam();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.setQueryData(['session'], { user: null });
    queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    setIsMenuOpen(false);
    router.push(asRoute('/'));
  };

  return (
    <header
      className={`border-b ${
        isDark ? 'border-slate-800 bg-[#0b1224] text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/polypicks.png" alt="PolyPicks logo" width={32} height={32} />
          <span className="text-xl font-semibold">PolyPicks</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          {navItems.map((item) =>
            item.kind === 'link' ? (
              <Link
                key={item.href}
                href={item.href}
                className={isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className={isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}
              >
                {item.label}
              </a>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!user && (
            <>
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  isDark
                    ? 'border-slate-700 text-slate-200 hover:border-slate-400'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setIsSignUpOpen(true)}
                className="rounded-full bg-[#002cff] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                Sign up
              </button>
            </>
          )}
          {user && (
            <>
              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsNotificationsOpen((open) => !open);
                    setIsMenuOpen(false);
                  }}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:border-slate-400'
                      : 'border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                  aria-label="Notifications"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 17a3 3 0 0 0 6 0"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {(notificationsQuery.data?.unreadCount ?? 0) > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {notificationsQuery.data?.unreadCount}
                    </span>
                  )}
                </button>
                {isNotificationsOpen && (
                  <div
                    className={`absolute right-0 z-50 mt-2 w-72 rounded-xl border p-2 text-sm shadow-xl ${
                      isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p
                      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Alerts
                    </p>
                    <div className="max-h-72 space-y-1 overflow-y-auto pb-1">
                      {notificationsQuery.data?.notifications?.length ? (
                        notificationsQuery.data.notifications.map((note) => (
                          <div
                            key={note.id}
                            className={`rounded-lg px-3 py-2 ${
                              note.readAt
                                ? isDark
                                  ? 'text-slate-300'
                                  : 'text-slate-600'
                                : isDark
                                  ? 'text-slate-100'
                                  : 'text-slate-900'
                            }`}
                          >
                            <p className="text-sm font-semibold">{note.title}</p>
                            {note.body && (
                              <p
                                className={`text-xs ${
                                  isDark ? 'text-slate-400' : 'text-slate-500'
                                }`}
                              >
                                {note.body}
                              </p>
                            )}
                            <p
                              className={`text-[11px] ${
                                isDark ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {new Date(note.createdAt).toLocaleString()}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p
                          className={`px-3 py-3 text-xs ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          No notifications yet.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen((open) => !open);
                    setIsNotificationsOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-full border px-2 py-1.5 text-xs font-semibold transition ${
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:border-slate-400'
                      : 'border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#002cff] text-[11px] text-white">
                    {initials}
                  </span>
                  <span className="hidden sm:inline">{user.name}</span>
                </button>
                {isMenuOpen && (
                  <div
                    className={`absolute right-0 z-50 mt-2 w-40 rounded-xl border p-2 text-sm shadow-xl ${
                      isDark ? 'border-slate-800 bg-[#0f182c]' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <Link
                      href="/profile"
                      className={`block rounded-lg px-3 py-2 ${
                        isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <Link
                      href="/trade"
                      className={`block rounded-lg px-3 py-2 ${
                        isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Trades
                    </Link>
                    <Link
                      href="/history"
                      className={`block rounded-lg px-3 py-2 ${
                        isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      History
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={`w-full rounded-lg px-3 py-2 text-left ${
                        isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <SignUpModal
        isOpen={isSignUpOpen}
        isDark={isDark}
        onClose={() => {
          setIsSignUpOpen(false);
          clearAuthParam();
        }}
        onSuccess={handleSignUpSuccess}
      />
      <LoginModal
        isOpen={isLoginOpen}
        isDark={isDark}
        onClose={() => {
          setIsLoginOpen(false);
          clearAuthParam();
        }}
        onSuccess={handleLoginSuccess}
      />
    </header>
  );
}
