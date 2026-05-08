const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

const requireEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required server env var: ${key}`);
  return value;
};

export const getPolymarketBuilderCode = () => {
  const builderCode = requireEnv('POLYMARKET_BUILDER_CODE');
  if (!BYTES32_RE.test(builderCode)) {
    throw new Error('POLYMARKET_BUILDER_CODE must be a bytes32 hex value.');
  }
  return builderCode;
};

export const getPolymarketServerCreds = () => ({
  key: requireEnv('POLYMARKET_API_KEY'),
  secret: requireEnv('POLYMARKET_SECRET'),
  passphrase: requireEnv('POLYMARKET_PASSPHRASE'),
});

export const validatePolymarketTradingEnv = () => {
  const missing: string[] = [];
  for (const key of ['POLYMARKET_BUILDER_CODE', 'POLYPICKS_SESSION_SECRET']) {
    if (!process.env[key]?.trim()) missing.push(key);
  }
  if (missing.length) {
    throw new Error(`Missing Polymarket env vars: ${missing.join(', ')}`);
  }
  getPolymarketBuilderCode();
};
