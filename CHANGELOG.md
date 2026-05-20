# Changelog: Skylink Bundlefasta

All notable changes to this project will be documented in this file.

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
