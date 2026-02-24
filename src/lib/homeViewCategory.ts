import { filterHighVolumeMarkets, type HomeViewMode, type MarketWithVolume } from './highVolumeMarkets';

type AllCategory = 'All';

export type HomeViewCategorySelection<TCategory extends string> = AllCategory | TCategory;

export function buildCategoryCounts<TMarket, TCategory extends string>(
  markets: TMarket[],
  categories: readonly TCategory[],
  mapCategory: (market: TMarket) => TCategory,
): Record<TCategory, number> {
  const counts = Object.fromEntries(categories.map((category) => [category, 0])) as Record<
    TCategory,
    number
  >;

  markets.forEach((market) => {
    const category = mapCategory(market);
    counts[category] += 1;
  });

  return counts;
}

export function deriveHomeViewMarkets<TMarket extends MarketWithVolume, TCategory extends string>({
  displayedMarkets,
  viewMode,
  activeCategory,
  categories,
  mapCategory,
}: {
  displayedMarkets: TMarket[];
  viewMode: HomeViewMode;
  activeCategory: HomeViewCategorySelection<TCategory>;
  categories: readonly TCategory[];
  mapCategory: (market: TMarket) => TCategory;
}) {
  const highVolumeBase = filterHighVolumeMarkets(displayedMarkets);
  const categorySourceMarkets =
    viewMode === 'high-volume' ? highVolumeBase : displayedMarkets;
  const categoryCounts = buildCategoryCounts(categorySourceMarkets, categories, mapCategory);
  const renderedMarkets =
    activeCategory === 'All'
      ? categorySourceMarkets
      : categorySourceMarkets.filter((market) => mapCategory(market) === activeCategory);

  return {
    highVolumeBase,
    categorySourceMarkets,
    categoryCounts,
    renderedMarkets,
  };
}
