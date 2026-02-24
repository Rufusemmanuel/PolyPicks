import {
  HIGH_VOLUME_THRESHOLD,
  filterHighVolumeMarkets,
  getVolumeUsd,
  resolveHomeViewMode,
  selectMarketsForView,
} from '../src/lib/highVolumeMarkets';
import { navItems } from '../src/lib/ui/navItems';

type MarketLike = { id: string; title: string; volume: number | string };

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseFilteredMarkets: MarketLike[] = [
  { id: 'm1', title: 'A', volume: 100000 },
  { id: 'm2', title: 'B', volume: 100001 },
  { id: 'm3', title: 'C', volume: '250000' },
  { id: 'm4', title: 'D', volume: '99,999' },
];

const rawUniverseHasExtra: MarketLike[] = [
  ...baseFilteredMarkets,
  { id: 'outside-filter', title: 'E', volume: 9999999 },
];

const highVolume = filterHighVolumeMarkets(baseFilteredMarkets);
assert(highVolume.length === 2, 'Expected only markets strictly above 100000 volume.');
assert(highVolume.some((m) => m.id === 'm2'), 'Expected m2 to pass high-volume threshold.');
assert(highVolume.some((m) => m.id === 'm3'), 'Expected m3 to pass high-volume threshold.');
assert(!highVolume.some((m) => m.id === 'm1'), 'Expected m1 to fail at exact threshold.');
assert(getVolumeUsd({ id: 'x', title: 'X', volume: '120,500' }) === 120500, 'Volume parser should support comma-formatted strings.');

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

const navLabels = navItems.map((item) => item.label);
assert(
  navLabels.join('|') === 'Markets|About|High Volume',
  'Navbar should render High Volume after About.',
);

console.log('high-volume-harness: all checks passed');
