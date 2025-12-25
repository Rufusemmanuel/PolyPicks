// src/lib/polymarket/types.ts

export type OutcomeSide = 'Yes' | 'No' | string;

export type MarketPrice = {
  leadingOutcome: OutcomeSide;
  price: number; // 0–1 (e.g. 0.81 for 81c)
};

export type MarketSummary = {
  id: string;
  title: string;
  slug: string;
  category: string;
  endDate: Date;
  gameStartTime?: string | null;
  lowerBoundDate?: string | null;
  upperBoundDate?: string | null;
  yesTokenId?: string | null;
  noTokenId?: string | null;
  closedTime?: Date;
  price: MarketPrice;
  volume: number;
  url: string;
  conditionId?: string;
  bestBid?: number | null;
  bestAsk?: number | null;
  spreadBps?: number | null;
};

/**
 * Raw shape returned by Polymarket Gamma API.
 * Only fields we actually use are included.
 */
export type RawMarket = {
  id: string;
  question: string;
  title?: string;
  description?: string;
  rules?: string;
  resolutionRules?: string;
  resolutionCriteria?: string;
  marketRules?: string;
  slug: string;
  category?: string;

  // High-level tags on the market itself
  tags?: {
    label: string;
    slug: string;
  }[];

  // Event group(s) this market belongs to
  events?: {
    slug?: string; // 👈 this is what fixes your TypeScript error
    category?: string;
    title?: string;
    description?: string;
    tags?: {
      label: string;
      slug: string;
    }[];
  }[];

  endDate: string; // ISO string
  gameStartTime?: string | null;
  lowerBoundDate?: string | null;
  upperBoundDate?: string | null;
  closedTime?: string | null;

  // Outcome prices as JSON strings
  outcomes?: string;       // e.g. '["Yes","No"]'
  outcomePrices?: string;  // e.g. '["0.8","0.2"]'

  // Fallback if we don’t have outcomePrices
  bestBid?: string | number;

  volume?: string | number;
  volumeNum?: string | number;

  conditionId?: string;
  yesTokenId?: string | null;
  noTokenId?: string | null;
};

/**
 * Raw event shape from Polymarket Gamma API (only fields we need).
 */
export interface RawEvent {
  id: string;
  slug: string;
  title?: string;
  question?: string;
  description?: string;
  endDate?: string;
  tags?: {
    label: string;
    slug: string;
  }[];
  markets: RawMarket[];
}

export type HistoryEntryDto = {
  id: string;
  marketId: string;
  title: string;
  category?: string | null;
  trackedOutcome: string;
  entryPrice: number;
  resolvedOutcome: string;
  appearedAt: string;
  resolvedAt: string;
  closedAt?: string | null;
  marketUrl: string;
};

export type MarketDetailsResponse = {
  id: string;
  title: string;
  slug: string;
  categoryResolved: string;
  directCategory?: string | null;
  tags?: string[];
  volume: number;
  closesAt: string;
  url: string;
  leading: { outcome: string; price: number; prob: number };
  about: { description?: string | null; resolution?: string | null; sourceUrl?: string | null };
  highConfidence: { min: number; max: number; currentProb: number; whyText: string };
  sports?: SportsEnrichment;
  sportsMeta?: {
    enabled: boolean;
    reason?:
      | 'missing_api_key'
      | 'fixture_not_found'
      | 'not_soccer'
      | 'matchup_parse_failed'
      | 'unsupported_competition'
      | 'team_not_found'
      | 'rate_limited'
      | 'upstream_error';
  };
};

export type SportsMatch = {
  utcDate: string;
  competition?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type SportsEnrichment = {
  matchup: {
    teamA: string;
    teamB: string;
    teamAId?: number;
    teamBId?: number;
    crestA?: string | null;
    crestB?: string | null;
  };
  recentA: SportsMatch[];
  recentB: SportsMatch[];
  headToHead: SportsMatch[];
};
