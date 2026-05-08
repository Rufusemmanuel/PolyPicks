type OrderType = 'FAK' | 'FOK' | 'GTC' | 'GTD';

type SanitizedOrder = {
  salt: number;
  maker: string;
  signer: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  side: 'BUY' | 'SELL';
  signatureType: number;
  timestamp: string;
  expiration: string;
  metadata: string;
  builder: string;
  signature: string;
};

type SanitizedOrderPayload = {
  order: SanitizedOrder;
  orderType: OrderType;
  postOnly?: boolean;
};

const ORDER_TYPES = new Set<OrderType>(['FAK', 'FOK', 'GTC', 'GTD']);
const NUMERIC_RE = /^\d+$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

const requireString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
};

const requireNumericString = (value: unknown, label: string) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${label} must be an integer.`);
    }
    return String(value);
  }
  if (typeof value !== 'string' || !NUMERIC_RE.test(value)) {
    throw new Error(`${label} must be a numeric string.`);
  }
  return value;
};

const requirePositiveAmount = (value: unknown, label: string) => {
  const numeric = requireNumericString(value, label);
  if (BigInt(numeric) <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return numeric;
};

const normalizeExpiration = (value: unknown) => requireNumericString(value, 'order.expiration');

const requireSalt = (value: unknown) => {
  const numeric = requireNumericString(value, 'order.salt');
  const parsed = Number(numeric);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('order.salt must be a safe integer.');
  }
  return parsed;
};

const requireSide = (value: unknown) => {
  if (value === 'BUY' || value === '0' || value === 0) return 'BUY';
  if (value === 'SELL' || value === '1' || value === 1) return 'SELL';
  throw new Error('order.side must be BUY or SELL.');
};

const requireSignatureType = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && NUMERIC_RE.test(value)) {
    return Number(value);
  }
  throw new Error('order.signatureType must be an integer.');
};

const requireBytes32 = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !BYTES32_RE.test(value)) {
    throw new Error(`${label} must be a bytes32 hex string.`);
  }
  return value;
};

export const sanitizeOrderPayload = (payload: Record<string, unknown>): SanitizedOrderPayload => {
  const orderType = payload.orderType;
  if (typeof orderType !== 'string' || !ORDER_TYPES.has(orderType as OrderType)) {
    throw new Error('orderType must be FAK, FOK, GTC, or GTD.');
  }
  const orderRaw = payload.order;
  if (!orderRaw || typeof orderRaw !== 'object') {
    throw new Error('order must be an object.');
  }
  const order = orderRaw as Record<string, unknown>;

  const expiration = normalizeExpiration(order.expiration);
  if (orderType === 'GTD') {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (BigInt(expiration) <= BigInt(nowSeconds + 60)) {
      throw new Error('order.expiration must be at least 60 seconds in the future.');
    }
  } else if (expiration !== '0') {
    throw new Error('order.expiration must be "0" for non-GTD orders.');
  }

  const sanitized: SanitizedOrder = {
    salt: requireSalt(order.salt),
    maker: requireString(order.maker, 'order.maker'),
    signer: requireString(order.signer, 'order.signer'),
    tokenId: requireNumericString(order.tokenId, 'order.tokenId'),
    makerAmount: requirePositiveAmount(order.makerAmount, 'order.makerAmount'),
    takerAmount: requirePositiveAmount(order.takerAmount, 'order.takerAmount'),
    side: requireSide(order.side),
    signatureType: requireSignatureType(order.signatureType),
    timestamp: requireNumericString(order.timestamp, 'order.timestamp'),
    expiration,
    metadata: requireBytes32(order.metadata, 'order.metadata'),
    builder: requireBytes32(order.builder, 'order.builder'),
    signature: requireString(order.signature, 'order.signature'),
  };

  const postOnlyRaw = payload.postOnly;
  const postOnly =
    typeof postOnlyRaw === 'boolean' && orderType !== 'FAK' && orderType !== 'FOK'
      ? postOnlyRaw
      : undefined;

  return {
    order: sanitized,
    orderType: orderType as OrderType,
    ...(postOnly ? { postOnly } : {}),
  };
};
