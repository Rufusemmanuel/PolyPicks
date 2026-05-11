'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodeFunctionData, erc1155Abi as viemErc1155Abi, erc20Abi } from 'viem';
import {
  RelayClient,
  RelayerTxType,
  RelayerTransactionState,
} from '@polymarket/builder-relayer-client';
import { getContractConfig } from '@polymarket/clob-client-v2';
import {
  createRelayClient,
  ensureDepositWalletDeployed as ensureDepositWalletDeployedWithRelayer,
  executeDepositWalletBatch,
  deploySafeIfNeeded,
  executeRelayerTransactions,
  loadStoredProxyAddress,
  storeProxyAddress,
} from '@/lib/polymarket/relayer';
import { ensureTradingSession } from '@/lib/polymarket/tradeService';
import { createViemSigner } from '@/lib/wallet/viemSigner';
import { getPolygonPublicClient } from '@/lib/wallet/publicClient';
import type { WalletClient } from 'viem';

type SessionState = {
  eoaAddress: string | null;
  proxyAddress: string | null;
  proxyDeployed: boolean | null;
  depositWalletAddress: string | null;
  depositWalletDeployed: boolean | null;
  tradingWalletAddress: string | null;
  tradingSignatureType: 2 | 3 | null;
  walletMode: 'legacy-proxy' | 'deposit-wallet' | null;
  depositWalletRequired: boolean;
  initialized: boolean;
  hasApiCreds: boolean;
  isLoading: boolean;
  lastRefreshAt: number | null;
  error: string | null;
  redeemPositions: (params: {
    conditionId: string;
    outcomeSlotCount?: number;
    indexSets?: bigint[];
  }) => Promise<void>;
  ensureProxyDeployed: (options?: { force?: boolean }) => Promise<string>;
  ensureDepositWalletDeployed: (options?: {
    force?: boolean;
    useDepositWallet?: boolean;
  }) => Promise<string>;
  requireDepositWalletFlow: () => Promise<string>;
  refreshProxyDeployment: () => Promise<void>;
  ensureApprovals: (token: string, spender: string, amount: bigint) => Promise<void>;
  ensureDepositWalletApprovals: (token: string, spender: string, amount: bigint) => Promise<void>;
  ensureDepositWalletConditionalApproval: (
    token: string,
    operator: string,
    tokenId: string,
  ) => Promise<void>;
  ensureOperatorApproval: (token: string, operator: string) => Promise<void>;
  syncBalanceAllowance: (params?: {
    assetType?: 'COLLATERAL' | 'CONDITIONAL';
    tokenId?: string;
    signatureType?: 2 | 3;
    tradingWalletAddress?: string;
  }) => Promise<void>;
  getUsdcBalance: () => Promise<bigint>;
  withdrawErc20: (token: string, to: string, amount: bigint) => Promise<unknown>;
  getTokenBalance: (token: string, address?: string) => Promise<bigint>;
  getErc1155Balance: (
    token: string,
    tokenId: bigint,
    owner?: string,
  ) => Promise<bigint>;
};

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;
const AUTH_INVALID_SESSION_CODE = 'AUTH_INVALID_SESSION';
const DEPOSIT_REQUIRED_PREFIX = 'polymarket:deposit-wallet-required:';
const conditionalTokensAbi = [
  {
    type: 'function',
    name: 'redeemPositions',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' },
    ],
    outputs: [],
  },
] as const;

const sameAddress = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

const depositRequiredKey = (address: string) =>
  `${DEPOSIT_REQUIRED_PREFIX}${address.toLowerCase()}`;

const readDepositWalletRequired = (address: string) => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(depositRequiredKey(address)) === '1';
};

const writeDepositWalletRequired = (address: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(depositRequiredKey(address), '1');
};

