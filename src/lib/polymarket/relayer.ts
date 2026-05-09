import {
  CallType,
  buildDepositWalletCreateRequest,
  type DepositWalletCall,
  OperationType,
  RelayClient,
  RelayerTransactionState,
  RelayerTxType,
  type RelayerTransaction,
  type RelayerTransactionResponse,
} from '@polymarket/builder-relayer-client';
import { buildSafeCreateTransactionRequest } from '@polymarket/builder-relayer-client/dist/builder/create';
import { deriveSafe } from '@polymarket/builder-relayer-client/dist/builder/derive';
import { buildProxyTransactionRequest } from '@polymarket/builder-relayer-client/dist/builder/proxy';
import { buildSafeTransactionRequest } from '@polymarket/builder-relayer-client/dist/builder/safe';
import { encodeProxyTransactionData } from '@polymarket/builder-relayer-client/dist/encode';
import {
  isDepositWalletContractConfigValid,
  isProxyContractConfigValid,
  isSafeContractConfigValid,
} from '@polymarket/builder-relayer-client/dist/config';
import type { WalletClient } from 'viem';
import { zeroAddress } from 'viem';
import { ensureTradingSession } from '@/lib/polymarket/tradeService';
import { createViemSigner } from '@/lib/wallet/viemSigner';

const DEFAULT_RELAYER_URL = 'https://relayer-v2.polymarket.com/';
const RELAYER_ENV_URL = process.env.NEXT_PUBLIC_POLY_RELAYER_URL;
const CHAIN_ID = 137;
const STORAGE_PREFIX = 'polymarket:safe:';
const SESSION_PREFIX = 'polymarket:relayer-session:';
const DEPOSIT_WALLET_BATCH_TYPES = {
  Call: [
    { name: 'target', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
  Batch: [
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'calls', type: 'Call[]' },
  ],
} as const;
const HEX_65_BYTE_SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

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

type RelayerSubmitResponse = {
  ok?: boolean;
  transactionID?: string;
  transactionId?: string;
  id?: string;
  state?: string;
  transactionHash?: string;
  hash?: string;
  error?: string;
  details?: unknown;
};

const BUILDER_AUTH_MISCONFIGURED_MESSAGE =
  'Builder relayer authentication is misconfigured. The backend should use Builder API Key auth, not wallet-scoped Relayer API Key auth.';

const normalizeSubmitErrorMessage = (message: string) => {
  if (/does not match auth/i.test(message)) {
    return BUILDER_AUTH_MISCONFIGURED_MESSAGE;
  }
  return message;
};

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

const parseRelayerErrorMessage = (value: unknown) => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = value as { error?: unknown; message?: unknown; details?: unknown };
    if (typeof candidate.error === 'string') return candidate.error;
    if (typeof candidate.message === 'string') return candidate.message;
    if (candidate.details) return JSON.stringify(candidate.details);
  }
  return 'Relayer request failed.';
};

