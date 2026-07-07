# Pesatrix → Dashboard Webhook

How Pesatrix reports payment events to the external paybill dashboard.

## Overview

All outbound webhook delivery goes through a single function:
[`sendPaybillWebhook()`](../src/lib/paybill-webhook.ts) in `src/lib/paybill-webhook.ts`.

It reads two environment variables:

| Env var | Purpose |
|---|---|
| `PAYBILL_DASHBOARD_WEBHOOK_URL` | Destination URL. If unset, delivery is silently **skipped**. |
| `PAYBILL_DASHBOARD_WEBHOOK_SECRET` | HMAC signing key (optional). If unset, **no signature header** is sent. |

> ⚠️ Both are currently **empty** in `.env` (lines 35–36), so no webhooks are actually delivered until they are configured.

## Which payments trigger it

There are exactly **two event types**.

### `event: "activation"`
Fired when a user's account-activation payment (M-Pesa STK) is confirmed as **paid**:

- `src/app/api/payments/mpesa/callback/route.ts:230` — automatic Daraja STK callback marks the payment `paid`
- `src/app/api/admin/payments/[id]/verify/route.ts:84` — an admin manually verifies a payment

### `event: "withdrawal"`
Fired when a user withdrawal (M-Pesa B2C) completes **successfully**:

- `src/lib/wallet/finalizeWithdrawal.ts:99`
- `src/app/api/payments/mpesa/b2c-callback/route.ts:91`
- `src/app/api/payments/b2c/result/route.ts:128`
- `src/app/api/mpesa/b2c/result/route.ts:82`

**Trigger condition:** it fires **only on success** — after the DB row is updated to `paid` / `sent`. Failed or pending payments do not trigger it. Note there are several parallel B2C-result routes all wired to fire the withdrawal event, so depending on which callback URL Safaricom hits, one of them delivers it.

## How it's sent (transport)

- **Method:** `POST`
- **Body:** `JSON.stringify(payload)`, `cache: no-store`
- **Timeout:** 8 seconds (request aborts after that). Failures are logged but **non-fatal** — a webhook failure never rolls back the payment.
- **Retry:** none. Failed webhooks are not persisted or retried (only logged to console).

### Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Pesatrix-Event` | `activation` or `withdrawal` |
| `X-Pesatrix-Signature` | `HMAC-SHA256(secret, rawBody)` as hex — **only present if the secret is configured** |

## Payload format & contents

Typed by `PaybillWebhookPayload`. Both event types share the **same shape**:

```json
{
  "event": "activation",
  "transaction_id": "SGR7XYZ12K",
  "amount": 300,
  "phone": "254712345678",
  "platform": "pesatrix",
  "timestamp": "2026-07-07T12:34:56.000Z",
  "reference_id": "uuid-...",
  "user_id": "uuid-..."
}
```

| Field | Type | Notes |
|---|---|---|
| `event` | string | `"activation"` or `"withdrawal"` |
| `transaction_id` | string | M-Pesa receipt (activation) or B2C transaction id (withdrawal). May be `""` if the provider didn't return one. |
| `amount` | number | Coerced to a JS number; value in KES. |
| `phone` | string | Payer / recipient phone. |
| `platform` | string | Constant literal `"pesatrix"`. |
| `timestamp` | string | ISO 8601, time of confirmation. |
| `reference_id` | string | Internal DB primary key: `activation_payments.id` (activation) or the withdrawal request id (withdrawal). |
| `user_id` | string | Owning user id. |

## What the receiving webhook should expect / do

1. Accept `POST application/json` and return a **2xx quickly** — Pesatrix aborts at 8s and treats non-2xx as a failed delivery (logged, not retried).
2. Branch on the `X-Pesatrix-Event` header (or `body.event`) → `activation` vs `withdrawal`.
3. **Verify the signature:** compute `HMAC-SHA256` of the **raw request body** using the shared secret and constant-time compare against `X-Pesatrix-Signature`. Reject on mismatch. Compute over the raw bytes, not a re-serialized object.
4. **Idempotency:** there is no built-in retry, but multiple B2C-result routes can fire for the same withdrawal — dedupe on `reference_id` (+ `event`).
5. Treat `transaction_id` as possibly empty and `amount` as a number in KES.

## Known gap

There is **no delivery retry and no persistence of failed webhooks**. If the receiver is down or slow (>8s), the event is lost (only logged). For guaranteed delivery, add a queue/retry or an outbox table.
