import { createOrderHandler } from '../src/lib/server/polymarketOrderHandler';

process.env.POLYMARKET_BUILDER_CODE =
  process.env.POLYMARKET_BUILDER_CODE ??
  '0x1111111111111111111111111111111111111111111111111111111111111111';

const handler = createOrderHandler({
  getSession: async () => ({
    l2: {
      apiKey: 'test-api-key',
      secret: 'test-secret',
      passphrase: 'test-passphrase',
    },
    walletAddress: '0x0000000000000000000000000000000000000001',
    createdAt: Date.now(),
  }),
  isSessionExpired: () => false,
  buildL2Headers: async () => ({
    POLY_ADDRESS: '0x0000000000000000000000000000000000000001',
    POLY_SIGNATURE: 'test-signature',
    POLY_TIMESTAMP: '0',
    POLY_API_KEY: 'test-api-key',
    POLY_PASSPHRASE: 'test-passphrase',
  }),
  clobHost: 'https://clob.polymarket.com',
  fetchImpl: async (_url, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (
      body?.order?.side !== 'BUY' ||
      body?.orderType !== 'FOK' ||
      body?.order?.builder !== process.env.POLYMARKET_BUILDER_CODE
    ) {
      return new Response(JSON.stringify({ success: false, errorMsg: 'Unexpected payload' }), {
        status: 400,
      });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  },
  logger: {
    info: () => {},
    error: console.error,
  },
});

const payload = {
  tradeMode: 'market',
  execution: 'FOK',
  tokenId: '5863',
  side: 'BUY',
  order: {
    salt: '1',
    maker: '0x0000000000000000000000000000000000000001',
    signer: '0x0000000000000000000000000000000000000001',
    tokenId: '5863',
    makerAmount: '1000000',
    takerAmount: '1000000',
    side: 'BUY',
    signatureType: 2,
    timestamp: '1700000000',
    expiration: '0',
    metadata: '0x0000000000000000000000000000000000000000000000000000000000000000',
    builder: process.env.POLYMARKET_BUILDER_CODE,
    signature: `0x${'0'.repeat(130)}`,
  },
};

const postPayload = async (body: unknown) => {
  const request = new Request('http://localhost/api/polymarket/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await handler(request);
  const data = await response.json();
  return { response, data };
};

const clonePayload = () => JSON.parse(JSON.stringify(payload)) as typeof payload;

const run = async () => {
  const { response, data } = await postPayload(payload);

  if (!response.ok || !data?.ok) {
    console.error('BUY order handler test failed.', {
      status: response.status,
      data,
    });
    process.exit(1);
  }

  const missingBuilderPayload = clonePayload();
  delete (missingBuilderPayload.order as Partial<typeof missingBuilderPayload.order>).builder;
  const missingBuilder = await postPayload(missingBuilderPayload);
  if (missingBuilder.response.status !== 400) {
    console.error('Missing builder guard failed.', missingBuilder);
    process.exit(1);
  }
  const missing = missingBuilder.data?.details?.missing ?? [];
  if (!Array.isArray(missing) || !missing.includes('order.builder')) {
    console.error('Missing builder guard returned unexpected details.', missingBuilder.data);
    process.exit(1);
  }

  const mismatchedBuilderPayload = clonePayload();
  mismatchedBuilderPayload.order.builder =
    '0x2222222222222222222222222222222222222222222222222222222222222222';
  const mismatchedBuilder = await postPayload(mismatchedBuilderPayload);
  if (
    mismatchedBuilder.response.status !== 400 ||
    mismatchedBuilder.data?.error !== 'Order builder code mismatch.'
  ) {
    console.error('Mismatched builder guard failed.', mismatchedBuilder);
    process.exit(1);
  }

  console.log('BUY order handler and builder attribution guard tests passed.');
};

run().catch((error) => {
  console.error('BUY order handler test failed.', error);
  process.exit(1);
});
