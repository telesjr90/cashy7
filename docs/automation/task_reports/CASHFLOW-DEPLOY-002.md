# CASHFLOW-DEPLOY-002 — Verify and fix missing Google Sign-In button

## Result: PARTIAL

Local implementation and smoke **PASS**. Production still serves a build **without** the Google button until `npm run build` + `npx wrangler deploy` is run from this working tree.

## Login implementation audit

| Question | Answer |
| --- | --- |
| Is there a Google button in the login JSX? | **Yes** — `Continue with Google` in `src/pages/login.tsx` |
| Is it hidden by a condition? | **No** — renders for all unauthenticated visitors; no household/membership/profile gate |
| Is it behind an env var? | **No** — only standard `VITE_SUPABASE_*` client env required for OAuth call |
| Is it hidden by CSS/responsive classes? | **No** — full-width outline button, always in DOM |
| Is the deployed app likely older than current code? | **Yes** — committed `main` at `fc5118b` has email/password-only login; Google UI is uncommitted local change |
| Does email/password login UI still render? | **Yes** — email, password, and Sign In button remain below an “Or continue with email” separator |

## Missing button root cause

Production Cloudflare Worker (`https://cashy7.tjr-8fa.workers.dev`) is serving the last deployed build from committed `main`, which does **not** include the Google Sign-In UI. The fix exists locally in `src/pages/login.tsx` but has not been committed or redeployed.

Missing Google app-database users do **not** affect button rendering. That is a post-login onboarding concern handled by `PublicRoute` → `SetupPage`.

## Files changed

- `src/pages/login.tsx` — Google OAuth button, loading/error states, copy, `data-testid="google-sign-in-button"`
- `scripts/smoke-google-login-button.mjs` — Playwright smoke for local and production visibility
- `docs/deployment/cloudflare-google-auth.md` — redirect/env/deploy/smoke notes
- `.env.example` — safe public Supabase placeholders only
- `docs/automation/task_reports/CASHFLOW-DEPLOY-002.md`
- `docs/automation/task_reports/CASHFLOW-DEPLOY-002.result.json`

## Behavior implemented

### Google button (`/login`)

- Visible before authentication
- Keyboard-accessible native `<button>` via shadcn `Button`
- `data-testid="google-sign-in-button"`
- Text: **Continue with Google** (loading: “Redirecting to Google...”)
- Helper copy: “Sign in with Google to continue.”
- Disabled while email/password or Google auth is in progress

### Google click handler

```ts
const redirectTo = `${window.location.origin}/login`;
await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
```

Uses `window.location.origin` so local (`http://127.0.0.1:5227`) and production (`https://cashy7.tjr-8fa.workers.dev`) both work when listed in Supabase redirect allow list.

### Session after OAuth redirect

No new callback route required:

1. Supabase redirects to `/login` with auth callback params.
2. `@supabase/supabase-js` restores session from URL (default browser behavior).
3. `AuthProvider` updates via `onAuthStateChange` / `getSession`.
4. `PublicRoute` sends authenticated users with a household to `/`; users without membership see existing `SetupPage`.

### No DB requirement for button

Explicit comment in `login.tsx`: button renders without `household`, `membership`, `person`, or app profile rows.

## Security / secrets review

| Check | Status |
| --- | --- |
| `VITE_SUPABASE_URL` in frontend | Present |
| `VITE_SUPABASE_ANON_KEY` in frontend | Present |
| `SUPABASE_SERVICE_ROLE_KEY` in frontend | **Absent** |
| `VITE_GOOGLE_CLIENT_SECRET` | **Absent** |
| Google client secret in repo | **Absent** |
| RLS weakened | **No** |
| Supabase Auth bypassed | **No** |

`.env.example` includes only public Supabase placeholders; service role commented for server scripts only.

## Validation

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (79 files, 1334 tests) |

## Browser smoke

| Target | Result |
| --- | --- |
| Local `http://127.0.0.1:5227/login` | **PASS** — button visible, text includes “Google”, email/password form present, OAuth navigation starts on click, no console errors |
| Production `https://cashy7.tjr-8fa.workers.dev/login` | **FAIL (expected)** — `[data-testid="google-sign-in-button"]` not in deployed bundle |

## Manual test checklist (after deploy)

1. Open production `/login`.
2. Confirm **Continue with Google** is visible.
3. Click it — should redirect to Supabase/Google OAuth.
4. Complete Google login with a test user.
5. Confirm app returns to `/login`, session loads, and navigation proceeds.
6. For a new Google user without membership, confirm safe `SetupPage` / onboarding state (not a hidden button).

## Privacy / product rules

- PASS — no financial mutations, no RLS changes, no service-role exposure, no household auto-creation added.

## Ready to commit

**Yes** — local code, tests, build, and local smoke pass. Commit + deploy required for production PASS.

## Next task

`CASHFLOW-CURSOR-128`
