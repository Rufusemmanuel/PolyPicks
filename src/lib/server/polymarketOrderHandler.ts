import { NextResponse } from 'next/server';
import type { PolymarketSessionData } from './session';
import { sanitizeOrderPayload } from './polymarketOrderCore';
import type { buildL2Headers as buildL2HeadersType } from './polymarketHeaders';

type SessionLike = PolymarketSessionData & { destroy?: () => void };

type OrderHandlerDeps = {
  getSession: () => Promise<SessionLike>;
  isSessionExpired: (session: PolymarketSessionData) => boolean;
  buildL2Headers: typeof buildL2HeadersType;
  getBuilderHeaders?: (args: {
    method: string;
    path: string;
    body: string;
    request: Request;
  }) => Promise<Record<string, string> | undefined>;
  clobHost: string;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'error'>;
};

const ORDER_TYPES = new Set(['FOK', 'GTC', 'GTD']);
const redactSignature = (value: unknown) => {
  if (typeof value !== 'string') return value;
  if (!value.startsWith('0x')) return value;
  return `${value.slice(0, 10)}...`;
};
const isNegativeNumeric = (value: unknown) => {
  if (typeof value === 'number') return value < 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return trimmed.startsWith('-');
  }
  return false;
};
const isSellRequest = (
  payload: Record<string, unknown>,
  orderIn: Record<string, unknown>,
) => {
  const rootSide = payload.side;
  const orderSide = orderIn.side;
  const sideValues = [rootSide, orderSide];
  for (const value of sideValues) {
    if (value === 1 || value === '1') return true;
    if (typeof value === 'string' && value.trim().toLowerCase() === 'sell') return true;
  }
  const amountFields = [
    payload.amount,
    payload.size,
    orderIn.makerAmount,
    orderIn.takerAmount,
  ];
  return amountFields.some((value) => isNegativeNumeric(value));
};

