import 'server-only';

type TradingStatus = {
  enabled: boolean;
  tradingFlag: boolean;
  hasRuntimeConfig: boolean;
  missing: string[];
  disabledReasons: string[];
};

const isEnabledFlag = (value: string | undefined) =>
  value === '1' || value?.toLowerCase() === 'true';

export const resolveTradingStatus = (): TradingStatus => {
  const tradingFlag = isEnabledFlag(process.env.ENABLE_TRADING);
  const missing: string[] = [];

  if (!process.env.POLYMARKET_BUILDER_CODE) missing.push('POLYMARKET_BUILDER_CODE');
  if (!process.env.POLYPICKS_SESSION_SECRET) missing.push('POLYPICKS_SESSION_SECRET');

  const hasRuntimeConfig = missing.length === 0;
  const disabledReasons = [
    ...(!tradingFlag ? ['ENABLE_TRADING is not true'] : []),
    ...missing.map((key) => `Missing ${key}`),
  ];

  return {
    enabled: tradingFlag && hasRuntimeConfig,
    tradingFlag,
    hasRuntimeConfig,
    missing,
    disabledReasons,
  };
};
