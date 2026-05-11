import 'server-only';

import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';

export type PolymarketSessionData = {
  l2?: {
    apiKey: string;
    secret: string;
    passphrase: string;
  };
  walletAddress?: string;
  tradingWalletAddress?: string;
  signatureType?: number;
  createdAt?: number;
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const getSessionPassword = () => {
  const value = process.env.POLYPICKS_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('Missing or weak POLYPICKS_SESSION_SECRET.');
  }
  return value;
};

const buildSessionOptions = (): SessionOptions => ({
  cookieName: 'polypicks_session',
  password: getSessionPassword(),
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});

export const getSession = async () =>
  getIronSession<PolymarketSessionData>(cookies(), buildSessionOptions());

export const isSessionExpired = (session: PolymarketSessionData) => {
  if (!session.createdAt) return true;
  return Date.now() - session.createdAt > SESSION_TTL_MS;
};

export const clearSession = (session: PolymarketSessionData & { destroy?: () => void }) => {
  session.destroy?.();
};
