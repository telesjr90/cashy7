# CASHFLOW-CURSOR-111 — Person mapping conflict UX

## Result

**PASS**

Person/profile conflict prevention UX implemented with pure helpers, Settings card, active-member DB guard migration, auth-context usable person resolution, and browser smoke.

## Schema/RLS decision

**Migration applied:** `20260624000001_032_active_member_person_unique.sql`

Replaced household-wide `(household_id, person_id)` uniqueness with a partial unique index scoped to active members only (`status = 'active'` AND `is_active = true`). Removed and invited members no longer reserve profiles at the database layer. Existing RLS policies unchanged.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260624000001_032_active_member_person_unique.sql` | Active-member-only person_id uniqueness |
| `src/lib/person-mapping-conflicts.ts` | Pure conflict/reservation helpers and copy |
| `src/lib/person-mapping-conflicts.test.ts` | 13 regression tests |
| `src/lib/user-person.ts` | Member `person_id` in queries; pre-save conflict validation |
| `src/lib/auth-context.tsx` | `usablePersonId` excludes missing/conflicted mappings |
| `src/components/person-mapping-card.tsx` | Settings profile mapping UI |
| `src/pages/settings.tsx` | Uses `PersonMappingCard`; savings uses `usablePersonId` |
| `src/pages/dashboard.tsx` | Uses `usablePersonId` for split-safe person resolution |
| `src/pages/bills.tsx` | Uses `usablePersonId` for pay/profile guards |
| `src/pages/debt.tsx` | Uses `usablePersonId` for pay/profile guards |
| `src/pages/expenses.tsx` | Uses `usablePersonId` for expense/pay guards |
| `src/components/import-upload-card.tsx` | Uses `usablePersonId` for import person context |
| `src/components/receipt-upload-card.tsx` | Uses `usablePersonId` for receipt person context |
| `docs/automation/task_reports/CASHFLOW-CURSOR-111.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-111.result.json` | Machine-readable report |

## What was implemented

### Person/profile conflict behavior

- Active members reserve a profile; removed/invited/pending invite rows do not.
- Settings lists Teles/Nicole with reserved profiles disabled and helper copy.
- Duplicate active assignments show a privacy-safe conflict alert with resolution guidance.
- `usablePersonId` in auth context treats conflicts like missing mapping for split/privacy guards.

### Save/update behavior

- Save updates only the current user's active membership row (existing RLS + scoped update).
- Pre-save and server-side validation block reserved/stale profiles.
- Success: “Profile updated.” Stale denial: “That profile is no longer available.”

### Privacy behavior

- No private cash, savings, receipts, paycheck, or audit amounts exposed.
- Owner/member labels use display name/email only; no raw UUIDs in user-facing copy.
- Conflict UI names profiles (Teles/Nicole) only, not other users' private data.

## Tests added/updated

- `person-mapping-conflicts.test.ts` — 13 cases covering reservation, conflict detection, stale save, labels
- Total: **1152** tests passing

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS |

## Supabase validation

Migration `032_active_member_person_unique` applied to project `cashy7` via Supabase MCP.

## Browser smoke result

**PASS** — `.tmp-smoke-111.mjs` against `http://127.0.0.1:5211`:

- Settings, Dashboard, Bills, Expenses, Debt, Accept invite routes load
- Profile mapping section visible
- Invite and member management sections visible
- No console errors

Conflict warning path covered by unit tests (no safe duplicate-assignment fixture in test account).

## Remaining known limitations

- Browser smoke uses single owner test account; unavailable-profile disabled state not exercised live if both profiles are unreserved for sole active user
- Duplicate conflict alert not exercised in browser (helper tests cover it)

## Next recommended task

**CASHFLOW-CURSOR-112** — Two-user privacy smoke tests
