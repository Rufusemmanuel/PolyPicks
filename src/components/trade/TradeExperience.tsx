'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import type { MarketDetailsResponse } from '@/lib/polymarket/types';
import { isTradableMarket } from '@/lib/polymarket/marketStatus';
import { useOrderBook } from '@/lib/polymarket/marketDataService';
import { TRADE_CONFIG } from '@/lib/polymarket/tradeConfig';
import { useTheme } from '@/components/theme-context';
import { OrderBook } from './OrderBook';
import { TradePanel } from './TradePanel';
import { usePolymarketSession } from '@/lib/polymarket/usePolymarketSession';
import { useSession } from '@/lib/useSession';
import { useInjectedWallet } from '@/hooks/useInjectedWallet';
import {
  buttonPrimary,
  buttonSecondaryDark,
  buttonSecondaryLight,
  cardBase,
  cardLabel,
  cardSurfaceDark,
  cardSurfaceLight,
  sectionTitle,
} from '@/lib/ui/classes';

type Props = {
  marketId: string;
  market: MarketDetailsResponse | null;
  overlayMode?: boolean;
  initialTradeKey?: string;
  initialTradeState?: {
    outcome?: 'yes' | 'no';
    orderType?: 'market' | 'limit';
    side?: 'buy' | 'sell';
    tokenId?: string;
    maxShares?: string;
    limitPriceCents?: number;
    suggestedPriceCents?: number;
    amountUsd?: string;
  };
};

const normalizeOutcomeLabel = (label: string | null | undefined) =>
  label?.trim().toLowerCase() ?? '';

