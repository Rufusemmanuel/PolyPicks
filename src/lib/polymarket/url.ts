import { POLYMARKET_CONFIG } from '../config';

export const getPolymarketMarketUrl = (
  eventSlug?: string | null,
  conditionId?: string | null,
) => {
  if (!eventSlug) return POLYMARKET_CONFIG.marketPageBase;
  if (conditionId) {
    return `${POLYMARKET_CONFIG.marketPageBase}${eventSlug}?tid=${conditionId}`;
  }
  return `${POLYMARKET_CONFIG.marketPageBase}${eventSlug}`;
};
