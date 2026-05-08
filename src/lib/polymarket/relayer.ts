import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client';
import type { WalletClient } from 'viem';
import { ensureTradingSession } from '@/lib/polymarket/tradeService';
import { createViemSigner } from '@/lib/wallet/viemSigner';

const DEFAULT_RELAYER_URL = 'https://relayer-v2.polymarket.com/';
const RELAYER_ENV_URL = process.env.NEXT_PUBLIC_POLY_RELAYER_URL;
const CHAIN_ID = 137;
const STORAGE_PREFIX = 'polymarket:safe:';
const SESSION_PREFIX = 'polymarket:relayer-session:';

const getRelayerUrl = () => {
  if (RELAYER_ENV_URL && /^https?:\/\//.test(RELAYER_ENV_URL)) {
    return RELAYER_ENV_URL;
  }
  return DEFAULT_RELAYER_URL;
};

const storageKey = (address: string) => `${STORAGE_PREFIX}${address.toLowerCase()}`;

export const loadStoredProxyAddress = (address: string) => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(storageKey(address));
};

export const storeProxyAddress = (address: string, proxy: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(address), proxy);
};

export const createRelayClient = (
  walletClient: WalletClient,
  txType: RelayerTxType = RelayerTxType.SAFE,
) => {
  return new RelayClient(
    getRelayerUrl(),
    CHAIN_ID,
    walletClient,
    undefined,
    txType,
  );
};

type RelayerSessionOptions = {
  walletClient: WalletClient;
  address: `0x${string}`;
  force?: boolean;
  txType?: RelayerTxType;
};

const getSessionCacheKey = (
  address: string,
  relayerUrl: string,
  txType: RelayerTxType,
) => {
  return `${SESSION_PREFIX}${relayerUrl}:${CHAIN_ID}:${txType}:${address.toLowerCase()}`;
};

const SESSION_TTL_MS = 10 * 60 * 1000;

const readSessionCache = (key: string) => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { checkedAt: number };
  } catch {
    return null;
  }
};

const writeSessionCache = (key: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify({ checkedAt: Date.now() }));
};

export const ensureRelayerSession = async ({
  walletClient,
  address,
  force,
  txType = RelayerTxType.SAFE,
}: RelayerSessionOptions) => {
  const relayerUrl = getRelayerUrl();
  const cacheKey = getSessionCacheKey(address, relayerUrl, txType);
  const cached = readSessionCache(cacheKey);
  if (!force && cached && Date.now() - cached.checkedAt < SESSION_TTL_MS) {
    return;
  }
  const signer = createViemSigner(walletClient, address);
  await ensureTradingSession(signer);
  writeSessionCache(cacheKey);
};

const isSessionNotInitializedError = (error: unknown) => {
  if (error instanceof Error && error.message.includes('Session not initialized')) {
    return true;
  }
  if (typeof error === 'string' && error.includes('Session not initialized')) {
    return true;
  }
  return false;
};

export const executeRelayerTransactions = async ({
  client,
  walletClient,
  address,
  txns,
  metadata,
  txType = RelayerTxType.SAFE,
}: {
  client: RelayClient;
  walletClient: WalletClient;
  address: `0x${string}`;
  txns: Array<{ to: string; data: string; value?: string }>;
  metadata?: string;
  txType?: RelayerTxType;
}) => {
  await ensureRelayerSession({ walletClient, address, txType });
  try {
    return await client.execute(
      txns.map((txn) => ({
        to: txn.to,
        data: txn.data,
        value: txn.value ?? '0',
      })),
      metadata,
    );
  } catch (error) {
    if (isSessionNotInitializedError(error)) {
      await ensureRelayerSession({ walletClient, address, force: true, txType });
      return client.execute(
        txns.map((txn) => ({
          to: txn.to,
          data: txn.data,
          value: txn.value ?? '0',
        })),
        metadata,
      );
    }
    throw error;
  }
};

export const deploySafeIfNeeded = async (
  client: RelayClient,
  eoaAddress: string,
) => {
  const cached = loadStoredProxyAddress(eoaAddress);
  const expectedSafe = await (
    client as unknown as { getExpectedSafe: () => Promise<string> }
  ).getExpectedSafe();
  const candidate = cached ?? expectedSafe;
  const deployed = await client.getDeployed(candidate);
  if (deployed) {
    storeProxyAddress(eoaAddress, candidate);
    return candidate;
  }
  const response = await client.deploy();
  const result = await response.wait();
  const proxy = result?.proxyAddress ?? expectedSafe;
  storeProxyAddress(eoaAddress, proxy);
  return proxy;
};
