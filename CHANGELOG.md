# Changelog

All notable changes to the Skylink Bundlefasta Dashboard project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to Semantic Versioning.

## [1.1.4] - 2026-05-30

### Added
- Redesigned the login page in [page.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/login/page.tsx) with a calm, premium visual glow layout featuring email, password, and admin keyword fields.
- Implemented forgot-password flow linked to Supabase auth in [actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/login/actions.ts).
- Integrated the public brand logo image `logo.png` on the login card, laptop sidebar logo placeholder, and mobile header logo placeholder inside [Shell.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/layout/Shell.tsx).

---

## [1.1.3] - 2026-05-30

### Fixed
- Fixed B2C Payout `Bad Request - Invalid OriginatorConversationID` error by generating and including a unique `OriginatorConversationID` in the request payload to satisfy Safaricom's v3 API gateway requirements.
- Fixed Reversal `Bad Request - Invalid RecieverIdentifierType` error by reverting the spelling of `ReceiverIdentifierType` back to `RecieverIdentifierType` (matching the misspelled parameter case validated by Safaricom's endpoint).

---

## [1.1.2] - 2026-05-30

### Fixed
- Fixed dashboard PIN authorization failure by updating `verifyDashboardPin`, `setDashboardPin`, and `hasPinConfigured` inside [pin.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/repositories/pin.ts) to query the database using the admin client. This correctly bypasses Row Level Security (RLS) policies on the server side.
- Fixed Safaricom Daraja OAuth token caching bug in [daraja.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts). Replaced Turbopack/Next.js fetch disk cache with a memory-level cache store and `cache: 'no-store'` options, preventing expired tokens from being reused.

### Changed
- Reset credentials for `rainhardbonnke89@gmail.com` to `password123` (Supabase Auth) and PIN `123456` (dashboard_pin) for verification purposes.

---

## [1.1.1] - 2026-05-30

### Fixed
- Fixed Daraja Account Balance query QueueTimeOutURL validation error by dynamically sanitizing callback URLs using `process.env.NEXT_PUBLIC_APP_URL` or `process.env.VERCEL_URL` when available.
- Corrected parameter spelling in Daraja Reversal request from `RecieverIdentifierType` to `ReceiverIdentifierType` to prevent Safaricom integration payload validation failures.
- Corrected B2C command parameter `Occassion` to `Occasion`.

### Removed
- Removed the developer "Simulate Payment" button and simulation modal UI completely from `Shell.tsx` to eliminate mock actions from the production site.

### Changed
- Updated the checklist tracking in `task.md`.

---

## [1.1.0] - 2026-05-30

### Added
- Created [AGENTS.md](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/AGENTS.md) defining strict guidelines for AI agents, including updating the changelog and pushing to GitHub.
- Created [.env.example](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/.env.example) template environment configuration.
- Created local environment configuration file [.env.local](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/.env.local) to store api keys.
- Created M-Pesa Error translation dictionary in [darajaErrors.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/darajaErrors.ts) which maps ResponseCodes, B2C/Reversal/Balance callback ResultCodes, and general API codes to friendly explanations.
- Added `DARAJA_ENV`, `DARAJA_CERTIFICATE` (RSA Public certificate), B2C command types and custom callback URL overrides to `.env.example` and `.env.local`.
- Added tooltip explanations next to the operational form headers in [StkView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/StkView.tsx), [B2cView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/B2cView.tsx), [ReversalsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/ReversalsView.tsx), and [BalanceView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/BalanceView.tsx).

### Changed
- Integrated M-Pesa failure details in [B2cView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/B2cView.tsx) to inspect raw callback payloads and display descriptive failure reasons instead of generic 'FAILED' labels.
- Integrated M-Pesa failure details in [ReversalsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/ReversalsView.tsx) to inspect raw callback payloads and display descriptive failure reasons.
- Refactored [daraja.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts) to encrypt B2C, Reversal, and Account Balance initiator passwords using Node's native `crypto.publicEncrypt` and Safaricom's public certificate.
- Updated [daraja.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts) call sites to use a robust, regex-based `normalizePesaPhone` helper.
- Added URL sanitization in [daraja.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts) to resolve localhost callback address errors.
- Cleaned up PostgREST schema cache join errors by fetching `audit_logs` without relational tables in [actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/actions.ts) and storing `operator_email` inside log metadata in [audit.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/repositories/audit.ts).
- Refined STK push action in [actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/actions.ts) and [StkView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/StkView.tsx) to prompt and verify the Dashboard PIN before dispatching requests.
- Replaced hardcoded Account Reference dropdown selections in [StkView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/StkView.tsx) and the simulation panel in [Shell.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/layout/Shell.tsx) with custom text fields.
- Replaced hardcoded mock balance data fallback values in [actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/actions.ts) and [BalanceView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/BalanceView.tsx) with a delayed DB snapshot lookup query to reflect actual Safaricom webhook callback values.
- Cleaned up login input fields in [page.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/login/page.tsx) to read "Operator Password".

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