export const usePolymarketSession = (
  walletClient: WalletClient | null,
  address: `0x${string}` | null,
  chainId: number | null,
): SessionState => {
  const [eoaAddress, setEoaAddress] = useState<string | null>(null);
  const [proxyAddress, setProxyAddress] = useState<string | null>(null);
  const [proxyDeployed, setProxyDeployed] = useState<boolean | null>(null);
  const [depositWalletAddress, setDepositWalletAddress] = useState<string | null>(null);
  const [depositWalletDeployed, setDepositWalletDeployed] = useState<boolean | null>(null);
  const [tradingWalletAddress, setTradingWalletAddress] = useState<string | null>(null);
  const [tradingSignatureType, setTradingSignatureType] = useState<2 | 3 | null>(null);
  const [walletMode, setWalletMode] = useState<'legacy-proxy' | 'deposit-wallet' | null>(null);
  const [depositWalletRequired, setDepositWalletRequired] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [hasApiCreds, setHasApiCreds] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relayClient, setRelayClient] = useState<RelayClient | null>(null);
  const publicClient = useMemo(() => getPolygonPublicClient(), []);
  const initStateRef = useRef<{
    inFlight: Promise<void> | null;
    attempts: number;
    timer: ReturnType<typeof setTimeout> | null;
    token: number;
  }>({ inFlight: null, attempts: 0, timer: null, token: 0 });
  const ensureProxyRef = useRef<Promise<string> | null>(null);
  const ensureDepositWalletRef = useRef<Promise<string> | null>(null);
  const balanceInFlightRef = useRef<Map<string, Promise<bigint>>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const initState = initStateRef.current;
    initState.token += 1;
    const currentToken = initState.token;

    const resetState = () => {
      setRelayClient(null);
      setEoaAddress(null);
      setProxyAddress(null);
      setProxyDeployed(null);
      setDepositWalletAddress(null);
      setDepositWalletDeployed(null);
      setTradingWalletAddress(null);
      setTradingSignatureType(null);
      setWalletMode(null);
      setDepositWalletRequired(false);
      setInitialized(false);
      setHasApiCreds(false);
      setLastRefreshAt(null);
      setError(null);
      setIsLoading(false);
      initState.inFlight = null;
      initState.attempts = 0;
    };

    const activeWalletClient = walletClient;
    const activeAddress = address;
    const activeChainId = chainId;

    const startInit = async () => {
      if (initState.inFlight) return initState.inFlight;
      initState.inFlight = (async () => {
        if (!activeWalletClient || !activeAddress || activeChainId !== 137) return;
        try {
          setIsLoading(true);
          const relayer = createRelayClient(activeWalletClient, RelayerTxType.SAFE);
          let depositWallet: string | null = null;
          let depositDeployed: boolean | null = null;
          let depositCheckError: string | null = null;
          try {
            depositWallet = await relayer.deriveDepositWalletAddress();
            depositDeployed = await relayer.getDeployed(depositWallet, 'WALLET');
          } catch (err) {
            depositDeployed = null;
            depositCheckError =
              'Unable to check deposit wallet deployment right now. Try again.';
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[wallet] deposit wallet deploy check failed', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          const safe = await (
            relayer as unknown as { getExpectedSafe: () => Promise<string> }
          ).getExpectedSafe();
          const cached = loadStoredProxyAddress(activeAddress);
          let resolvedSafe = cached ?? safe;
          let deployed: boolean | null = null;
          let deployCheckError: string | null = null;
          try {
            deployed = await relayer.getDeployed(resolvedSafe);
            if (!deployed && cached && resolvedSafe !== safe) {
              const expectedDeployed = await relayer.getDeployed(safe);
              if (expectedDeployed) {
                resolvedSafe = safe;
                deployed = true;
              }
            }
            if (deployed) {
              storeProxyAddress(activeAddress, resolvedSafe);
            }
          } catch (err) {
            deployed = null;
            deployCheckError =
              'Unable to check proxy deployment right now. Try again.';
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[wallet] relayer deploy check failed', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          if (initState.token !== currentToken) return;
          const storedDepositRequired = readDepositWalletRequired(activeAddress);
          setRelayClient(relayer);
          setEoaAddress(activeAddress);
          setProxyAddress(resolvedSafe);
          setProxyDeployed(deployed);
          setDepositWalletAddress(depositWallet);
          setDepositWalletDeployed(depositDeployed);
          setDepositWalletRequired(storedDepositRequired);
          const resolvedWalletMode: 'legacy-proxy' | 'deposit-wallet' | null =
            storedDepositRequired
              ? 'deposit-wallet'
              : deployed === true
                ? 'legacy-proxy'
                : deployed === false
                  ? 'deposit-wallet'
                  : null;
          const resolvedTradingWallet =
            resolvedWalletMode === 'legacy-proxy'
              ? resolvedSafe
              : resolvedWalletMode === 'deposit-wallet'
                ? depositWallet
                : null;
          const resolvedTradingSignatureType: 2 | 3 | null =
            resolvedWalletMode === 'legacy-proxy'
              ? 2
              : resolvedWalletMode === 'deposit-wallet'
                ? 3
                : null;
          if (!resolvedTradingWallet) {
            throw new Error(deployCheckError ?? 'Trading wallet address unavailable.');
          }
          const signer = createViemSigner(activeWalletClient, activeAddress);
          await ensureTradingSession(signer, activeChainId, {
            tradingWalletAddress: resolvedTradingWallet,
            signatureType: resolvedTradingSignatureType,
          });
          setTradingWalletAddress(resolvedTradingWallet);
          setTradingSignatureType(resolvedTradingSignatureType);
          setWalletMode(resolvedWalletMode);
          setInitialized(true);
          setHasApiCreds(true);
          setLastRefreshAt(Date.now());
          setError(deployCheckError ?? depositCheckError);
          initState.attempts = 0;
          if (process.env.NODE_ENV !== 'production') {
            console.info('[wallet] session ready', {
              chainId: activeChainId,
              proxyAddress: resolvedSafe,
              proxyDeployed: deployed,
              depositWalletAddress: depositWallet,
              tradingWalletAddress: resolvedTradingWallet,
              tradingSignatureType: resolvedTradingSignatureType,
              walletMode: resolvedWalletMode,
              depositWalletRequired: storedDepositRequired,
              initialized: true,
              hasApiCreds: true,
              depositWalletDeployed: depositDeployed,
              connectedEoa: activeAddress,
              lastRefreshAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          if (initState.token !== currentToken) return;
          const message = err instanceof Error ? err.message : 'Unable to init relayer.';
          setInitialized(false);
          setHasApiCreds(false);
          setError(message);
          initState.attempts += 1;
          const nextDelay = Math.min(8000, 500 * 2 ** (initState.attempts - 1));
          if (initState.attempts <= 3) {
            scheduleInit(nextDelay);
          } else if (process.env.NODE_ENV !== 'production') {
            console.warn('[wallet] init failed, stopping retries', {
              attempts: initState.attempts,
              error: message,
            });
          }
        } finally {
          if (initState.token === currentToken) {
            setIsLoading(false);
          }
          initState.inFlight = null;
        }
      })();
      return initState.inFlight;
    };

    const scheduleInit = (delayMs: number) => {
      if (initState.timer) {
        clearTimeout(initState.timer);
      }
      initState.timer = setTimeout(() => {
        void startInit();
      }, delayMs);
    };

    if (!activeWalletClient || !activeAddress || activeChainId !== 137) {
      resetState();
      return undefined;
    }

    scheduleInit(0);

    return () => {
      if (initState.timer) {
        clearTimeout(initState.timer);
        initState.timer = null;
      }
    };
  }, [walletClient, address, chainId]);

  const ensureProxyDeployed = useCallback(async (options?: { force?: boolean }) => {
    if (!relayClient) {
      throw new Error('Relayer client not ready.');
    }
    if (!eoaAddress) {
      throw new Error('EOA address unavailable.');
    }
    if (proxyDeployed === true) {
      if (proxyAddress) return proxyAddress;
      throw new Error('Proxy address unavailable.');
    }
    if (proxyDeployed === null && !options?.force) {
      throw new Error('Proxy deployment status unknown. Try again.');
    }
    if (ensureProxyRef.current) return ensureProxyRef.current;
    ensureProxyRef.current = (async () => {
      if (proxyDeployed === null && options?.force && proxyAddress) {
        try {
          const deployed = await relayClient.getDeployed(proxyAddress);
          if (deployed) {
            setProxyDeployed(true);
            return proxyAddress;
          }
          if (deployed === false) {
            setProxyDeployed(false);
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[wallet] relayer deploy recheck failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      const proxy = await deploySafeIfNeeded(relayClient, eoaAddress);
      setProxyAddress(proxy);
      setProxyDeployed(true);
      return proxy;
    })().finally(() => {
      ensureProxyRef.current = null;
    });
    return ensureProxyRef.current;
  }, [relayClient, eoaAddress, proxyAddress, proxyDeployed]);

  const ensureDepositWalletDeployed = useCallback(async (options?: {
    force?: boolean;
    useDepositWallet?: boolean;
  }) => {
    if (!relayClient) {
      throw new Error('Relayer client not ready.');
    }
    if (depositWalletDeployed === null && !options?.force) {
      throw new Error('Deposit wallet deployment status unknown. Try again.');
    }
    if (ensureDepositWalletRef.current) return ensureDepositWalletRef.current;
    ensureDepositWalletRef.current = (async () => {
      const walletAddress = await relayClient.deriveDepositWalletAddress();
      if (depositWalletAddress && !sameAddress(depositWalletAddress, walletAddress)) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[wallet] resolved deposit wallet updated', {
            connectedEoa: eoaAddress,
            previousDepositWalletAddress: depositWalletAddress,
            resolvedDepositWalletAddress: walletAddress,
          });
        }
      }
      setDepositWalletAddress(walletAddress);
      if (depositWalletDeployed === null && options?.force) {
        try {
          const deployed = await relayClient.getDeployed(walletAddress, 'WALLET');
          if (deployed) {
            setDepositWalletAddress(walletAddress);
            setDepositWalletDeployed(true);
            const shouldUseDepositWallet =
              options?.useDepositWallet === true ||
              depositWalletRequired ||
              walletMode === 'deposit-wallet' ||
              proxyDeployed === false;
            const nextTradingWallet = shouldUseDepositWallet ? walletAddress : proxyAddress;
            const nextSignatureType: 2 | 3 = shouldUseDepositWallet ? 3 : 2;
            setTradingWalletAddress(nextTradingWallet);
            setTradingSignatureType(nextSignatureType);
            setWalletMode(shouldUseDepositWallet ? 'deposit-wallet' : 'legacy-proxy');
            if (nextTradingWallet && walletClient && address) {
              await ensureTradingSession(createViemSigner(walletClient, address), 137, {
                tradingWalletAddress: nextTradingWallet,
                signatureType: nextSignatureType,
              });
              setInitialized(true);
              setHasApiCreds(true);
            }
            return walletAddress;
          }
          setDepositWalletDeployed(false);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[wallet] deposit wallet deploy recheck failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      const deployedWallet = await ensureDepositWalletDeployedWithRelayer(relayClient);
      setDepositWalletAddress(deployedWallet);
      setDepositWalletDeployed(true);
      const shouldUseDepositWallet =
        options?.useDepositWallet === true ||
        depositWalletRequired ||
        walletMode === 'deposit-wallet' ||
        proxyDeployed === false;
      const nextTradingWallet = shouldUseDepositWallet ? deployedWallet : proxyAddress;
      const nextSignatureType: 2 | 3 = shouldUseDepositWallet ? 3 : 2;
      setTradingWalletAddress(nextTradingWallet);
      setTradingSignatureType(nextSignatureType);
      setWalletMode(shouldUseDepositWallet ? 'deposit-wallet' : 'legacy-proxy');
      if (nextTradingWallet && walletClient && address) {
        await ensureTradingSession(createViemSigner(walletClient, address), 137, {
          tradingWalletAddress: nextTradingWallet,
          signatureType: nextSignatureType,
        });
        setInitialized(true);
        setHasApiCreds(true);
      }
      return deployedWallet;
    })().finally(() => {
      ensureDepositWalletRef.current = null;
    });
    return ensureDepositWalletRef.current;
  }, [
    address,
    depositWalletAddress,
    depositWalletDeployed,
    depositWalletRequired,
    eoaAddress,
    proxyAddress,
    proxyDeployed,
    relayClient,
    walletClient,
    walletMode,
  ]);

  const requireDepositWalletFlow = useCallback(async () => {
    if (!address || !walletClient || chainId !== 137) {
      throw new Error('Wallet not ready for deposit wallet trading.');
    }
    writeDepositWalletRequired(address);
    setDepositWalletRequired(true);
    setWalletMode('deposit-wallet');
    setTradingWalletAddress(null);
    setTradingSignatureType(null);
    const walletAddress = await ensureDepositWalletDeployed({
      force: true,
      useDepositWallet: true,
    });
    setTradingWalletAddress(walletAddress);
    setTradingSignatureType(3);
    setWalletMode('deposit-wallet');
    await ensureTradingSession(createViemSigner(walletClient, address), chainId, {
      force: true,
      tradingWalletAddress: walletAddress,
      signatureType: 3,
    });
    setInitialized(true);
    setHasApiCreds(true);
    setError(null);
    return walletAddress;
  }, [address, chainId, ensureDepositWalletDeployed, walletClient]);

  const refreshProxyDeployment = useCallback(async () => {
    if (!relayClient) {
      throw new Error('Relayer client not ready.');
    }
    if (!proxyAddress) {
      throw new Error('Proxy address unavailable.');
    }
    try {
      const deployed = await relayClient.getDeployed(proxyAddress);
      setProxyDeployed(deployed);
      if (!depositWalletRequired) {
        setWalletMode(deployed ? 'legacy-proxy' : 'deposit-wallet');
        setTradingSignatureType(deployed ? 2 : 3);
        setTradingWalletAddress(deployed ? proxyAddress : depositWalletAddress);
      }
      setError(null);
    } catch (err) {
      setProxyDeployed(null);
      setError('Unable to check proxy deployment right now. Try again.');
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[wallet] relayer deploy check failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, [depositWalletAddress, depositWalletRequired, proxyAddress, relayClient]);

  const getTokenBalance = useCallback(
    async (token: string, address?: string) => {
      const owner = address ?? tradingWalletAddress ?? depositWalletAddress ?? proxyAddress;
      if (!owner) {
        throw new Error(
          'Trading wallet address unavailable.',
        );
      }
      const key = `${token.toLowerCase()}-${owner.toLowerCase()}`;
      const cached = balanceInFlightRef.current.get(key);
      if (cached) return cached;
      const request = publicClient
        .readContract({
          address: token as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [owner as `0x${string}`],
        })
        .then((balance) => balance as bigint)
        .finally(() => {
          balanceInFlightRef.current.delete(key);
        });
      balanceInFlightRef.current.set(key, request);
      return request;
    },
    [depositWalletAddress, publicClient, proxyAddress, tradingWalletAddress],
  );

  const syncBalanceAllowance = useCallback(async (params?: {
    assetType?: 'COLLATERAL' | 'CONDITIONAL';
    tokenId?: string;
    signatureType?: 2 | 3;
    tradingWalletAddress?: string;
  }) => {
    const resolvedSignatureType = params?.signatureType ?? tradingSignatureType;
    const resolvedTradingWallet = params?.tradingWalletAddress ?? tradingWalletAddress;
    if (!resolvedSignatureType || !resolvedTradingWallet) {
      throw new Error('Initializing trading session...');
    }
    let sessionReady = initialized && hasApiCreds;
    if (!sessionReady && walletClient && address && chainId === 137) {
      await ensureTradingSession(createViemSigner(walletClient, address), chainId, {
        tradingWalletAddress: resolvedTradingWallet,
        signatureType: resolvedSignatureType,
      });
      setInitialized(true);
      setHasApiCreds(true);
      setError(null);
      sessionReady = true;
    }
    if (!sessionReady) {
      throw new Error('Initializing trading session...');
    }
    const body = {
        assetType: params?.assetType ?? 'COLLATERAL',
        asset_type: params?.assetType ?? 'COLLATERAL',
        tokenId: params?.tokenId,
        token_id: params?.tokenId,
        signatureType: resolvedSignatureType,
        signature_type: resolvedSignatureType,
        tradingWalletAddress: resolvedTradingWallet,
        funderAddress: resolvedTradingWallet,
        connectedEoa: address,
      };
    const postUpdate = () =>
      fetch('/api/polymarket/balance-allowance/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    let res = await postUpdate();
    let errorData = !res.ok
      ? await res.json().catch(() => null) as { code?: string; error?: string } | null
      : null;
    if (!res.ok && walletClient && address && chainId === 137) {
      if (errorData?.code === AUTH_INVALID_SESSION_CODE || res.status === 401) {
        await ensureTradingSession(createViemSigner(walletClient, address), chainId, {
          force: true,
          tradingWalletAddress: resolvedTradingWallet,
          signatureType: resolvedSignatureType,
        });
        setInitialized(true);
        setHasApiCreds(true);
        setError(null);
        res = await postUpdate();
        errorData = !res.ok
          ? await res.json().catch(() => null) as { code?: string; error?: string } | null
          : null;
      }
    }
    if (!res.ok) {
      throw new Error(errorData?.error ?? 'Balance allowance update failed.');
    }
  }, [
    address,
    chainId,
    hasApiCreds,
    initialized,
    tradingSignatureType,
    tradingWalletAddress,
    walletClient,
  ]);

  const ensureApprovals = useCallback(
    async (token: string, spender: string, amount: bigint) => {
      if (!relayClient || !proxyAddress || !walletClient || !address) {
        throw new Error('Relayer client not ready.');
      }
      if (walletMode !== 'legacy-proxy') {
        throw new Error('Legacy proxy approval requested outside legacy wallet mode.');
      }
      const allowance = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [proxyAddress as `0x${string}`, spender as `0x${string}`],
      });
      if (typeof allowance === 'bigint' && allowance >= amount) {
        await syncBalanceAllowance({
          assetType: 'COLLATERAL',
          signatureType: 2,
          tradingWalletAddress: proxyAddress,
        });
        return;
      }
      await ensureProxyDeployed({ force: true });
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender as `0x${string}`, amount],
      });
      const response = await executeRelayerTransactions({
        client: relayClient,
        walletClient,
        address,
        txns: [{ to: token, data, value: '0' }],
        metadata: 'Approve collateral',
      });
      const txn = await response.wait();
      if (txn?.state === RelayerTransactionState.STATE_FAILED) {
        throw new Error('Relayer approval failed.');
      }
      await syncBalanceAllowance({
        assetType: 'COLLATERAL',
        signatureType: 2,
        tradingWalletAddress: proxyAddress,
      });
    },
    [
      relayClient,
      walletClient,
      address,
      publicClient,
      proxyAddress,
      ensureProxyDeployed,
      syncBalanceAllowance,
      walletMode,
    ],
  );

  const ensureDepositWalletApprovals = useCallback(
    async (token: string, spender: string, amount: bigint) => {
      if (!relayClient || !walletClient || !address) {
        throw new Error('Relayer client not ready.');
      }
      const walletAddress = await ensureDepositWalletDeployed({ force: true });
      const allowance = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [walletAddress as `0x${string}`, spender as `0x${string}`],
      });
      if (typeof allowance === 'bigint' && allowance >= amount) {
        await syncBalanceAllowance({
          assetType: 'COLLATERAL',
          signatureType: 3,
          tradingWalletAddress: walletAddress,
        });
        return;
      }
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender as `0x${string}`, amount],
      });
      await executeDepositWalletBatch({
        client: relayClient,
        walletClient,
        ownerAddress: address,
        walletAddress,
        calls: [{ target: token, data, value: '0' }],
      });
      await syncBalanceAllowance({
        assetType: 'COLLATERAL',
        signatureType: 3,
        tradingWalletAddress: walletAddress,
      });
    },
    [
      address,
      ensureDepositWalletDeployed,
      publicClient,
      relayClient,
      syncBalanceAllowance,
      walletClient,
    ],
  );

  const ensureDepositWalletConditionalApproval = useCallback(
    async (token: string, operator: string, tokenId: string) => {
      if (!relayClient || !walletClient || !address) {
        throw new Error('Relayer client not ready.');
      }
      const walletAddress = await ensureDepositWalletDeployed({ force: true });
      const approved = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: viemErc1155Abi,
        functionName: 'isApprovedForAll',
        args: [walletAddress as `0x${string}`, operator as `0x${string}`],
      });
      if (approved !== true) {
        const data = encodeFunctionData({
          abi: viemErc1155Abi,
          functionName: 'setApprovalForAll',
          args: [operator as `0x${string}`, true],
        });
        await executeDepositWalletBatch({
          client: relayClient,
          walletClient,
          ownerAddress: address,
          walletAddress,
          calls: [{ target: token, data, value: '0' }],
        });
      }
    },
    [
      address,
      ensureDepositWalletDeployed,
      publicClient,
      relayClient,
      walletClient,
    ],
  );

  const ensureOperatorApproval = useCallback(
    async (token: string, operator: string) => {
      if (!relayClient || !proxyAddress || !walletClient || !address) {
        throw new Error('Relayer client not ready.');
      }
      if (walletMode !== 'legacy-proxy') {
        throw new Error('Legacy proxy approval requested outside legacy wallet mode.');
      }
      const approved = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: viemErc1155Abi,
        functionName: 'isApprovedForAll',
        args: [proxyAddress as `0x${string}`, operator as `0x${string}`],
      });
      if (approved === true) return;
      await ensureProxyDeployed({ force: true });
      const data = encodeFunctionData({
        abi: viemErc1155Abi,
        functionName: 'setApprovalForAll',
        args: [operator as `0x${string}`, true],
      });
      const response = await executeRelayerTransactions({
        client: relayClient,
        walletClient,
        address,
        txns: [{ to: token, data, value: '0' }],
        metadata: 'Approve conditional tokens',
      });
      const txn = await response.wait();
      if (txn?.state === RelayerTransactionState.STATE_FAILED) {
        throw new Error('Relayer approval failed.');
      }
    },
    [relayClient, walletClient, address, publicClient, proxyAddress, ensureProxyDeployed, walletMode],
  );

  const redeemPositions = useCallback(
    async (params: {
      conditionId: string;
      outcomeSlotCount?: number;
      indexSets?: bigint[];
    }) => {
      if (!relayClient || !walletClient || !address) {
        throw new Error('Relayer client not ready.');
      }
      if (!chainId) {
        throw new Error('Chain unavailable.');
      }
      const { collateral, conditionalTokens } = getContractConfig(chainId);
      const indexSets =
        params.indexSets && params.indexSets.length
          ? params.indexSets
          : (() => {
              const count = params.outcomeSlotCount ?? 0;
              if (count <= 0) {
                return [];
              }
              if (count === 2) {
                return [1n, 2n];
              }
              return Array.from({ length: count }, (_, i) => 1n << BigInt(i));
            })();
      if (!indexSets.length) {
        throw new Error('Index sets unavailable for redemption.');
      }
      await ensureProxyDeployed({ force: true });
      const data = encodeFunctionData({
        abi: conditionalTokensAbi,
        functionName: 'redeemPositions',
        args: [
          collateral as `0x${string}`,
          ZERO_BYTES32,
          params.conditionId as `0x${string}`,
          indexSets,
        ],
      });
      const response = await executeRelayerTransactions({
        client: relayClient,
        walletClient,
        address,
        txns: [{ to: conditionalTokens, data, value: '0' }],
        metadata: 'Redeem positions',
      });
      const txn = await response.wait();
      if (txn?.state === RelayerTransactionState.STATE_FAILED) {
        throw new Error('Redeem failed.');
      }
    },
    [chainId, ensureProxyDeployed, relayClient, walletClient, address],
  );

  const getErc1155Balance = useCallback(
    async (token: string, tokenId: bigint, owner?: string) => {
      const holder = owner ?? proxyAddress;
      if (!holder) {
        throw new Error('Proxy address unavailable.');
      }
      const key = `${token.toLowerCase()}-${holder.toLowerCase()}-${tokenId.toString()}`;
      const cached = balanceInFlightRef.current.get(key);
      if (cached) return cached;
      const request = publicClient
        .readContract({
          address: token as `0x${string}`,
          abi: viemErc1155Abi,
          functionName: 'balanceOf',
          args: [holder as `0x${string}`, tokenId],
        })
        .then((balance) => balance as bigint)
        .finally(() => {
          balanceInFlightRef.current.delete(key);
        });
      balanceInFlightRef.current.set(key, request);
      return request;
    },
    [publicClient, proxyAddress],
  );

  const getUsdcBalance = useCallback(async () => {
    if (!chainId) {
      throw new Error('Chain unavailable.');
    }
    const { collateral } = getContractConfig(chainId);
    if (tradingWalletAddress || depositWalletAddress || proxyAddress) {
      const walletAddress =
        tradingWalletAddress ??
        (walletMode === 'legacy-proxy' ? proxyAddress : null) ??
        (walletMode === 'deposit-wallet' || depositWalletRequired || proxyDeployed === false
          ? depositWalletAddress
          : null) ??
        (await ensureDepositWalletDeployed({ force: true }));
      return getTokenBalance(collateral, walletAddress);
    }
    const proxy = proxyAddress ?? (await ensureProxyDeployed());
    return getTokenBalance(collateral, proxy);
  }, [
    chainId,
    depositWalletAddress,
    ensureDepositWalletDeployed,
    ensureProxyDeployed,
    getTokenBalance,
    proxyAddress,
    proxyDeployed,
    depositWalletRequired,
    tradingWalletAddress,
    walletMode,
  ]);

  const withdrawErc20 = useCallback(
    async (token: string, to: string, amount: bigint) => {
      if (!relayClient || !walletClient || !address) {
        throw new Error('Relayer client not ready.');
      }
      await ensureProxyDeployed({ force: true });
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as `0x${string}`, amount],
      });
      const response = await executeRelayerTransactions({
        client: relayClient,
        walletClient,
        address,
        txns: [{ to: token, data, value: '0' }],
        metadata: 'Withdraw USDC',
      });
      return response.wait();
    },
    [relayClient, walletClient, address, ensureProxyDeployed],
  );

  return useMemo(
    () => ({
      eoaAddress,
      proxyAddress,
      proxyDeployed,
      depositWalletAddress,
      depositWalletDeployed,
      tradingWalletAddress,
      tradingSignatureType,
      walletMode,
      depositWalletRequired,
      initialized,
      hasApiCreds,
      isLoading,
      lastRefreshAt,
      error,
      redeemPositions,
      ensureProxyDeployed,
      ensureDepositWalletDeployed,
      requireDepositWalletFlow,
      refreshProxyDeployment,
      ensureApprovals,
      ensureDepositWalletApprovals,
      ensureDepositWalletConditionalApproval,
      ensureOperatorApproval,
      syncBalanceAllowance,
      getUsdcBalance,
      withdrawErc20,
      getTokenBalance,
      getErc1155Balance,
    }),
    [
      eoaAddress,
      proxyAddress,
      proxyDeployed,
      depositWalletAddress,
      depositWalletDeployed,
      tradingWalletAddress,
      tradingSignatureType,
      walletMode,
      depositWalletRequired,
      initialized,
      hasApiCreds,
      isLoading,
      lastRefreshAt,
      error,
      redeemPositions,
      ensureProxyDeployed,
      ensureDepositWalletDeployed,
      requireDepositWalletFlow,
      refreshProxyDeployment,
      ensureApprovals,
      ensureDepositWalletApprovals,
      ensureDepositWalletConditionalApproval,
      ensureOperatorApproval,
      syncBalanceAllowance,
      getUsdcBalance,
      withdrawErc20,
      getTokenBalance,
      getErc1155Balance,
    ],
  );
};