export const createOrderHandler = ({
  getSession,
  isSessionExpired,
  buildL2Headers,
  getBuilderHeaders,
  clobHost,
  fetchImpl,
  logger = console,
}: OrderHandlerDeps) => {
  const doFetch = fetchImpl ?? fetch;

  return async (request: Request) => {
    const rawHeaderKeys = Array.from(request.headers.keys());
    if (rawHeaderKeys.some((k) => k.toLowerCase().startsWith('poly_'))) {
      return NextResponse.json(
        { ok: false, error: 'Unexpected auth headers.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let session: SessionLike;
    try {
      session = await getSession();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Server session not configured.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!session.l2 || !session.walletAddress || isSessionExpired(session)) {
      if (isSessionExpired(session)) session.destroy?.();
      return NextResponse.json(
        { ok: false, error: 'Session not initialized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const rawBody = await request.text();

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch (error) {
      logger.error('[polymarket] order payload parse failed', error);
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: { message: 'Malformed JSON' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'owner')) {
      return NextResponse.json(
        { ok: false, error: 'Owner must not be provided by client.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const missing: string[] = [];
    const orderRaw = payload.order;
    if (!orderRaw || typeof orderRaw !== 'object') {
      missing.push('order');
    }
    const orderIn = (orderRaw ?? {}) as Record<string, unknown>;
    if (!orderIn.signature) missing.push('order.signature');
    if (orderIn.signatureType == null) missing.push('order.signatureType');
    const tokenIdValue = orderIn.tokenId ?? orderIn.tokenID;
    if (tokenIdValue == null) missing.push('order.tokenId');
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: { missing } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const saltInt = Number.parseInt(String(orderIn.salt), 10);
    if (!Number.isFinite(saltInt)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: { missing: ['order.salt'] } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (isSellRequest(payload, orderIn)) {
      return NextResponse.json(
        { code: 'SELL_DISABLED', message: 'Sell is disabled on this platform.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const rawSide = orderIn.side;
    let sideValue: string | number | undefined = rawSide as string | number | undefined;
    if (typeof rawSide === 'number') {
      sideValue = String(rawSide);
    } else if (typeof rawSide === 'string') {
      const normalized = rawSide.trim().toLowerCase();
      if (normalized === 'buy') sideValue = '0';
      else if (normalized === 'sell') sideValue = '1';
      else sideValue = rawSide;
    }
    if (sideValue === '1' || rawSide === 1 || rawSide === '1') {
      return NextResponse.json(
        { code: 'SELL_DISABLED', message: 'Sell is disabled on this platform.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const normalizedOrder: Record<string, unknown> = {
      ...orderIn,
      tokenId: String(tokenIdValue),
      salt: saltInt,
      makerAmount: String(orderIn.makerAmount),
      takerAmount: String(orderIn.takerAmount),
      expiration: String(orderIn.expiration),
      nonce: String(orderIn.nonce),
      feeRateBps:
        typeof orderIn.feeRateBps === 'number' ? String(orderIn.feeRateBps) : orderIn.feeRateBps,
      side: sideValue,
      signatureType: Number(orderIn.signatureType),
      signature: orderIn.signature,
    };

    const execution = (payload.orderType ?? payload.execution ?? 'FOK').toString().toUpperCase();
    if (!ORDER_TYPES.has(execution)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request',
          details: { formErrors: ['orderType must be FOK, FAK, GTC, or GTD.'] },
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (payload.signatureType != null && normalizedOrder.signatureType !== payload.signatureType) {
      return NextResponse.json(
        { ok: false, error: 'Signature type mismatch.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (payload.funderAddress) {
      const makerValue = normalizedOrder.maker;
      const funderValue = payload.funderAddress;
      if (typeof makerValue !== 'string' || typeof funderValue !== 'string') {
        return NextResponse.json(
          { ok: false, error: 'Funder address mismatch.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (makerValue.toLowerCase() !== funderValue.toLowerCase()) {
        return NextResponse.json(
          { ok: false, error: 'Funder address mismatch.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    try {
      sanitizeOrderPayload({
        orderType: execution as 'FOK' | 'GTC' | 'GTD',
        order: normalizedOrder as Record<string, unknown>,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request',
          details: {
            formErrors: [
              error instanceof Error ? error.message : 'Invalid order payload.',
            ],
          },
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const orderPayload = {
      order: {
        maker: normalizedOrder.maker,
        signer: normalizedOrder.signer,
        taker: normalizedOrder.taker,
        tokenId: normalizedOrder.tokenId,
        salt: normalizedOrder.salt,
        makerAmount: normalizedOrder.makerAmount,
        takerAmount: normalizedOrder.takerAmount,
        expiration: normalizedOrder.expiration,
        nonce: normalizedOrder.nonce,
        feeRateBps: normalizedOrder.feeRateBps,
        side: normalizedOrder.side,
        signatureType: normalizedOrder.signatureType,
        signature: normalizedOrder.signature,
      },
      owner: session.l2.apiKey,
      orderType: execution,
    };
    const sentDebug = {
      orderType: orderPayload.orderType,
      side: orderPayload.order.side,
      salt: orderPayload.order.salt,
      tokenIdPrefix: String(orderPayload.order.tokenId ?? '').slice(0, 8),
    };

    const requestPath = '/order';
    const body = JSON.stringify(orderPayload);
    try {
      const l2Headers = await buildL2Headers(session, {
        method: 'POST',
        requestPath,
        body,
      });
      const builderHeaders = getBuilderHeaders
        ? await getBuilderHeaders({ method: 'POST', path: requestPath, body, request })
        : undefined;
      const headers = {
        'Content-Type': 'application/json',
        ...l2Headers,
        ...(builderHeaders ?? {}),
      };

      if (process.env.NODE_ENV !== 'production') {
        logger.info('[polymarket] order payload keys', {
          orderKeys: Object.keys(orderPayload.order ?? {}),
          orderType: orderPayload.orderType,
          saltType: typeof orderPayload.order?.salt,
          sideType: typeof orderPayload.order?.side,
        });
      }

      const baseHeaders = {
        'User-Agent': 'Mozilla/5.0 (compatible; PolyPicks/1.0; +https://polypicks.xyz)',
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      };
      const timeoutMs = 12_000;
      const maxAttempts = 3;
      const retryableStatuses = new Set([408, 429, 500, 502, 503, 504, 520, 522, 523, 524]);
      let res: Response | null = null;
      let text = '';

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          res = await doFetch(`${clobHost}${requestPath}`, {
            method: 'POST',
            headers: {
              ...headers,
              ...baseHeaders,
            },
            body,
            signal: controller.signal,
          });
          text = await res.text();
        } catch (error) {
          clearTimeout(timeoutId);
          if (attempt < maxAttempts - 1) {
            const baseDelay = attempt === 0 ? 300 : 900;
            const jitter = Math.floor(Math.random() * 120);
            await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
            continue;
          }
          return NextResponse.json(
            { ok: false, error: 'CLOB timeout' },
            { status: 502, headers: { 'Cache-Control': 'no-store' } },
          );
        }
        clearTimeout(timeoutId);

        if (retryableStatuses.has(res.status)) {
          if (attempt < maxAttempts - 1) {
            const baseDelay = attempt === 0 ? 300 : 900;
            const jitter = Math.floor(Math.random() * 120);
            await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
            continue;
          }
        }
        break;
      }

      if (!res) {
        return NextResponse.json(
          { ok: false, error: 'CLOB timeout' },
          { status: 502, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (process.env.NODE_ENV !== 'production') {
        logger.info('[polymarket] order response status', res.status);
      }

      const contentType = res.headers.get('content-type') ?? '';
      const cfRay = res.headers.get('cf-ray') ?? null;
      const looksLikeHtml = contentType.includes('text/html') || /<html/i.test(text);
      const looksLikeCloudflare = Boolean(cfRay) || text.toLowerCase().includes('cloudflare');
      if (looksLikeHtml || (looksLikeCloudflare && !contentType.includes('application/json'))) {
        return NextResponse.json(
          {
            ok: false,
            error: 'CLOB error',
            details: {
              status: res.status,
              contentType,
              cfRay,
              snippet: text.trim().slice(0, 120) || null,
            },
            sent: sentDebug,
          },
          { status: 502, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          return NextResponse.json(
            {
              ok: false,
              error: 'CLOB error',
              details: {
                status: res.status,
                contentType,
                cfRay,
                snippet: text.trim().slice(0, 120) || null,
              },
              sent: sentDebug,
            },
            { status: 502, headers: { 'Cache-Control': 'no-store' } },
          );
        }
      }

      if (!res.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: 'CLOB error',
            details: {
              status: res.status,
              body: data ?? null,
            },
            sent: sentDebug,
          },
          { status: 502, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (process.env.NODE_ENV !== 'production') {
        const redacted = data && typeof data === 'object'
          ? { ...data, signature: redactSignature((data as { signature?: unknown }).signature) }
          : data;
        logger.info('[polymarket] order response', redacted ?? null);
      }
      if (
        data
        && typeof data === 'object'
        && 'success' in data
        && (data as { success?: unknown }).success === false
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: (data as { errorMsg?: string }).errorMsg ?? 'Order rejected',
            details: data,
            sent: sentDebug,
          },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return NextResponse.json({ ok: true, data }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      logger.error('[polymarket] order post failed', error);
      return NextResponse.json(
        { ok: false, error: 'CLOB error' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
};
