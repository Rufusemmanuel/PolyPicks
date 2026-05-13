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
import {
  buttonPrimary,
  buttonSecondaryDark,
  buttonSecondaryLight,
  iconButtonDark,
  iconButtonLight,
} from '@/lib/ui/classes';
import { navItems } from '@/lib/ui/navItems';

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

  const navLinkClass = (href: string) => {
    const view = searchParams.get('view');
    const isHighVolume = view === 'high-volume';
    const isActive =
      (href === '/' && pathname === '/' && !isHighVolume) ||
      (href === '/?view=high-volume' && pathname === '/' && isHighVolume);
    return `rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
      isActive
        ? isDark
          ? 'bg-white/10 text-white'
          : 'bg-slate-900 text-white'
        : isDark
          ? 'text-slate-300 hover:bg-white/5 hover:text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;
  };

  const iconButtonClass = isDark ? iconButtonDark : iconButtonLight;
  const buttonSecondary = isDark ? buttonSecondaryDark : buttonSecondaryLight;

  return (
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur ${
        isDark
          ? 'border-slate-800/80 bg-[#0b1224]/80 text-slate-100'
          : 'border-slate-200/80 bg-white/80 text-slate-900'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/polypicks.png" alt="PolyPicks logo" width={32} height={32} />
          <span className="text-2xl font-semibold tracking-tight">PolyPicks</span>
        </Link>
        <nav className="hidden items-center gap-2 text-sm md:flex">
          {navItems.map((item) =>
            item.kind === 'link' ? (
              <Link
                key={item.href}
                href={item.href}
                className={navLinkClass(item.href)}
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className={navLinkClass(item.href)}
              >
                {item.label}
              </a>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle variant="icon" className={iconButtonClass} />
          {!user && (
            <>
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className={`${buttonSecondary} h-9 px-4 text-xs font-semibold`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setIsSignUpOpen(true)}
                className={`${buttonPrimary} h-9 px-4 text-xs font-semibold`}
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
                  className={iconButtonClass}
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
                  className={`${buttonSecondary} h-9 gap-2 px-3 text-sm font-semibold`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#002cff] text-[11px] text-white">
                    {initials}
                  </span>
                  <span className="hidden max-w-[140px] truncate sm:inline">
                    {user.name}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="h-4 w-4 text-slate-400"
                    fill="currentColor"
                  >
                    <path d="M5.5 7.5 10 12l4.5-4.5-1.4-1.4L10 9.2 6.9 6.1 5.5 7.5z" />
                  </svg>
                </button>
                {isMenuOpen && (
                  <div
                    className={`absolute right-0 z-50 mt-3 w-44 rounded-xl border p-2 text-sm shadow-lg backdrop-blur ${
                      isDark
                        ? 'border-white/10 bg-slate-950/95 text-slate-100'
                        : 'border-slate-200 bg-white/95 text-slate-900'
                    }`}
                  >
                    <Link
                      href="/profile?tab=overview"
                      className={`block rounded-lg px-3 py-2 transition ${
                        isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <Link
                      href="/profile?tab=bookmarks"
                      className={`block rounded-lg px-3 py-2 transition ${
                        isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Bookmarks
                    </Link>
                    <Link
                      href="/profile?tab=history"
                      className={`block rounded-lg px-3 py-2 transition ${
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
                      onClick={() => {
                        setIsMenuOpen(false);
                        router.push(asRoute('/profile?tab=wallet'));
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left transition ${
                        isDark
                          ? 'text-slate-200 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Wallet
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={`w-full rounded-lg px-3 py-2 text-left transition ${
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
      <div className="md:hidden">
        <nav
          className={`mx-auto max-w-6xl overflow-x-auto whitespace-nowrap px-4 pb-3 text-sm ${
            isDark ? 'text-slate-100' : 'text-slate-900'
          }`}
          aria-label="Primary"
        >
          <div className="flex min-w-max items-center gap-2">
            {navItems.map((item) =>
              item.kind === 'link' ? (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className={`${navLinkClass(item.href)} inline-flex min-h-10 items-center justify-center`}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className={`${navLinkClass(item.href)} inline-flex min-h-10 items-center justify-center`}
                >
                  {item.label}
                </a>
              ),
            )}
          </div>
        </nav>
      </div>
      <SignUpModal
        isOpen={isSignUpOpen}
        isDark={isDark}
        onClose={() => {
          setIsSignUpOpen(false);
          clearAuthParam();
        }}
        onSuccess={handleSignUpSuccess}
        onLoginClick={() => {
          setIsSignUpOpen(false);
          setIsLoginOpen(true);
          clearAuthParam();
        }}
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
