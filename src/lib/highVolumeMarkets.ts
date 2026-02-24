export type MarketWithVolume = { volume?: unknown } & Record<string, unknown>;

export const HIGH_VOLUME_THRESHOLD = 50000;
export type HomeViewMode = 'markets' | 'high-volume';

export const getVolumeUsd = (market: MarketWithVolume): number => {
  const raw =
    market.volume ??
    market.volumeUSD ??
    market.volumeUsd ??
    market.volume_usd ??
    market.volumeNum;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const filterHighVolumeMarkets = <T extends MarketWithVolume>(markets: T[]): T[] =>
  markets.filter((market) => getVolumeUsd(market) > HIGH_VOLUME_THRESHOLD);

export const resolveHomeViewMode = (viewParam: string | null | undefined): HomeViewMode =>
  viewParam === 'high-volume' ? 'high-volume' : 'markets';

export const selectMarketsForView = <T extends MarketWithVolume>(
  markets: T[],
  viewMode: HomeViewMode,
): T[] => (viewMode === 'high-volume' ? filterHighVolumeMarkets(markets) : markets);