const submitRelayerRequest = async (
  request: object,
): Promise<RelayerSubmitResponse> => {
  const res = await fetch('/api/polymarket/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = (await res.json().catch(() => null)) as RelayerSubmitResponse | null;
  if (!res.ok || !data) {
    const upstream =
      data?.details && typeof data.details === 'object'
        ? (data.details as { data?: { error?: string }; error?: string })
        : null;
    const message =
      upstream?.data?.error ??
      upstream?.error ??
      data?.error ??
      `Relayer request failed (${res.status}).`;
    throw new Error(normalizeSubmitErrorMessage(message));
  }
  return data;
};

const buildRelayerResponse = (
  client: RelayClient,
  response: RelayerSubmitResponse,
): RelayerTransactionResponse => {
  const transactionID = response.transactionID ?? response.transactionId ?? response.id;
  if (!transactionID) {
    throw new Error('Relayer response missing transaction id.');
  }
  const transactionHash = response.transactionHash ?? response.hash ?? '';
  return {
    transactionID,
    transactionHash,
    hash: transactionHash,
    state: response.state ?? RelayerTransactionState.STATE_NEW,
    getTransaction: () => client.getTransaction(transactionID),
    wait: () =>
      client.pollUntilState(
        transactionID,
        [
          RelayerTransactionState.STATE_MINED,
          RelayerTransactionState.STATE_CONFIRMED,
        ],
        RelayerTransactionState.STATE_FAILED,
        100,
      ) as Promise<RelayerTransaction | undefined>,
  };
};

const waitForRelayerResponse = async (
  response: RelayerTransactionResponse,
  failureMessage: string,
) => {
  const result = await response.wait();
  if (!result || result.state === RelayerTransactionState.STATE_FAILED) {
    throw new Error(failureMessage);
  }
  return result;
};

const getClientSigner = (client: RelayClient) => {
  if (!client.signer) {
    throw new Error('Relayer signer unavailable.');
  }
  return client.signer;
};

const getExpectedSafe = async (client: RelayClient) => {
  const signer = getClientSigner(client);
  const address = await signer.getAddress();
  return deriveSafe(address, client.contractConfig.SafeContracts.SafeFactory);
};

const buildExecuteRequest = async ({
  client,
  txns,
  metadata,
  txType,
}: {
  client: RelayClient;
  txns: Array<{ to: string; data: string; value?: string }>;
  metadata?: string;
  txType: RelayerTxType;
}) => {
  const signer = getClientSigner(client);
  const from = await signer.getAddress();
  if (txType === RelayerTxType.PROXY) {
    const relayPayload = await client.getRelayPayload(from, 'PROXY');
    const proxyContractConfig = client.contractConfig.ProxyContracts;
    if (!isProxyContractConfigValid(proxyContractConfig)) {
      throw new Error('Relayer proxy config unsupported on Polygon.');
    }
    return buildProxyTransactionRequest(
      signer,
      {
        from,
        gasPrice: '0',
        data: encodeProxyTransactionData(
          txns.map((txn) => ({
            to: txn.to,
            typeCode: CallType.Call,
            data: txn.data,
            value: txn.value ?? '0',
          })),
        ),
        relay: relayPayload.address,
        nonce: relayPayload.nonce,
      },
      proxyContractConfig,
      metadata,
    );
  }

  const safe = await getExpectedSafe(client);
  const deployed = await client.getDeployed(safe);
  if (!deployed) {
    throw new Error('Safe is not deployed.');
  }
  const noncePayload = await client.getNonce(from, 'SAFE');
  const safeContractConfig = client.contractConfig.SafeContracts;
  if (!isSafeContractConfigValid(safeContractConfig)) {
    throw new Error('Relayer Safe config unsupported on Polygon.');
  }
  return buildSafeTransactionRequest(
    signer,
    {
      transactions: txns.map((txn) => ({
        to: txn.to,
        operation: OperationType.Call,
        data: txn.data,
        value: txn.value ?? '0',
      })),
      from,
      nonce: noncePayload.nonce,
      chainId: CHAIN_ID,
    },
    safeContractConfig,
    metadata,
  );
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
    const request = await buildExecuteRequest({ client, txns, metadata, txType });
    const response = await submitRelayerRequest(request);
    return buildRelayerResponse(client, response);
  } catch (error) {
    if (isSessionNotInitializedError(error) || parseRelayerErrorMessage(error).includes('invalid authorization')) {
      await ensureRelayerSession({ walletClient, address, force: true, txType });
      const request = await buildExecuteRequest({ client, txns, metadata, txType });
      const response = await submitRelayerRequest(request);
      return buildRelayerResponse(client, response);
    }
    throw error;
  }
};

export const deriveDepositWalletAddress = async (client: RelayClient) => {
  return client.deriveDepositWalletAddress();
};

export const ensureDepositWalletDeployed = async (client: RelayClient) => {
  const signer = getClientSigner(client);
  const owner = await signer.getAddress();
  const walletAddress = await client.deriveDepositWalletAddress();
  const alreadyDeployed = await client.getDeployed(walletAddress, 'WALLET');
  if (alreadyDeployed) {
    return walletAddress;
  }
  const depositWalletConfig = client.contractConfig.DepositWalletContracts;
  if (!isDepositWalletContractConfigValid(depositWalletConfig)) {
    throw new Error('Deposit wallet config unsupported on Polygon.');
  }
  console.info('[polymarket]', {
    event: 'deposit_wallet_deploy_started',
    component: 'relayer',
    owner,
    depositWalletAddress: walletAddress,
  });
  const request = buildDepositWalletCreateRequest(owner, depositWalletConfig);
  const response = buildRelayerResponse(client, await submitRelayerRequest(request));
  await waitForRelayerResponse(response, 'Deposit wallet deployment failed.');
  console.info('[polymarket]', {
    event: 'deposit_wallet_create_confirmed',
    component: 'relayer',
    owner,
    depositWalletAddress: walletAddress,
    txId: response.transactionID,
    txHash: response.transactionHash,
  });
  const deployed = await client.getDeployed(walletAddress, 'WALLET');
  if (!deployed) {
    throw new Error('Deposit wallet deployment was not confirmed.');
  }
  return walletAddress;
};

