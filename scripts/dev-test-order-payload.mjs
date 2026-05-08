const builderCode =
  process.env.POLYMARKET_BUILDER_CODE ??
  '0x1111111111111111111111111111111111111111111111111111111111111111';

const sampleOrder = {
  tradeMode: 'market',
  execution: 'FOK',
  tokenId: '5863',
  side: 'BUY',
  signatureType: 2,
  funderAddress: '0x0000000000000000000000000000000000000000',
  order: {
    salt: '1',
    maker: '0x0000000000000000000000000000000000000000',
    signer: '0x0000000000000000000000000000000000000000',
    tokenId: '5863',
    makerAmount: '1',
    takerAmount: '1',
    side: 'BUY',
    signatureType: 2,
    timestamp: '1700000000',
    expiration: '0',
    metadata: '0x0000000000000000000000000000000000000000000000000000000000000000',
    builder: builderCode,
    signature: '0x' + '0'.repeat(130),
  },
};

const url = process.env.ORDER_TEST_URL ?? 'http://localhost:3000/api/polymarket/order';

try {
  const variants = [
    { label: 'v2-builder-attributed', payload: sampleOrder },
  ];

  for (const variant of variants) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variant.payload),
    });
    const text = await res.text();
    console.log('Variant:', variant.label);
    console.log('Status:', res.status);
    console.log('Response:', text || '<empty>');
  }
} catch (error) {
  console.warn('Order payload test skipped (server unreachable).', error);
}
