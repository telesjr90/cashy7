# CASHFLOW-CURSOR-108 — Invited user accepts invite and joins household

## Result

**PASS**

Invited-user acceptance flow implemented with `accept-household-invite` Edge Function, pure helpers, client service, `/accept-invite` route, login redirect support, function deployment, and browser smoke.

## UI scope decision

| Option | Verdict |
|--------|---------|
| Dedicated `/accept-invite` route | **Chosen** — invite email deep-link + auth redirect requirement |
| Inline card on Settings | Rejected — invited user may have no household yet |
| Dialog-only acceptance | Rejected — auth redirect lands on a route |
| `App.tsx` changes | Minimal route wire-up only |

Smallest safe surface: standalone accept page outside `AuthenticatedLayout` / `PublicRoute` so invited users without membership are not forced into household setup.

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/accept-household-invite/index.ts` | Trusted JWT-verified acceptance + membership activation |
| `src/lib/household-invite-acceptance.ts` | Pure validation, display state, safe copy helpers |
| `src/lib/household-invite-acceptance.test.ts` | 18 Vitest cases |
| `src/lib/household-invite-acceptance-service.ts` | Client invoke wrapper |
| `src/lib/household-invite-acceptance-service.test.ts` | 9 service tests |
| `src/pages/accept-invite.tsx` | Auth redirect handling + acceptance UI states |
| `src/pages/login.tsx` | Return to accept-invite after sign-in |
| `src/App.tsx` | `/accept-invite` route |
| `docs/automation/task_reports/CASHFLOW-CURSOR-108.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-108.result.json` | Machine-readable report |

## Schema/RLS decision

No new migration required.

C107 `household_invitations` already includes `status`, `accepted_at`, `invited_user_id`, and `expires_at`. `household_members` and `people` already support active member creation and optional `person_id` mapping.

RLS unchanged:

- Invitation rows remain owner-only for SELECT/INSERT/UPDATE
- Pending invitation alone still grants no household data access
- Membership activation happens only through the trusted Edge Function using service role after JWT + email verification

## Function/acceptance decision

Edge Function `accept-household-invite` (JWT verified, service role for writes):

1. Authenticates caller via user JWT
2. Validates invitation id
3. Loads pending invitation row
4. Compares normalized caller email to invitation email
5. Blocks owner/self-invite, expired/cancelled/accepted, household full, and existing active membership
6. Creates active `household_members` row with role `member`
7. Links unclaimed `people` row when exactly one budget profile slot is free
8. Marks invitation `accepted` with `accepted_at` and `invited_user_id`
9. Returns privacy-safe JSON only

Required function secrets (names only):

- `SUPABASE_SERVICE_ROLE_KEY`

Deploy command:

```bash
npx supabase functions deploy accept-household-invite --project-ref nasyeoywmcifabusfpti --use-api
```

## Behavior implemented

### Auth redirect / accept page

- `/accept-invite` handles Supabase auth `code` via `exchangeCodeForSession`
- Invitation id resolved from `?invitation=` query or `household_invitation_id` user metadata
- Loading, sign-in required, accepting, success, and safe error states
- Success links to dashboard with privacy copy
- No raw UUIDs in normal UI copy

### Acceptance guards

- Wrong email blocked
- Expired/cancelled/accepted invites blocked
- Household full blocked
- Already active member blocked
- Owner/self-invite blocked
- Missing/invalid invitation id shows safe error

### Person/membership behavior

- Accepted user becomes active household member (`role = member`, `is_owner = false`)
- Unclaimed `people` row auto-linked when one exists (second Teles/Nicole slot pattern)
- Owner person mapping not overwritten
- User can still choose/confirm budget profile in Settings if unmapped

### C107 compatibility

- Owner invite card unchanged and still loads on Settings
- Pending invite list still shows only `invited` rows; accepted invites disappear from pending list

## Privacy/post-acceptance behavior

- No RLS weakening
- No service-role key in frontend
- Member gains household-shared access only after active membership row is created
- Private cash, savings, receipts, paycheck, and cash audit remain governed by existing RLS

## Tests added/updated

- `household-invite-acceptance.test.ts` — email match, expiry/cancel/accept blocks, page states, privacy copy, UUID sanitization
- `household-invite-acceptance-service.test.ts` — invoke payload, error mapping, transport failure, no service-role exposure

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1092 tests) |

## Browser smoke / deployment result

| Step | Result |
|------|--------|
| Migration | Not required |
| Edge Function `accept-household-invite` | Deployed ACTIVE |
| `.tmp-smoke-108.mjs` on `http://127.0.0.1:5203` | PASS |

Smoke covered:

- `/accept-invite` loads
- Missing/invalid invitation id shows safe error
- Authenticated owner cannot accept invite (already-member safe rejection)
- Settings owner invite card loads
- Dashboard, Bills, Expenses, Debt, Settings reload
- No console errors

Live invited-user email acceptance not exercised in smoke (no safe second test account); function path validated via unit/service tests and owner rejection smoke.

## Remaining known limitations

- Cancel/resend/removal lifecycle deferred to C109
- Broader owner/member permission audit deferred to C110
- `APP_INVITE_REDIRECT_URL` should point to `/accept-invite` in function secrets when production URL is finalized
- Invited user must complete Supabase Auth invite/password flow before acceptance

## Ready to commit

Yes — validation and smoke pass; scope matches C108; no credentials committed.

## Next task

**CASHFLOW-CURSOR-109** — Invited/active/removed member state management
