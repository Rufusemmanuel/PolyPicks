# Deployment Environment

PolyPicks trading is a user-wallet flow. The backend never signs user orders with a server private key.

## Required for user trading

| Variable | Purpose |
| --- | --- |
| `ENABLE_TRADING=true` | Enables trading UI/actions. |
| `POLYMARKET_BUILDER_CODE` | Bytes32 builder code injected before wallet signing and validated before CLOB submission. |
| `POLYPICKS_SESSION_SECRET` | Encrypts the short-lived user-derived Polymarket L2 session cookie. Use 32+ characters. |

The usual app infrastructure variables, such as `DATABASE_URL`, are still required for login and persistence.

Set `NEXT_PUBLIC_POLY_SIGNATURE_TYPE` to the wallet model being used: `0` for direct EOA, `1` for Polymarket proxy, `2` for existing Gnosis Safe proxy, or `3` for deposit-wallet `POLY_1271`. Deposit-wallet orders require `maker` and `signer` to both be the deposit wallet address.

## Optional admin/reporting

| Variable | Purpose |
| --- | --- |
| `POLYMARKET_API_KEY` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_SECRET` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_PASSPHRASE` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_PRIVATE_KEY` | Local live-attribution/admin script signer only. Do not configure it for normal app trading. |
| `POLYMARKET_RELAYER_API_KEY` | Server-only credential for forwarding Safe/proxy relayer `/submit` requests. Not exposed to the browser. |
| `POLYMARKET_RELAYER_API_KEY_ADDRESS` | Address paired with `POLYMARKET_RELAYER_API_KEY`. Not exposed to the browser. |

## User order path

1. The browser connects an injected wallet and derives a viem signer.
2. The user signs CLOB auth and order typed data from the connected wallet.
3. `POLYMARKET_BUILDER_CODE` is added before signing and becomes the signed V2 `order.builder` field.
4. The backend validates `order.builder`, uses the user-derived L2 session to post the signed order, and never creates a custodial order.
5. If CLOB returns `401 invalid authorization`, the backend clears the stale user L2 session so the browser can re-derive credentials from the connected wallet and retry.
6. Safe/proxy relayer transactions are signed in the browser, then submitted through `/api/polymarket/submit`; only the backend forwards to Polymarket relayer `/submit` with `RELAYER_API_KEY` headers.
