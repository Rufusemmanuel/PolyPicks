import { z } from 'zod';
import { getAddress, isAddress } from 'viem';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

const DECIMAL_STRING_RE = /^[0-9]+$/;
const HEX_STRING_RE = /^0x[0-9a-fA-F]+$/;

const decimalStringSchema = z
  .string()
  .regex(DECIMAL_STRING_RE, 'Expected a decimal string.');

const addressSchema = z
  .string()
  .refine((value) => isAddress(value), 'Invalid address.');

const signatureSchema = z
  .string()
  .regex(HEX_STRING_RE, 'Invalid hex signature.')
  .refine((value) => (value.length - 2) % 2 === 0, 'Signature hex length invalid.');

export const SignedOrderSchema = z.object({
  salt: decimalStringSchema,
  maker: addressSchema,
  signer: addressSchema,
  tokenId: decimalStringSchema,
  makerAmount: decimalStringSchema,
  takerAmount: decimalStringSchema,
  side: z
    .enum(['BUY', 'SELL']),
  signatureType: z
    .number()
    .int()
    .min(0, 'SignatureType must be >= 0.')
    .max(255, 'SignatureType must be <= 255.'),
  timestamp: decimalStringSchema,
  expiration: decimalStringSchema,
  metadata: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'metadata must be bytes32.'),
  builder: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'builder must be bytes32.'),
  signature: signatureSchema,
});

export type NormalizedSignedOrder = z.infer<typeof SignedOrderSchema>;

const normalizeAddress = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required and must be a non-empty string.`);
  }
  if (!isAddress(value)) {
    throw new Error(`${field} is not a valid address.`);
  }
  return getAddress(value);
};

const normalizeSignature = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required and must be a non-empty string.`);
  }
  if (!HEX_STRING_RE.test(value)) {
    throw new Error(`${field} must be a 0x-prefixed hex string.`);
  }
  if ((value.length - 2) % 2 !== 0) {
    throw new Error(`${field} must have an even-length hex payload.`);
  }
  return value;
};

const toDecimalString = (value: unknown, field: string) => {
  if (value == null) {
    throw new Error(`${field} is required.`);
  }
  if (typeof value === 'string') {
    if (!value.trim()) {
      throw new Error(`${field} must be a non-empty string.`);
    }
    if (DECIMAL_STRING_RE.test(value)) return value;
    if (HEX_STRING_RE.test(value)) return BigInt(value).toString();
    throw new Error(`${field} must be a decimal string.`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number.`);
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
    return String(value);
  }
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error(`${field} must be a non-negative integer.`);
    }
    return value.toString();
  }
  if (
    typeof value === 'object' &&
    value &&
    '_hex' in value &&
    typeof (value as { _hex?: unknown })._hex === 'string'
  ) {
    const hex = (value as { _hex: string })._hex;
    if (HEX_STRING_RE.test(hex)) return BigInt(hex).toString();
  }
  if (value && typeof (value as { toString?: unknown }).toString === 'function') {
    const text = String((value as { toString: () => string }).toString());
    if (DECIMAL_STRING_RE.test(text)) return text;
    if (HEX_STRING_RE.test(text)) return BigInt(text).toString();
  }
  throw new Error(`${field} must be a decimal-compatible value.`);
};

const toNumber = (value: unknown, field: string) => {
  if (value == null) {
    throw new Error(`${field} is required.`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number.`);
    }
    if (!Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
    return value;
  }
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${field} is too large to fit in a number.`);
    }
    return Number(value);
  }
  if (typeof value === 'string') {
    if (!DECIMAL_STRING_RE.test(value)) {
      throw new Error(`${field} must be a numeric string.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`${field} is too large to fit in a number.`);
    }
    return parsed;
  }
  throw new Error(`${field} must be a numeric value.`);
};

const normalizeSide = (value: unknown) => {
  if (value === 'BUY' || value === '0' || value === 0) return 'BUY';
  if (value === 'SELL' || value === '1' || value === 1) return 'SELL';
  throw new Error('side must be BUY or SELL.');
};

const normalizeBytes32 = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${field} must be a bytes32 hex string.`);
  }
  return value;
};

export const normalizeSignedOrder = (input: unknown): NormalizedSignedOrder => {
  if (!input || typeof input !== 'object') {
    throw new Error('Signed order must be an object.');
  }
  const raw = input as Record<string, unknown>;
  const tokenIdRaw = raw.tokenId ?? raw.tokenID;
  const normalized: NormalizedSignedOrder = {
    salt: toDecimalString(raw.salt, 'salt'),
    maker: normalizeAddress(raw.maker, 'maker'),
    signer: normalizeAddress(raw.signer, 'signer'),
    tokenId: toDecimalString(tokenIdRaw, 'tokenId'),
    makerAmount: toDecimalString(raw.makerAmount, 'makerAmount'),
    takerAmount: toDecimalString(raw.takerAmount, 'takerAmount'),
    side: normalizeSide(raw.side),
    signatureType: toNumber(raw.signatureType, 'signatureType'),
    timestamp: toDecimalString(raw.timestamp, 'timestamp'),
    expiration: toDecimalString(raw.expiration, 'expiration'),
    metadata: normalizeBytes32(raw.metadata ?? ZERO_BYTES32, 'metadata'),
    builder: normalizeBytes32(raw.builder, 'builder'),
    signature: normalizeSignature(raw.signature, 'signature'),
  };

  const parsed = SignedOrderSchema.safeParse(normalized);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid signed order: ${details}`);
  }
  return parsed.data;
};

export const getSignedOrderTypeMap = (order: NormalizedSignedOrder) => ({
  salt: typeof order.salt,
  maker: typeof order.maker,
  signer: typeof order.signer,
  tokenId: typeof order.tokenId,
  makerAmount: typeof order.makerAmount,
  takerAmount: typeof order.takerAmount,
  side: typeof order.side,
  signatureType: typeof order.signatureType,
  timestamp: typeof order.timestamp,
  expiration: typeof order.expiration,
  metadata: typeof order.metadata,
  builder: typeof order.builder,
  signature: typeof order.signature,
});

export const redactSignedOrder = (order: NormalizedSignedOrder) => ({
  ...order,
  maker: `${order.maker.slice(0, 6)}...`,
  signer: `${order.signer.slice(0, 6)}...`,
  signature: `${order.signature.slice(0, 10)}...`,
});
