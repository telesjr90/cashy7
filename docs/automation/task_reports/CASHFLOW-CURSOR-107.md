# CASHFLOW-CURSOR-107 — Invite second household user

## Result

**PASS**

Owner-only household invite flow implemented with `household_invitations` table, `invite-household-member` Edge Function, Settings UI, helpers/tests, remote migration, function deployment, and browser smoke.

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline card on existing Settings page | **Chosen** |
| New route for invite management | Rejected — no deep-link requirement |
| Dialog-only invite | Rejected — persistent pending status belongs on Settings |
| `App.tsx` changes | Avoided |

Smallest safe surface: `HouseholdInviteCard` on Settings near household/profile settings.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000008_030_household_invitations.sql` | Invitation table, indexes, owner-only RLS |
| `supabase/functions/invite-household-member/index.ts` | Server-side owner verify + Auth admin invite |
| `src/lib/types.ts` | `household_invitations` types |
| `src/lib/household-invitations.ts` | Pure validation, permission, display, error helpers |
| `src/lib/household-invitations.test.ts` | 15 Vitest cases |
| `src/lib/household-invitation-service.ts` | Client invoke + list invitations |
| `src/lib/household-invitation-service.test.ts` | 11 service tests |
| `src/lib/user-person.ts` | `getHouseholdMembers` for invite guardrails |
| `src/components/household-invite-card.tsx` | Owner invite UI on Settings |
| `src/pages/settings.tsx` | Mount invite card |
| `docs/automation/task_reports/CASHFLOW-CURSOR-107.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-107.result.json` | Machine-readable report |

## Schema/RLS decision

`household_members` already supports `status = 'invited'` but requires `user_id` (auth user). C107 uses a separate `household_invitations` table so email-only invites do not create membership rows or widen household data access.

### `household_invitations`

- Household-scoped invitation records with normalized email, `invited`/`accepted`/`cancelled`/`expired` status
- Partial unique index on pending invite per household + email
- RLS: **owner-only** `SELECT`, `INSERT`, `UPDATE` via `is_my_household_owner()`
- No policies for invited email alone; invited users gain no household data from the invitation row

Remote migration `030_household_invitations` applied to project `nasyeoywmcifabusfpti`.

## Function/auth invite decision

Edge Function `invite-household-member` (JWT verified):

1. Authenticates caller with user JWT (anon client)
2. Verifies active owner membership
3. Validates/normalizes email; blocks self-invite, duplicate pending invite, active member email, and max-two active members
4. Creates invitation row with service-role client
5. Calls `auth.admin.inviteUserByEmail` server-side only
6. Stores `invited_user_id` when Auth returns a user id
7. Rolls invitation back to `cancelled` if Auth invite fails
8. Optional `APP_INVITE_REDIRECT_URL` env for redirect; otherwise Supabase default redirect behavior
9. Returns privacy-safe JSON messages only (no tokens, no service role exposure)

Deploy command:

```bash
npx supabase functions deploy invite-household-member --project-ref nasyeoywmcifabusfpti --use-api
```

Required function secrets (names only):

- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_INVITE_REDIRECT_URL` (optional)

## Behavior implemented

### Owner invite

- Settings shows **Invite household member** card for owners
- Email input + **Send invite** action
- Client-side validation before invoke
- Server-side guards for owner, capacity, duplicates, active member, self-invite
- Success copy: **Invite sent.**
- Pending invite list when invitations exist

### Non-owner

- Read-only copy: **Only a household owner can invite members.**

### Product copy

- **This household supports two users.**
- Privacy copy about private cash/savings/receipts/cash audit until membership rules apply

Resend/cancel deferred to C109.

## Privacy / non-member access behavior

- No service-role key in frontend
- Invitation rows visible only to household owners
- Invited email does not receive household RLS access from invitation alone
- No automatic membership activation (C108)
- No changes to dashboard formulas, bills, debt, expenses, savings, import, receipt, paycheck, forecast, or warnings
- Display models omit raw UUIDs from normal UI copy

## Tests added

- `household-invitations.test.ts` — email normalize/validate, owner permission, self/duplicate/member/capacity blocks, display model, error labels
- `household-invitation-service.test.ts` — invoke payload, function error mapping, transport failure, no service-role exposure

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1065 tests) |

## Browser smoke / deployment result

| Step | Result |
|------|--------|
| Migration `030_household_invitations` | Applied via Supabase MCP |
| Edge Function `invite-household-member` v1 | Deployed ACTIVE |
| `.tmp-smoke-107.mjs` on `http://127.0.0.1:5202` | PASS |

Smoke covered:

- Settings loads; invite card visible
- Owner email input + send action present for test owner account
- Invalid email validation error
- Self-invite validation error (safe path; no live outbound invite sent)
- Dashboard, Bills, Expenses, Debt, Settings reload
- No console errors

Live outbound invite email not sent during smoke (self-invite/validation paths only).

## Remaining known limitations

- Accept-invite / join household flow is C108
- Cancel/resend invitation lifecycle is C109
- Broader owner/member permission audit is C110
- `APP_INVITE_REDIRECT_URL` should be set in function secrets when production redirect URL is finalized
- Supabase Auth redirect URLs must be configured in project settings before using custom `redirectTo`

## Ready to commit

Yes — validation and smoke pass; scope matches C107; no credentials committed.

## Next task

**CASHFLOW-CURSOR-108** — Invited user accepts invite and joins household
