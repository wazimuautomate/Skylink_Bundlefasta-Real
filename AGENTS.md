# AI Coding Agent Rules & Guidelines

Welcome, AI Coding Agent. You are pair programming on the Skylink Bundlefasta Dashboard.
You **must** read and adhere to this file every time before you modify any code or start a task in this workspace.
The purpose of this dashboard is to serve as a secure, centralized operating system for managing, monitoring, analyzing, and controlling all money flowing into and out of your Safaricom PayBill across multiple products from a single mobile-friendly interface.

## CRITICAL RULES OF ENGAGEMENT

> [!IMPORTANT]
> ### RULE 1: Always Update the Changelog (`CHANGELOG.md`)
> Every time you modify, delete, add, or refactor any code in this repository, you **must** update [CHANGELOG.md](file:///c:/Users/ADMIN/OneDrive/Desktop/Skylink-Bundlefasta-main/CHANGELOG.md) with a clear, concise log of:
> - The specific files modified or added.
> - The rationale and description of the changes.
> - The timestamp of the change.

> [!IMPORTANT]
> ### RULE 2: Always Push Code to GitHub
> After verifying your changes locally via build checks (e.g., `npm run build`), you **must** stage all your modifications, commit them with a clean, descriptive message, and push the branch to the remote GitHub repository ([https://github.com/bnk-bnk/Skylink-Bundlefasta.git](https://github.com/bnk-bnk/Skylink-Bundlefasta.git)).

---

## Core System Architecture & Guidelines

1. **Tech Stack**:
   - **Frontend**: Next.js 15 App Router, TypeScript, Tailwind CSS v4, Shadcn UI, Framer Motion, Recharts.
   - **Backend**: Next.js Route Handlers, Server Actions, Supabase.
   - **Styling**: Modern, premium dark/glassmorphic design with Outfit or custom premium typography.

2. **Supabase Key Handling**:
   - **Client side**: Publishable key only.
   - **Server side**: Service Role secret key for administrative tasks (bypassing RLS safely), Cookie-based client for user-specific queries.

3. **M-Pesa Daraja Callback Standards**:
   - Safaricom B2C, Reversal, and Balance callback metadata properties are named `Key` and `Value` (instead of `Name`/`Value`).
   - Use the `darajaErrors.ts` module to translate result/response codes to human-readable explanations.

4. **Workflow Check**:
   - Before making any code change: Review the current state of files.
   - During code change: Focus on robust, production-ready implementation, avoiding placeholders.
   - After code change: Check compilation (`npx tsc --noEmit`), run build (`npm run build`), update the changelog, and push the branch.
