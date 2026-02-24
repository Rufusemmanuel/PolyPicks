import {
  HIGH_VOLUME_THRESHOLD,
  filterHighVolumeMarkets,
  getVolumeUsd,
  resolveHomeViewMode,
  selectMarketsForView,
} from '../src/lib/highVolumeMarkets';
import { deriveHomeViewMarkets } from '../src/lib/homeViewCategory';
import { navItems } from '../src/lib/ui/navItems';

type MarketLike = { id: string; title: string; volume: number | string };

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseFilteredMarkets: MarketLike[] = [
  { id: 'm1', title: 'A', volume: 50000 },
  { id: 'm2', title: 'B', volume: 50001 },
  { id: 'm3', title: 'C', volume: '250000' },
  { id: 'm4', title: 'D', volume: '49,999' },
];

const rawUniverseHasExtra: MarketLike[] = [
  ...baseFilteredMarkets,
  { id: 'outside-filter', title: 'E', volume: 9999999 },
];

const highVolume = filterHighVolumeMarkets(baseFilteredMarkets);
assert(highVolume.length === 2, 'Expected only markets strictly above 50000 volume.');
assert(highVolume.some((m) => m.id === 'm2'), 'Expected m2 to pass high-volume threshold.');
assert(highVolume.some((m) => m.id === 'm3'), 'Expected m3 to pass high-volume threshold.');
assert(!highVolume.some((m) => m.id === 'm1'), 'Expected m1 to fail at exact threshold.');
assert(getVolumeUsd({ id: 'x', title: 'X', volume: '120,500' }) === 120500, 'Volume parser should support comma-formatted strings.');
assert(getVolumeUsd({ id: 'y', title: 'Y', volume: undefined }) === 0, 'Missing volume should parse to zero.');
assert(
  getVolumeUsd({ id: 'z', title: 'Z', volumeUSD: '50,250' }) === 50250,
  'volumeUSD fallback should parse correctly.',
);

const selectedFromFilteredOnly = selectMarketsForView(baseFilteredMarkets, 'high-volume');
const rawOnlyHighVolumeIds = new Set(
  filterHighVolumeMarkets(rawUniverseHasExtra).map((m) => m.id),
);
assert(
  rawOnlyHighVolumeIds.has('outside-filter'),
  'Sanity check failed: expected extra market in raw-universe high-volume set.',
);
assert(
  !selectedFromFilteredOnly.some((m) => m.id === 'outside-filter'),
  'High volume view must be derived from existing filtered list, not raw markets.',
);
const selectedAsMarkets = selectMarketsForView(baseFilteredMarkets, 'markets');
assert(
  selectedAsMarkets === baseFilteredMarkets,
  'Markets view should preserve the same filtered array reference.',
);
assert(
  selectMarketsForView(baseFilteredMarkets, 'high-volume').length <= baseFilteredMarkets.length,
  'High volume view must be a subset of filtered markets.',
);
assert(resolveHomeViewMode('high-volume') === 'high-volume', 'Expected high-volume mode from query value.');
assert(resolveHomeViewMode('anything-else') === 'markets', 'Expected fallback to markets mode.');
const renderedInMarketsView = selectMarketsForView(baseFilteredMarkets, 'markets');
const renderedInHighVolumeView = selectMarketsForView(baseFilteredMarkets, 'high-volume');
assert(
  renderedInMarketsView.length === baseFilteredMarkets.length,
  'Markets view count must equal rendered markets length.',
);
assert(
  renderedInHighVolumeView.length === 2,
  'High Volume view count must equal rendered high-volume markets length.',
);

type Category = 'Politics' | 'Sports' | 'Crypto';
type CategorizedMarket = {
  id: string;
  title: string;
  category: Category;
  volume: number;
};
const CATEGORIES: readonly Category[] = ['Politics', 'Sports', 'Crypto'];
const mapCategory = (market: CategorizedMarket) => market.category;
const categorizedDisplayedMarkets: CategorizedMarket[] = [
  { id: 'a', title: 'P1', category: 'Politics', volume: 70000 },
  { id: 'b', title: 'P2', category: 'Politics', volume: 40000 },
  { id: 'c', title: 'S1', category: 'Sports', volume: 80000 },
  { id: 'd', title: 'S2', category: 'Sports', volume: 150000 },
  { id: 'e', title: 'C1', category: 'Crypto', volume: 10000 },
];
const highVolumeViewAll = deriveHomeViewMarkets({
  displayedMarkets: categorizedDisplayedMarkets,
  viewMode: 'high-volume',
  activeCategory: 'All',
  categories: CATEGORIES,
  mapCategory,
});
assert(
  highVolumeViewAll.highVolumeBase.length === 3,
  'High Volume base list should only include markets above threshold from displayed markets.',
);
assert(
  highVolumeViewAll.categorySourceMarkets.length === highVolumeViewAll.highVolumeBase.length,
  'High Volume category source must be the high-volume base set.',
);
assert(
  highVolumeViewAll.categoryCounts.Politics === 1 &&
    highVolumeViewAll.categoryCounts.Sports === 2 &&
    highVolumeViewAll.categoryCounts.Crypto === 0,
  'High Volume category counts must come from the high-volume set only.',
);
assert(
  highVolumeViewAll.renderedMarkets.length === highVolumeViewAll.highVolumeBase.length,
  'High Volume All count must equal total high-volume markets.',
);
const highVolumeSports = deriveHomeViewMarkets({
  displayedMarkets: categorizedDisplayedMarkets,
  viewMode: 'high-volume',
  activeCategory: 'Sports',
  categories: CATEGORIES,
  mapCategory,
});
assert(
  highVolumeSports.renderedMarkets.length === 2,
  'Switching category in High Volume view must filter within high-volume markets.',
);
assert(
  highVolumeSports.renderedMarkets.every((market) => market.category === 'Sports'),
  'High Volume category filter returned non-selected category market.',
);
const marketsViewSports = deriveHomeViewMarkets({
  displayedMarkets: categorizedDisplayedMarkets,
  viewMode: 'markets',
  activeCategory: 'Sports',
  categories: CATEGORIES,
  mapCategory,
});
assert(
  marketsViewSports.categorySourceMarkets.length === categorizedDisplayedMarkets.length,
  'Markets view category source must remain full displayed markets list.',
);
assert(
  marketsViewSports.renderedMarkets.length === 2,
  'Markets view filtering should remain unchanged from pre-high-volume behavior.',
);

const navLabels = navItems.map((item) => item.label);
assert(
  navLabels.join('|') === 'Markets|About|High Volume',
  'Navbar should render High Volume after About.',
);

console.log('high-volume-harness: all checks passed');
