# Changelog: Skylink Bundlefasta

All notable changes to this project will be documented in this file.

## [1.3.0-transaction-status] - 2026-05-20
### Added
- Implemented production-grade Safaricom Daraja Transaction Status Query API module on dedicated branch `feature/api-transaction-status`.
- Database Schema: Added `transaction_status_queries` table in Supabase with strict Row Level Security (RLS) policies, indexes, and automatic audit logging.
- Created Backend Service Layer at `src/server/services/transactionStatus/`:
  - `initiateTransactionStatus.ts`: State tracking, RSA initiator password encryption, and Daraja status query API dispatching.
  - `parseTransactionStatusResult.ts`: Webhook callback unpacker parsing transaction details, flags, and account balances.
  - `handleTransactionStatusResult.ts`: Webhook result handler resolving target transaction states (in `transactions`, `b2c_account_topups`, or `business_buy_goods_transactions` tables), writing double-entry ledger entries, and pushing dashboard notifications.
  - `handleTransactionStatusTimeout.ts`: Queue timeout handler updating status queries and sending alert notifications.
- Registered Express routes in `src/server/index.ts`:
  - `POST /api/mpesa/transaction/status`: High-reliability, state-tracked status query initiator.
  - `POST /api/webhooks/transaction-status/result`: Validation-enforced status result callback webhook.
  - `POST /api/webhooks/transaction-status/timeout`: Validation-enforced status queue timeout webhook.
- Frontend Dashboard: Integrated new "Transaction Status Queries" tab in `src/pages/ReconciliationPage.tsx` with:
  - Form to query any C2B, B2C, B2B, or REVERSAL transaction by Safaricom Receipt Number.
  - Real-time PostgreSQL subscription updates for query log state changes.
  - Interactive "View Payload" modal dialog displaying the raw JSON payload inspector (request, response, and webhook callback).

## [1.2.0-b2b] - 2026-05-20
### Added
- Implemented full production-grade M-PESA B2B Business Buy Goods (Merchant Payments) module.
- Database Schema: Migrated `business_buy_goods_transactions` and `payout_audit_logs` tables with strict RLS policies, indexes, and credentials config parameters (limits, password, cooldowns).
- Created Backend Service Layer at `src/server/services/businessBuyGoods/`:
  - `validateBusinessBuyGoods.ts`: Safety checks (individual limits, daily limits, cooldown checks).
  - `initiateBusinessBuyGoods.ts`: Initiator password encryption via RSA PKCS#1 v1.5 padding and Daraja B2B API invocation.
  - `parseBusinessBuyGoodsResult.ts`: Standard callback parser mapping transaction details and balances.
  - `handleBusinessBuyGoodsResult.ts`: Webhook processor performing transaction resolution, double-entry ledger credits on disbursement vault (`a3333333-3333-3333-3333-333333333333`), and dashboard notification inserts.
  - `handleBusinessBuyGoodsTimeout.ts`: Gateway timeout handler.
- Integrated Express endpoints in `src/server/index.ts` for payment dispatching, retries, and callback results/timeouts. Added `b2b_buy_goods` to `/api/mpesa/test-connection`.
- Developed frontend dashboard `src/pages/MerchantPaymentsPage.tsx` using Tailwind v4, Motion, Recharts, and Lucide React, featuring:
  - Payout Form with authorization modal and initiator verification password support.
  - Real-time PostgreSQL changes listener for automated transaction row updates.
  - 7-Day Area Chart volume trend and recipient tills Bar Chart visualization.
  - Searchable transaction registry.
  - Slide-over Drawer containing timeline tracking, audit trail history logs, and raw JSON payload inspection.
  - Inline retry mechanism for failed/timeout payouts.
- Registered the new dashboard item in `src/components/Sidebar.tsx` and `src/App.tsx`.

## [1.1.0-daraja] - 2026-05-20
### Added
- Created centralized Safaricom Daraja service layer at `src/server/services/daraja/`:
  - `types.ts`: TypeScript definitions for all 11 M-Pesa API models and the 9 Bill Manager endpoints.
  - `darajaClient.ts`: HTTP client with Basic Auth token generation, caching, auto-refresh window, exponential backoff retries, and timeout handling.
  - `darajaService.ts`: Wrapper class executing requests to all official Safaricom endpoints (including Dynamic QR, Bill Manager, B2B, B2C, STK Push, and Reversals).
  - `webhookValidator.ts`: Security check for callback tokens, idempotency checks against `transaction_events`, and raw JSON payload logging.
- Refactored backend Express router in `src/server/index.ts` to utilize the new Daraja service layer.
- Connected frontend checkout page (`PaymentCheckoutPage.tsx`) and manual push page (`STKPushPage.tsx`) to dispatch requests through backend API endpoints.
- Enforced strict double-entry ledger database insertions (DEBIT collections, CREDIT vault) on completed callback events.

## [1.0.0-audit] - 2026-05-20
### Added
- Created comprehensive architecture documentation:
  - `README.md` (Updated with real instructions)
  - `PROJECT_ARCHITECTURE.md` (Component mapping, navigation logic, frontend layout)
  - `AUTH_FLOW.md` (Multi-factor admin login flow specifications)
  - `DATABASE_USAGE.md` (Supabase schema, RLS, active vs unused tables)
  - `ENVIRONMENT_VARIABLES.md` (Configuration mapping for Vite and server)
- Added `.env.example` template file.
- Prepared `TODO.md` checklist.
- Completed full audit of current code status, confirming frontend mockups and empty database states.
