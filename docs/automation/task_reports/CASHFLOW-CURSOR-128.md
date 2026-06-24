# CASHFLOW-CURSOR-128 — RPC / SECURITY DEFINER audit

## Result: PASS

Audited all 8 Postgres functions, 4 Edge Functions (RPC/database interaction only), and 2 frontend RPC call sites. Three concrete gaps were found in SECURITY DEFINER RPCs and fixed in migration `033_harden_rpc_source_validation`. Static audit script and regression tests added.

## Files changed

- `src/lib/function-security-audit.ts` — function security registry and SQL/RPC parsers
- `src/lib/function-security-audit.test.ts` — regression tests
- `scripts/audit-database-functions.mjs` — offline migration + frontend RPC audit
- `supabase/migrations/20260625000001_033_harden_rpc_source_validation.sql` — RPC hardening
- `docs/automation/task_reports/CASHFLOW-CURSOR-128-function-matrix.md` — full matrix
- `docs/automation/task_reports/CASHFLOW-CURSOR-128.md` — this report
- `docs/automation/task_reports/CASHFLOW-CURSOR-128.result.json` — machine-readable result

## Audit scope

- **A.** All 27 migrations under `supabase/migrations` (26 prior + 033)
- **B.** Edge Functions: invite, accept, manage-household-members, extract-receipt
- **C.** Frontend: `supabase.rpc`, `functions.invoke`, `paySourceFromCurrentCash`
- **D.** RLS helpers `get_my_household_id()`, `is_my_household_owner()` (function behavior, not table RLS repeat)

## Function / SECURITY DEFINER matrix summary

See [CASHFLOW-CURSOR-128-function-matrix.md](./CASHFLOW-CURSOR-128-function-matrix.md).

- 8 database functions: **8 PASS** (after 033)
- 4 Edge Functions (scoped review): **4 PASS**
- Import apply/rollback: **PASS** (RLS owner policies, no elevated RPC)

## RPC / frontend reference summary

| Client call | Target | Server enforcement |
|-------------|--------|-------------------|
| `pay_source_from_current_cash` | SECURITY DEFINER RPC | auth.uid, get_my_household_id, per-type source validation, own-user cash writes |
| `credit_manual_expense_adjustment_to_current_cash` | SECURITY DEFINER RPC | auth.uid, household, shared-or-own adjustment, own-user cash writes |
| `invite-household-member` | Edge + service role | JWT owner check before admin writes |
| `manage-household-members` | Edge + service role | verifyActiveOwner; household_id match on targets |
| `accept-household-invite` | Edge + service role | Email match; no cross-household membership |
| `extract-receipt` | Edge (user client) | uploaded_by = auth.uid; no service role in browser |

## Gaps found and fixes applied

| Gap | Fix |
|-----|-----|
| `pay_source_from_current_cash`: cash deducted without valid unpaid `bill_instance` | Migration 033 — validate bill/debt/manual/savings sources before cash mutation |
| `credit_manual_expense_adjustment_to_current_cash`: private peer adjustment could credit caller cash | Migration 033 — `expense_scope = shared OR created_by_user_id = auth.uid()` |
| `set_household_invitations_updated_at`: no explicit search_path | Migration 033 — `set search_path = ''` |

**Gaps fixed:** 3  
**Migrations created:** 1

## Static audit script behavior

- `buildFunctionSecurityExpectations()` — typed expected function matrix
- `parseFunctionsFromMigrationSql()` — SECURITY DEFINER, search_path, grants, triggers
- `detectFrontendRpcReferences()` — scans `src` for `supabase.rpc(`
- `node scripts/audit-database-functions.mjs` — prints functions, definer/search_path gaps, RPC/edge refs, summary counts; exits 1 on gaps

## Privacy / security behavior

- Cross-household: blocked via `get_my_household_id()` and source household checks in RPCs
- Two-user private cash: RPCs write only `user_id = auth.uid()`
- Private manual expenses: pay + credit RPCs enforce shared-or-own
- Savings contributions: own-user check on source id
- Edge Functions: service-role server-side only; JWT verified before privileged writes
- No service-role or provider secrets in frontend

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1342 tests) |
| `node scripts/audit-database-functions.mjs` | PASS |

## Browser smoke

Not required for docs/tests/migration-only RPC hardening. If migration is deployed, spot-check Pay & deduct on Bills/Expenses/Debt and cash credit on Expenses.

## Ready to commit

Yes — after user review. Task instruction: do not commit in this session.

## Next task

**CASHFLOW-CURSOR-129** — cross-household privacy tests.
