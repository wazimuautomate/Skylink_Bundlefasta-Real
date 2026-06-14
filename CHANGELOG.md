# Changelog

All notable changes to the Skylink Bundlefasta Dashboard project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to Semantic Versioning.

## [1.12.2] - 2026-06-14

### Changed
- **[Daraja Cert Loading] Eliminate filesystem dependency — embed certificate in source code:**
  - **New file:** [`src/lib/services/certificates.ts`](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/certificates.ts) — exports `PRODUCTION_CERTIFICATE` and `SANDBOX_CERTIFICATE` as TypeScript string constants, so the PEM content is bundled directly with the compiled code.
  - **Updated:** [`src/lib/services/daraja.ts`](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts) — `loadCertificate()` now resolves certificates in this order: ① `DARAJA_CERTIFICATE` env var (override/rotation), ② embedded constant from `certificates.ts` (default, always works). The `fs` and `path` imports have been removed.
  - **Why:** Removed all filesystem path dependency (no more `process.cwd()` → `/var/task/` mismatch on Vercel serverless). The certificate is a **public key** so embedding it in source is safe and idiomatic.
  - **To update cert:** Replace `PRODUCTION_CERTIFICATE` in `certificates.ts` with the new PEM content from the Safaricom Daraja portal, or set `DARAJA_CERTIFICATE` env var for zero-downtime rotation.

## [1.12.1] - 2026-06-14

