export type SignatureType = 0 | 1 | 2 | 3;

const parseSignatureType = (): SignatureType => {
  const raw = process.env.NEXT_PUBLIC_POLY_SIGNATURE_TYPE;
  if (raw != null) {
    const parsed = Number(raw);
    if (parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3) return parsed;
  }
  return process.env.NEXT_PUBLIC_FORCE_EOA === 'true' ? 0 : 2;
};

const parseNumber = (raw: string | undefined, fallback: number) => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const TRADE_CONFIG = {
  chainId: 137,
  clobHost: 'https://clob.polymarket.com',
  relayerUrl:
    process.env.NEXT_PUBLIC_POLY_RELAYER_URL ?? 'https://relayer-v2.polymarket.com/',
  signatureType: parseSignatureType(),
  slippageBps: parseNumber(process.env.NEXT_PUBLIC_POLY_SLIPPAGE_BPS, 50),
  orderbookPollMs: parseNumber(process.env.NEXT_PUBLIC_POLY_BOOK_POLL_MS, 5000),
};
