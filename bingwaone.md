# BingwaOne → Paybill Dashboard Webhook

How BingwaOne pushes settled money-movement events to the external paybill dashboard, what
triggers each event, the exact wire format, and what the receiving webhook must do.

Source of truth: [`lib/payments/paybill-reporter.ts`](../lib/payments/paybill-reporter.ts).

---

## 1. Overview

After money settles, BingwaOne fires a **signed HTTP POST** to a single external endpoint (the
"paybill dashboard") so settlement can be reconciled outside the platform. Every event is:

- recorded first in the `payment_export_events` table (dedupe + retry ledger), then
- delivered as an **HMAC-SHA256-signed JSON POST**.

All three reporter functions build a payload and hand it to one internal deliverer
(`deliverPaybillEvent`), so the transport, signing, headers, retry and dedupe behaviour are
**identical** across every event type. Only the JSON body differs.

---

## 2. What triggers a webhook call

There are **three event families**, from three call sites:

| # | Event(s) | Direction | Trigger / call site | Fires when |
|---|----------|-----------|---------------------|-----------|
| 1 | `payment.completed` | `incoming` | `reportCompletedPaybillPayment` — called via `safelyReportCompletedPayment` in [`app/api/payments/callback/route.ts`](../app/api/payments/callback/route.ts) | An M-Pesa STK (Daraja) callback marks a `payments` row **`completed`**, and the payment is eligible (see gate below). Covers every completed inbound service: subscriptions, posters, storefront/mini-site sales, WhatsApp bundle sales, buy-for-another, Join Guide, whitelisting, etc. |
| 2 | `wallet.withdrawal.completed` | `outgoing` | `reportWalletWithdrawal` in [`app/api/agent-wallet/b2c-callback/route.ts`](../app/api/agent-wallet/b2c-callback/route.ts) | A B2C payout for an **agent wallet withdrawal** succeeds (`resultCode === 0`). |
| 3 | `bonga.payout.completed` | `outgoing` | `reportOutgoingPaybillTransfer` in [`app/api/bonga/b2c-callback/route.ts`](../app/api/bonga/b2c-callback/route.ts) | A **Bonga points sell** B2C payout to an agent succeeds (`resultCode === 0`). `reportOutgoingPaybillTransfer` is generic (`event`/`serviceSource` are passed in), so future outgoing transfers reuse it with new event names. |

### Eligibility gate for `payment.completed` (important)

Not every completed payment is reported. `reportCompletedPaybillPayment` reports **only if**
`shouldReportPaybillPayment(metadata.settlement_destination, metadata.paybill_id)` returns true
([`lib/payments/buy-for-another.ts`](../lib/payments/buy-for-another.ts)):

```ts
shouldReportPaybillPayment(destination, paybillId):
  if (!paybillId) return false;                      // no paybill → not reported
  return destination !== "agent_till"                // money that landed directly
      && destination !== "agent_buy_for_another_till"; // on an agent's till is NOT reported
```

So a payment is reported when it has a `paybill_id` in metadata **and** its
`settlement_destination` is **not** `agent_till` or `agent_buy_for_another_till` — i.e. money that
flowed through / settled on the BingwaZone paybill (e.g. `bingwazone_paybill`), not money that went
straight to an agent's own till. Additionally the payment must be `status === "completed"` or the
function returns early.

Events 2 and 3 have **no eligibility gate** — every successful withdrawal / Bonga payout is
reported.

---

## 3. Delivery mechanism (identical for all events)

Implemented in `deliverPaybillEvent`:

1. **Idempotency ledger.** Look up `payment_export_events` by `event_key`. If a row already exists
   with `status = "sent"`, **do nothing** (already delivered). Otherwise insert a `pending` row
   (unique `event_key`; a `23505` unique-violation race is swallowed).
2. **Resolve config.** URL from `PAYBILL_DASHBOARD_WEBHOOK_URL` env, else `app_config` key
   `paybill_dashboard_webhook_url`. Secret from `PAYBILL_DASHBOARD_WEBHOOK_SECRET` env. If URL or
   secret is missing, the event is marked `failed` and nothing is sent.
