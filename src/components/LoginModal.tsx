import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';

type Props = {
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; name: string }) => void;
};

type Errors = {
  name?: string;
  password?: string;
  form?: string;
};

export function LoginModal({ isOpen, isDark, onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setPassword('');
      setErrors({});
      setLoading(false);
      setShowPassword(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const validate = () => {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Name is required.';
    if (!password) next.password = 'Password is required.';
    return next;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next = validate();
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const body = (await res.json()) as { user?: { id: string; name: string }; error?: string };
      if (!res.ok || !body.user) {
        setErrors({ form: body.error ?? 'Unable to log in.' });
        return;
      }
      onSuccess(body.user);
    } catch (error) {
      console.error('[login] error', error);
      setErrors({ form: 'Unable to log in.' });
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close login"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        className={`relative max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6 ${
          isDark
            ? 'border-white/10 bg-[#0b1224] text-slate-100 shadow-black/30'
            : 'border-slate-200 bg-white text-slate-900 shadow-slate-900/10'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <Image src="/polypicks.png" alt="PolyPicks logo" width={34} height={34} />
              <div>
                <p className="text-sm font-semibold">PolyPicks</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                  Powered by Polymarket
                </p>
              </div>
            </div>
            <h2 id="login-modal-title" className="text-3xl font-semibold leading-tight">
              Welcome back
            </h2>
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              Log in to manage your watchlist, positions, and live trade setup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isDark
                ? 'border-slate-600 text-slate-200 hover:border-slate-400'
                : 'border-slate-300 text-slate-700 hover:border-slate-500'
            }`}
          >
            Close
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-semibold">Username</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="username"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isDark
                  ? 'border-slate-700 bg-[#101a32] text-slate-100 focus:border-blue-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500'
              }`}
              placeholder="Your username"
            />
            {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className={`w-full rounded-lg border px-3 py-2 pr-11 text-sm outline-none transition ${
                  isDark
                    ? 'border-slate-700 bg-[#101a32] text-slate-100 focus:border-blue-500'
                    : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500'
                }`}
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition ${
                  isDark
                    ? 'text-slate-400 hover:bg-white/10 hover:text-slate-100'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
          </div>

          {errors.form && <p className="text-xs text-red-400">{errors.form}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
              loading ? 'bg-blue-300' : 'bg-[#002cff] hover:bg-blue-700'
            }`}
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.9 17.9 0 0 1-3.2 4.2" />
      <path d="M6.6 6.6C3.8 8.5 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8" />
    </svg>
  );
}
