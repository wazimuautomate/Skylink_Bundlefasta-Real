# Skylink Paybill Dashboard — Payment Webhook Reference

How the Skylink dashboard **receives** inbound payment notifications, which
external sites send them, the exact payload each endpoint expects, and what the
dashboard does once a valid webhook arrives.

> Scope: this document covers **inbound** application webhooks (money notifications
> pushed *to* Skylink). It does **not** cover Safaricom Daraja callbacks
> (`/api/daraja/callback/*`, `/api/mpesa/*`), which are the payment-provider side,
> nor the **outbound** Pesatrix webhook that Skylink itself sends
> (`src/lib/paybill-webhook.ts`).

---

## 1. Who sends payments, and to which endpoint

Skylink receives signed transaction notifications from **two business
applications** ("sites"):

| Source site | Endpoint (route handler) | HMAC secret env var |
|---|---|---|
| **BingwaOne / BingwaZone** | `POST /api/webhooks/bingwaone` — [route.ts](src/app/api/webhooks/bingwaone/route.ts) | `BINGWAONE_WEBHOOK_SECRET` (falls back to `BINGWAZONE_WEBHOOK_SECRET`) |
| **BingwaOne / BingwaZone** (alt) | `POST /webhooks/bingwaone` — [route.ts](src/app/webhooks/bingwaone/route.ts) | same |
| **Pesatrix** | `POST /api/webhooks/pesatrix` — [route.ts](src/app/api/webhooks/pesatrix/route.ts) | `PESATRIX_WEBHOOK_SECRET` |

All routes run on the **Node.js runtime** (`export const runtime = 'nodejs'`) so
that `node:crypto` is available for HMAC verification.

### ⚠️ Two BingwaOne routes exist

There are **two** live BingwaOne handlers with the same logic but different
plumbing:

- **`/api/webhooks/bingwaone`** — delegates to the shared
  [`reconcileWebhookTransaction()`](src/lib/services/reconciliation.ts) service,
  which does the reconciliation **atomically inside a Postgres function**
  (`reconcile_webhook_event` RPC). This is the canonical/preferred path.
- **`/webhooks/bingwaone`** — a self-contained handler that performs the same
  reconciliation with **separate Supabase calls** (not atomic) and additionally
  handles `test: true` payloads. Historically the first implementation.

Both accept `X-BingwaOne-*` **and** `X-BingwaZone-*` headers and both
`source_system` values `bingwaone` / `bingwazone`. Point the sender at
`/api/webhooks/bingwaone` unless you specifically need the test-payload path.

Production base domain (per the implementation spec): `https://skylink.pesatrix.co.ke`.

---

## 2. Security: how a payload is authenticated

Every endpoint follows the same defensive order — **verify before you parse**:

1. Read the required headers (signature + event). Missing → **401**.
2. Read the raw request body **exactly once** with `req.text()`.
3. Compute `HMAC-SHA256(rawBody, secret)` and compare against the supplied
   signature using **`crypto.timingSafeEqual`** on equal-length buffers.
   Mismatch/malformed → **401/403**.
4. Only **after** the signature is valid, `JSON.parse` the raw body.

The signature is always computed over the **exact raw bytes** of the body — never
over a re-serialized (`JSON.stringify`) object. Shared helper:
[`verifyWebhookHmac()`](src/lib/webhooks/verify-hmac.ts).

Signature header formats:

| Site | Header | Format |
|---|---|---|
| BingwaOne | `X-BingwaOne-Signature` | `sha256=<64 hex chars>` |
| Pesatrix | `X-Pesatrix-Signature` | `<64 hex chars>` (no prefix) |

The `/webhooks/bingwaone` route also rejects bodies larger than **1 MB** (413).

---

## 3. BingwaOne / BingwaZone payloads

### Required headers

```
Content-Type: application/json
X-BingwaOne-Signature: sha256=<hmac-hex>
X-BingwaOne-Event: <category>:<uuid>:completed
```

`X-BingwaOne-Event` is parsed into three colon-separated parts
`<category>:<id>:<action>`:

- `category` must be `payment`, `wallet-withdrawal`, or `bonga-payout`
- `action` must be `completed`
- `id` must equal the `payment.id` / `withdrawal.id` inside the body
  (the `bonga-payout` `transfer` object carries no id of its own — the id is only
  in the header, so nothing is cross-checked there)
