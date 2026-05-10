type MarketPriceArgs = {
  bestBid: number | null;
  bestAsk: number | null;
  side: 'BUY' | 'SELL';
  slippageBps: number;
};

const PRICE_SCALE = 1_000_000;

const toPriceInt = (price: number) => Math.round(price * PRICE_SCALE);
const fromPriceInt = (value: number) => value / PRICE_SCALE;

export const resolveMarketPrice = ({
  bestBid,
  bestAsk,
  side,
  slippageBps,
}: MarketPriceArgs): { price: number | null; error?: string } => {
  if (side === 'BUY') {
    if (bestAsk == null || !Number.isFinite(bestAsk)) {
      return { price: null, error: 'No asks available for market buy.' };
    }
    const askInt = toPriceInt(bestAsk);
    const slipped = Math.floor((askInt * (10_000 + slippageBps)) / 10_000);
    const normalized = Math.min(PRICE_SCALE - 1, Math.max(1, slipped));
    return { price: fromPriceInt(normalized) };
  }
  if (bestBid == null || !Number.isFinite(bestBid)) {
    return { price: null, error: 'There are no buyers available for this outcome right now.' };
  }
  const bidInt = toPriceInt(bestBid);
  const slipped = Math.floor((bidInt * (10_000 - slippageBps)) / 10_000);
  const normalized = Math.min(PRICE_SCALE - 1, Math.max(1, slipped));
  return { price: fromPriceInt(normalized) };
};
