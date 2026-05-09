'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { encodeFunctionData, formatUnits, parseUnits, erc20Abi } from 'viem';
import { polygon } from 'viem/chains';
import { formatDistanceToNow } from 'date-fns';
import type { RelayClient } from '@polymarket/builder-relayer-client';
import { RelayerTransactionState } from '@polymarket/builder-relayer-client';
import { getContractConfig } from '@polymarket/clob-client-v2';
import { useTheme } from '@/components/theme-context';
import { useInjectedWallet } from '@/hooks/useInjectedWallet';
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
      };
    })
    .filter((row) => row.marketId && row.tokenId && row.balanceBase > 0n);
};

export default function WalletPage() {
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
  const isWalletReady = isConnected && isCorrectNetwork;
  const isResolvingTradingWallet =
    isWalletReady && depositWalletDeployed === null && !status;
  const shortProxyAddress = proxyAddress
    ? `${proxyAddress.slice(0, 6)}...${proxyAddress.slice(-4)}`
    : null;
  const shortTradingWalletAddress = depositWalletAddress
    ? `${depositWalletAddress.slice(0, 6)}...${depositWalletAddress.slice(-4)}`
    : null;
  const tradingWalletStatusLabel = !isConnected
    ? 'Not connected'
    : !isCorrectNetwork
      ? 'Unavailable'
      : isResolvingTradingWallet
        ? 'Resolving'
        : depositWalletAddress
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
    queryKey: ['wallet-positions', depositWalletAddress ?? proxyAddress],
    enabled: Boolean(depositWalletAddress ?? proxyAddress),
    queryFn: async () => fetchPositions((depositWalletAddress ?? proxyAddress)!),
  });

  const { collateral } = getContractConfig(polygon.id);
  const usdcBalanceQuery = useQuery({
    queryKey: ['wallet-usdc-balance', depositWalletAddress ?? proxyAddress],
    enabled: Boolean((depositWalletAddress ?? proxyAddress) && publicClient),
    queryFn: async () => {
      const walletAddress = depositWalletAddress ?? proxyAddress;
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

  const openPositions = positionsQuery.data ?? [];

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
              Track your deposit wallet balances and positions.
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

        <div className="grid gap-4 md:grid-cols-3">
          <div className={`${cardBase} ${cardSurface} p-4`}>
            <p className={`${cardLabel} text-white/50`}>Trading wallet balance</p>
            <p className="mt-2 text-2xl font-semibold">
              {usdcBalanceQuery.data
                ? `$${Number(formatUnits(usdcBalanceQuery.data as bigint, 6)).toFixed(2)}`
                : '-'}
            </p>
            <p className={`mt-2 text-[11px] ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
              Deposit wallet USDC on Polygon
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
        </div>

        <div className={`${cardBase} ${cardSurface} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`${cardLabel} text-white/50`}>Trading wallet</p>
              {!isConnected && (
                <p className="mt-2 text-sm font-semibold">
                  Connect a wallet to view the deposit wallet.
                </p>
              )}
              {isConnected && !isCorrectNetwork && (
                <p className="mt-2 text-sm font-semibold">
                  Switch to Polygon to view the deposit wallet.
                </p>
              )}
              {isWalletReady && !depositWalletAddress && (
                <p className="mt-2 text-sm font-semibold">Resolving deposit wallet...</p>
              )}
              {isWalletReady && depositWalletAddress && (
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="font-mono">{shortTradingWalletAddress}</span>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(depositWalletAddress).catch(() => null)
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
              {isWalletReady && proxyAddress && (
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
          {status && <p className="mt-3 text-xs text-red-400">{status}</p>}
          {isWalletReady && depositWalletAddress && (
            <p className="mt-3 text-[11px] text-slate-500">
              Send USDC on Polygon to this deposit wallet address to fund trades.
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
                  <div className="ml-auto flex flex-wrap items-center gap-6 text-sm">
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
                  </div>
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
