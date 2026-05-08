# Deployment Environment

PolyPicks trading is a user-wallet flow. The backend never signs user orders with a server private key.

## Required for user trading

| Variable | Purpose |
| --- | --- |
| `ENABLE_TRADING=true` | Enables trading UI/actions. |
| `POLYMARKET_BUILDER_CODE` | Bytes32 builder code injected before wallet signing and validated before CLOB submission. |
| `POLYPICKS_SESSION_SECRET` | Encrypts the short-lived user-derived Polymarket L2 session cookie. Use 32+ characters. |

The usual app infrastructure variables, such as `DATABASE_URL`, are still required for login and persistence.

## Optional admin/reporting

| Variable | Purpose |
| --- | --- |
| `POLYMARKET_API_KEY` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_SECRET` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_PASSPHRASE` | Builder analytics/reporting client credential. Not used for user order signing. |
| `POLYMARKET_PRIVATE_KEY` | Local live-attribution/admin script signer only. Do not configure it for normal app trading. |

## User order path

1. The browser connects an injected wallet and derives a viem signer.
2. The user signs CLOB auth and order typed data from the connected wallet.
3. `POLYMARKET_BUILDER_CODE` is added before signing and becomes the signed V2 `order.builder` field.
4. The backend validates `order.builder`, uses the user-derived L2 session to post the signed order, and never creates a custodial order.
