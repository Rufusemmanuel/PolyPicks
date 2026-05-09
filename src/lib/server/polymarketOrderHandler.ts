import { NextResponse } from 'next/server';
import type { PolymarketSessionData } from './session';
import { sanitizeOrderPayload } from './polymarketOrderCore';
import type { buildL2Headers as buildL2HeadersType } from './polymarketHeaders';
import { getPolymarketBuilderCode } from './polymarketRuntimeConfig';

type SessionLike = PolymarketSessionData & { destroy?: () => void };

type OrderHandlerDeps = {
  getSession: () => Promise<SessionLike>;
  isSessionExpired: (session: PolymarketSessionData) => boolean;
  buildL2Headers: typeof buildL2HeadersType;
  clobHost: string;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'error'>;
};

const ORDER_TYPES = new Set(['FAK', 'FOK', 'GTC', 'GTD']);
const logOrderEvent = (
  logger: Pick<Console, 'info' | 'error'>,
  level: 'info' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) => {
  logger[level]('[polymarket]', {
    event,
    component: 'order_submission',
    ...fields,
  });
};
const redactSignature = (value: unknown) => {
  if (typeof value !== 'string') return value;
  if (!value.startsWith('0x')) return value;
  return `${value.slice(0, 10)}...`;
};
const redactCredential = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};
const sameAddress = (left: unknown, right: unknown) =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  left.toLowerCase() === right.toLowerCase();
const DEPOSIT_WALLET_REQUIRED_MESSAGE =
  'This account must trade through a Polymarket deposit wallet. Please deploy/fund your deposit wallet before trading.';