3. **Sign.** `body = JSON.stringify(payload)`; `signature = HMAC_SHA256(secret, body)` as lowercase
   hex.
4. **POST** to the webhook URL with up to **3 attempts**, 10 s timeout each (`AbortSignal.timeout`),
   `cache: "no-store"`. Success = **any HTTP 2xx** (`response.ok`); the loop breaks on first 2xx.
5. **Persist result.** On success → row `status = "sent"`, `sent_at` set, `attempts` incremented.
   On failure after 3 tries → `status = "failed"`, `last_error` stores the message (truncated to
   2000 chars). Delivery failures are logged and swallowed — they never break the M-Pesa callback
   (`safely*` wrappers).

### HTTP request

```
POST <PAYBILL_DASHBOARD_WEBHOOK_URL>
Content-Type: application/json
X-BingwaZone-Event: <event_key>
X-BingwaZone-Signature: sha256=<hex hmac of the raw body>

<raw JSON body>
```

- **Method:** always `POST`.
- **`X-BingwaZone-Event`** header = the `event_key` (also the dedupe key; see below).
- **`X-BingwaZone-Signature`** header = `sha256=` + hex HMAC-SHA256 of the **exact raw body bytes**,
  keyed by the shared secret.

### `event_key` (per-event unique id, used for dedupe)

| Event | `event_key` format |
|-------|--------------------|
| `payment.completed` | `payment:<paymentId>:completed` |
| `wallet.withdrawal.completed` | `wallet-withdrawal:<withdrawalId>:completed` |
| `bonga.payout.completed` | `bonga-payout:<paymentId>:completed` |

The same event may be POSTed more than once (M-Pesa can re-deliver callbacks; BingwaOne retries). The
receiver **must treat `event_key` as an idempotency key** and de-duplicate on it. BingwaOne
suppresses re-sends only after a `2xx` was recorded.

---

## 4. Payload formats

All bodies share a common envelope:

```jsonc
{
  "schema_version": 1,
  "event": "<event name>",
  "source_system": "bingwazone",
  "occurred_at": "<ISO 8601 timestamp>",
  // ...one event-specific object (payment | withdrawal | transfer)...
  "agent": { ... } | null
}
```

Amounts are numbers (KES), `currency` is always `"KES"`. Any field can be `null` where noted.

### 4.1 `payment.completed` (incoming)

```jsonc
{
  "schema_version": 1,
  "event": "payment.completed",
  "source_system": "bingwazone",
  "occurred_at": "2026-07-07T12:34:56.000Z",   // payment.completed_at
  "payment": {
    "id": "uuid",
    "type": "subscription | poster | mini_site_sale | ...",
    "module": "whatsapp | storefront | ... | null",
    "amount": 100,
    "currency": "KES",
    "payer_phone": "2547XXXXXXXX",
    "recipient_phone": "2547XXXXXXXX | null",   // from metadata.recipient_phone
    "receipt": "M-Pesa receipt e.g. SFK... | null",
    "provider": "mpesa | ...",
    "paybill_id": "routing paybill id (from metadata)",
    "account_reference": "string | null",       // metadata.reference
    "service_source": "human-readable source (see below)",
    "initiated_at": "ISO 8601",
    "completed_at": "ISO 8601",
    "metadata": { /* full raw payments.metadata object */ }
  },
  "agent": {                                     // null if payment has no agent_id
    "id": "uuid",
    "name": "string | null",
    "business_name": "string | null",
    "username": "string | null"
  }
}
```

**`service_source`** is derived by `describePaymentSource(type, module, metadata)`:

- `subscription` → `"<module>_subscription"` (e.g. `whatsapp_subscription`)
- `poster` → `metadata.source` or `"poster"`
- `mini_site_sale` + `module === "whatsapp"` → `"whatsapp_bundle_sale"`
- `mini_site_sale` (other) → `"mini_site_buy_for_another"` if `metadata.purchase_mode === "buy_for_another"`, else `"mini_site_sale"`
- otherwise → `"<module>_<type>"`

