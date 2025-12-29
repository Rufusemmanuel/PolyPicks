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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
