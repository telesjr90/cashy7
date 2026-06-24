# Cloudflare + Google OAuth (Supabase Auth)

## Frontend env (safe to expose at build time)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

Do **not** add `SUPABASE_SERVICE_ROLE_KEY`, `VITE_GOOGLE_CLIENT_SECRET`, or any Google client secret to frontend or Worker asset env.

## Supabase Auth redirect allow list

Add every origin that serves the app:

- Production: `https://cashy7.tjr-8fa.workers.dev/login`
- Local dev: `http://127.0.0.1:5227/login` (or your Vite port)

The login page uses `${window.location.origin}/login` so each environment redirects back to its own `/login` route.

## Google Cloud Console

Configure the OAuth client used by Supabase Google provider:

- Authorized JavaScript origins: app origins above (without path)
- Authorized redirect URIs: Supabase callback URL from the Supabase Google provider settings

Google client secret stays in Supabase provider config only.

## Session after OAuth

1. User clicks **Continue with Google** on `/login`.
2. Supabase Auth completes Google OAuth and redirects to `/login`.
3. The Supabase JS client restores the session from the callback URL.
4. `AuthProvider` receives the session via `onAuthStateChange` / `getSession`.
5. `PublicRoute` sends users with a household to `/`, or shows setup when membership is missing.

The Google button renders before login and does not depend on app `household`, `membership`, or `person` rows.

## Deploy

```bash
npm run build
npx wrangler deploy
```

## Smoke tests

Local:

```bash
npm run dev -- --host 127.0.0.1 --port 5227 --strictPort
node scripts/smoke-google-login-button.mjs
```

Production visibility check:

```powershell
$env:CASHFLOW_E2E_BASE_URL = "https://cashy7.tjr-8fa.workers.dev"
node scripts/smoke-google-login-button.mjs
```
