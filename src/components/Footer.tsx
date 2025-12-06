import { POLYMARKET_CONFIG } from '@/lib/config';

export function Footer() {
  return (
    <footer className="bg-[#002cff] text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-sm">
        <span className="font-semibold">Polybet</span>
        <a
          href={POLYMARKET_CONFIG.twitterUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 hover:text-slate-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path d="M3 3h4.5l4.1 6.2L15.6 3H21l-7.3 8.4L21 21h-4.5l-4.4-6.5L7.8 21H3l7.3-8.5z" />
          </svg>
          <span>Follow on X</span>
        </a>
      </div>
    </footer>
  );
}
