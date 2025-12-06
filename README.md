# Polybet

Next.js 14 + Prisma + SQLite dashboard for Polymarket markets.

## Setup
- Install deps: `npm install`
- Ensure the `data` directory exists (it does by default) and points to the SQLite file at `./data/polybet.db`.
- Copy `.env.example` to `.env` (or set `DATABASE_URL` yourself):
  - `DATABASE_URL="file:./data/polybet.db"`
- Generate Prisma client: `npx prisma generate`
- Start dev server: `npm run dev`

The app uses the Polymarket Gamma/Data API and an optional RTDS WebSocket for live prices.
