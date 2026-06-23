# CASHFLOW-CURSOR-110 — Owner/member permissions audit

## Result

**PASS**

Broad owner/member permissions audit completed with pure audit helper, regression tests, minimal UI guard hardening, permissions matrix documentation, and browser smoke. No RLS migration required.

## Audit scope

| Area | Coverage |
|------|----------|
| Database RLS / helpers | `get_my_household_id`, `is_my_household_owner`, shared tables, private tables, storage |
| Edge Functions | `invite-household-member`, `accept-household-invite`, `manage-household-members`, `extract-receipt` |
| Frontend guards | auth context, invite/member management, cashflow start, import apply/rollback |
| Privacy tables | cash snapshots, paycheck schedules, savings, receipts, cash audit |
| UI routing | protected routes, accept-invite, settings owner sections |

## Schema/RLS/function decision

**No new migration.** Existing policies already enforce:

- Active membership via `get_my_household_id()` (`status = 'active'` AND `is_active = true`)
- Owner-only writes for household settings, imports, invitations
- Own-user RLS on private cash, paycheck, savings participants/contributions, receipts, audit rows
- Private receipt storage bucket with own-folder policies

Edge Functions verified: JWT auth, active owner/membership checks, household target scoping, service-role server-side only, sanitized error messages without UUIDs.

## Files changed

| File | Change |
|------|--------|
| `src/lib/permissions-audit.ts` | Central role classification, action guards, audit matrix builder, denial copy |
| `src/lib/permissions-audit.test.ts` | 15 regression tests |
| `src/lib/auth-context.tsx` | Require `status = 'active'` when loading membership |
| `src/lib/cashflow-start-admin.ts` | Owner edit guard uses `isActiveHouseholdOwner()` |
| `src/lib/household-invitations.ts` | Invite guard uses `isActiveHouseholdOwner()` |
| `src/lib/cashflow-start-admin.test.ts` | Inactive owner membership cases |
| `src/lib/household-invitations.test.ts` | Inactive owner invite denial cases |
| `docs/automation/task_reports/CASHFLOW-CURSOR-110-permissions-matrix.md` | Full audit matrix |
| `docs/automation/task_reports/CASHFLOW-CURSOR-110.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-110.result.json` | Machine-readable report |

## Gaps found and fixes

| Gap | Fix | Layer |
|-----|-----|-------|
| Auth context could treat non-active membership rows as household access if `is_active=true` but `status != 'active'` | Added `.eq("status", "active")` to membership query | `auth-context.tsx` |
| Owner role checks ignored explicit `removed` / `invited` membership rows in pure helpers | `isActiveHouseholdOwner()` requires active status (defaults missing fields to active for backward compatibility) | `permissions-audit.ts` wired into invite/cashflow guards |

## Permission matrix summary

See `CASHFLOW-CURSOR-110-permissions-matrix.md`. All audited rows **PASS** after hardening.

Highlights:

- Unauthenticated / invited-without-membership / removed: no shared household access
- Active member: shared data yes; owner actions no; other-user private data no
- Owner: household management yes; other-user private data no
- Receipt storage: private bucket, own-folder only, no anonymous access

## Privacy/access behavior

- RLS remains the database privacy boundary
- No service-role or provider secrets in browser code
- No broadening of private data visibility
- No owner access to other users' cash, paycheck, savings, receipts, or audit rows
- Denial labels contain no raw UUIDs

## Tests added/updated

- `permissions-audit.test.ts` — role classification, owner/member guards, denial copy, matrix
- `cashflow-start-admin.test.ts` — removed/invited owner cannot edit start date
- `household-invitations.test.ts` — removed/invited owner cannot invite

Total: **1139** tests passing.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS |

## Browser smoke result

**PASS** — `.tmp-smoke-110.mjs` against `http://127.0.0.1:5210` with owner test account:

- Settings loads; Household members + Invite cards visible
- Owner invite field enabled (owner path)
- `/accept-invite` loads
- Dashboard, Bills, Expenses, Debt, Settings reload
- Import/receipt sections reachable on Settings
- No console errors

No separate non-owner test account available; non-owner/removed/invited states covered by unit tests and RLS audit.

## Remaining known limitations

- Non-owner browser smoke not run (no second safe test account)
- Ownership transfer not implemented
- Re-inviting removed users may create new membership rows
- Frontend guards are UX-only; RLS and Edge Functions remain authoritative

## Ready to commit

Yes — validation and smoke pass; scope matches C110; no credentials committed; user requested no commit in this task.

## Next task

**CASHFLOW-CURSOR-111**
