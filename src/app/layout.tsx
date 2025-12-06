// src/app/layout.tsx
import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Polybet',
  description: 'Polybet is running.',
  icons: {
    icon: [
      { url: '/polybet-favicon.png', type: 'image/png' },
      { url: '/polybet-favicon.ico', rel: 'icon' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