### Fixed
- **[Vercel Deployment] Certificate file not found at `/var/task/ProductionCertificate.cer`:**
  - **Root cause:** Vercel's serverless functions run with CWD `/var/task/`. Static files placed in the project root are not automatically bundled into the Lambda deployment package. `process.cwd()` resolves to `/var/task/` at runtime, so `fs.readFileSync` failed to find the `.cer` file.
  - **Fix:** Added `outputFileTracingIncludes` to [`next.config.ts`](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/next.config.ts) to explicitly instruct Next.js/Vercel to trace and bundle `ProductionCertificate.cer` and `SandboxCertificate.cer` into all `/api/**` serverless function bundles.
  - **Alternative:** The `DARAJA_CERTIFICATE` env var (set to the full PEM string) bypasses file loading entirely and is the recommended approach for production secrets.
  - **Note:** The `.cer` file in the repository expired in March 2018 — a fresh certificate must be downloaded from the [Safaricom Daraja Portal](https://developer.safaricom.co.ke/) for the API to accept the `SecurityCredential`.

## [1.12.0] - 2026-06-14

### Fixed
- **[CRITICAL] M-Pesa Account Balance API — `ResultCode: 2001` fix in `src/lib/services/daraja.ts`:**
  - **Root cause #1 (Certificate):** Diagnosed that `ProductionCertificate.cer` in the repository expired on **March 21, 2018** (over 7 years ago). Added a runtime certificate expiry check using `crypto.X509Certificate` in `loadCertificate()` that logs a `CRITICAL` error to the console whenever an expired certificate is detected, clearly identifying the file path and expiry date, and instructing the operator to download the current certificate from the Daraja portal.
  - **Root cause #2 (Silent encryption fallback):** Removed the dangerous `catch` block in `encryptSecurityCredential()` that silently returned the raw plaintext `initiatorPassword` as the `SecurityCredential` when RSA encryption failed. The function now **throws a descriptive error** on any encryption failure, preventing any API call from ever proceeding with an unencrypted credential. This was the hidden bug causing `ResultCode: 2001` / "The initiator information is invalid" rejections.
  - **Root cause #3 (Missing password validation):** Removed the dangerous `|| 'P@ssword123'` default for `DARAJA_INITIATOR_PASSWORD` in `getEnvConfig()`. If the env var is not set, the function now returns `null` (triggering mock mode with a console error) instead of silently sending a wrong password to Safaricom.
  - **Root cause #4 (Cert loading silent failure):** `loadCertificate()` previously returned an empty string `''` when the certificate file was missing or unreadable. `encryptSecurityCredential()` then skipped encryption entirely (due to `!certificatePem` check) and returned the raw password. Both functions now **throw descriptive errors** that include the expected file path and instructions for resolution.
  - **Payload logging:** Added detailed pre-request logging to `queryAccountBalance()`, `initiateB2c()`, `requestReversal()`, and `initiateB2b()`. The `SecurityCredential` is masked (first 20 chars only) in logs for security while still being useful for debugging. The Account Balance response body is also fully logged.
  - **DarajaConfig interface:** Made `certificate` and `initiatorPassword` required fields (removing `?` optional markers) to enforce correct typing and allow removal of all `!` non-null assertions internally.
  - **Environment startup log:** `getEnvConfig()` now logs the active environment (SANDBOX vs PRODUCTION), shortcode, and initiator name on every initialization for easy audit trail.

## [1.11.0] - 2026-06-14

### Changed
- Configured local loading of `Outfit` font family using `next/font/google` in [layout.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/layout.tsx) with weights 300, 400, 500, 600, and 700.
- Removed external Google Fonts stylesheet `@import` and local font-family overrides in [globals.css](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/globals.css) to fix browser font rendering issues (e.g., condensed or thick looks) and optimize load times.

## [1.10.0] - 2026-06-14

### Added
- Created a secure webhook export module `src/lib/paybill-webhook.ts` that implements `sendPaybillWebhook` to dispatch activation and withdrawal events to the Pesatrix application signed with a lowercase hexadecimal HMAC-SHA256 signature.
- Added comprehensive unit tests in `tests/webhooks.test.ts` for verifying Pesatrix webhook receiver's signature checks, JSON/payload validation constraints, and duplication processing.

### Fixed
- Re-implemented the Pesatrix webhook receiver route in `src/app/api/webhooks/pesatrix/route.ts` with strict timing-safe signature checking, body parsing only after signature check, and custom payload schema validation.
- Integrated payment confirmation webhook export dispatching inside the C2B (`src/app/api/daraja/callback/c2b/route.ts`) and B2C (`src/app/api/daraja/callback/b2c/route.ts`) callbacks.
- Added database transaction deduplication checks inside the Safaricom callback routes to prevent double-inserting transactions when webhooks are received out-of-order.

## [1.9.0] - 2026-06-14

### Changed
- Changed the site metadata title and description from "Create Next App" to "Skylink Dashboard" in [layout.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/layout.tsx).
- Disabled Webpack caching in [next.config.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/next.config.ts) to prevent compilation caching race conditions / file locking errors in Windows build environments.

### Fixed
- Fixed drop down options visibility across all search filters, transactions, notifications, and settings views by explicitly setting the option text color and background color matching the active theme (light or dark mode) in [globals.css](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/globals.css).

## [1.8.0] - 2026-06-14

### Added
- Created a backend repository module `src/lib/repositories/services-analytics.ts` containing functions for Nairobi timezone period bounds (`getPeriodBounds`), percentage change calculations, service parent summaries, dynamic BingwaOne module summaries/details, and Pesatrix activation/withdrawal ledger tracking.
- Added corresponding Server Actions in `src/app/actions.ts` for fetching services overview, BingwaOne modules list, module specific analytics, Pesatrix overview, and Pesatrix activations/withdrawals detail logs.
- Created reusable `TransactionDetailDrawer.tsx` inside `src/components/shared` to centralize the presentation of transaction details and asynchronous linked webhooks evidence retrieval.
- Applied three composite indexes on the `transactions` table (`source_system` + `occurred_at` DESC) to optimize analytics queries via Supabase database migration.
- Added comprehensive unit and integration test suite `tests/services.test.ts` validating period calculation bounds, percentage trends, identifier formatting, and module discovery logic.

### Changed
- Overhauled `ServicesView.tsx` to display dual service parent cards (BingwaOne and Pesatrix), global period selector with custom range support, dynamically generated module cards, and standalone activations/withdrawals cards for Pesatrix.
- Refactored `TransactionsView.tsx` to use the shared `TransactionDetailDrawer` component, reducing code duplication.
- Updated `src/lib/utils/labels.ts` to export a dynamic, reusable `humanizeIdentifier` utility function for module and transaction payment types.

## [1.7.0] - 2026-06-14

### Added
- Added `metadata` jsonb column to the `transactions` table in Supabase via SQL migration, resolving webhook reconciliation RPC failures.
- Added `isTest?: boolean` parameter to `AlertParams` in `src/lib/notifications/send-transaction-alert.ts` to bypass idempotency/deduplication checks for test notification actions.

### Fixed
- Fixed WhatsApp notification number formatting in `src/lib/notifications/providers/evolution-whatsapp.ts` to convert Kenyan phone numbers (e.g. `07...`) to the international format (`254...`) required by the Evolution API.
- Fixed settings page test notification failures by ensuring that when sending a test notification, the deduplication key is unique and skips existing check.

### Changed / Renamed
- Renamed the service/word `bingwazone` to `bingwaone` across all directories, files, database records, environment variables, headers, and UI views.
- Moved and renamed the webhook directories to `src/app/webhooks/bingwaone` and `src/app/api/webhooks/bingwaone`.
- Updated webhook headers check to support `X-BingwaOne-Signature` and `X-BingwaOne-Event` with fallbacks to the old `X-BingwaZone-*` headers.
- Updated environment variable config in `.env` and `.env.local` to support `BINGWAONE_WEBHOOK_SECRET` with fallback to `BINGWAZONE_WEBHOOK_SECRET`.
- Updated test suite `tests/webhooks.test.ts` to test the new `bingwaone` webhook endpoint and headers.

## [1.6.0] - 2026-06-14

### Added
- Created a production-ready Next.js Route Handler at `src/app/webhooks/bingwazone/route.ts` to expose the public webhook endpoint `/webhooks/bingwazone` (without the `/api` prefix), supporting signature checking, idempotency validation, payload parsing, and transaction recording/enrichment.
- Added comprehensive unit and integration tests inside `tests/webhooks.test.ts` covering missing headers, malformed signature format, invalid signature, invalid JSON payload, test webhook processing and duplicate checks, real payment payloads, and wallet withdrawal webhook transactions.

### Changed
- Updated the database schema for the `webhook_events` table (adding columns `provider`, `payload`, `signature`, `processed_at`, and applying a UNIQUE constraint on `event_key` for concurrent-proof database idempotency).
- Updated `resolveSourceId` inside `src/lib/repositories/transactions.ts` to fallback to `createAdminClient` when cookies request store context is unavailable, enabling standalone test suite runs.

## [1.5.1] - 2026-06-13

### Fixed / Verification
- Verified local build passes successfully (Next.js 15, TypeScript) with all 1.5.0 features intact.
- Re-triggered Vercel deployment via fresh commit to ensure all 1.5.0 changes are visible on production (dashboard cards, services page, analytics updates, settings notification channel).
- Confirmed no build errors or TypeScript type errors in any modified file.

### Summary of deployed features (1.5.0):
- **Dashboard** → Updated KPI cards: Current Balance (with inline refresh), Incoming Today, Outgoing Today, Pesatrix Today (In/Out), BingwaZone Today (In/Out), Alert Notifications stats.
- **Dashboard Charts** → Service Revenue Trend (7-day Area), Service Volumes bar, Inflow Share by Module (Pie), Historical Balance Line.
- **Services Page** → Full BingwaZone & Pesatrix portal with KPI cards, module inbound revenue chart + list, transaction type distribution, recent B2C payout log.
- **Analytics Page** → Multi-dimensional advanced filters (Date, Service, Module, Direction, Tx Type, Reconciliation, Status, Search), Cashflow trend area, Module share pie, Pesatrix Activation panel, Revenue by Payment Type & Source charts.
- **Settings** → Notification channel selector (SMS / WhatsApp), Admin Alert Phone number input, SMS Sender ID (SMS only), Incoming/Outgoing alert toggles, Send Test notification button.

## [1.5.0] - 2026-06-13

### Added
- Created the dedicated **Services View** ([ServicesView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/ServicesView.tsx)) component detailing inflows/outflows, module revenue share breakdown (e.g. mini-sites, WhatsApp bot, activations), transaction type splits, and recent B2C payout logs for **BingwaZone** and **Pesatrix** services.
- Added `getServicesStatsAction()` server action inside [actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/actions.ts) to compute financial statistics, module revenues, and recent payouts for active services.

### Changed
- Upgraded the **Dashboard View** ([DashboardView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/DashboardView.tsx)) with a balance refresh trigger executing `refreshBalanceAction()` inline without leaving the page.
- Replaced outdated KPI widgets with optimized cards: Current Balance, Incoming Today, Outgoing Today, Pesatrix Flow (In/Out), BingwaZone Flow (In/Out), and Alert Notification Outbox Stats.
- Upgraded dashboard charts to feature Service Revenue Trend (7-day Area), Service Volumes comparison (Bar), Inflow Share by Module (Pie), and Historical Balance Trend.
- Overhauled the **Analytics View** ([AnalyticsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/AnalyticsView.tsx)) to support advanced multi-dimensional filtering (Date Range, Service Source, Module, Flow Direction, Transaction Type, Reconciliation Status, Search keywords) and dynamic contextual module selection.
- Redesigned settings card title in [SettingsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/SettingsView.tsx) to "Notification & Alert Channel Settings" to represent both SMS & WhatsApp channels clearly.
- Renamed "SMS Logs" sidebar menu item in [Shell.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/layout/Shell.tsx) to "Notification Logs".

## [1.4.0] - 2026-06-13

### Added
- Created BingwaZone and Pesatrix webhook ingestion controllers inside [src/app/api/webhooks/bingwazone/route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/webhooks/bingwazone/route.ts) and [src/app/api/webhooks/pesatrix/route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/webhooks/pesatrix/route.ts) supporting HMAC timing-safe signature verification, raw event logging, and transaction reconciliation.
- Added constant-time HMAC signature verification helper in [src/lib/webhooks/verify-hmac.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/webhooks/verify-hmac.ts).
- Added Kenyan phone normalization utility [src/lib/utils/phone.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/utils/phone.ts) for E.164 conversion.
- Created `reconcile_webhook_event` RPC database trigger and reconciliation driver inside [src/lib/services/reconciliation.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/reconciliation.ts) for canonical transaction reconciliation, deduplication, auto-matching, and drift detection.
- Integrated unified notifications service under [src/lib/notifications/send-transaction-alert.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/notifications/send-transaction-alert.ts) supporting deduplication, outbox pattern tracking, custom formatting templates, and alert toggling.
- Added Scope SMS notification provider inside [src/lib/notifications/providers/scope-sms.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/notifications/providers/scope-sms.ts) and Evolution WhatsApp notification provider inside [src/lib/notifications/providers/evolution-whatsapp.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/notifications/providers/evolution-whatsapp.ts).
- Created safe client utility [src/lib/utils/labels.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/utils/labels.ts) to resolve human-readable source/module names without compiling server-side Next.js dependencies.
- Added native automated test suite [tests/webhooks.test.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/tests/webhooks.test.ts) covering HMAC validations, phone normalization, text formatting, and mapping labels.

### Changed
- Updated [src/app/actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/actions.ts) to support channels selection setting, notification outbox logs query, raw webhook events, and alert simulation triggers.
- Updated database typings inside [src/types/database.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/types/database.ts) to extend `Database` types for `webhook_events`, `notification_deliveries`, and revised transaction columns.
- Rewrote [TransactionsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/TransactionsView.tsx) to feature a detail drawer displaying reconciliation status, discrepancy alerts, auto-matched status, and raw webhook event payloads.
- Rewrote [NotificationsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/NotificationsView.tsx) to support both SMS and WhatsApp notification logs, recipient searches, and status details.
- Updated [DashboardView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/DashboardView.tsx) to dynamically report queued/sent notification outbox stats based on current channel settings.
- Updated [SettingsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/SettingsView.tsx) to allow toggling notification channels (SMS vs WhatsApp) and sending test simulation alerts.
- Rewrote [AnalyticsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/AnalyticsView.tsx) to incorporate source performance cards, reconciliation status, and custom volume charts.
- Updated resolveSourceId inside [src/lib/repositories/transactions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/repositories/transactions.ts) to support database operations using server clients.

## [1.3.0] - 2026-05-30

### Added
- Integrated BlazeTech Scope SMS Notification Alerts in successful webhook callbacks: STK callback [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/daraja/callback/stk/route.ts), C2B callback [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/daraja/callback/c2b/route.ts), B2C callback [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/daraja/callback/b2c/route.ts), Reversal callback [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/daraja/callback/reversal/route.ts), and B2B callback [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/mpesa/b2b/result/route.ts).
- Created a background, non-blocking SMS alert helper `triggerSmsNotification` inside [send-sms.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/sms/send-sms.ts) using Axios with a 30s timeout to hit the provider endpoints.
- Created database migration schemas for `sms_notifications` and `sms_settings` tables in [supabase_schema.sql](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/supabase_schema.sql) and registered typings inside [database.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/types/database.ts).
- Exposed server actions inside [actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/actions.ts) for reading and updating settings, logging audits (`SMS_SENT`, `SMS_FAILED`, `SMS_SETTINGS_UPDATED`), retrieving stats, and loading notification pages.
- Created the premium, responsive [NotificationsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/NotificationsView.tsx) component displaying detailed SMS logs with status/search filtering, and realtime Supabase channel subscriptions.
- Added a dedicated "SMS Alerts" widget card inside [DashboardView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/DashboardView.tsx) reporting sent and failed alerts.
- Configured a new Settings card inside [SettingsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/SettingsView.tsx) to configure alert phone lines, sender IDs, alert switches, and automated split settlement Till numbers.
- Added "SMS Logs" menu options, mobile grouping mappings, and a premium mobile operations horizontal sub-tabs bar to [Shell.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/layout/Shell.tsx) and page renderer bindings in [page.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/dashboard/page.tsx).
- Created background automated B2B split settlement dispatcher `performAutoB2bSettlement` inside [b2b.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/repositories/b2b.ts) triggered automatically when a transaction with a reference of `PESATRIX` or `PESAFRIX` enters, executing the 60% settlement split (KES 300 for every 500) to the Till shortcode set by the admin in Settings.
- Replaced the default `favicon.ico` website icon with the custom brand logo `icon.png` in `src/app/icon.png` for automatic Next.js App Router metadata generation.

### Changed
- Removed the "Admin Keyword" validation check and form input field from the login page.

### Security
- Blocked the Development Shortcut / Demo Seeding Login helper in production environments (`NODE_ENV === 'production'`). Conditionally renders the "Quick Demo Seed & Login" button only in development view.
- Completely removed API references, Keep documents, SQL schemas, and environment template variables from git tracking index and pushed deletion mappings to origin.

## [1.2.0] - 2026-05-30

### Added
- Created B2B database repository [b2b.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/repositories/b2b.ts) managing B2B requests storage, rule configurations, and calculated queue calculations.
- Created webhook result callback [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/mpesa/b2b/result/route.ts) with strict idempotency checking and direct output unified transaction ledger logging.
- Created webhook timeout callback [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/mpesa/b2b/timeout/route.ts) to mark pending requests as TIMEOUT.
- Developed mobile-first [SettlementView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/SettlementView.tsx) UI component containing stats cards, B2B initiation form, dashboard PIN confirmations, rule creator manager, and calculated queue preview logs.
- Added Settlement page sidebar and mobile operations layout mappings in [Shell.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/layout/Shell.tsx) and [page.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/dashboard/page.tsx).

### Changed
- Refactored [daraja.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/lib/services/daraja.ts) to add the `initiateB2b` method, mapping automatically to `BusinessBuyGoods` or `BusinessPayBill` command IDs and sandbox or production gateways.
- Updated [actions.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/actions.ts) to expose B2B server actions for manual settlement dispatches, pre-flight operator PIN verifications, and funds balance availability checks.
- Integrated settlement splitting rule calculation triggers into successful incoming STK [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/daraja/callback/stk/route.ts) and C2B [route.ts](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/api/daraja/callback/c2b/route.ts) webhook handlers.
- Overhauled [AnalyticsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/AnalyticsView.tsx) with a dedicated Settlement Engine Analytics panel containing total volumes, success/failure rates, Settlements By Day, Settlements By Destination, and Settlements By Source charts.

---

## [1.1.6] - 2026-05-30

### Added
- Created dedicated [reset-password](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/reset-password/page.tsx) password-update page to handle password recovery.
- Created [SettingsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/SettingsView.tsx) component for managing security PIN updates and admin password changes.
- Added Settings tab configuration to laptop sidebar and mobile bottom menus inside [Shell.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/layout/Shell.tsx) and [page.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/dashboard/page.tsx).

### Changed
- Mapped STK transaction fallback source stream name to `System` inside [TransactionsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/TransactionsView.tsx) instead of rendering as `Unknown`.
- Overhauled [AnalyticsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/AnalyticsView.tsx) with date range selection (Today, Last 7 Days, Custom Range), channel filtering, KPI metric deltas comparing preceding periods, and 4 performance visualizations (Volume Trend Area, Channel Pie, Inflow/Outflow Flow Bar, and Hour Peak Hours Chart).
- Overhauled [AuditView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/AuditView.tsx) with a Detail overlay modal displaying detailed metadata parameter lists, cross-referenced transaction metrics, and nearest resulting balances snapshots.
- Added row selection checkboxes, select-all master header toggles, and contextual CSV Export/Delete bulk actions to [TransactionsView.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/views/TransactionsView.tsx).
- Added eye-icon visibility toggle buttons to password and admin keyword text fields inside [page.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/login/page.tsx) with sliding Framer Motion entry transition animations.
- Implemented a 30-minute inactivity auto-logout listener hook inside [Shell.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/components/layout/Shell.tsx) wrapping all dashboard modules.

---

## [1.1.5] - 2026-05-30

### Changed
- Updated style classes on the calm login page [page.tsx](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/login/page.tsx) to match the brand color classes specified in the user's styling design.
- Added brand and status color mappings (`brand-bg`, `brand-text`, `brand-accent`, `brand-panel`, `brand-border`, `status-danger`, `status-success`) to Tailwind CSS v4 `@theme` configuration in [globals.css](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/src/app/globals.css).

---

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
