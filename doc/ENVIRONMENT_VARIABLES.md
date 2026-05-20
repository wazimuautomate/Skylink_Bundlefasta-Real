# Environment Variables: Skylink Bundlefasta

This document defines the configuration variables required to run the Skylink Bundlefasta application.

## 📁 Environment Setup
Create a `.env` file in the root directory of the project.

```bash
cp .env.example .env
```

---

## 🎨 Frontend Variables (Vite)
Vite requires frontend variables to be prefixed with `VITE_`. These are bundled into the client-side code.

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Supabase API connection URL | `https://zrofbcerkfbuouiisjpx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Client Anonymous Key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

---

## 🖥️ Backend Variables (Express/M-Pesa)
These variables are private to the server and must **never** be prefix-exposed with `VITE_` or included in frontend bundles.

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `PORT` | Local port for Express API backend | `5000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin override key (service role) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `MPESA_CONSUMER_KEY` | Safaricom Developer portal Consumer Key | `8g3H2k9L1p5S7d...` |
| `MPESA_CONSUMER_SECRET` | Safaricom Developer portal Consumer Secret | `T7yU8i9O0p1A2s...` |
| `MPESA_PASSKEY` | M-Pesa Online Passkey for STK push requests | `bfb279f9aa9bdbcf158e97...` |
| `MPESA_SHORTCODE` | Paybill / Till Number | `174379` |
| `MPESA_CALLBACK_URL` | Secure public endpoint for Safaricom callbacks | `https://api.yourdomain.com/mpesa/callback` |
| `MPESA_ENV` | M-Pesa environment mode (`sandbox` or `production`) | `sandbox` |
