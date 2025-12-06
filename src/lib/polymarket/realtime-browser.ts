import { POLYMARKET_CONFIG } from '../config';
import type { MarketPrice, OutcomeSide } from './types';

export type MarketUpdate = {
  marketId: string;
  price?: MarketPrice;
};

export const subscribeToMarketsBrowser = (
  marketIds: string[],
  onUpdate: (update: MarketUpdate) => void,
) => {
  if (typeof window === 'undefined' || !marketIds.length) return () => {};

  const ws = new WebSocket(`${POLYMARKET_CONFIG.rtdsUrl}/ws`);

  ws.onopen = () => {
    const message = {
      action: 'subscribe',
      topics: marketIds.map((id) => `market.${id}`),
    };
    ws.send(JSON.stringify(message));
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      const topic: string | undefined = payload.topic ?? payload.channel;
      const marketId = topic?.split('.').pop() ?? payload.marketId;
      const priceField = payload.data?.outcomePrices ?? payload.data?.price;
      if (!marketId || !priceField) return;

      const prices: number[] =
        typeof priceField === 'string'
          ? (JSON.parse(priceField) as number[])
          : Array.isArray(priceField)
          ? priceField.map((p: number) => Number(p))
          : [];
      if (!prices.length) return;

      const leadingIdx = prices.reduce(
        (maxIdx, p, idx) => (p > prices[maxIdx] ? idx : maxIdx),
        0,
      );
      const leadingOutcome: OutcomeSide = leadingIdx === 0 ? 'Yes' : 'No';
      onUpdate({ marketId, price: { leadingOutcome, price: prices[leadingIdx] } });
    } catch {
      // ignore malformed events
    }
  };

  const cleanup = () => {
    ws.close();
  };

  return cleanup;
};
