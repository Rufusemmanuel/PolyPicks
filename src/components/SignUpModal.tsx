import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
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
  confirm?: string;
  form?: string;
};

export function SignUpModal({ isOpen, isDark, onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setPassword('');
      setConfirm('');
      setErrors({});
      setLoading(false);
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
    if (name.trim().length < 2) next.name = 'Name must be at least 2 characters.';
    if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    if (!confirm) next.confirm = 'Please confirm your password.';
    if (confirm && confirm !== password) next.confirm = 'Passwords do not match.';
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
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });

      if (res.status === 409) {
        setErrors({ name: 'That name is already taken.' });
        return;
      }

      const body = (await res.json()) as { user?: { id: string; name: string }; error?: string };
      if (!res.ok || !body.user) {
        setErrors({ form: body.error ?? 'Unable to create account.' });
        return;
      }

      onSuccess(body.user);
    } catch (error) {
      console.error('[signup] error', error);
      setErrors({ form: 'Unable to create account.' });
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close signup"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-modal-title"
        className={`relative max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6 ${
          isDark
            ? 'border-slate-800 bg-[#0b1224] text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              PolyPicks
            </p>
            <h2 id="signup-modal-title" className="text-2xl font-semibold">
              Create your account
            </h2>
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              Sign up to save markets you want to track.
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
              placeholder="Choose a username"
            />
            {errors.name && (
              <p className="text-xs text-red-400">{errors.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isDark
                  ? 'border-slate-700 bg-[#101a32] text-slate-100 focus:border-blue-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500'
              }`}
              placeholder="At least 8 characters"
            />
            {errors.password && (
              <p className="text-xs text-red-400">{errors.password}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isDark
                  ? 'border-slate-700 bg-[#101a32] text-slate-100 focus:border-blue-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500'
              }`}
            />
            {errors.confirm && (
              <p className="text-xs text-red-400">{errors.confirm}</p>
            )}
          </div>

          {errors.form && (
            <p className="text-xs text-red-400">{errors.form}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
              loading ? 'bg-blue-300' : 'bg-[#002cff] hover:bg-blue-700'
            }`}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
