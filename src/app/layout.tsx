// src/app/layout.tsx
import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'PolyPicks',
  description: 'PolyPicks is running.',
  icons: {
    icon: [{ url: '/polypicks-favicon.png', type: 'image/png' }],
  },
};

const themeInitScript = `
(function () {
  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.dataset.theme = theme;
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  }
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    applyTheme(theme);
  } catch (e) {
    applyTheme('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