const normalizeExchangeError = (message: string, body?: unknown) => {
  const haystack = `${message} ${body ? JSON.stringify(body) : ''}`;
  if (/maker address not allowed|deposit wallet flow/i.test(haystack)) {
    return DEPOSIT_WALLET_REQUIRED_MESSAGE;
  }
  return message;
};
const redactOrderPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = structuredClone(payload) as Record<string, unknown>;
  if (copy.order && typeof copy.order === 'object') {
    const order = copy.order as Record<string, unknown>;
    order.signature = redactSignature(order.signature);
  }
  return copy;
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
      logOrderEvent(logger, 'error', 'order_payload_parse_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
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
    if (!orderIn.timestamp) missing.push('order.timestamp');
    if (!orderIn.metadata) missing.push('order.metadata');
    if (!orderIn.builder) missing.push('order.builder');
    const tokenIdValue = orderIn.tokenId ?? orderIn.tokenID;
    if (tokenIdValue == null) missing.push('order.tokenId');
    if (missing.length) {
      logOrderEvent(logger, 'error', 'order_payload_missing_fields', { missing });
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
      if (normalized === 'buy') sideValue = 'BUY';
      else if (normalized === 'sell') sideValue = 'SELL';
      else sideValue = rawSide;
    }
    if (sideValue === 'SELL' || sideValue === '1' || rawSide === 1 || rawSide === '1') {
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
      side: sideValue,
      signatureType: Number(orderIn.signatureType),
      timestamp: String(orderIn.timestamp),
      expiration: String(orderIn.expiration),
      metadata: String(orderIn.metadata),
      builder: String(orderIn.builder),
      signature: orderIn.signature,
    };

    const builderCode = getPolymarketBuilderCode();
    if (String(normalizedOrder.builder).toLowerCase() !== builderCode.toLowerCase()) {
      logOrderEvent(logger, 'error', 'builder_code_mismatch', {
        expectedBuilder: builderCode,
        receivedBuilder: normalizedOrder.builder,
        tokenIdPrefix: String(normalizedOrder.tokenId ?? '').slice(0, 12),
      });
      return NextResponse.json(
        { ok: false, error: 'Order builder code mismatch.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

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
    if (
      typeof payload.authAddress === 'string' &&
      !sameAddress(payload.authAddress, session.walletAddress)
    ) {
      logOrderEvent(logger, 'error', 'auth_address_mismatch', {
        clientAuthAddress: payload.authAddress,
        sessionAuthAddress: session.walletAddress,
      });
      return NextResponse.json(
        { ok: false, error: 'Auth address mismatch.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
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

    const signatureType = Number(normalizedOrder.signatureType);
    const funderAddress =
      typeof payload.funderAddress === 'string' ? payload.funderAddress : null;
    const authAddress = session.walletAddress;
    const maker = normalizedOrder.maker;
    const signer = normalizedOrder.signer;
    const accountModelErrors: string[] = [];
    if (signatureType === 0) {
      if (!sameAddress(maker, authAddress)) accountModelErrors.push('EOA maker must match auth address.');
      if (!sameAddress(signer, authAddress)) accountModelErrors.push('EOA signer must match auth address.');
    } else if (signatureType === 1 || signatureType === 2) {
      if (!sameAddress(signer, authAddress)) {
        accountModelErrors.push('Proxy/Safe signer must match auth address.');
      }
      if (funderAddress && !sameAddress(maker, funderAddress)) {
        accountModelErrors.push('Proxy/Safe maker must match funder address.');
      }
    } else if (signatureType === 3) {
      if (!funderAddress) accountModelErrors.push('POLY_1271 funder address is required.');
      if (!sameAddress(maker, signer)) {
        accountModelErrors.push('POLY_1271 maker and signer must match.');
      }
      if (funderAddress && !sameAddress(maker, funderAddress)) {
        accountModelErrors.push('POLY_1271 maker must match funder address.');
      }
      if (typeof normalizedOrder.signature === 'string' && normalizedOrder.signature.length <= 132) {
        accountModelErrors.push('POLY_1271 signature must be the wrapped ERC-7739 signature.');
      }
    } else {
      accountModelErrors.push('Unsupported signature type.');
    }
    if (accountModelErrors.length) {
      logOrderEvent(logger, 'error', 'order_account_model_mismatch', {
        signatureType,
        maker,
        signer,
        funderAddress,
        authAddress,
        accountModelErrors,
      });
      return NextResponse.json(
        { ok: false, error: 'Order account model mismatch.', details: { accountModelErrors } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    try {
      sanitizeOrderPayload({
        orderType: execution as 'FAK' | 'FOK' | 'GTC' | 'GTD',
        order: normalizedOrder as Record<string, unknown>,
      });
    } catch (error) {
      logOrderEvent(logger, 'error', 'order_payload_serialization_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
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
        tokenId: normalizedOrder.tokenId,
        salt: normalizedOrder.salt,
        makerAmount: normalizedOrder.makerAmount,
        takerAmount: normalizedOrder.takerAmount,
        side: normalizedOrder.side,
        signatureType: normalizedOrder.signatureType,
        timestamp: normalizedOrder.timestamp,
        expiration: normalizedOrder.expiration,
        metadata: normalizedOrder.metadata,
        builder: normalizedOrder.builder,
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
      builderCode: orderPayload.order.builder,
    };

    const requestPath = '/order';
    const body = JSON.stringify(orderPayload);
    try {
      const l2Headers = await buildL2Headers(session, {
        method: 'POST',
        requestPath,
        body,
      });
      const headers = {
        'Content-Type': 'application/json',
        ...l2Headers,
      };

      logOrderEvent(logger, 'info', 'order_submission_started', {
        orderKeys: Object.keys(orderPayload.order ?? {}),
        orderType: orderPayload.orderType,
        side: orderPayload.order?.side,
        tokenIdPrefix: String(orderPayload.order?.tokenId ?? '').slice(0, 12),
        builderCode: orderPayload.order?.builder,
        hasBuilder: Boolean(orderPayload.order?.builder),
        signatureType,
        maker,
        signer,
        funderAddress,
        authAddress,
        apiKey: redactCredential(session.l2.apiKey),
        passphrase: redactCredential(session.l2.passphrase),
        hasSecret: Boolean(session.l2.secret),
      });
      if (process.env.POLYMARKET_ORDER_DEBUG === '1') {
        logOrderEvent(logger, 'info', 'final_order_payload_debug', {
          payload: redactOrderPayload(orderPayload),
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

      logOrderEvent(logger, 'info', 'order_response_status', {
        status: res.status,
        builderCode: orderPayload.order.builder,
      });

      const contentType = res.headers.get('content-type') ?? '';
      const cfRay = res.headers.get('cf-ray') ?? null;
      const looksLikeHtml = contentType.includes('text/html') || /<html/i.test(text);
      const looksLikeCloudflare = Boolean(cfRay) || text.toLowerCase().includes('cloudflare');
      if (looksLikeHtml || (looksLikeCloudflare && !contentType.includes('application/json'))) {
        logOrderEvent(logger, 'error', 'exchange_non_json_response', {
          status: res.status,
          contentType,
          cfRay,
          sent: sentDebug,
        });
        return NextResponse.json(
          {
            ok: false,
            error: normalizeExchangeError('CLOB error', text),
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
          logOrderEvent(logger, 'error', 'exchange_json_parse_failed', {
            status: res.status,
            contentType,
            cfRay,
            sent: sentDebug,
          });
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
        logOrderEvent(logger, 'error', 'exchange_http_rejection', {
          status: res.status,
          body: data ?? null,
          sent: {
            ...sentDebug,
            signatureType,
            maker,
            signer,
            funderAddress,
            authAddress,
            apiKey: redactCredential(session.l2.apiKey),
          },
        });
        const serializedBody = JSON.stringify(data ?? {}).toLowerCase();
        if (res.status === 401 && serializedBody.includes('invalid authorization')) {
          const redactedApiKey = redactCredential(session.l2.apiKey);
          session.destroy?.();
          logOrderEvent(logger, 'error', 'invalid_l2_authorization_session_cleared', {
            authAddress,
            apiKey: redactedApiKey,
          });
          return NextResponse.json(
            {
              ok: false,
              code: 'AUTH_INVALID_SESSION',
              error: 'Polymarket authorization expired. Reinitializing wallet session.',
              details: {
                status: res.status,
                body: data ?? null,
              },
              sent: sentDebug,
            },
            { status: 401, headers: { 'Cache-Control': 'no-store' } },
          );
        }
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
      const redacted = data && typeof data === 'object'
        ? { ...data, signature: redactSignature((data as { signature?: unknown }).signature) }
        : data;
      logOrderEvent(logger, 'info', 'order_response_body', {
        response: redacted ?? null,
      });
      if (
        data
        && typeof data === 'object'
        && 'success' in data
        && (data as { success?: unknown }).success === false
      ) {
        logOrderEvent(logger, 'error', 'exchange_business_rejection', {
          body: data,
          sent: sentDebug,
        });
        return NextResponse.json(
          {
            ok: false,
            error: normalizeExchangeError(
              (data as { errorMsg?: string }).errorMsg ?? 'Order rejected',
              data,
            ),
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
      logOrderEvent(logger, 'error', 'order_post_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { ok: false, error: 'CLOB error' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
};
