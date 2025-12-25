import type { RawMarket } from './types';

const CRYPTO_TICKERS = ['BTC', 'ETH', 'SOL', 'XRP'] as const;
const CRYPTO_KEYWORDS = ['bitcoin', 'ethereum', 'solana', 'ripple'] as const;
const TECH_TICKERS = ['NFLX', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'] as const;
const TECH_KEYWORDS = [
  'netflix',
  'apple',
  'microsoft',
  'google',
  'alphabet',
  'amazon',
  'meta',
  'facebook',
  'nvidia',
  'tesla',
] as const;
const UP_OR_DOWN_REGEX = /up\s*or\s*down/i;
const SPREAD_CUE = /^(spread|handicap)\s*:/i;
const SPORTS_SLUG_TOKENS = [
  'nfl',
  'nba',
  'mlb',
  'nhl',
  'epl',
  'premier-league',
  'ucl',
  'champions-league',
  'fifa',
  'uefa',
  'afcon',
  'world-cup',
  'f1',
  'soccer',
  'sea',
] as const;
const hasWholeWordToken = (text: string, token: string): boolean => {
  const safeToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${safeToken}\\b`, 'i').test(text);
};

const hasSlugToken = (slug: string, token: string): boolean => {
  const safeToken = token.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|-)${safeToken}(-|$)`, 'i').test(slug);
};

const hasAnySlugToken = (slug: string, tokens: string[]): boolean =>
  tokens.some((token) => hasSlugToken(slug, token));

const hasCryptoAsset = (text?: string): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (CRYPTO_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;
  return CRYPTO_TICKERS.some((ticker) => hasWholeWordToken(text, ticker));
};

const hasTechAsset = (text?: string, isSlug = false): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (TECH_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;
  if (isSlug) {
    return TECH_TICKERS.some((ticker) => hasSlugToken(text, ticker));
  }
  return TECH_TICKERS.some((ticker) => hasWholeWordToken(text, ticker));
};

const collectTagLabels = (market: RawMarket): string[] => {
  const labels: string[] = [];
  for (const tag of market.tags ?? []) {
    if (tag.label) labels.push(tag.label);
  }
  for (const event of market.events ?? []) {
    for (const tag of event.tags ?? []) {
      if (tag.label) labels.push(tag.label);
    }
  }
  return labels;
};

const hasTechSignal = (market: RawMarket): boolean => {
  const title = market.question ?? market.title ?? market.slug ?? '';
  const slug = market.slug ?? '';
  const category = market.category ?? '';
  const tagLabels = collectTagLabels(market);
  const loweredTags = tagLabels.map((label) => label.toLowerCase());

  const hasExplicitTechTag = loweredTags.some((label) => label.includes('tech'));
  const hasFinanceTag = loweredTags.some(
    (label) =>
      label.includes('stocks') || label.includes('markets') || label.includes('finance'),
  );

  const hasAsset =
    hasTechAsset(title) ||
    hasTechAsset(slug, true) ||
    hasTechAsset(category) ||
    tagLabels.some((label) => hasTechAsset(label));

  if (hasExplicitTechTag) return true;
  if (hasFinanceTag && hasAsset) return true;
  if (hasAsset) return true;

  return false;
};