- The header **is used verbatim as the idempotency `event_key`**

### 3a. `payment.completed` (money IN)

```json
{
  "schema_version": 1,
  "event": "payment.completed",
  "source_system": "bingwaone",
  "occurred_at": "2026-06-13T10:00:00.000Z",
  "payment": {
    "id": "uuid",
    "type": "subscription",
    "module": "mini_site",
    "amount": 500,
    "currency": "KES",
    "payer_phone": "0712345678",
    "recipient_phone": null,
    "receipt": "TFA1234567",
    "provider": "mpesa",
    "account_reference": "Mini Site",
    "service_source": "mini_site_subscription",
    "initiated_at": "2026-06-13T09:59:30.000Z",
    "completed_at": "2026-06-13T10:00:00.000Z",
    "metadata": {}
  },
  "agent": {
    "id": "uuid",
    "name": "Agent Name",
    "business_name": "Agent Shop",
    "username": "agentshop"
  }
}
```

Validation enforced:
- `source_system` ∈ {`bingwaone`, `bingwazone`}
- `event` matches the header category (`payment` → `payment.completed`)
- `payment` object present with `id` and a **positive** `amount`
- `payment.id === headerId`
- phones (when present) must normalize to Kenyan E.164 via
  [`normalizeKenyanPhone`](src/lib/utils/phone.ts)

Mapping into the canonical transaction: `direction = IN`, `transaction_type = C2B`,
`payment_type = payment.type`, `module`/`product_stream = payment.module`,
`service_source = payment.service_source`, `receipt` upper-cased & trimmed.

### 3b. `wallet.withdrawal.completed` (money OUT)

Same envelope, but with a `withdrawal` object instead of `payment`:

```json
{
  "schema_version": 1,
  "event": "wallet.withdrawal.completed",
  "source_system": "bingwazone",
  "occurred_at": "2026-06-13T10:00:00.000Z",
  "withdrawal": {
    "id": "uuid",
    "amount": 500,
    "currency": "KES",
    "destination_phone": "0712345678",
    "conversation_id": "AG_... (M-Pesa B2C conversation id) | null",
    "service_source": "agent_wallet"
  },
  "agent": { "id": "uuid", "name": "...", "business_name": "...", "username": "..." }
}
```

Mapping: `direction = OUT`, `transaction_type/payment_type = wallet_withdrawal`,
`module/product_stream = wallet`,
`recipient_phone = normalize(destination_phone)` (legacy `destination` accepted as
a fallback), `receipt = provider_reference || transaction_id || conversation_id`
(the live sender only supplies `conversation_id`).

### 3d. `bonga.payout.completed` (money OUT)

Outgoing Bonga-points sell payout to an agent. Event key is
`bonga-payout:<paymentId>:completed`; the `transfer` object has **no `id`** of its
own (the payout id is in the header).

```json
{
  "schema_version": 1,
  "event": "bonga.payout.completed",
  "source_system": "bingwazone",
  "occurred_at": "2026-06-13T10:00:00.000Z",
  "transfer": {
    "amount": 250,
    "currency": "KES",
    "destination_phone": "0712345678",
    "conversation_id": "BG_... (M-Pesa B2C conversation id)",
    "service_source": "bonga_sell",
    "metadata": {}
  },
  "agent": { "id": "uuid", "name": "...", "business_name": "...", "username": "..." }
}
```

Mapping: `direction = OUT`, `transaction_type/payment_type = bonga_payout`,
`module/product_stream = bonga`, `service_source = transfer.service_source`,
`recipient_phone = normalize(destination_phone)`, `receipt = conversation_id`,
`external_reference_id = <paymentId from the header>`.

### 3c. Test payloads (only on `/webhooks/bingwaone`)

A body with `{ "test": true, ... }` is stored in `webhook_events` for
idempotency/audit but **does not create a financial transaction**. Returns
`{ success: true, status: "processed" | "duplicate" }`.

---

## 4. Pesatrix payloads

### Required headers

```
Content-Type: application/json
X-Pesatrix-Signature: <64 hex chars>
X-Pesatrix-Event: activation | withdrawal
```

