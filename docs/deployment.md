# Deployment Environment

PolyPicks trading is a user-wallet flow. The backend never signs user orders with a server private key.

## Required for user trading

| Variable | Purpose |
| --- | --- |
| `ENABLE_TRADING=true` | Enables trading UI/actions. |
| `POLYMARKET_BUILDER_CODE` | Bytes32 builder code injected before wallet signing and validated before CLOB submission. |
| `POLYPICKS_SESSION_SECRET` | Encrypts the short-lived user-derived Polymarket L2 session cookie. Use 32+ characters. |

The usual app infrastructure variables, such as `DATABASE_URL`, are still required for login and persistence.

Set `NEXT_PUBLIC_POLY_SIGNATURE_TYPE=3` for normal browser user trading with deposit-wallet `POLY_1271`. Existing proxy/Safe accounts can use `1` or `2` as a legacy override. Browser user trades do not use direct EOA type `0`. Deposit-wallet orders require `maker` and `signer` to both be the deposit wallet address.

## Optional admin/reporting

| Variable | Purpose |
| --- | --- |
| `POLYMARKET_API_KEY` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_SECRET` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_PASSPHRASE` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_PRIVATE_KEY` | Local live-attribution/admin script signer only. Do not configure it for normal app trading. |
| `POLYMARKET_BUILDER_API_KEY` | Server-only Builder API key for forwarding user-signed relayer `/submit` payloads. Required only when relayer-backed Safe/proxy/deposit-wallet transactions are enabled. |
| `POLYMARKET_BUILDER_SECRET` | Server-only Builder API secret used to sign `/submit` requests. Required only with the builder relayer submit path. |
| `POLYMARKET_BUILDER_PASSPHRASE` | Server-only Builder API passphrase sent with builder-authenticated `/submit` requests. Required only with the builder relayer submit path. |

## User order path

1. The browser connects an injected wallet and derives a viem signer.
2. New users derive/deploy a deterministic Polymarket deposit wallet through relayer `WALLET-CREATE`.
3. `POLYMARKET_BUILDER_CODE` is added before signing and becomes the signed V2 `order.builder` field.
4. The browser initializes CLOB signing with `signatureType=3` and the deposit wallet as `funderAddress`, producing a wrapped `POLY_1271` order where `maker` and `signer` are the deposit wallet.
5. The backend validates `order.builder`, validates the deposit-wallet account model, uses the user-derived L2 session to post the signed order, and never creates a custodial order.
6. If CLOB returns `401 invalid authorization`, the backend clears the stale user L2 session so the browser can re-derive credentials from the connected wallet and retry.
7. Deposit-wallet approvals are sent as relayer `WALLET` batches through `/api/polymarket/submit`; only the backend forwards the untouched user-signed payload to Polymarket relayer `/submit` with Builder API auth headers.
