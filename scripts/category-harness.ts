import assert from 'node:assert/strict';
import { resolveCategory } from '../src/lib/polymarket/category';
import type { RawMarket } from '../src/lib/polymarket/types';

const baseMarket: RawMarket = {
  id: 'test-market',
  question: 'Placeholder',
  slug: 'placeholder',
  endDate: new Date().toISOString(),
};

const makeMarket = (overrides: Partial<RawMarket>): RawMarket => ({
  ...baseMarket,
  ...overrides,
});

const cases = [
  {
    name: 'Bitcoin Up or Down is crypto',
    market: makeMarket({
      question: 'Bitcoin Up or Down',
      slug: 'bitcoin-up-or-down',
      category: 'World',
    }),
    expected: 'Crypto',
  },
  {
    name: 'XRP market is crypto',
    market: makeMarket({
      question: 'Will XRP reach $1?',
      slug: 'xrp-price-target',
      category: 'World',
    }),
    expected: 'Crypto',
  },
  {
    name: 'Non-crypto up or down stays world',
    market: makeMarket({
      question: 'Oil Up or Down',
      slug: 'oil-up-or-down',
      category: 'World',
    }),
    expected: 'World',
  },
  {
    name: 'Mali win market is sports',
    market: makeMarket({
      question: 'Will Mali win on penalties?',
      slug: 'will-mali-win-on-penalties',
      category: 'Games',
    }),
    expected: 'Sports',
  },
  {
    name: 'NFLX close market is tech',
    market: makeMarket({
      question: 'NFLX close above $500?',
      slug: 'nflx-close-above-500',
      category: 'Games',
    }),
    expected: 'Tech',
  },
  {
    name: 'NFL week market is sports',
    market: makeMarket({
      question: 'Will the NFL week 1 games start on time?',
      slug: 'nfl-week-1',
      category: 'Sports',
    }),
    expected: 'Sports',
  },
  {
    name: 'Election win market is not sports',
    market: makeMarket({
      question: 'Will Trump win the election?',
      slug: 'will-trump-win-the-election',
      category: 'World',
    }),
    expected: 'Politics',
  },
  {
    name: 'Serie A spread market is sports',
    market: makeMarket({
      question: 'Spread: SS Lazio (-1.5)',
      slug: 'sea-udi-laz-2025-12-27-spread-away-1pt5',
      category: 'World',
    }),
    expected: 'Sports',
  },
  {
    name: 'Serie A spread market without category is sports',
    market: makeMarket({
      question: 'Spread: ACF Fiorentina (-1.5)',
      slug: 'sea-par-fio-2025-12-27-spread-away-1pt5',
    }),
    expected: 'Sports',
  },
  {
    name: 'EFL Championship draw market is sports',
    market: makeMarket({
      question: 'Will Coventry City FC vs. Swansea City AFC end in a draw?',
      slug: 'elc-cov-swa-2025-12-26-draw',
      category: 'World',
    }),
    expected: 'Sports',
  },
  {
    name: 'Serie A Lazio spread market is sports',
    market: makeMarket({
      question: 'Spread: SS Lazio (-1.5)',
      slug: 'sea-udi-laz-2025-12-27-spread-away-1pt5',
      category: 'World',
    }),
    expected: 'Sports',
  },
  {
    name: 'Serie A Fiorentina spread market is sports',
    market: makeMarket({
      question: 'Spread: ACF Fiorentina (-1.5)',
      slug: 'sea-par-fio-2025-12-27-spread-away-1pt5',
      category: 'World',
    }),
    expected: 'Sports',
  },
];

for (const testCase of cases) {
  const actual = resolveCategory(testCase.market);
  assert.equal(actual, testCase.expected, testCase.name);
}

console.log(`Category harness passed (${cases.length} cases).`);
