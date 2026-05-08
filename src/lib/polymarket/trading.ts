import 'server-only';

type TradingStatus = {
  enabled: boolean;
  tradingFlag: boolean;
  hasRuntimeConfig: boolean;
  missing: string[];
};

const isEnabledFlag = (value: string | undefined) =>
  value === '1' || value?.toLowerCase() === 'true';

export const resolveTradingStatus = (): TradingStatus => {
  const tradingFlag = isEnabledFlag(process.env.ENABLE_TRADING);
  const missing: string[] = [];

  if (!process.env.POLYMARKET_BUILDER_CODE) missing.push('POLYMARKET_BUILDER_CODE');
  if (!process.env.POLYPICKS_SESSION_SECRET) missing.push('POLYPICKS_SESSION_SECRET');

  const hasRuntimeConfig = missing.length === 0;

  return {
    enabled: tradingFlag && hasRuntimeConfig,
    tradingFlag,
    hasRuntimeConfig,
    missing,
  };
};
