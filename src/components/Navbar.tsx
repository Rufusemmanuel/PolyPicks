'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/useSession';
import { SignUpModal } from '@/components/SignUpModal';
import { LoginModal } from '@/components/LoginModal';

const navItems = [
  { label: 'Markets', href: '/' as const, kind: 'link' as const },
  { label: 'About', href: '#about', kind: 'anchor' as const },
];

export function Navbar() {
  const sessionQuery = useSession();
  const queryClient = useQueryClient();
  const user = sessionQuery.data?.user ?? null;
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
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
    if (!isMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isMenuOpen]);

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
    <header className="border-b border-slate-800 bg-[#0b1224] text-slate-100">
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
                className="text-slate-300 hover:text-white"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="text-slate-300 hover:text-white"
              >
                {item.label}
              </a>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          {!user && (
            <>
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400"
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
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#002cff] text-[11px] text-white">
                  {initials}
                </span>
                <span className="hidden sm:inline">{user.name}</span>
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl border border-slate-800 bg-[#0f182c] p-2 text-sm shadow-xl">
                  <Link
                    href="/profile"
                    className="block rounded-lg px-3 py-2 text-slate-200 hover:bg-slate-800"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/trade"
                    className="block rounded-lg px-3 py-2 text-slate-200 hover:bg-slate-800"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Trades
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-lg px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <SignUpModal
        isOpen={isSignUpOpen}
        isDark
        onClose={() => {
          setIsSignUpOpen(false);
          clearAuthParam();
        }}
        onSuccess={handleSignUpSuccess}
      />
      <LoginModal
        isOpen={isLoginOpen}
        isDark
        onClose={() => {
          setIsLoginOpen(false);
          clearAuthParam();
        }}
        onSuccess={handleLoginSuccess}
      />
    </header>
  );
}