export function TradeExperience({
  marketId,
  market,
  initialTradeState,
  initialTradeKey,
  overlayMode = false,
}: Props) {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
  const [bookSelection, setBookSelection] = useState<number | null>(null);
  const lastInitKey = useRef<string | null>(null);
  const skipBookResetRef = useRef(false);
  const {
    address,
    chainId,
    walletClient,
    connect,
    ensurePolygon,
    providerAvailable,
    isConnected,
  } = useInjectedWallet();
  const polymarketSession = usePolymarketSession(walletClient, address, chainId);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [positions, setPositions] = useState<
    Array<{ tokenId: string; sizeBase: bigint; redeemable: boolean; outcomeLabel: string }>
  >([]);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const cardSurface = isDark ? cardSurfaceDark : cardSurfaceLight;
  const buttonSecondary = isDark ? buttonSecondaryDark : buttonSecondaryLight;

  const outcomeLabels = useMemo(() => market?.outcomes ?? [], [market?.outcomes]);
  const outcomeTokenIds = useMemo(
    () => market?.outcomeTokenIds ?? [],
    [market?.outcomeTokenIds],
  );
  const yesIndex = outcomeLabels.findIndex(
    (label) => normalizeOutcomeLabel(label) === 'yes',
  );
  const noIndex = outcomeLabels.findIndex(
    (label) => normalizeOutcomeLabel(label) === 'no',
  );
  const yesTokenId =
    (yesIndex >= 0 ? outcomeTokenIds[yesIndex] : null) ??
    outcomeTokenIds[0] ??
    null;
  const noTokenId =
    (noIndex >= 0 ? outcomeTokenIds[noIndex] : null) ??
    outcomeTokenIds[1] ??
    null;
  const tokenId = selectedOutcome === 'yes' ? yesTokenId : noTokenId;
  const marketClosed = !isTradableMarket(market);
  const tradingWalletAddress = polymarketSession.tradingWalletAddress;

  const yesOrderBook = useOrderBook(yesTokenId, TRADE_CONFIG.orderbookPollMs);
  const noOrderBook = useOrderBook(noTokenId, TRADE_CONFIG.orderbookPollMs);
  const orderBook = selectedOutcome === 'yes' ? yesOrderBook : noOrderBook;

  useEffect(() => {
    if (skipBookResetRef.current) {
      skipBookResetRef.current = false;
      return;
    }
    setBookSelection(null);
  }, [selectedOutcome]);

  useEffect(() => {
    if (!initialTradeState) return;
    const key = JSON.stringify({ marketId, initialTradeState, initialTradeKey });
    if (lastInitKey.current === key) return;
    if (initialTradeState.tokenId && initialTradeState.tokenId === yesTokenId) {
      skipBookResetRef.current = true;
      setSelectedOutcome('yes');
    } else if (initialTradeState.tokenId && initialTradeState.tokenId === noTokenId) {
      skipBookResetRef.current = true;
      setSelectedOutcome('no');
    } else if (initialTradeState.outcome === 'yes' || initialTradeState.outcome === 'no') {
      skipBookResetRef.current = true;
      setSelectedOutcome(initialTradeState.outcome);
    }
    if (typeof initialTradeState.limitPriceCents === 'number') {
      setBookSelection(initialTradeState.limitPriceCents / 100);
    } else {
      setBookSelection(null);
    }
    lastInitKey.current = key;
  }, [initialTradeKey, initialTradeState, marketId, noTokenId, yesTokenId]);

  const outcomePrices = useMemo(() => {
    if (!market?.outcomePrices?.length) return { yes: null, no: null };
    return {
      yes: market.outcomePrices[0] ?? null,
      no: market.outcomePrices[1] ?? null,
    };
  }, [market?.outcomePrices]);

  useEffect(() => {
    if (!tradingWalletAddress) return;
    let isMounted = true;
    const loadPositions = async () => {
      setPositionsLoading(true);
      setPositionsError(null);
      try {
        const params = new URLSearchParams({
          user: tradingWalletAddress,
          limit: '200',
        });
        const res = await fetch(`/api/positions?${params.toString()}`);
        const data = (await res.json()) as
          | { ok: boolean; positions?: Array<Record<string, unknown>>; error?: string }
          | Array<Record<string, unknown>>;
        if (!res.ok || ('ok' in data && !data.ok)) {
          throw new Error(
            'error' in data && data.error ? data.error : 'Positions request failed.',
          );
        }
        const rows = Array.isArray(data) ? data : data.positions ?? [];
        const mapped = rows
          .map((row) => {
            const tokenId = (row.asset ?? row.tokenId ?? row.token_id) as string | null;
            const outcomeLabel = (row.outcome ?? row.outcomeLabel ?? 'Outcome') as string;
            const rawSize = (row.size ?? row.balance ?? row.shares ?? '0') as string | number;
            const sizeBase =
              typeof rawSize === 'number'
                ? parseUnits(rawSize.toString(), 6)
                : parseUnits(String(rawSize), 6);
            return {
              tokenId,
              sizeBase,
              redeemable: row.redeemable === true,
              outcomeLabel,
              marketId: (row.marketId ?? row.market_id ?? row.condition_id ?? row.conditionId) as
                | string
                | null,
            };
          })
          .filter((row) => row.tokenId && row.sizeBase > 0n);
        const filtered = mapped.filter((row) => {
          if (row.marketId && (row.marketId === marketId || row.marketId === market?.conditionId)) {
            return true;
          }
          if (row.tokenId === yesTokenId || row.tokenId === noTokenId) return true;
          return false;
        });
        if (isMounted) {
          setPositions(
            filtered.map((row) => ({
              tokenId: row.tokenId!,
              sizeBase: row.sizeBase,
              redeemable: row.redeemable,
              outcomeLabel: row.outcomeLabel,
            })),
          );
        }
      } catch (error) {
        if (isMounted) {
          setPositionsError(
            error instanceof Error ? error.message : 'Unable to load positions.',
          );
        }
      } finally {
        if (isMounted) setPositionsLoading(false);
      }
    };
    loadPositions();
    return () => {
      isMounted = false;
    };
  }, [
    market?.conditionId,
    marketId,
    noTokenId,
    tradingWalletAddress,
    yesTokenId,
  ]);

  const yesPosition = useMemo(
    () => positions.find((row) => row.tokenId === yesTokenId) ?? null,
    [positions, yesTokenId],
  );
  const noPosition = useMemo(
    () => positions.find((row) => row.tokenId === noTokenId) ?? null,
    [positions, noTokenId],
  );
  const isResolved = Boolean(market?.resolved);
  const winningTokenId = market?.winningOutcomeId ?? null;
  const winningOutcomeIndex = useMemo(() => {
    if (winningTokenId && outcomeTokenIds.length) {
      const index = outcomeTokenIds.findIndex((id) => id === winningTokenId);
      return index >= 0 ? index : null;
    }
    if (market?.winningOutcome && outcomeLabels.length) {
      const winningOutcome = normalizeOutcomeLabel(market.winningOutcome);
      const index = outcomeLabels.findIndex((label) => normalizeOutcomeLabel(label) === winningOutcome);
      return index >= 0 ? index : null;
    }
    return null;
  }, [market?.winningOutcome, outcomeLabels, outcomeTokenIds, winningTokenId]);
  const confirmedWinningTokenId =
    winningTokenId ??
    (winningOutcomeIndex != null ? outcomeTokenIds[winningOutcomeIndex] ?? null : null);
  const winningPosition = useMemo(() => {
    if (!confirmedWinningTokenId) return null;
    return positions.find((row) => row.tokenId === confirmedWinningTokenId) ?? null;
  }, [confirmedWinningTokenId, positions]);
  const redeemable =
    winningPosition?.redeemable === true &&
    winningOutcomeIndex != null &&
    Boolean(confirmedWinningTokenId) &&
    Boolean(market?.conditionId) &&
    isResolved;
  const connectWallet = async () => {
    if (!providerAvailable) {
      throw new Error('Wallet not found. Install MetaMask or a Web3 wallet.');
    }
    const result = await connect();
    if (result.chainId !== 137) {
      await ensurePolygon();
    }
  };

  const handleRedeem = async () => {
    if (!tradingWalletAddress) {
      setRedeemMessage('Connect your wallet to redeem.');
      return;
    }
    setRedeemLoading(true);
    setRedeemMessage(null);
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
      if (!res.ok || !data.ok || !data.conditionId || !data.outcomeCount) {
        throw new Error(data.error ?? 'Redeem validation failed.');
      }
      if (
        !redeemable ||
        !confirmedWinningTokenId ||
        winningOutcomeIndex == null ||
        !winningPosition?.redeemable
      ) {
        throw new Error('This position is not redeemable yet.');
      }
      console.info('[trade] redeem requested', {
        conditionId: data.conditionId,
        tokenId: confirmedWinningTokenId,
        outcomeIndex: winningOutcomeIndex,
        resolved: isResolved,
        redeemable: winningPosition.redeemable,
      });
      await polymarketSession.redeemPositions({
        conditionId: data.conditionId,
        outcomeSlotCount: data.outcomeCount,
        indexSets: [1n << BigInt(winningOutcomeIndex)],
        tokenId: confirmedWinningTokenId,
        outcomeIndex: winningOutcomeIndex,
        redeemable: winningPosition.redeemable,
        marketResolved: isResolved,
      });
      setRedeemMessage('Redeem submitted. USDC will appear in your wallet.');
    } catch (error) {
      setRedeemMessage(error instanceof Error ? error.message : 'Redeem failed.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const marketThumbnail =
    market?.sports?.matchup?.crestA ?? market?.sports?.matchup?.crestB ?? null;
  const marketInitial = market?.title?.trim()?.charAt(0)?.toUpperCase() ?? 'M';

  return (
    <div
      className={`grid gap-6 ${
        overlayMode ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'lg:grid-cols-[minmax(0,1fr)_360px]'
      }`}
    >
      <div className="space-y-6">
        {!overlayMode && (
          <div
            className={`${cardBase} ${cardSurface} p-6`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Market
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold">
                    {market?.title ?? 'Loading market...'}
                  </h2>
                  {market && marketClosed && (
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        isDark
                          ? 'border-slate-700 bg-slate-900 text-slate-300'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                    >
                      Closed
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`relative h-14 w-14 overflow-hidden rounded-2xl border ${
                  isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'
                }`}
              >
                {marketThumbnail ? (
                  <Image
                    src={marketThumbnail}
                    alt={market?.title ?? 'Market'}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold">
                    {marketInitial}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <OrderBook
          bids={orderBook.bids}
          asks={orderBook.asks}
          isLoading={orderBook.isLoading}
          error={orderBook.error}
          onSelectLevel={(level) => {
            setBookSelection(level.price);
          }}
        />

        <div
          className={`${cardBase} ${cardSurface} p-4`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Positions
              </p>
              <p className={sectionTitle}>Settlement</p>
            </div>
            {!sessionQuery.data?.user && (
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Log in to trade
              </span>
            )}
          </div>

          {!isConnected && (
            <button
              type="button"
              onClick={() => connectWallet().catch(() => null)}
              className={`${buttonSecondary} mt-3 h-8 px-3 text-xs font-semibold`}
            >
              {providerAvailable ? 'Connect wallet to view positions' : 'Install MetaMask to view positions'}
            </button>
          )}

          {positionsLoading && (
            <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Loading positions...
            </p>
          )}
          {positionsError && (
            <p className="mt-3 text-sm text-red-400">{positionsError}</p>
          )}

          {!positionsLoading && !positionsError && isConnected && (
            <div className="mt-3 space-y-2 text-sm">
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  isDark ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span>Yes</span>
                <span className="font-semibold">
                  {yesPosition ? formatUnits(yesPosition.sizeBase, 6) : '0'}
                </span>
              </div>
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  isDark ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span>No</span>
                <span className="font-semibold">
                  {noPosition ? formatUnits(noPosition.sizeBase, 6) : '0'}
                </span>
              </div>
              {isResolved && winningTokenId && (
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Winning outcome: {winningTokenId === yesTokenId ? 'Yes' : 'No'}
                </p>
              )}
              {isResolved && winningTokenId && yesTokenId && noTokenId && (
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {winningTokenId === yesTokenId
                    ? 'No shares are worthless.'
                    : 'Yes shares are worthless.'}
                </p>
              )}
              {redeemable ? (
                <button
                  type="button"
                  onClick={handleRedeem}
                  disabled={redeemLoading}
                  className={`${buttonPrimary} mt-2 h-8 px-3 text-xs font-semibold ${
                    redeemLoading ? 'opacity-70' : ''
                  }`}
                >
                  {redeemLoading ? 'Redeeming...' : 'Redeem winnings'}
                </button>
              ) : (
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isResolved ? 'Not redeemable yet.' : 'Market not resolved.'}
                </p>
              )}
              {redeemMessage && (
                <p className={`text-xs ${redeemMessage.includes('Redeem submitted') ? (isDark ? 'text-blue-300' : 'text-blue-700') : 'text-red-400'}`}>
                  {redeemMessage}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <TradePanel
        marketId={marketId}
        yesTokenId={yesTokenId}
        noTokenId={noTokenId}
        selectedOutcome={selectedOutcome}
        onOutcomeChange={setSelectedOutcome}
        orderBook={orderBook}
        bookSelectionPrice={bookSelection}
        yesPrice={yesOrderBook.bestAsk ?? yesOrderBook.bestBid ?? outcomePrices.yes}
        noPrice={noOrderBook.bestAsk ?? noOrderBook.bestBid ?? outcomePrices.no}
        initialTradeState={initialTradeState}
        initialTradeKey={initialTradeKey}
        marketClosed={marketClosed}
      />
    </div>
  );
}
