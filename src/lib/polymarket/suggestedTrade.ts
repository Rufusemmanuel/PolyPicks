export type SuggestedTrade = {
  marketId: string;
  outcome: 'yes' | 'no';
  orderType: 'market' | 'limit';
  side?: 'buy' | 'sell';
  tokenId?: string;
  maxShares?: string;
  suggestedPriceCents?: number;
  amountUsd?: string;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
};

const normalizeOutcome = (value: string | null) => {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'yes' || raw === 'y' || raw === 'up' || raw === 'true') return 'yes';
  if (raw === 'no' || raw === 'n' || raw === 'down' || raw === 'false') return 'no';
  return null;
};

const normalizeOrderType = (value: string | null) => {
  const raw = value?.trim().toLowerCase();
  if (raw === 'limit') return 'limit';
  if (raw === 'market') return 'market';
  return null;
};

const normalizeSide = (value: string | null) => {
  const raw = value?.trim().toLowerCase();
  if (raw === 'sell') return 'sell';
  if (raw === 'buy') return 'buy';
  return null;
};

export const parseSuggestedTradeFromSearchParams = (
  params: SearchParamsLike,
): SuggestedTrade | null => {
  const marketId = params.get('trade')?.trim();
  if (!marketId) return null;

  const suggestedPriceRaw =
    params.get('suggestedPriceCents') ?? params.get('limitPriceCents');
  const suggestedPriceParsed =
    suggestedPriceRaw != null ? Number(suggestedPriceRaw) : null;
  const suggestedPriceCents =
    suggestedPriceParsed != null && Number.isFinite(suggestedPriceParsed)
      ? Math.round(suggestedPriceParsed)
      : undefined;

  const outcome = normalizeOutcome(params.get('outcome')) ?? 'yes';
  const orderType = normalizeOrderType(params.get('orderType')) ?? 'market';
  const side = normalizeSide(params.get('side')) ?? undefined;
  const tokenId = params.get('tokenId')?.trim() || undefined;
  const maxShares = params.get('maxShares')?.trim() || undefined;

  const amountUsd = params.get('amountUsd') ?? undefined;

  return {
    marketId,
    outcome,
    orderType,
    side,
    tokenId,
    maxShares,
    suggestedPriceCents: suggestedPriceCents != null ? suggestedPriceCents : undefined,
    amountUsd,
  };
};

export const buildSuggestedTradeQuery = (suggested: SuggestedTrade): string => {
  const params = new URLSearchParams();
  params.set('trade', suggested.marketId);
  params.set('outcome', suggested.outcome);
  params.set('orderType', suggested.orderType);
  if (suggested.side) {
    params.set('side', suggested.side);
  }
  if (suggested.tokenId) {
    params.set('tokenId', suggested.tokenId);
  }
  if (suggested.maxShares) {
    params.set('maxShares', suggested.maxShares);
  }
  if (typeof suggested.suggestedPriceCents === 'number') {
    params.set(
      'suggestedPriceCents',
      String(Math.round(suggested.suggestedPriceCents)),
    );
  }
  if (suggested.amountUsd) {
    params.set('amountUsd', suggested.amountUsd);
  }
  return params.toString();
};
