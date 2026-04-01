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
        <meta
          name="talentapp:project_verification"
          content="6e8de8366c7d569599ce0999af97e66f458bb8e5a269105876e49a891da52d9145ff82157c4f76bd9270771b1186abc9570c82ab6f4c4e586d63e59a79523fcb"
        />
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