### 4.2 `wallet.withdrawal.completed` (outgoing)

```jsonc
{
  "schema_version": 1,
  "event": "wallet.withdrawal.completed",
  "source_system": "bingwazone",
  "occurred_at": "ISO 8601",                    // withdrawal.completed_at or now
  "withdrawal": {
    "id": "uuid",
    "amount": 500,
    "currency": "KES",
    "destination_phone": "2547XXXXXXXX",
    "conversation_id": "M-Pesa B2C conversation id | null",
    "service_source": "agent_wallet"
  },
  "agent": {
    "id": "uuid",
    "name": "string | null",
    "business_name": "string | null",
    "username": "string | null"
  }
}
```

### 4.3 `bonga.payout.completed` (outgoing)

Produced by the generic `reportOutgoingPaybillTransfer`; the `transfer` object is the same shape for
any future outgoing transfer event.

```jsonc
{
  "schema_version": 1,
  "event": "bonga.payout.completed",
  "source_system": "bingwazone",
  "occurred_at": "ISO 8601",                    // now (delivery time)
  "transfer": {
    "amount": 250,
    "currency": "KES",
    "destination_phone": "2547XXXXXXXX",
    "conversation_id": "M-Pesa B2C conversation id",
    "service_source": "bonga_sell",
    "metadata": { /* payment.metadata */ }
  },
  "agent": {                                     // null if no agentId
    "id": "uuid",
    "name": "string | null",
    "business_name": "string | null",
    "username": "string | null"
  }
}
```

---

## 5. What the receiving webhook must do

To be a correct consumer of these events, the dashboard endpoint should:

1. **Accept `POST` application/json** and read the **raw body** before parsing (needed for signature
   verification).
2. **Verify the signature.** Compute `HMAC_SHA256(shared_secret, raw_body)` as hex and constant-time
   compare against the `X-BingwaZone-Signature` header value **with the `sha256=` prefix stripped**.
   Reject (`401`) on mismatch. The shared secret is whatever is set as
   `PAYBILL_DASHBOARD_WEBHOOK_SECRET` on the BingwaOne side.
3. **Idempotency.** Use `X-BingwaZone-Event` (== `payload`-scoped `event_key`) as a unique key.
   If already processed, return `2xx` and skip — the same event may arrive multiple times.
4. **Return HTTP 2xx quickly** on success. Any non-2xx (or a >10 s hang) is treated as failure and
   BingwaOne retries up to 3 times per invocation, then marks the event `failed` (it is **not**
   auto-replayed later by a background job — re-delivery only happens if the reporter runs again for
   that entity, e.g. a duplicate M-Pesa callback).
5. **Branch on `event`** (and/or `direction` implied by event) to route incoming payments vs.
   outgoing payouts/transfers. Rely on `schema_version` (currently `1`) for forward compatibility.
6. **Tolerate `null`s** on `agent`, `recipient_phone`, `receipt`, `account_reference`,
   `conversation_id`. Treat `metadata` as an opaque passthrough object.

### Minimal verification example (Node)

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, header: string, secret: string) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

---

## 6. Configuration reference

| Setting | Where | Purpose |
|---------|-------|---------|
| `PAYBILL_DASHBOARD_WEBHOOK_URL` | env (preferred) | Destination URL. If unset, falls back to `app_config.paybill_dashboard_webhook_url`. |
| `paybill_dashboard_webhook_url` | `app_config` table | DB fallback for the URL. |
| `PAYBILL_DASHBOARD_WEBHOOK_SECRET` | env | HMAC signing secret. **Required** — if missing, events are marked `failed` and nothing is sent. |

Related tables/notes: `payment_export_events` (ledger),
[`docs/BingwaOne Memory/Paybill Reporter.md`](BingwaOne%20Memory/Paybill%20Reporter.md),
[`docs/BingwaOne Memory/Payments.md`](BingwaOne%20Memory/Payments.md).
