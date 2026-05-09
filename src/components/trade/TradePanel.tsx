'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createWalletClient, custom } from 'viem';
import { polygon } from 'viem/chains';
import {
  OrderType,
  Side,
  getContractConfig as getClobContractConfig,
} from '@polymarket/clob-client-v2';
import { useTheme } from '@/components/theme-context';
import { useTradingStatus } from '@/lib/useTradingStatus';
import { useSession } from '@/lib/useSession';
import { usePolymarketSession } from '@/lib/polymarket/usePolymarketSession';
import type { OrderBookState } from '@/lib/polymarket/marketDataService';
import { TRADE_CONFIG } from '@/lib/polymarket/tradeConfig';
import { createAndPostOrder } from '@/lib/polymarket/tradeService';
import { resolveMarketPrice } from '@/lib/polymarket/orderPricing';
import { ensureRelayerProxy } from '@/lib/polymarket/relayerService';
import { useInjectedWallet } from '@/hooks/useInjectedWallet';
import { createViemSigner } from '@/lib/wallet/viemSigner';
import {
  buttonPrimary,
  buttonSecondaryDark,
  buttonSecondaryLight,
  cardBase,
  cardLabel,
  cardSurfaceDark,
  cardSurfaceLight,
  inputBaseDark,
  inputBaseLight,
} from '@/lib/ui/classes';

type OutcomeKey = 'yes' | 'no';

type Props = {
  marketId: string;
  yesTokenId: string | null;
  noTokenId: string | null;
  selectedOutcome: OutcomeKey;
  onOutcomeChange: (value: OutcomeKey) => void;
  orderBook: OrderBookState;
  bookSelectionPrice: number | null;
  yesPrice: number | null;
  noPrice: number | null;
  proxyWalletAddress?: string | null;
  initialTradeState?: {
    outcome?: 'yes' | 'no';
    orderType?: 'market' | 'limit';
    limitPriceCents?: number;
    suggestedPriceCents?: number;
    amountUsd?: string;
  };
  initialTradeKey?: string;
};

const roundTo = (value: number, decimals = 6) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const formatCents = (price: number | null) =>
  price == null || !Number.isFinite(price) ? '-' : `${Math.round(price * 100)}c`;