The signature must be a strict 64-char hex SHA-256 digest, and
`X-Pesatrix-Event` must equal the body's `event`.

### 4a. `activation` (money IN)

```json
{
  "event": "activation",
  "transaction_id": "MPESA_RECEIPT_CODE",
  "amount": 500,
  "phone": "2547XXXXXXXX",
  "platform": "pesatrix",
  "timestamp": "2026-06-13T10:32:00.000Z",
  "reference_id": "activation_payment_uuid",
  "user_id": "user_account_uuid"
}
```

### 4b. `withdrawal` (money OUT)

```json
{
  "event": "withdrawal",
  "transaction_id": "MPESA_B2C_TXN_ID",
  "amount": 1000,
  "phone": "2547XXXXXXXX",
  "platform": "pesatrix",
  "timestamp": "2026-06-13T10:32:00.000Z",
  "reference_id": "withdrawal_request_uuid",
  "user_id": "user_account_uuid"
}
```

Validation enforced (both events):
- `event` ∈ {`activation`, `withdrawal`} and equals the `X-Pesatrix-Event` header
- `platform` (case-insensitive) === `pesatrix`
- `amount` is a positive number
- `reference_id` and `user_id` are non-empty strings
- `transaction_id` is a string but **may be empty** — the provider does not always
  return a receipt/B2C id; when empty it is stored as `null`
- `phone` normalizes to Kenyan E.164
- `timestamp` is a parseable ISO date

Mapping: `activation` → `direction IN`, `module = account_activation`,
`service_source = pesatrix_activation`, `payer_phone = normalize(phone)`.
`withdrawal` → `direction OUT`, `module = wallet`,
`service_source = pesatrix_wallet_withdrawal`, `recipient_phone = normalize(phone)`.
`receipt = transaction_id` in both cases.

### Idempotency key

The Pesatrix event header is not unique on its own, so the route builds a
deterministic key from the **stable internal `reference_id`** (the
`activation_payments.id` / withdrawal request id):

```
pesatrix:<event>:<reference_id>
```

`reference_id` is used — not `transaction_id` — because `transaction_id` may be
empty, and several parallel B2C-result routes on the Pesatrix side can fire for the
same withdrawal. Deduping on `reference_id` collapses those into one event, per the
Pesatrix sender contract. See [route.ts](src/app/api/webhooks/pesatrix/route.ts).

---

## 5. What happens when a valid webhook is received

Once the signature passes and the payload validates, control flows into the
reconciliation layer. The **critical accounting rule** is that the same payment
may already exist from a Safaricom callback — the dashboard must **never
double-count** it. So it reconciles instead of blindly inserting.

Steps (see [reconciliation.ts](src/lib/services/reconciliation.ts) and the
inline logic in the self-contained route):

1. **Audit receipt** — log `*_WEBHOOK_RECEIVED`.
2. **Hash the raw payload** (SHA-256) for change-detection on repeated event keys.
3. **Resolve product source id** from the receipt/module/type (best-effort).
4. **Reconcile atomically** via the `reconcile_webhook_event` Postgres RPC
   (`/api` route) or via inline Supabase calls (`/webhooks` route):
   - **Match** an existing canonical `transactions` row by
     **exact receipt + compatible direction + equal amount**.
   - **If matched & no attribution conflict** → *enrich* that row (add
     `source_system`, `module`, `payment_type`, `service_source`, agent details,
     external references, raw evidence). No new row.
     `reconciliation_status = matched`.
   - **If matched but already owned by a different `source_system`** →
     mark `reconciliation_status = conflict`, log
     `TRANSACTION_RECONCILIATION_CONFLICT`, do **not** overwrite. Excluded from totals.
   - **If no match** → *insert* a new canonical transaction with
     `origin = bingwaone_webhook` (or pesatrix), `status = SUCCESS`,
     `reconciliation_status = app_only`.
   - **Link** the `webhook_events` row to the resulting `transaction_id`.
5. **Audit the outcome** — `*_WEBHOOK_PROCESSED`, plus `TRANSACTION_RECONCILED` /
   `TRANSACTION_ATTRIBUTION_UPDATED` / `TRANSACTION_RECONCILIATION_CONFLICT`.
