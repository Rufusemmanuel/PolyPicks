'use client';

import { useTheme } from '@/components/theme-context';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      className="group inline-flex items-center gap-2"
    >
      <span
        className={`text-[11px] font-semibold ${
          isDark ? 'text-slate-300' : 'text-slate-600'
        }`}
      >
        {isDark ? 'Dark' : 'Light'}
      </span>
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
          isDark
            ? 'border-slate-600 bg-[#0f1a32]'
            : 'border-slate-300 bg-white'
        } group-focus-visible:outline-none group-focus-visible:ring-2 group-focus-visible:ring-[#002cff] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-transparent`}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white shadow transition ${
            isDark
              ? 'translate-x-5 bg-[#002cff]'
              : 'translate-x-1 bg-slate-400'
          }`}
        >
          {isDark ? '☾' : '☀'}
        </span>
      </span>
    </button>
  );
}
