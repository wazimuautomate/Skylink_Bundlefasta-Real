# Skylink Bundlefasta - Fintech Operations Dashboard

Skylink Bundlefasta is a premium, retro-themed operations dashboard designed for managing M-Pesa Daraja API transactions, STK pushes, reconciliation, and reversals.

## 🛠️ Tech Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Motion (animations), Recharts, Lucide React
- **Backend (Planned)**: Express backend for secure API proxying and webhook handlers
- **Database**: Supabase PostgreSQL with Row Level Security (RLS)

## 📦 Project Structure
- `src/components/`: Core UI widgets, sidebar, headers, charts, and context providers.
- `src/pages/`: Modular page views (Dashboard, Transactions, STK Push, Reversals, Reconciliation, Customers, Analytics, Settings).
- `src/utils/`: (To be added) Supabase clients and helper functions.

## 🔐 Security & Credentials
The application is designed for **single admin access** with multi-factor verification:
- Email and Password authenticated via Supabase Auth
- Secret login Keyword verified via database RPC function
- API credentials (M-Pesa Consumer Key, Secret, Passkey) are stored securely and must never be exposed to the client.

## 🚀 Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A [Supabase](https://supabase.com) project database

### Installation
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Set your variables in `.env` (refer to [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for details):
   ```env
   VITE_SUPABASE_URL="your-supabase-url"
   VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
   The app will run locally at [http://localhost:3000](http://localhost:3000).
