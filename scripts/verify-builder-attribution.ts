import { Chain, ClobClient } from '@polymarket/clob-client-v2';
import { existsSync, readFileSync } from 'fs';

for (const envFile of ['.env.local', '.env']) {
  if (!existsSync(envFile)) continue;
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

const requireEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const builderCode = requireEnv('POLYMARKET_BUILDER_CODE');
if (!/^0x[0-9a-fA-F]{64}$/.test(builderCode)) {
  throw new Error('POLYMARKET_BUILDER_CODE must be a bytes32 hex value.');
}

const client = new ClobClient({
  host: process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com',
  chain: Chain.POLYGON,
  creds: {
    key: requireEnv('POLYMARKET_API_KEY'),
    secret: requireEnv('POLYMARKET_SECRET'),
    passphrase: requireEnv('POLYMARKET_PASSPHRASE'),
  },
  builderConfig: { builderCode },
});

const main = async () => {
  const response = await client.getBuilderTrades({ builder_code: builderCode });

  console.log(
    JSON.stringify(
      {
        ok: true,
        builderCode,
        count: response.count,
        next_cursor: response.next_cursor,
        sample: response.trades.slice(0, 3).map((trade) => ({
          id: trade.id,
          market: trade.market,
          assetId: trade.assetId,
          side: trade.side,
          size: trade.size,
          price: trade.price,
          status: trade.status,
          builderCode: trade.builderCode,
          transactionHash: trade.transactionHash,
        })),
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
