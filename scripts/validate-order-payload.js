/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/validate-order-payload.js <payload.json>');
  process.exit(1);
}

const fullPath = path.resolve(process.cwd(), filePath);
const raw = fs.readFileSync(fullPath, 'utf8');
const payload = JSON.parse(raw);

const errors = [];
if (!payload || typeof payload !== 'object') {
  errors.push('payload');
} else {
  if (!payload.order || typeof payload.order !== 'object') errors.push('order');
  if (typeof payload.owner !== 'string') errors.push('owner');
  if (typeof payload.orderType !== 'string') errors.push('orderType');
  if (typeof payload.signature === 'string') {
    errors.push('signature (unexpected top-level)');
  }

  const order = payload.order || {};
  [
    'maker',
    'signer',
    'tokenId',
    'makerAmount',
    'takerAmount',
    'timestamp',
    'expiration',
    'metadata',
    'builder',
  ].forEach((key) => {
    if (typeof order[key] !== 'string') errors.push(`order.${key}`);
  });
  const saltValue = order.salt;
  const saltIsNumericString =
    typeof saltValue === 'string' && /^[0-9]+$/.test(saltValue);
  if (!(typeof saltValue === 'number' || saltIsNumericString)) {
    errors.push('order.salt');
  }
  if (saltIsNumericString) {
    console.warn('Warning: order.salt is a string, expected number when forwarded.');
  }
  if (typeof order.signature !== 'string' || !order.signature.startsWith('0x')) {
    errors.push('order.signature');
  }
  if (order.side !== 'BUY' && order.side !== 'SELL') errors.push('order.side');
  if (typeof order.signatureType !== 'number') errors.push('order.signatureType');
}

if (errors.length) {
  console.error('Invalid payload fields:', errors.join(', '));
  process.exit(1);
}

console.log('Payload is valid.');
