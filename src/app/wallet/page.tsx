'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { encodeFunctionData, formatUnits, parseUnits, erc20Abi } from 'viem';
import { polygon } from 'viem/chains';
import { formatDistanceToNow } from 'date-fns';
import type { RelayClient } from '@polymarket/builder-relayer-client';
import { RelayerTransactionState } from '@polymarket/builder-relayer-client';
import { getContractConfig } from '@polymarket/clob-client-v2';
import { useTheme } from '@/components/theme-context';
import { useInjectedWallet } from '@/hooks/useInjectedWallet';
import { usePolymarketSession } from '@/lib/polymarket/usePolymarketSession';
import {
  createRelayClient,
  deploySafeIfNeeded,
  executeRelayerTransactions,
  loadStoredProxyAddress,
  storeProxyAddress,
} from '@/lib/polymarket/relayer';
import { getPolygonPublicClient } from '@/lib/wallet/publicClient';
import { SafeRemoteImage } from '@/components/ui/SafeRemoteImage';
import {
  bodyText,
  buttonPrimary,
  buttonSecondaryDark,
  buttonSecondaryLight,
  cardBase,
  cardLabel,
  cardSurfaceDark,
  cardSurfaceLight,
  chipLive,
  chipMutedDark,
  chipMutedLight,
  chipSuccess,
  inputBaseDark,
  inputBaseLight,
  modalBaseDark,
  modalBaseLight,
  pageTitle,
  sectionTitle,
} from '@/lib/ui/classes';

type PositionRow = {
  marketId: string | null;
  conditionId: string | null;
  marketTitle: string;
  outcomeLabel: string;
  tokenId: string | null;
  balanceBase: bigint;
  price: number | null;
  thumbnailUrl: string | null;
  createdAt: Date | null;
  closed: boolean;
  resolved: boolean;
  redeemable: boolean;
};

type MarketStatus = {
  closed: boolean;
  resolved: boolean;
  conditionId: string | null;
  outcomeCount: number | null;
  outcomeTokenIds: string[];
  outcomes: string[];
  winningOutcomeId: string | null;
  winningOutcome: string | null;
};

type RelayUsage = {
  todayRelayTransactions: number;
  remainingEstimated: number;
};

const normalizePositionOutcome = (value: string): 'yes' | 'no' => {
  const raw = value.trim().toLowerCase();
  if (raw === 'no' || raw === 'n' || raw === 'down' || raw === 'false') return 'no';
  return 'yes';
};

const normalizeOutcomeLabel = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? '';

const getWinningOutcomeIndex = (row: PositionRow, marketStatus?: MarketStatus) => {
  if (!marketStatus?.resolved) return null;
  if (row.tokenId && marketStatus.winningOutcomeId && row.tokenId === marketStatus.winningOutcomeId) {
    const index = marketStatus.outcomeTokenIds.findIndex((tokenId) => tokenId === row.tokenId);
    return index >= 0 ? index : null;
  }
  if (
    marketStatus.winningOutcome &&
    normalizeOutcomeLabel(row.outcomeLabel) === normalizeOutcomeLabel(marketStatus.winningOutcome)
  ) {
    const index = marketStatus.outcomes.findIndex(
      (outcome) => normalizeOutcomeLabel(outcome) === normalizeOutcomeLabel(marketStatus.winningOutcome),
    );
    if (index < 0) return null;
    const outcomeTokenId = marketStatus.outcomeTokenIds[index];
    return row.tokenId && outcomeTokenId === row.tokenId ? index : null;
  }
  return null;
};

const isClosedMarketPayload = (market: Record<string, unknown>): boolean => {
  if (market.resolved === true || market.closed === true || market.isClosed === true) {
    return true;
  }
  if (typeof market.status === 'string') {
    const status = market.status.toLowerCase();
    if (['closed', 'resolved', 'finalized', 'settled'].includes(status)) return true;
  }
  return Boolean(market.closedTime);
};

