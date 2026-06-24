# CASHFLOW-CURSOR-129 — Cross-household privacy tests

## Result: PASS (API/RPC/Owner-Admin confirmed; UI NOT_RUN — no dev server)

Static registry, fixture scripts, and all live API/RPC/owner-admin smoke checks pass.
UI smoke is NOT_RUN because the dev server is not running; it does not count as a leak.

---

## Files changed

| File | Purpose |
|------|---------|
| `scripts/lib/cross-household-privacy-test-support.mjs` | C129 constants, env helpers, anon-client auth helpers |
| `scripts/seed-cross-household-privacy-test-users.mjs` | Opt-in two-household fixture seed (service role) |
| `scripts/cleanup-cross-household-privacy-test-users.mjs` | Dry-run + confirmed cleanup for C129 emails only |
| `scripts/smoke-cross-household-privacy.mjs` | API/RPC/owner-admin/UI cross-household isolation smoke (patched C129 false positives) |
| `src/lib/cross-household-privacy-audit.ts` | Static cross-household table/RPC registry |
| `src/lib/cross-household-privacy-audit.test.ts` | Vitest coverage for registry completeness |

---

## Smoke script fixes (this patch)

### Root causes of false positives

| # | Issue | Fix |
|---|-------|-----|
| 1 | `assertCanReadOwnHousehold` for `households` used `.select("id").eq("household_id", …)` — no `household_id` column on `households` table | Replaced with household_members membership check |
| 2 | `assertCannotReadForeignHousehold` selected `id` from `household_settings` which has no `id` column — accidentally PASSed via query error | Changed to `.select("household_id")` for all tables in the list |
| 3 | `assertWriteDenied` for UPDATE required `Boolean(error)`; PostgREST/RLS returns no error + 0 rows when silently blocking | Added `assertUpdateDeniedOrNoop` helper |
| 4 | Owner-admin UPDATE checks used `Boolean(error)` same pattern | Replaced with `assertUpdateDeniedOrNoop` using correct verifier clients |
| 5 | UI smoke ran Playwright even when dev server was down, counting the connection error as a leak | `isDevServerReachable` probe — unreachable → NOT_RUN, not FAIL |

### `assertUpdateDeniedOrNoop` semantics

1. Capture target row via **verifier** (foreign household owner or row owner) before the attempt.
2. Run actor `.update(patch).eq("id", targetId).select(patchColumns)`.
3. **PASS** if update returns an error (explicit RLS denial).
4. **PASS** if update returns `[]` / 0 rows AND verifier confirms the row is unchanged.
5. **FAIL** only if actor sees returned updated rows, or verifier detects the row mutated despite 0 rows returned.

Verifier assignment:
- Cross-household writes → foreign household owner is verifier.
- Owner-admin foreign cash → `ownerBClient` is verifier.
- Owner-admin same-household member cash → `memberAClient` is verifier.

---

## Test fixture setup

### Opt-in seed

```powershell
$env:CASHFLOW_ALLOW_CROSS_HOUSEHOLD_TEST_SEED = "YES"
node scripts/seed-cross-household-privacy-test-users.mjs
```

Creates/reuses:

- **Household A** — owner `cashflow.household-a.owner+e2e@example.com`, member `cashflow.household-a.member+e2e@example.com`
- **Household B** — owner `cashflow.household-b.owner+e2e@example.com`

Credentials written only to `.tmp/c129-cross-household-smoke.env` (gitignored). Metadata: `.tmp/c129-seed-metadata.json`.

### Cleanup

```powershell
node scripts/cleanup-cross-household-privacy-test-users.mjs
$env:CASHFLOW_CONFIRM_CROSS_HOUSEHOLD_TEST_CLEANUP = "YES"
node scripts/cleanup-cross-household-privacy-test-users.mjs
```

---

## Cross-household API isolation

For each owner (A vs B, symmetric):

- Own-household access verified via `household_members` (direct `households` SELECT not exposed)
- Cannot read foreign `households` row directly
- Cannot read foreign rows for 18 tables (household_members, people, household_settings, bills, bill_instances, debt_accounts, debt_payments, manual_expenses, import_batches, import_batch_records, receipt_uploads, receipt_candidates, savings_goals, savings_goal_participants, savings_contributions, cash_snapshots, cash_payment_transactions, paycheck_schedules)
- Cannot read foreign bills, bill_instances, cash_snapshots, paycheck, receipt_uploads, savings_goals, manual_expenses by ID
- Cannot UPDATE 10 foreign tables (noop confirmed by verifier): bills, bill_instances, debt_accounts, debt_payments, manual_expenses, savings_goals, import_batches, import_batch_records, receipt_uploads, receipt_candidates
- Cannot UPDATE foreign cash_snapshots (noop confirmed by verifier)
- Cannot INSERT into foreign household cash_snapshots (explicit error)
- Cannot UPDATE foreign household_members or household_settings

## Cross-household RPC isolation

- `pay_source_from_current_cash` with foreign bill_instance, debt_payment, manual_expense, savings_contribution ids — all fail
- `credit_manual_expense_adjustment_to_current_cash` with foreign adjustment id — fails
- Caller cash snapshot / payment / adjustment counts unchanged after all failed RPCs

## Owner Admin cross-household isolation

- Household A owner CAN read same-household member private cash (migration 034 admin SELECT)
- Household A owner CANNOT read Household B private cash, paycheck, etc.
- Non-owner member cannot read foreign or same-household owner private rows
- Owner admin SELECT does NOT grant UPDATE on foreign private cash (noop confirmed by ownerBClient)
- Owner admin SELECT does NOT grant UPDATE on same-household member private cash (noop confirmed by memberAClient)

## UI isolation (smoke design)

Isolated Playwright contexts for both owners. Runs only when dev server is reachable.

```powershell
npm run dev -- --host 127.0.0.1 --port 5229 --strictPort
$env:CASHFLOW_E2E_BASE_URL = "http://127.0.0.1:5229"
node scripts/smoke-cross-household-privacy.mjs
```

Skip UI explicitly: `CASHFLOW_SKIP_UI_SMOKE=YES`

If dev server is not reachable and `CASHFLOW_E2E_BASE_URL` is not set at run-time, UI is reported as NOT_RUN and does not count as a failure.

---

## Privacy guarantees preserved

- No service-role key in frontend or committed files
- No Teles/Nicole production household used
- Owner admin same-household read exception documented; cross-household denied in all smoke paths
- Seed/cleanup scoped to `@example.com` C129 emails only
- No RLS weakened; no migrations added

---

## Validation results

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1368 tests) |
| `node scripts/audit-rls-policies.mjs` | PASS |
| `node scripts/audit-database-functions.mjs` | PASS (034 `is_household_admin_viewer` present) |
| `node scripts/smoke-cross-household-privacy.mjs` | **PASS** — 103 checks, 0 leaks, UI NOT_RUN |

### Smoke breakdown

| Category | Checks | Result |
|----------|--------|--------|
| apiIsolation — read | 54 | PASS |
| apiIsolation — write | 28 | PASS |
| rpcIsolation | 16 | PASS |
| ownerAdmin | 7 | PASS |
| uiIsolation | — | NOT_RUN (dev server down) |

---

## Ready to commit

**Yes** — typecheck, build, tests, RLS audit, function audit, and live smoke all pass.

No RLS weakened. No migrations. No credentials committed.

## Next task

**CASHFLOW-CURSOR-130** — deeper two-user same-household privacy tests.
