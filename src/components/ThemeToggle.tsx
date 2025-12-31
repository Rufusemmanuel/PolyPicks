'use client';

import { useTheme } from '@/components/theme-context';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition ${
        isDark
          ? 'border-slate-600 bg-[#0f1a32]/80 text-slate-100 shadow-slate-900/50 hover:border-slate-400 hover:text-white'
          : 'border-slate-300 bg-white text-slate-800 shadow-slate-200 hover:border-slate-500 hover:text-slate-900'
      }`}
      aria-label="Toggle light and dark mode"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#002cff] text-[10px] text-white">
        {isDark ? '?' : '?'}
      </span>
      <span>{isDark ? 'Dark' : 'Light'} mode</span>
    </button>
  );
}