6. **Queue an admin notification** *after* the transaction is persisted, via
   [`triggerNotificationFlow()`](src/lib/notifications/send-transaction-alert.ts):
   - Reads channel + admin phone + IN/OUT toggles from the `sms_settings`
     singleton row.
   - Dedup key `transaction:<id>:<in|out>-alert:<channel>` prevents repeat alerts.
   - Sends **SMS (BlazeTech Scope)** or **WhatsApp (Evolution)** per preference.
   - Runs as a **fire-and-forget** promise — **notification failure never rolls
     back or fails the webhook**.

### Idempotency & duplicates

- **Same event key + same payload hash** → treated as a **duplicate**: no new
  transaction, no new notification, HTTP **200** with `duplicate: true`.
- **Same event key + different payload hash** → **idempotency conflict**: original
  is preserved, `WEBHOOK_IDEMPOTENCY_CONFLICT` audited, HTTP **409**.

---

## 6. HTTP responses

| Situation | Status | Body (representative) |
|---|---|---|
| Newly processed | **200** | `{ received: true, duplicate: false }` (bingwaone) / `{ success: true, status: "processed", ... }` |
| Duplicate (same key + hash) | **200** | `{ received: true, duplicate: true }` |
| Missing signature/event header | **401** | `Missing required headers` |
| Bad/malformed signature | **401** (bingwaone) / **403** (pesatrix) | `Invalid ... signature` |
| Malformed JSON / invalid payload | **400** | `Invalid ... payload` |
| Event key reused with changed payload | **409** | `Idempotency conflict` |
| Payload larger than 1 MB (`/webhooks/bingwaone`) | **413** | `Payload too large` |
| DB / internal failure | **500** | `Internal Server Error` / `Database processing failed` |

A non-2xx is **never** returned merely because SMS/WhatsApp delivery failed —
webhook acknowledgement concerns transaction ingestion only.

---

## 7. Required environment variables

| Variable | Purpose |
|---|---|
| `BINGWAONE_WEBHOOK_SECRET` / `BINGWAZONE_WEBHOOK_SECRET` | HMAC secret for BingwaOne/Zone signature verification |
| `PESATRIX_WEBHOOK_SECRET` | HMAC secret for Pesatrix signature verification |
| `SUPABASE_*` (service role) | Admin DB client used by the reconciliation/audit layer |
| `SCOPE_SMS_API_KEY`, `SCOPE_SMS_SENDER_ID` | Outbound SMS alerts |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | Outbound WhatsApp alerts |
| `ADMIN_ALERT_PHONE` | Fallback admin alert recipient if not set in `sms_settings` |

None of these are exposed to browser code.

---

## 8. Quick reference: sending a signed test webhook

```bash
# Pesatrix activation — signature is HMAC-SHA256 of the exact raw body
BODY='{"event":"activation","transaction_id":"TFA1234567","amount":500,"phone":"254712345678","platform":"pesatrix","timestamp":"2026-06-13T10:32:00.000Z","reference_id":"ref-uuid","user_id":"user-uuid"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PESATRIX_WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST https://skylink.pesatrix.co.ke/api/webhooks/pesatrix \
  -H "Content-Type: application/json" \
  -H "X-Pesatrix-Event: activation" \
  -H "X-Pesatrix-Signature: $SIG" \
  --data-raw "$BODY"
```

```bash
# BingwaOne payment.completed — note the sha256= prefix
BODY='{"schema_version":1,"event":"payment.completed","source_system":"bingwaone","occurred_at":"2026-06-13T10:00:00.000Z","payment":{"id":"pay-uuid","type":"subscription","module":"mini_site","amount":500,"currency":"KES","payer_phone":"254712345678","receipt":"TFA1234567","service_source":"mini_site_subscription"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$BINGWAONE_WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST https://skylink.pesatrix.co.ke/api/webhooks/bingwaone \
  -H "Content-Type: application/json" \
  -H "X-BingwaOne-Event: payment:pay-uuid:completed" \
  -H "X-BingwaOne-Signature: sha256=$SIG" \
  --data-raw "$BODY"
```

The `--data-raw` (not `-d`) matters: the server verifies the signature against the
exact bytes it receives, so the body must not be re-formatted in transit.