const hasSportsSignal = (market: RawMarket): boolean => {
  const title = market.question ?? market.title ?? market.slug ?? '';
  const slug = market.slug ?? '';
  const category = market.category ?? '';
  const tagLabels = collectTagLabels(market);

  if (tagLabels.some((label) => label.toLowerCase().includes('sports'))) return true;
  if (SPREAD_CUE.test(title) && hasAnySlugToken(slug, [...SPORTS_SLUG_TOKENS])) return true;

  const lowerCategory = category.toLowerCase();
  const matchCue =
    /\bwin\b/i.test(title) ||
    /\bvs\b/i.test(title) ||
    /(^|[\s(])v([\s).]|$)/i.test(title) ||
    /\bagainst\b/i.test(title) ||
    /\bmatch\b/i.test(title) ||
    /\bfinal\b/i.test(title) ||
    /\bscore\b/i.test(title) ||
    /\bpenalt(?:y|ies)\b/i.test(title) ||
    /\bgoal(?:s)?\b/i.test(title) ||
    /\btournament\b/i.test(title) ||
    /\bleague\b/i.test(title) ||
    /\bcup\b/i.test(title);
  const politicsCue =
    /\belection\b/i.test(title) ||
    /\bpresident\b/i.test(title) ||
    /\bvote\b/i.test(title) ||
    /\bprimary\b/i.test(title) ||
    /\bpoll\b/i.test(title) ||
    /\bcampaign\b/i.test(title);

  if (lowerCategory === 'games' && matchCue) return true;

  const startsWithTeamWin = /^Will\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+win\b/.test(
    title,
  );
  if (startsWithTeamWin && matchCue && !politicsCue) return true;

  const titleLeagueTokens = ['nfl', 'nba', 'mlb', 'nhl'];
  const hasTitleLeagueToken = titleLeagueTokens.some((token) => hasWholeWordToken(title, token));

  return hasAnySlugToken(slug, [...SPORTS_SLUG_TOKENS]) || (matchCue && hasTitleLeagueToken);
};

const hasPoliticsSignal = (market: RawMarket): boolean => {
  const title = market.question ?? market.title ?? market.slug ?? '';
  const slug = market.slug ?? '';
  const category = market.category ?? '';
  const tagLabels = collectTagLabels(market);

  const cue =
    /\belection\b/i.test(title) ||
    /\bpresident\b/i.test(title) ||
    /\bvote\b/i.test(title) ||
    /\bprimary\b/i.test(title) ||
    /\bpoll\b/i.test(title) ||
    /\bcampaign\b/i.test(title);

  if (cue) return true;

  const lowerSlug = slug.toLowerCase();
  const lowerCategory = category.toLowerCase();
  const lowerTags = tagLabels.map((label) => label.toLowerCase());

  return (
    lowerSlug.includes('election') ||
    lowerSlug.includes('vote') ||
    lowerCategory.includes('election') ||
    /\bpolitic\w*\b/i.test(category) ||
    lowerTags.some((label) => label.includes('election') || label.includes('politic'))
  );
};

const hasCryptoSignal = (market: RawMarket): boolean => {
  const title = market.question ?? market.title ?? market.slug ?? '';
  const slug = market.slug ?? '';
  const category = market.category ?? '';
  const tagLabels = collectTagLabels(market);

  if (tagLabels.some((label) => label.toLowerCase().includes('crypto'))) return true;
  if (hasCryptoAsset(category)) return true;
  if (tagLabels.some((label) => hasCryptoAsset(label))) return true;

  if (hasCryptoAsset(title) || hasCryptoAsset(slug)) return true;
  if (UP_OR_DOWN_REGEX.test(title) && hasCryptoAsset(title)) return true;

  return false;
};

// Very simple slug -> category guesser used only when Polymarket
// doesn't give us a category or tag.
const inferCategoryFromSlug = (slug?: string): string | undefined => {
  if (!slug) return undefined;
  if (hasCryptoAsset(slug)) return 'Crypto';
  const s = slug.toLowerCase();

  if (s.includes('election') || s.includes('president') || s.includes('vote')) {
    return 'Politics';
  }
  if (s.includes('gdp') || s.includes('inflation') || s.includes('rate') || s.includes('fed')) {
    return 'Economy';
  }
  if (
    hasAnySlugToken(s, [
      ...SPORTS_SLUG_TOKENS,
    ])
  ) {
    return 'Sports';
  }

  return undefined;
};

export const resolveCategory = (market: RawMarket): string => {
  if (hasCryptoSignal(market)) return 'Crypto';
  if (hasTechSignal(market)) return 'Tech';
  if (hasPoliticsSignal(market)) return 'Politics';
  if (hasSportsSignal(market)) return 'Sports';

  const direct = market.category?.trim();
  const tagLabels = collectTagLabels(market);
  const tag = tagLabels[0]?.trim();
  const slugGuess = direct || tag ? undefined : inferCategoryFromSlug(market.slug);

  return (direct || tag || slugGuess || 'Uncategorized').replace(/-/g, ' ');
};
