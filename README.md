# PolyPicks

Next.js 14 + Prisma dashboard for Polymarket markets.

## Setup
- Install deps: `npm install`
- Set `DATABASE_URL` to a Postgres connection string (required in all environments).
- Copy `.env.example` to `.env` and update:
  - `DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require"`
- Set user-wallet trading config in `.env.local` or deployment env:
  - `ENABLE_TRADING=true`
  - `POLYMARKET_BUILDER_CODE=0x...`
  - `POLYPICKS_SESSION_SECRET=...` (32+ chars)
- Do not set `POLYMARKET_PRIVATE_KEY` for normal trading. Users sign orders from connected wallets.
- Optional admin/reporting credentials:
  - `POLYMARKET_API_KEY`, `POLYMARKET_SECRET`, and `POLYMARKET_PASSPHRASE` are only used by builder analytics/reporting utilities.
  - `POLYMARKET_PRIVATE_KEY` is only used by local live-attribution/admin scripts.
  - `POLYMARKET_RELAYER_API_KEY` and `POLYMARKET_RELAYER_API_KEY_ADDRESS` are server-only credentials for forwarding Safe/proxy relayer `/submit` requests. Never expose them with `NEXT_PUBLIC_`.
- Optional client flags:
  - `NEXT_PUBLIC_CLOB_DEBUG=false`
  - `NEXT_PUBLIC_FORCE_EOA=false`
  - `NEXT_PUBLIC_POLY_RELAYER_URL=`
  - `NEXT_PUBLIC_POLY_SIGNATURE_TYPE=2` for existing Safe proxy users; use `3` only for deposit wallets that require `POLY_1271`.
  - `POLYMARKET_DATA_API_BASE_URL=https://data-api.polymarket.com`
- For soccer stats, set `FOOTBALL_DATA_API_KEY` in `.env.local` (local dev) or Vercel Project Settings → Environment Variables.
- Generate Prisma client: `npx prisma generate`
- Start dev server: `npm run dev`

## Vercel
- Set `DATABASE_URL` in Project Settings to your Postgres connection string.
- Run migrations in production:
  - Vercel will auto-run `npm run vercel-build` if present.
  - `vercel-build` runs migrations only when `VERCEL_ENV=production`.
  - Optional: set `ALLOW_DB_RESET_ON_FAILED_MIGRATIONS=1` to auto-reset a fresh database on failed migrations.
- Do not run `prisma db pull` against production; it can overwrite `prisma/schema.prisma` and drop models that are not yet present in the database.
- For user-wallet trading deployments, the required trading runtime vars are only `ENABLE_TRADING=true`, `POLYMARKET_BUILDER_CODE`, and `POLYPICKS_SESSION_SECRET`. Server-side Polymarket API credentials and private keys are optional admin/reporting inputs, not trading blockers.

The app uses the Polymarket Gamma/Data API and an optional RTDS WebSocket for live prices.

Builder-attributed trading uses CLOB V2 `builderCode`. The browser fetches the server-configured bytes32 code before signing, the SDK serializes it into the final order `builder` field, and the server rejects posts where that field is missing or mismatched.

Order signing supports Polymarket V2 signature types `0`, `1`, `2`, and `3`. Existing proxy/Safe wallets use their existing type (`1` or `2`). Deposit-wallet orders must use `3`, with `maker` and `signer` equal to the deposit wallet address.
