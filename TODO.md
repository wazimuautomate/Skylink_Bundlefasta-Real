# TODO Checklist: Skylink Bundlefasta

Below is the list of remaining development, integration, and deployment tasks for the production deployment of the Skylink Bundlefasta dashboard.

## 🔑 Phase 1: Authentication & Protection (In Progress)
- [ ] Connect Supabase client using env variables.
- [ ] Create `verify_admin_keyword` RPC function in database.
- [ ] Implement `LoginPage.tsx` styled to match the dark retro arcade palette.
- [ ] Protect pages by verifying active Supabase session + keyword validation.

## 📡 Phase 2: Express Backend Integration (Next Up)
- [ ] Create node backend initialization script (`src/server/index.ts` or `server.ts`).
- [ ] Write secure endpoint handlers for STK Pushes (`/api/mpesa/stkpush`).
- [ ] Implement webhook listeners (`/api/mpesa/callback`) to receive M-Pesa results.
- [ ] Save transaction statuses directly to Supabase rather than utilizing mock callbacks.

## 📊 Phase 3: Dashboard Data Integration
- [ ] Replace UI mock data arrays in `Dashboard.tsx` and `AnalyticsPage.tsx` with realtime queries from Supabase `transactions` and `mpesa_stk_requests` tables.
- [ ] Connect transaction details modals to fetch data dynamically based on ID.
- [ ] Bind "Run Auto-Match" in ReconciliationPage to execute reconciliation queries in the database.

## 🧪 Phase 4: Security Hardening & Testing
- [ ] Confirm RLS rules block all unauthenticated operations.
- [ ] Run penetration checks on API routes.
- [ ] Verify token renewal and session timeout constraints.
