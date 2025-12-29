# PolyPicks

Next.js 14 + Prisma dashboard for Polymarket markets.

## Setup
- Install deps: `npm install`
- Set `DATABASE_URL` to a Postgres connection string (required in all environments).
- Copy `.env.example` to `.env` and update:
  - `DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require"`
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

The app uses the Polymarket Gamma/Data API and an optional RTDS WebSocket for live prices.
