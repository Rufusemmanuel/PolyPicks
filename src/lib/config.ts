// src/lib/config.ts
import { MAX_ODDS, MAX_TIME_TO_CLOSE_MS, MIN_ODDS } from './config/polybetCriteria';

export const POLYMARKET_CONFIG = {
  // Core Gamma / RTDS endpoints
  gammaBaseUrl: process.env.POLYMARKET_GAMMA_URL ?? 'https://gamma-api.polymarket.com',
  rtdsUrl: process.env.POLYMARKET_RTDS_URL ?? 'wss://rtds.polymarket.com',

  // Frontend URLs
  marketPageBase: process.env.POLYMARKET_MARKET_BASE ?? 'https://polymarket.com/event/',
  twitterUrl: process.env.NEXT_PUBLIC_TWITTER_URL ?? 'https://x.com/Poly_Bets',

  // Polybet odds & time config
  priceFloor: MIN_ODDS,
  priceCeil: MAX_ODDS,
  maxMinutesToClose: MAX_TIME_TO_CLOSE_MS / 60000,

  // CLOB endpoint (for orderbook / top-of-book)
  clobBaseUrl: process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com',

  // Debug flag to disable filtering from the markets route if needed
  // Set POLYBET_DEBUG_RELAX=1 in .env to turn this on.
  debugRelax: process.env.POLYBET_DEBUG_RELAX === '1',
} as const;

export type PolybetConfig = typeof POLYMARKET_CONFIG;
