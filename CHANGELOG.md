# Changelog

All notable changes to the Skylink Bundlefasta Dashboard project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to Semantic Versioning.

---

## [1.1.0] - 2026-05-30

### Added
- Created [AGENTS.md](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/AGENTS.md) defining strict guidelines for AI agents, including updating the changelog and pushing to GitHub.
- Created [.env.example](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/.env.example) template environment configuration.
- Created local environment configuration file [.env.local](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/.env.local) to store api keys.
- Created M-Pesa Error translation dictionary in [darajaErrors.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/darajaErrors.ts) which maps ResponseCodes, B2C/Reversal/Balance callback ResultCodes, and general API codes to friendly explanations.
- Added `DARAJA_ENV`, `DARAJA_CERTIFICATE` (RSA Public certificate), B2C command types and custom callback URL overrides to `.env.example` and `.env.local`.

### Changed
- Integrated M-Pesa failure details in [B2cView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/B2cView.tsx) to inspect raw callback payloads and display descriptive failure reasons instead of generic 'FAILED' labels.
- Integrated M-Pesa failure details in [ReversalsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/ReversalsView.tsx) to inspect raw callback payloads and display descriptive failure reasons.
- Refactored [daraja.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts) to encrypt B2C, Reversal, and Account Balance initiator passwords using Node's native `crypto.publicEncrypt` and Safaricom's public certificate.
- Updated [daraja.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts) call sites to use a robust, regex-based `normalizePesaPhone` helper.

---

## [1.0.0] - 2026-05-30

### Added
- Bootstrapped Next.js 15 App Router codebase with TypeScript, Tailwind CSS v4, and custom dark-theme dashboard.
- Configured Supabase clients (Cookie client, Browser client, Admin client) and auth middleware.
- Implemented core Transaction ledger repositories under `src/lib/repositories` including stats counters and analytics data aggregators.
- Set up Dashboard PIN security actions with `bcryptjs` hashing.
- Implemented M-Pesa Webhook Callback Route Handlers:
  - `/api/daraja/callback/stk` - Parses standard Lipa Na M-Pesa STK callbacks.
  - `/api/daraja/callback/c2b` - Handles PayBill payments and updates balance snapshots.
  - `/api/daraja/callback/b2c` - Handles B2C payouts using the `Key`/`Value` metadata structure.
  - `/api/daraja/callback/reversal` - Handles reversal notifications and updates ledger records.
  - `/api/daraja/callback/balance` - Queries and parses pipe-separated (`|`) organization balances.
- Added simulation utility routes `/api/mock/c2b` for rapid local transaction simulation.
- Created rich, responsive layout UI views under `src/components/views` (Dashboard, Transactions, B2C Payouts, Reversals, Account Balance, Audit Log, and Analytics).
