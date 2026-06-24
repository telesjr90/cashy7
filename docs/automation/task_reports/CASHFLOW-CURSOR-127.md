# CASHFLOW-CURSOR-127 — Full RLS audit

## Result: PASS

Full Row Level Security audit across 21 public app tables, 2 RLS helper functions, and the `receipt-uploads` storage policy group. One latent gap documented (legacy `people` paycheck columns); no active privacy leak and no migration required.

## Files changed

- `src/lib/rls-audit.ts` — typed expected RLS matrix registry
- `src/lib/rls-audit.test.ts` — regression tests for classifications and gap count
- `scripts/audit-rls-policies.mjs` — offline migration SQL parser
- `docs/automation/task_reports/CASHFLOW-CURSOR-127-rls-matrix.md` — full policy matrix
- `docs/automation/task_reports/CASHFLOW-CURSOR-127.md` — this report
- `docs/automation/task_reports/CASHFLOW-CURSOR-127.result.json` — machine-readable result

## Audit scope

- **A.** All 26 migrations under `supabase/migrations`
- **B.** Storage bucket `receipt-uploads` and `storage.objects` policies
- **C.** RLS helpers `get_my_household_id()`, `is_my_household_owner()` only (not full RPC audit — C128)
- **D.** Frontend spot-check: `auth-context.tsx`, `user-person.ts`, `permissions-audit.ts`, owner/import/receipt expectations

## Schema / RLS / storage decision

- RLS enabled on every app table; no `using(true)` / `with check(true)` on app tables
- Active membership enforced centrally via `get_my_household_id()` (`status=active`, `is_active=true`)
- Owner-only writes on `household_settings`, `import_batches`, `import_batch_records`, `household_invitations`
- Own-user isolation on cash, paycheck, savings participants/contributions, receipts, cash audit tables
- Storage bucket is private with uploader-scoped first path segment
- **No migration** — no concrete active leak requiring immediate hardening

## RLS matrix summary

See [CASHFLOW-CURSOR-127-rls-matrix.md](./CASHFLOW-CURSOR-127-rls-matrix.md).

- 21 tables: 20 PASS, 1 GAP (latent)
- 1 storage policy group: PASS
- 2 helpers: PASS

## Gaps found and fixes applied

| Gap | Fix |
|-----|-----|
| `people.paycheck_*` legacy columns household-readable if populated | Documented only; app uses `paycheck_schedules` (own-user RLS). Deferred to future schema cleanup. |

**Gaps fixed:** 0  
**Migrations created:** 0

## Helper / static audit behavior

- `buildRlsTableExpectations()` — mirrors migration intent per table
- `buildRlsStorageExpectations()` — receipt bucket policy summary
- `assertAllTablesClassified()` — ensures registry completeness
- `node scripts/audit-rls-policies.mjs` — parses migrations for tables, RLS enable, policy names, storage policies, `true` policy scan

## Privacy behavior

- Cross-household access: blocked
- Two-user private data (cash, paycheck, savings detail, receipts, cash audit): own-user RLS
- Removed/invited: excluded from `get_my_household_id()` and `is_my_household_owner()`
- Owner cannot read member private rows through RLS

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS |
| `node scripts/audit-rls-policies.mjs` | PASS |

## Browser smoke

Not required — docs/tests/scripts only; no UI or migration changes.

## Ready to commit

Yes — after user review. Task instruction: do not commit in this session.

## Next task

**CASHFLOW-CURSOR-128** — RPC / SECURITY DEFINER audit (`pay_source_from_current_cash`, `credit_manual_expense_adjustment_to_current_cash`, Edge Functions).