const fetchMarketStatuses = async (marketIds: string[]): Promise<Record<string, MarketStatus>> => {
  const entries = await Promise.all(
    marketIds.map(async (marketId) => {
      try {
        const res = await fetch(`/api/markets/${encodeURIComponent(marketId)}`);
        if (!res.ok) {
          return [
            marketId,
            {
              closed: false,
              resolved: false,
              conditionId: null,
              outcomeCount: null,
              outcomeTokenIds: [],
              outcomes: [],
              winningOutcomeId: null,
              winningOutcome: null,
            },
          ] as const;
        }
        const market = (await res.json()) as Record<string, unknown>;
        const outcomeTokenIds = Array.isArray(market.outcomeTokenIds)
          ? market.outcomeTokenIds.filter((tokenId): tokenId is string => typeof tokenId === 'string')
          : [];
        const outcomes = Array.isArray(market.outcomes)
          ? market.outcomes.filter((outcome): outcome is string => typeof outcome === 'string')
          : [];
        return [
          marketId,
          {
            closed: isClosedMarketPayload(market),
            resolved: market.resolved === true,
            conditionId:
              typeof market.conditionId === 'string'
                ? market.conditionId
                : null,
            outcomeCount: outcomeTokenIds.length || outcomes.length || null,
            outcomeTokenIds,
            outcomes,
            winningOutcomeId:
              typeof market.winningOutcomeId === 'string'
                ? market.winningOutcomeId
                : null,
            winningOutcome:
              typeof market.winningOutcome === 'string'
                ? market.winningOutcome
                : null,
          },
        ] as const;
      } catch {
        return [
          marketId,
          {
            closed: false,
            resolved: false,
            conditionId: null,
            outcomeCount: null,
            outcomeTokenIds: [],
            outcomes: [],
            winningOutcomeId: null,
            winningOutcome: null,
          },
        ] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
};

const fetchRelayUsage = async (): Promise<RelayUsage> => {
  const res = await fetch('/api/admin/relay-usage', { cache: 'no-store' });
  const data = (await res.json()) as RelayUsage | { error?: string };
  if (
    !res.ok ||
    !('todayRelayTransactions' in data) ||
    typeof data.todayRelayTransactions !== 'number'
  ) {
    throw new Error('error' in data && data.error ? data.error : 'Unable to load relay usage.');
  }
  return data;
};

const fetchPositions = async (address: string): Promise<PositionRow[]> => {
  const params = new URLSearchParams({ user: address });
  const res = await fetch(`/api/positions?${params.toString()}`);
  const data = (await res.json()) as
    | {
        ok: boolean;
        positions?: Array<Record<string, unknown>>;
        error?: string;
        status?: number;
      }
    | Array<Record<string, unknown>>;
  if (!res.ok || ('ok' in data && !data.ok)) {
    const status =
      'status' in data && typeof data.status === 'number' ? data.status : res.status;
    const errorMessage =
      'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Positions request failed';
    throw new Error(`${errorMessage} (${status})`);
  }
  const rows = Array.isArray(data) ? data : data.positions ?? [];
  return rows
    .map((row) => {
      const conditionId = (row.conditionId ?? row.condition_id) as string | null;
      const marketId =
        (row.marketId ?? row.market_id ?? conditionId) as string | null;
      const marketTitle = (row.title ?? row.marketTitle ?? row.market) as
        | string
        | undefined;
      const outcomeLabel = (row.outcome ?? row.outcomeLabel ?? 'Outcome') as string;
      const tokenId = (row.asset ?? row.tokenId ?? row.token_id) as string | null;
      const rawSize = (row.size ?? row.balance ?? row.shares ?? '0') as
        | string
        | number;
      const thumbnailUrl = (row.thumbnailUrl ??
        row.image ??
        row.imageUrl ??
        row.marketImage ??
        row.icon) as string | null;
      const rawTimestamp = (row.timestamp ??
        row.createdAt ??
        row.updatedAt ??
        row.time) as string | number | null;
      const createdAt =
        rawTimestamp != null && rawTimestamp !== ''
          ? new Date(rawTimestamp)
          : null;
      const balanceBase =
        typeof rawSize === 'number'
          ? parseUnits(rawSize.toString(), 6)
          : parseUnits(String(rawSize), 6);
      const price = typeof row.curPrice === 'number' ? row.curPrice : null;
      const closed = row.closed === true || row.isClosed === true;
      const resolved = row.resolved === true || row.isResolved === true;
      const redeemable = row.redeemable === true;
      return {
        marketId,
        conditionId,
        marketTitle: marketTitle ?? 'Unknown market',
        outcomeLabel,
        tokenId,
        balanceBase,
        price,
        thumbnailUrl,
        createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
        closed,
        resolved,
        redeemable,
      };
    })
    .filter((row) => row.marketId && row.tokenId && row.balanceBase > 0n);
};

export default function WalletPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const {
    address,
    chainId,
    isConnected,
    isCorrectNetwork,
    providerAvailable,
    walletClient,
    connect,
    ensurePolygon,
  } = useInjectedWallet();
  const publicClient = useMemo(() => getPolygonPublicClient(), []);
  const polymarketSession = usePolymarketSession(walletClient, address, chainId);
  const [relayerClient, setRelayerClient] = useState<RelayClient | null>(null);
  const [proxyAddress, setProxyAddress] = useState<string | null>(null);
  const [proxyDeployed, setProxyDeployed] = useState<boolean | null>(null);
  const [depositWalletAddress, setDepositWalletAddress] = useState<string | null>(null);
  const [depositWalletDeployed, setDepositWalletDeployed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [redeemingKey, setRedeemingKey] = useState<string | null>(null);
  const [redeemedKeys, setRedeemedKeys] = useState<Set<string>>(() => new Set());
  const [redeemMessages, setRedeemMessages] = useState<Record<string, string>>({});
  const isWalletReady = isConnected && isCorrectNetwork;
  const tradingWalletAddress =
    proxyDeployed === true
      ? proxyAddress
      : proxyDeployed === false
        ? depositWalletAddress
        : null;
  const isResolvingTradingWallet = isWalletReady && !tradingWalletAddress && !status;
  const shortProxyAddress = proxyAddress
    ? `${proxyAddress.slice(0, 6)}...${proxyAddress.slice(-4)}`
    : null;
  const shortTradingWalletAddress = tradingWalletAddress
    ? `${tradingWalletAddress.slice(0, 6)}...${tradingWalletAddress.slice(-4)}`
    : null;
  const shortDepositWalletAddress = depositWalletAddress
    ? `${depositWalletAddress.slice(0, 6)}...${depositWalletAddress.slice(-4)}`
    : null;
  const tradingWalletStatusLabel = !isConnected
    ? 'Not connected'
    : !isCorrectNetwork
      ? 'Unavailable'
      : isResolvingTradingWallet
        ? 'Resolving'
        : tradingWalletAddress
          ? 'Connected'
          : 'Unavailable';
  const buttonSecondary = isDark ? buttonSecondaryDark : buttonSecondaryLight;
  const chipMuted = isDark ? chipMutedDark : chipMutedLight;
  const inputBase = isDark ? inputBaseDark : inputBaseLight;
  const modalBase = isDark ? modalBaseDark : modalBaseLight;
  const cardSurface = isDark ? cardSurfaceDark : cardSurfaceLight;

  useEffect(() => {
    if (!walletClient || !isConnected || !address || chainId !== 137) {
      setRelayerClient(null);
      setProxyAddress(null);
      setProxyDeployed(null);
      setDepositWalletAddress(null);
      setDepositWalletDeployed(null);
      setStatus(null);
      return;
    }
    const relayer = createRelayClient(walletClient);
    setRelayerClient(relayer);
    (async () => {
      try {
        const safe = await (
          relayer as unknown as { getExpectedSafe: () => Promise<string> }
        ).getExpectedSafe();
        const cached = loadStoredProxyAddress(address);
        let resolvedSafe = cached ?? safe;
        let deployed = await relayer.getDeployed(resolvedSafe);
        if (!deployed && cached && resolvedSafe !== safe) {
          const expectedDeployed = await relayer.getDeployed(safe);
          if (expectedDeployed) {
            resolvedSafe = safe;
            deployed = true;
          }
        }
        if (deployed) {
          storeProxyAddress(address, resolvedSafe);
        }
        setProxyAddress(resolvedSafe);
        setProxyDeployed(deployed);
        const resolvedDepositWallet = await relayer.deriveDepositWalletAddress();
        const resolvedDepositWalletDeployed = await relayer.getDeployed(
          resolvedDepositWallet,
          'WALLET',
        );
        setDepositWalletAddress(resolvedDepositWallet);
        setDepositWalletDeployed(resolvedDepositWalletDeployed);
        console.info('[wallet]', {
          event: 'wallet_page_resolved_trading_wallet',
          connectedEoa: address,
          proxyWalletAddress: resolvedSafe,
          depositWalletAddress: resolvedDepositWallet,
          depositWalletDeployed: resolvedDepositWalletDeployed,
        });
        setStatus(null);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Unable to load wallet.');
        setProxyDeployed(null);
        setDepositWalletAddress(null);
        setDepositWalletDeployed(null);
      }
    })();
  }, [address, chainId, isConnected, walletClient]);

  const retryProxyDeployment = useCallback(async () => {
    if (!relayerClient || !address) return;
    try {
      let nextProxy = proxyAddress;
      if (!nextProxy) {
        nextProxy = await (
          relayerClient as unknown as { getExpectedSafe: () => Promise<string> }
        ).getExpectedSafe();
      }
      const deployed = await relayerClient.getDeployed(nextProxy);
      setProxyAddress(nextProxy);
      setProxyDeployed(deployed);
      setStatus(null);
    } catch (err) {
      setProxyDeployed(null);
      setStatus('Unable to check proxy deployment right now.');
    }
  }, [address, proxyAddress, relayerClient]);

  const positionsQuery = useQuery({
    queryKey: ['wallet-positions', tradingWalletAddress],
    enabled: Boolean(tradingWalletAddress),
    queryFn: async () => fetchPositions(tradingWalletAddress!),
  });
  const relayUsageQuery = useQuery({
    queryKey: ['admin-relay-usage'],
    queryFn: fetchRelayUsage,
    refetchInterval: 60_000,
  });

  const { collateral } = getContractConfig(polygon.id);
  const usdcBalanceQuery = useQuery({
    queryKey: ['wallet-usdc-balance', tradingWalletAddress],
    enabled: Boolean(tradingWalletAddress && publicClient),
    queryFn: async () => {
      const walletAddress = tradingWalletAddress;
      if (!publicClient || !walletAddress) return 0n;
      return publicClient.readContract({
        abi: erc20Abi,
        address: collateral as `0x${string}`,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      }) as Promise<bigint>;
    },
  });

  const positionsValue = useMemo(() => {
    if (!positionsQuery.data?.length) return null;
    return positionsQuery.data.reduce((sum, row) => {
      const amount = Number(formatUnits(row.balanceBase, 6));
      const price = row.price ?? 0;
      return sum + amount * price;
    }, 0);
  }, [positionsQuery.data]);

  const ensureProxyDeployed = useCallback(async () => {
    if (!relayerClient || !address) {
      throw new Error('Relayer client not ready.');
    }
    if (proxyDeployed === true) return proxyAddress;
    if (!proxyAddress) {
      throw new Error('Proxy address unavailable.');
    }
    if (proxyDeployed === null) {
      const deployed = await relayerClient.getDeployed(proxyAddress);
      if (deployed === null) {
        setProxyDeployed(null);
        throw new Error('Proxy deployment status unknown. Retry.');
      }
      setProxyDeployed(deployed);
      if (deployed) return proxyAddress;
    }
    const safe = await deploySafeIfNeeded(relayerClient, address);
    setProxyDeployed(true);
    setProxyAddress(safe);
    return safe;
  }, [address, proxyAddress, proxyDeployed, relayerClient]);

  const handleWithdraw = async () => {
    if (!relayerClient || !proxyAddress || !walletClient || !address) {
      setStatus('Connect a wallet to withdraw.');
      return;
    }
    if (!withdrawTo.trim()) {
      setStatus('Enter a destination address.');
      return;
    }
    const parsed = Number(withdrawAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStatus('Enter a valid amount.');
      return;
    }
    setWithdrawBusy(true);
    setStatus(null);
    try {
      await ensureProxyDeployed();
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [withdrawTo as `0x${string}`, parseUnits(withdrawAmount, 6)],
      });
      const response = await executeRelayerTransactions({
        client: relayerClient,
        walletClient,
        address,
        txns: [{ to: collateral, data, value: '0' }],
        metadata: 'Withdraw USDC',
      });
      const txn = await response.wait();
      if (txn?.state === RelayerTransactionState.STATE_FAILED) {
        throw new Error('Withdraw failed.');
      }
      setWithdrawAmount('');
      setWithdrawOpen(false);
      usdcBalanceQuery.refetch().catch(() => null);
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('Session not initialized')
          ? 'Relayer session expired. Please refresh and try again.'
          : err instanceof Error
            ? err.message
            : 'Withdraw failed.';
      setStatus(message);
    } finally {
      setWithdrawBusy(false);
    }
  };

  const openPositions = useMemo(() => positionsQuery.data ?? [], [positionsQuery.data]);
  const positionMarketIds = useMemo(
    () =>
      Array.from(
        new Set(
          openPositions
            .map((row) => row.marketId ?? row.conditionId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [openPositions],
  );
  const marketStatusesQuery = useQuery({
    queryKey: ['wallet-position-market-statuses', positionMarketIds],
    enabled: positionMarketIds.length > 0,
    queryFn: async () => fetchMarketStatuses(positionMarketIds),
    staleTime: 30_000,
  });

  const handleSellPosition = useCallback(
    (row: PositionRow) => {
      const marketId = row.marketId ?? row.conditionId;
      if (!marketId || !row.tokenId || row.balanceBase <= 0n) return;
      const params = new URLSearchParams();
      params.set('trade', marketId);
      params.set('outcome', normalizePositionOutcome(row.outcomeLabel));
      params.set('side', 'sell');
      params.set('tokenId', row.tokenId);
      params.set('maxShares', formatUnits(row.balanceBase, 6));
      params.set('orderType', 'market');
      params.set('tradeSession', `wallet-${marketId}-${row.tokenId}-${Date.now()}`);
      router.push(`/?${params.toString()}`);
    },
    [router],
  );

  const handleRedeemPosition = useCallback(
    async (row: PositionRow, marketStatus: MarketStatus | undefined) => {
      const marketId = row.marketId ?? row.conditionId;
      const rowKey = `${marketId ?? 'market'}-${row.tokenId ?? row.outcomeLabel}`;
      const winningOutcomeIndex = getWinningOutcomeIndex(row, marketStatus);
      if (
        !marketId ||
        !marketStatus?.resolved ||
        !row.redeemable ||
        !row.tokenId ||
        winningOutcomeIndex == null
      ) {
        setRedeemMessages((current) => ({
          ...current,
          [rowKey]: 'This position is not eligible for redemption.',
        }));
        return;
      }
      if (redeemingKey || redeemedKeys.has(rowKey)) return;
      setRedeemingKey(rowKey);
      setRedeemMessages((current) => ({ ...current, [rowKey]: 'Submitting redemption...' }));
      try {
        const res = await fetch('/api/polymarket/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            marketId,
            proxyWalletAddress: tradingWalletAddress,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          conditionId?: string;
          outcomeCount?: number;
          error?: string;
        };
        const conditionId = data.conditionId ?? marketStatus.conditionId;
        const outcomeCount = data.outcomeCount ?? marketStatus.outcomeCount;
        if (!res.ok || !data.ok || !conditionId || !outcomeCount) {
          throw new Error(data.error ?? 'Redeem validation failed.');
        }
        console.info('[wallet] redeem requested', {
          conditionId,
          tokenId: row.tokenId,
          outcomeIndex: winningOutcomeIndex,
          resolved: marketStatus.resolved,
          redeemable: row.redeemable,
        });
        await polymarketSession.redeemPositions({
          conditionId,
          outcomeSlotCount: outcomeCount,
          indexSets: [1n << BigInt(winningOutcomeIndex)],
          tokenId: row.tokenId,
          outcomeIndex: winningOutcomeIndex,
          redeemable: row.redeemable,
          marketResolved: marketStatus.resolved,
        });
        setRedeemedKeys((current) => {
          const next = new Set(current);
          next.add(rowKey);
          return next;
        });
        setRedeemMessages((current) => ({
          ...current,
          [rowKey]: 'Redeem submitted. USDC balance will update shortly.',
        }));
        await Promise.all([
          usdcBalanceQuery.refetch(),
          positionsQuery.refetch(),
          marketStatusesQuery.refetch(),
          relayUsageQuery.refetch(),
        ]);
      } catch (error) {
        setRedeemMessages((current) => ({
          ...current,
          [rowKey]: error instanceof Error ? error.message : 'Redeem failed.',
        }));
      } finally {
        setRedeemingKey(null);
      }
    },
    [
      marketStatusesQuery,
      polymarketSession,
      positionsQuery,
      redeemedKeys,
      redeemingKey,
      relayUsageQuery,
      tradingWalletAddress,
      usdcBalanceQuery,
    ],
  );

  return (
    <main
      className={
        isDark
          ? 'min-h-screen bg-[#0b1224] text-slate-100'
          : 'min-h-screen bg-slate-50 text-slate-900'
      }
    >
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className={`${cardLabel} text-blue-400`}>Wallet</p>
            <h1 className={pageTitle}>Portfolio</h1>
            <p className={`${bodyText} ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
              Track your trading wallet, bridge deposit, balances, and positions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!providerAvailable && (
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
                className={`${buttonSecondary} h-9 px-4 text-xs font-semibold`}
              >
                Install wallet
              </a>
            )}
            {providerAvailable && !isConnected && (
              <button
                type="button"
                onClick={() => connect().catch(() => null)}
                className={`${buttonPrimary} h-9 px-4 text-xs font-semibold`}
              >
                Connect wallet
              </button>
            )}
            {providerAvailable && isConnected && !isCorrectNetwork && (
              <button
                type="button"
                onClick={() => ensurePolygon().catch(() => null)}
                className={`${buttonSecondary} h-9 px-4 text-xs font-semibold`}
              >
                Switch to Polygon
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className={`${cardBase} ${cardSurface} p-4`}>
            <p className={`${cardLabel} text-white/50`}>Trading wallet balance</p>
            <p className="mt-2 text-2xl font-semibold">
              {usdcBalanceQuery.data
                ? `$${Number(formatUnits(usdcBalanceQuery.data as bigint, 6)).toFixed(2)}`
                : '-'}
            </p>
            <p className={`mt-2 text-[11px] ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
              Trading/funder wallet USDC on Polygon
            </p>
          </div>
          <div className={`${cardBase} ${cardSurface} p-4`}>
            <p className={`${cardLabel} text-white/50`}>Positions value</p>
            <p className="mt-2 text-2xl font-semibold">
              {positionsValue != null ? `$${positionsValue.toFixed(2)}` : '-'}
            </p>
            <p className={`mt-2 text-[11px] ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
              Estimated mark value
            </p>
          </div>
          <div className={`${cardBase} ${cardSurface} p-4`}>
            <p className={`${cardLabel} text-white/50`}>Total P&L</p>
            <p className="mt-2 text-2xl font-semibold">-</p>
            <p className={`mt-2 text-[11px] ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
              Coming soon
            </p>
          </div>
          <div className={`${cardBase} ${cardSurface} p-4`}>
            <p className={`${cardLabel} text-white/50`}>Relay usage today</p>
            <p className="mt-2 text-2xl font-semibold">
              {relayUsageQuery.data
                ? `${relayUsageQuery.data.todayRelayTransactions} / 100`
                : '- / 100'}
            </p>
            <p className={`mt-2 text-[11px] ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
              {relayUsageQuery.data
                ? `${relayUsageQuery.data.remainingEstimated} estimated remaining`
                : 'Builder relayer transactions'}
            </p>
          </div>
        </div>

        <div className={`${cardBase} ${cardSurface} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`${cardLabel} text-white/50`}>Trading wallet</p>
              {!isConnected && (
                <p className="mt-2 text-sm font-semibold">
                  Connect a wallet to view your trading wallet.
                </p>
              )}
              {isConnected && !isCorrectNetwork && (
                <p className="mt-2 text-sm font-semibold">
                  Switch to Polygon to view your trading wallet.
                </p>
              )}
              {isWalletReady && isResolvingTradingWallet && (
                <p className="mt-2 text-sm font-semibold">Resolving trading wallet...</p>
              )}
              {isWalletReady && tradingWalletAddress && (
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="font-mono">{shortTradingWalletAddress}</span>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(tradingWalletAddress).catch(() => null)
                    }
                    className={`${buttonSecondary} h-7 px-2 text-[10px] font-semibold`}
                    aria-label="Copy trading wallet address"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  tradingWalletStatusLabel === 'Connected'
                    ? chipSuccess
                    : tradingWalletStatusLabel === 'Resolving'
                      ? chipLive
                      : chipMuted
                }
              >
                {tradingWalletStatusLabel}
              </span>
              {isWalletReady && (
                <button
                  type="button"
                  onClick={retryProxyDeployment}
                  className={`${buttonSecondary} h-7 px-3 text-[11px] font-semibold`}
                >
                  Refresh
                </button>
              )}
              {isWalletReady && proxyDeployed === true && proxyAddress && (
                <button
                  type="button"
                  onClick={() => setWithdrawOpen(true)}
                  className={`${buttonPrimary} h-9 px-4 text-xs font-semibold`}
                >
                  Withdraw
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div
              className={`rounded-xl border px-3 py-2 ${
                isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Trading/funder
              </p>
              <p className="mt-1 font-mono text-sm">{shortTradingWalletAddress ?? '-'}</p>
            </div>
            <div
              className={`rounded-xl border px-3 py-2 ${
                isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Bridge deposit
              </p>
              <p className="mt-1 font-mono text-sm">{shortDepositWalletAddress ?? '-'}</p>
            </div>
          </div>
          {status && <p className="mt-3 text-xs text-red-400">{status}</p>}
          {isWalletReady && depositWalletAddress && (
            <p className="mt-3 text-[11px] text-slate-500">
              The bridge deposit address is used for deposit-wallet funding.
            </p>
          )}
        </div>

        <div className={`${cardBase} ${cardSurface} p-5`}>
          <div className="flex items-center justify-between">
            <p className={sectionTitle}>Trades</p>
            <span className="text-xs text-slate-400">
              {positionsQuery.isLoading
                ? 'Loading...'
                : `${openPositions.length} trades`}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {openPositions.length === 0 && !positionsQuery.isLoading && (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
                No trades yet.
              </div>
            )}
            {openPositions.map((row) => {
              const amountValue = Number(formatUnits(row.balanceBase, 6));
              const amountLabel =
                amountValue > 0 && amountValue < 0.01 ? '<0.01' : amountValue.toFixed(2);
              const marketId = row.marketId ?? row.conditionId ?? '';
              const marketStatus = marketStatusesQuery.data?.[marketId];
              const isMarketClosed = row.closed || marketStatus?.closed === true;
              const isMarketResolved = row.resolved || marketStatus?.resolved === true;
              const isSettlementState = isMarketClosed || isMarketResolved;
              const rowKey = `${marketId || 'market'}-${row.tokenId ?? row.outcomeLabel}`;
              const winningOutcomeIndex = getWinningOutcomeIndex(row, marketStatus);
              const positionWon = winningOutcomeIndex != null;
              const isRedeeming = redeemingKey === rowKey;
              const isRedeemed = redeemedKeys.has(rowKey);
              const isCheckingRedemption = isSettlementState && !marketStatus;
              const canRedeem =
                Boolean(tradingWalletAddress) &&
                marketStatus?.resolved === true &&
                row.redeemable === true &&
                positionWon &&
                row.tokenId != null &&
                Boolean(marketStatus?.conditionId) &&
                Boolean(marketStatus?.outcomeCount) &&
                !isRedeemed &&
                !isRedeeming;
              const sellDisabled =
                row.balanceBase <= 0n || !row.tokenId || !marketId || isSettlementState;
              const actionDisabled =
                isSettlementState
                  ? !canRedeem
                  : sellDisabled;
              const timestampLabel =
                row.createdAt != null
                  ? formatDistanceToNow(row.createdAt, { addSuffix: true })
                  : null;
              return (
                <div
                  key={`${row.marketId}-${row.tokenId}`}
                  className={`flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3 ${
                    isDark
                      ? 'border-white/10 bg-white/[0.03]'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {row.thumbnailUrl ? (
                      <div
                        className={`relative h-12 w-12 overflow-hidden rounded-xl border ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/70'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <SafeRemoteImage
                          src={row.thumbnailUrl}
                          alt={row.marketTitle}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border text-sm font-semibold ${
                          isDark
                            ? 'border-slate-700 bg-slate-900/70 text-slate-200'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {row.marketTitle.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold">{row.marketTitle}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className={chipMuted}>{row.outcomeLabel}</span>
                        {timestampLabel && <span>{timestampLabel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-3 text-sm sm:gap-6">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Amount</p>
                      <p className="font-semibold">{amountLabel} shares</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Price paid</p>
                      <p className="font-semibold">
                        {row.price != null ? `${Math.round(row.price * 100)}c` : '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSettlementState) {
                          handleRedeemPosition(row, marketStatus).catch(() => null);
                          return;
                        }
                        handleSellPosition(row);
                      }}
                      disabled={actionDisabled}
                      title={
                        isSettlementState
                          ? isCheckingRedemption
                            ? 'Checking redemption status'
                            : !isMarketResolved
                              ? 'Market is closed but not resolved yet'
                              : positionWon && row.redeemable
                            ? isRedeemed
                              ? 'Redemption already submitted'
                              : 'Claim winning shares'
                              : positionWon
                                ? 'Payout is not redeemable yet'
                                : 'This outcome did not win'
                          : row.balanceBase <= 0n
                            ? 'No shares available'
                            : undefined
                      }
                      className={`${buttonSecondary} h-8 px-3 text-xs font-semibold ${
                        actionDisabled ? 'opacity-50' : ''
                      }`}
                    >
                      {isSettlementState
                        ? isCheckingRedemption
                          ? 'Checking...'
                          : !isMarketResolved
                            ? 'Market closed'
                            : positionWon && row.redeemable
                          ? isRedeeming
                            ? 'Redeeming...'
                            : isRedeemed
                              ? 'Redeemed'
                              : 'Claim Winnings'
                            : positionWon
                              ? 'Not redeemable'
                              : 'No payout'
                        : 'Sell'}
                    </button>
                  </div>
                  {redeemMessages[rowKey] && (
                    <p
                      className={`basis-full text-right text-xs ${
                        redeemMessages[rowKey].includes('submitted')
                          || redeemMessages[rowKey].includes('Submitting')
                          ? isDark
                            ? 'text-blue-300'
                            : 'text-blue-700'
                          : 'text-red-400'
                      }`}
                    >
                      {redeemMessages[rowKey]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {withdrawOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setWithdrawOpen(false)}
          />
          <div className={`relative w-full max-w-md ${modalBase}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                  Withdraw
                </p>
                <h2 className="text-lg font-semibold">Send USDC</h2>
              </div>
              <button
                type="button"
                onClick={() => setWithdrawOpen(false)}
                className={`${buttonSecondary} h-7 px-3 text-xs font-semibold`}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <input
                type="text"
                value={withdrawTo}
                onChange={(event) => setWithdrawTo(event.target.value.trim())}
                placeholder="Destination address"
                className={`${inputBase} text-xs`}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                placeholder="Amount"
                className={`${inputBase} text-xs`}
              />
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={withdrawBusy}
                className={`${buttonPrimary} h-9 w-full px-4 text-xs font-semibold`}
              >
                {withdrawBusy ? 'Withdrawing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
