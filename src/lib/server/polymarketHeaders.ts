import 'server-only';

import { createHmac } from 'crypto';
import type { PolymarketSessionData } from './session';

type L2HeaderArgs = {
  method: string;
  requestPath: string;
  body?: string;
};

const decodeBase64Url = (secret: string) => {
  const normalized = secret.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
};

const buildPolyHmacSignature = (
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string,
) => {
  const message = `${timestamp}${method}${requestPath}${body ?? ''}`;
  return createHmac('sha256', decodeBase64Url(secret))
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

export const buildL2Headers = async (
  session: PolymarketSessionData,
  args: L2HeaderArgs,
) => {
  if (!session.l2 || !session.walletAddress) {
    throw new Error('Missing Polymarket session.');
  }
  // requestPath must match the exact upstream path + query string.
  const ts = Math.floor(Date.now() / 1000);
  const body = args.body ?? '';
  const signature = buildPolyHmacSignature(
    session.l2.secret,
    ts,
    args.method,
    args.requestPath,
    body,
  );
  return {
    POLY_ADDRESS: session.walletAddress,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: `${ts}`,
    POLY_API_KEY: session.l2.apiKey,
    POLY_PASSPHRASE: session.l2.passphrase,
  };
};