export function TradePanel({
  marketId,
  yesTokenId,
  noTokenId,
  selectedOutcome,
  onOutcomeChange,
  orderBook,
  bookSelectionPrice,
  yesPrice,
  noPrice,
  proxyWalletAddress,
  initialTradeState,
  initialTradeKey,
}: Props) {
  const { isDark } = useTheme();
  const sessionQuery = useSession();
  const tradingStatus = useTradingStatus();
  const side = 'BUY';
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [amount, setAmount] = useState('0');
  const [limitPriceCents, setLimitPriceCents] = useState('');
  const [shares, setShares] = useState('');
  const [indicativePrice, setIndicativePrice] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [relayerProxy, setRelayerProxy] = useState<string | null>(null);
  const {
    address,
    chainId,
    walletClient,
    provider,
    connect,
    ensurePolygon,
  } = useInjectedWallet();
  const walletSigner = useMemo(
    () => (walletClient && address ? createViemSigner(walletClient, address) : null),
    [address, walletClient],
  );
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const polymarketSession = usePolymarketSession(walletClient, address, chainId);
  const lastInitKey = useRef<string | null>(null);
  const suggestedPrefillRef = useRef<string | null>(null);
  const inputBase = isDark ? inputBaseDark : inputBaseLight;
  const buttonSecondary = isDark ? buttonSecondaryDark : buttonSecondaryLight;
  const cardSurface = isDark ? cardSurfaceDark : cardSurfaceLight;

  const tokenId = selectedOutcome === 'yes' ? yesTokenId : noTokenId;
  const bestAsk = orderBook.bestAsk;
  const bestBid = orderBook.bestBid;
  const tickSize = orderBook.tickSize;
  const minOrderSize = orderBook.minOrderSize;
  const negRisk = orderBook.negRisk;

  const tradingDisabled =
    tradingStatus.isLoading ||
    !tradingStatus.data?.enabled ||
    sessionQuery.isLoading;
  const relayerEnabled =
    process.env.NEXT_PUBLIC_POLY_ENABLE_RELAYER === '1' &&
    TRADE_CONFIG.signatureType !== 3;

  useEffect(() => {
    if (!bookSelectionPrice || !Number.isFinite(bookSelectionPrice)) return;
    const cents = Math.round(bookSelectionPrice * 100);
    if (orderType === 'LIMIT') {
      setLimitPriceCents(String(Math.min(99, Math.max(1, cents))));
    } else {
      setIndicativePrice(bookSelectionPrice);
    }
  }, [bookSelectionPrice, orderType]);

  useEffect(() => {
    if (!initialTradeState) return;
    const key = JSON.stringify({ marketId, initialTradeState, initialTradeKey });
    if (lastInitKey.current === key) return;
    if (initialTradeState.orderType === 'limit' || initialTradeState.orderType === 'market') {
      setOrderType(initialTradeState.orderType === 'limit' ? 'LIMIT' : 'MARKET');
    }
    if (
      initialTradeState.orderType === 'limit' &&
      typeof initialTradeState.limitPriceCents === 'number'
    ) {
      const clamped = Math.min(99, Math.max(1, Math.round(initialTradeState.limitPriceCents)));
      setLimitPriceCents(String(clamped));
    }
    if (typeof initialTradeState.amountUsd === 'string' && initialTradeState.amountUsd.trim()) {
      setAmount(initialTradeState.amountUsd);
    }
    lastInitKey.current = key;
  }, [initialTradeState, marketId, initialTradeKey]);

  const suggestedPriceCents = useMemo(() => {
    if (!initialTradeState) return null;
    const raw =
      typeof initialTradeState.suggestedPriceCents === 'number'
        ? initialTradeState.suggestedPriceCents
        : typeof initialTradeState.limitPriceCents === 'number'
          ? initialTradeState.limitPriceCents
          : null;
    if (raw == null) return null;
    const clamped = Math.min(99, Math.max(1, Math.round(raw)));
    return Number.isFinite(clamped) ? clamped : null;
  }, [initialTradeState]);

  useEffect(() => {
    if (orderType !== 'LIMIT' || suggestedPriceCents == null) return;
    const key = JSON.stringify({ marketId, suggestedPriceCents, initialTradeKey });
    if (suggestedPrefillRef.current === key) return;
    setLimitPriceCents(String(suggestedPriceCents));
    suggestedPrefillRef.current = key;
  }, [initialTradeKey, marketId, orderType, suggestedPriceCents]);

  useEffect(() => {
    if (orderType === 'LIMIT') {
      setIndicativePrice(null);
    }
  }, [orderType]);

  useEffect(() => {
    if (!relayerEnabled || !address) return;
    let isMounted = true;
    ensureRelayerProxy(address)
      .then((result) => {
        if (isMounted) setRelayerProxy(result.proxyWalletAddress);
      })
      .catch(() => null);
    return () => {
      isMounted = false;
    };
  }, [relayerEnabled, walletSigner]);

  useEffect(() => {
    if (!polymarketSession.proxyAddress) return;
    let isMounted = true;
    setBalanceLoading(true);
    polymarketSession
      .getUsdcBalance()
      .then((value) => {
        if (isMounted) setBalance(value);
      })
      .catch(() => null)
      .finally(() => {
        if (isMounted) setBalanceLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [polymarketSession.proxyAddress]);

  const limitPriceValue = useMemo(() => {
    if (!limitPriceCents.trim()) return null;
    const parsed = Number(limitPriceCents);
    if (!Number.isFinite(parsed)) return null;
    const normalized = parsed / 100;
    if (normalized <= 0 || normalized >= 1) return null;
    return normalized;
  }, [limitPriceCents]);

  const marketPriceResult = useMemo(
    () =>
      resolveMarketPrice({
        bestBid,
        bestAsk,
        side,
        slippageBps: TRADE_CONFIG.slippageBps,
      }),
    [bestBid, bestAsk],
  );

  const effectiveOrderPrice = useMemo(() => {
    if (orderType === 'LIMIT') return limitPriceValue;
    return marketPriceResult.price;
  }, [limitPriceValue, marketPriceResult.price, orderType]);

  const parsedAmount = Number(amount);
  const parsedShares = Number(shares);
  const tickStepCents = useMemo(() => {
    if (!tickSize || !Number.isFinite(tickSize)) return 1;
    const step = Math.round(tickSize * 100);
    return step > 0 ? step : 1;
  }, [tickSize]);

  const limitPriceAligned = useMemo(() => {
    if (!limitPriceValue || !tickSize) return true;
    const scaled = limitPriceValue / tickSize;
    return Math.abs(scaled - Math.round(scaled)) < 1e-8;
  }, [limitPriceValue, tickSize]);

  const marketDisplayPrice = useMemo(() => {
    if (orderType !== 'MARKET') return null;
    return indicativePrice ?? bestAsk;
  }, [bestAsk, indicativePrice, orderType]);

  const calculatedSize = useMemo(() => {
    if (!effectiveOrderPrice) return null;
    if (orderType === 'LIMIT') {
      if (!Number.isFinite(parsedShares) || parsedShares <= 0) return null;
      return roundTo(parsedShares);
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    return roundTo(parsedAmount / effectiveOrderPrice);
  }, [effectiveOrderPrice, orderType, parsedAmount, parsedShares]);

  const estimatedShares = useMemo(() => {
    if (orderType !== 'MARKET') return null;
    if (!marketDisplayPrice || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return null;
    }
    return roundTo(parsedAmount / marketDisplayPrice, 3);
  }, [marketDisplayPrice, orderType, parsedAmount]);

  const notional = useMemo(() => {
    if (!effectiveOrderPrice || !calculatedSize) return null;
    const value = calculatedSize * effectiveOrderPrice;
    return roundTo(value, 2);
  }, [calculatedSize, effectiveOrderPrice]);

  const sizeBelowMin =
    minOrderSize != null &&
    calculatedSize != null &&
    calculatedSize > 0 &&
    calculatedSize < minOrderSize;
  const limitPriceInvalid =
    orderType === 'LIMIT' && (!limitPriceValue || !limitPriceAligned);
  const marketPriceError =
    orderType === 'MARKET' ? marketPriceResult.error ?? null : null;

  const submitBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (tradingStatus.isLoading) blockers.push('Trading status is loading.');
    if (tradingStatus.isError) blockers.push('Unable to load trading status.');
    if (tradingStatus.data && !tradingStatus.data.enabled) {
      blockers.push(...(tradingStatus.data.disabledReasons?.length
        ? tradingStatus.data.disabledReasons
        : ['Trading is disabled.']));
    }
    if (sessionQuery.isLoading) blockers.push('User session is loading.');
    if (isSubmitting) blockers.push('Order is already submitting.');
    if (!tokenId) blockers.push('Select an outcome to trade.');
    if (effectiveOrderPrice == null) blockers.push('No tradable price is available.');
    if (calculatedSize == null || calculatedSize <= 0) blockers.push('Enter a valid order amount.');
    if (sizeBelowMin) blockers.push(`Minimum size is ${minOrderSize}.`);
    if (limitPriceInvalid) blockers.push('Enter a valid limit price.');
    if (marketPriceError) blockers.push(marketPriceError);
    return blockers;
  }, [
    calculatedSize,
    effectiveOrderPrice,
    isSubmitting,
    limitPriceInvalid,
    marketPriceError,
    minOrderSize,
    sessionQuery.isLoading,
    sizeBelowMin,
    tokenId,
    tradingStatus.data,
    tradingStatus.isError,
    tradingStatus.isLoading,
  ]);
  const disabledReasonText = submitBlockers.join(' ');
  const formReady =
    Boolean(tokenId) &&
    effectiveOrderPrice != null &&
    calculatedSize != null &&
    calculatedSize > 0 &&
    !sizeBelowMin &&
    !limitPriceInvalid &&
    !marketPriceError;
  const canSubmit =
    !tradingDisabled &&
    !isSubmitting &&
    formReady;
  const buttonDisabled = isSubmitting || !formReady;

  useEffect(() => {
    if (!submitBlockers.length) return;
    console.info('[trade-ui]', {
      event: 'trade_button_blocked',
      blockers: submitBlockers,
      tradingStatus: tradingStatus.data ?? null,
      marketId,
      tokenId,
      orderType,
      hasPrice: effectiveOrderPrice != null,
      calculatedSize,
      isSubmitting,
    });
  }, [
    calculatedSize,
    effectiveOrderPrice,
    isSubmitting,
    marketId,
    orderType,
    submitBlockers,
    tokenId,
    tradingStatus.data,
  ]);

  const connectWallet = async () => {
    if (!provider) {
      throw new Error('Wallet not found. Install MetaMask or a Web3 wallet.');
    }
    const result = await connect();
    if (result.chainId !== 137) {
      await ensurePolygon();
    }
    const client = createWalletClient({
      chain: polygon,
      account: result.address,
      transport: custom(provider),
    });
    const signer = createViemSigner(client, result.address);
    return { signer, chainId: result.chainId };
  };

  const resolveFunderAddress = async (signer: ReturnType<typeof createViemSigner>) => {
    if (TRADE_CONFIG.signatureType === 0) {
      return signer.getAddress();
    }
    if (TRADE_CONFIG.signatureType === 1) {
      const proxy =
        proxyWalletAddress ?? relayerProxy ?? polymarketSession.proxyAddress;
      if (!proxy) {
        throw new Error('Magic Link proxy address unavailable.');
      }
      return proxy;
    }
    if (TRADE_CONFIG.signatureType === 3) {
      if (!proxyWalletAddress) {
        throw new Error('Deposit wallet funder address unavailable for POLY_1271.');
      }
      return proxyWalletAddress;
    }
    if (proxyWalletAddress || relayerProxy) {
      return proxyWalletAddress ?? relayerProxy ?? '';
    }
    return polymarketSession.ensureProxyDeployed({ force: true });
  };

  const ensureApprovals = async () => {
    if (TRADE_CONFIG.signatureType === 0 || TRADE_CONFIG.signatureType === 3) return;
    if (!polymarketSession.proxyAddress) return;
    const contractConfig = getClobContractConfig(TRADE_CONFIG.chainId);
    const exchange = negRisk ? contractConfig.negRiskExchange : contractConfig.exchange;
    const collateral = contractConfig.collateral;
    const required = BigInt(Math.ceil((notional ?? 0) * 1_000_000));
    if (required > 0n) {
      await polymarketSession.ensureApprovals(collateral, exchange, required);
    }
  };

  const handleSubmit = async () => {
    if (chainId && chainId !== 137) {
      setMessage('Switch to Polygon to trade.');
      await ensurePolygon().catch(() => null);
      return;
    }
    if (!tokenId) {
      setMessage('Select an outcome to trade.');
      return;
    }
    if (orderType === 'MARKET' && marketPriceError) {
      setMessage(marketPriceError);
      return;
    }
    if (orderType === 'LIMIT' && limitPriceInvalid) {
      setMessage('Enter a valid limit price.');
      return;
    }
    if (tradingStatus.isError) {
      setMessage('Unable to verify trading status. Refresh and try again.');
      return;
    }
    if (!tradingStatus.data?.enabled) {
      const reason =
        tradingStatus.data?.disabledReasons?.join(' ') ||
        'Trading is disabled by server configuration.';
      console.info('[trade-ui]', {
        event: 'trade_click_blocked_by_trading_status',
        reason,
        tradingStatus: tradingStatus.data ?? null,
      });
      setMessage(`Trading unavailable. ${reason}`);
      return;
    }
    if (!canSubmit) {
      console.info('[trade-ui]', {
        event: 'trade_click_blocked',
        blockers: submitBlockers,
      });
      setMessage(disabledReasonText || 'Complete the form before placing an order.');
      return;
    }
    if (!sessionQuery.data?.user) {
      setMessage('Log in to place trades.');
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const { signer } = walletSigner ? { signer: walletSigner } : await connectWallet();
      if (!signer) {
        setMessage('Connect your wallet to continue.');
        return;
      }
      const funder = await resolveFunderAddress(signer);
      const authAddress = await signer.getAddress();
      console.info('[trade-ui]', {
        event: 'trade_submit_auth_context',
        signatureType: TRADE_CONFIG.signatureType,
        authAddress,
        signer: authAddress,
        funderAddress: funder,
        walletSessionProxy: polymarketSession.proxyAddress,
        relayerProxy,
      });
      await ensureApprovals();
      const marketAmount =
        orderType === 'MARKET'
          ? parsedAmount
          : null;
      const response = await createAndPostOrder({
        signer,
        tokenId,
        side: Side.BUY,
        price: effectiveOrderPrice!,
        size: orderType === 'LIMIT' ? calculatedSize : null,
        amount: marketAmount,
        tradeMode: orderType === 'MARKET' ? 'market' : 'limit',
        execution: orderType === 'MARKET' ? OrderType.FOK : OrderType.GTC,
        signatureType: TRADE_CONFIG.signatureType,
        funderAddress: funder,
        tickSize,
        negRisk,
        clientMeta: {
          marketId,
          orderPrice: effectiveOrderPrice,
          size: calculatedSize,
        },
      });
      if (!response.ok) {
        const detailText =
          response.details != null ? ` ${JSON.stringify(response.details)}` : '';
        setMessage(`${response.error ?? 'Order rejected.'}${detailText}`);
        return;
      }
      setMessage('Order placed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const maxAmount = useMemo(() => {
    if (!balance || balance <= 0n) return null;
    return Number(balance) / 1_000_000;
  }, [balance]);
  const maxSharesPlaceholder = 100;

  const applyQuickAmount = (value: number | 'max') => {
    if (value === 'max') {
      if (!maxAmount) return;
      setAmount(maxAmount.toFixed(2));
      return;
    }
    const next = Number(amount) + value;
    if (Number.isFinite(next)) setAmount(next.toFixed(2));
  };

  const applyLimitPercent = (percent: number) => {
    if (!effectiveOrderPrice) return;
    if (maxAmount) {
      const notionalValue = maxAmount * percent;
      const sharesValue = notionalValue / effectiveOrderPrice;
      setShares(sharesValue.toFixed(3));
      return;
    }
    setShares((maxSharesPlaceholder * percent).toFixed(3));
  };


  const outcomeButtons = [
    { key: 'yes' as const, label: 'Yes' },
    { key: 'no' as const, label: 'No' },
  ];

  const outcomePrices = {
    yes: formatCents(yesPrice),
    no: formatCents(noPrice),
  };

  return (
    <div
      className={`${cardBase} ${cardSurface} p-4`}
    >
        <div className="flex items-center justify-end">
          <div className="inline-flex rounded-full border p-1 text-xs font-semibold uppercase tracking-wide">
            {(['MARKET', 'LIMIT'] as const).map((value) => (
              <button
                key={value}
              type="button"
              onClick={() => setOrderType(value)}
              className={`rounded-full px-3 py-1 ${
                orderType === value
                  ? isDark
                    ? 'bg-white/10 text-slate-100'
                    : 'bg-slate-900 text-white'
                  : isDark
                    ? 'text-slate-400'
                    : 'text-slate-600'
              }`}
            >
              {value === 'MARKET' ? 'Market' : 'Limit'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {outcomeButtons.map((outcome) => {
          const active = selectedOutcome === outcome.key;
          return (
            <button
              key={outcome.key}
              type="button"
              onClick={() => onOutcomeChange(outcome.key)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? isDark
                    ? 'border-slate-500 bg-white/10'
                    : 'border-slate-900 bg-slate-900 text-white'
                  : isDark
                    ? 'border-slate-800 bg-slate-900/40 text-slate-100'
                    : 'border-slate-200 bg-slate-50'
              }`}
            >
              <p className="text-sm font-semibold">{outcome.label}</p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {outcomePrices[outcome.key]}
              </p>
            </button>
          );
        })}
      </div>
      {orderType === 'MARKET' && suggestedPriceCents != null && (
        <div className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Suggested: {suggestedPriceCents}c
        </div>
      )}

      {orderType === 'MARKET' ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Amount
              </p>
              <p className="text-lg font-semibold">Market order</p>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={`${inputBase} w-32 text-right text-lg font-semibold`}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              Indicative price
            </span>
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              {formatCents(marketDisplayPrice)}
            </span>
          </div>
          {side === 'BUY' && (
            <div className="flex items-center justify-between text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                Estimated shares
              </span>
              <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                {estimatedShares != null ? estimatedShares.toFixed(3) : '-'}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {[1, 20, 100].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => applyQuickAmount(value)}
                className={`${buttonSecondary} h-8 px-3 text-xs`}
              >
                {`+$${value}`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyQuickAmount('max')}
              disabled={!maxAmount || balanceLoading}
              className={`${buttonSecondary} h-8 px-3 text-xs ${(!maxAmount || balanceLoading) ? 'opacity-50' : ''}`}
            >
              Max
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Limit Price
              </p>
              <p className="text-sm">Set your price</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const fallback =
                    limitPriceValue ?? bestAsk ?? bestBid ?? 0.5;
                  const currentCents = Math.round(fallback * 100);
                  const nextCents = Math.max(1, currentCents - tickStepCents);
                  setLimitPriceCents(String(nextCents));
                }}
                className={`rounded-lg border px-2 py-1 text-sm ${
                  isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-white'
                }`}
              >
                -
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="99"
                step={tickStepCents}
                value={limitPriceCents}
                onChange={(event) => setLimitPriceCents(event.target.value)}
                className={`${inputBase} w-24 text-right text-sm font-semibold`}
              />
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>c</span>
              <button
                type="button"
                onClick={() => {
                  const fallback =
                    limitPriceValue ?? bestAsk ?? bestBid ?? 0.5;
                  const currentCents = Math.round(fallback * 100);
                  const nextCents = Math.min(99, currentCents + tickStepCents);
                  setLimitPriceCents(String(nextCents));
                }}
                className={`rounded-lg border px-2 py-1 text-sm ${
                  isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-white'
                }`}
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className={`${cardLabel} ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Shares
              </p>
              <p className="text-sm">Enter shares</p>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={shares}
              onChange={(event) => setShares(event.target.value)}
              className={`${inputBase} w-32 text-right text-lg font-semibold`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[0.25, 0.5, 1].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => applyLimitPercent(value)}
                className={`${buttonSecondary} h-8 px-3 text-xs`}
              >
                {value === 1 ? 'Max' : `${Math.round(value * 100)}%`}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Set expiration</span>
            <input type="checkbox" disabled className="h-4 w-4" />
          </div>
          {limitPriceInvalid && (
            <p className="text-xs text-red-400">
              Enter a valid limit price in cents that matches the tick size.
            </p>
          )}
        </div>
      )}

      <div className={`mt-4 rounded-xl border p-3 text-sm ${isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center justify-between">
          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
            You&apos;ll pay
          </span>
          <span className="font-semibold">
            {notional != null ? `$${notional.toFixed(2)}` : '-'}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
            You&apos;ll receive
          </span>
          <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
            {orderType === 'MARKET'
              ? estimatedShares != null
                ? `${estimatedShares.toFixed(3)} shares`
                : '-'
              : calculatedSize != null
                ? `${calculatedSize.toFixed(3)} shares`
                : '-'}
          </span>
        </div>
        {sizeBelowMin && (
          <p className="mt-2 text-xs text-red-400">
            Minimum size is {minOrderSize}. Increase your order size.
          </p>
        )}
        {marketPriceError && (
          <p className="mt-2 text-xs text-red-400">{marketPriceError}</p>
        )}
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.includes('Order placed') ? (isDark ? 'text-blue-300' : 'text-blue-700') : 'text-red-400'}`}>
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={buttonDisabled}
        title={disabledReasonText || undefined}
        aria-disabled={!canSubmit}
        className={`${buttonPrimary} mt-4 w-full px-4 py-3 text-sm font-semibold ${
          !canSubmit ? 'opacity-60' : ''
        }`}
      >
        {isSubmitting ? 'Submitting...' : 'Trade'}
      </button>

    </div>
  );
}