export const executeDepositWalletBatch = async ({
  client,
  walletClient,
  ownerAddress,
  walletAddress,
  calls,
  deadline,
}: {
  client: RelayClient;
  walletClient: WalletClient;
  ownerAddress: `0x${string}`;
  walletAddress: string;
  calls: DepositWalletCall[];
  deadline?: string;
}) => {
  const depositWalletConfig = client.contractConfig.DepositWalletContracts;
  if (!isDepositWalletContractConfigValid(depositWalletConfig)) {
    throw new Error('Deposit wallet config unsupported on Polygon.');
  }
  const owner = ownerAddress;
  const noncePayload = await client.getNonce(owner, 'WALLET');
  const resolvedDeadline =
    deadline ?? Math.floor(Date.now() / 1000 + 10 * 60).toString();
  if (BigInt(resolvedDeadline) <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error('Deposit wallet batch deadline must be in the future.');
  }
  console.info('[polymarket]', {
    event: 'Signing DepositWallet WALLET batch',
    component: 'relayer',
    owner,
    depositWalletAddress: walletAddress,
    nonce: noncePayload.nonce,
    deadline: resolvedDeadline,
    callCount: calls.length,
  });
  const signature = await walletClient.signTypedData({
    account: owner,
    domain: {
      name: 'DepositWallet',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: walletAddress as `0x${string}`,
    },
    types: DEPOSIT_WALLET_BATCH_TYPES,
    primaryType: 'Batch',
    message: {
      wallet: walletAddress as `0x${string}`,
      nonce: BigInt(noncePayload.nonce),
      deadline: BigInt(resolvedDeadline),
      calls: calls.map((call) => ({
        target: call.target as `0x${string}`,
        value: BigInt(call.value),
        data: call.data as `0x${string}`,
      })),
    },
  });
  if (!HEX_65_BYTE_SIGNATURE_RE.test(signature)) {
    throw new Error('Deposit wallet WALLET batch signature must be a 65-byte EIP-712 signature.');
  }
  const request = {
    type: 'WALLET',
    from: owner,
    to: depositWalletConfig.DepositWalletFactory,
    nonce: noncePayload.nonce,
    signature,
    depositWalletParams: {
      depositWallet: walletAddress,
      deadline: resolvedDeadline,
      calls,
    },
  };
  console.info('[polymarket]', {
    event: 'deposit_wallet_batch_forwarded',
    component: 'relayer',
    owner,
    depositWalletAddress: walletAddress,
    calls: calls.length,
    nonce: noncePayload.nonce,
    deadline: resolvedDeadline,
    signatureLength: signature.length,
  });
  const response = buildRelayerResponse(client, await submitRelayerRequest(request));
  await waitForRelayerResponse(response, 'Deposit wallet batch failed.');
  return response;
};

export const deploySafeIfNeeded = async (
  client: RelayClient,
  eoaAddress: string,
) => {
  const cached = loadStoredProxyAddress(eoaAddress);
  const expectedSafe = await getExpectedSafe(client);
  const candidate = cached ?? expectedSafe;
  const deployed = await client.getDeployed(candidate);
  if (deployed) {
    storeProxyAddress(eoaAddress, candidate);
    return candidate;
  }
  const signer = getClientSigner(client);
  const request = await buildSafeCreateTransactionRequest(
    signer,
    client.contractConfig.SafeContracts,
    {
      from: eoaAddress,
      chainId: CHAIN_ID,
      paymentToken: zeroAddress,
      payment: '0',
      paymentReceiver: zeroAddress,
    },
  );
  const response = buildRelayerResponse(client, await submitRelayerRequest(request));
  const result = await response.wait();
  const proxy = result?.proxyAddress ?? expectedSafe;
  storeProxyAddress(eoaAddress, proxy);
  return proxy;
};
