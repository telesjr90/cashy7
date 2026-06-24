# CASHFLOW-CURSOR-130 — Same-household two-user privacy tests

## Result: PARTIAL (static registry + validation PASS; live seed/smoke blocked — no service role key)

Static same-household privacy registry, fixture scripts, and all unit/audit validation pass.
Live API/RPC/UI smoke is **NOT_RUN** because `SUPABASE_SERVICE_ROLE_KEY` is not present locally.

---

## Files changed

| File | Purpose |
|------|---------|
| `scripts/lib/two-user-privacy-v2-test-support.mjs` | C130 constants, env helpers, anon-client auth helpers |
| `scripts/seed-same-household-two-user-privacy-test-users.mjs` | Opt-in same-household fixture seed (service role) |
| `scripts/cleanup-same-household-two-user-privacy-test-users.mjs` | Dry-run + confirmed cleanup for C130 emails only |
| `scripts/smoke-same-household-two-user-privacy.mjs` | API/RPC/owner-admin/UI same-household isolation smoke |
| `src/lib/same-household-privacy-audit.ts` | Static same-household table/action registry |
| `src/lib/same-household-privacy-audit.test.ts` | Vitest coverage for registry completeness |

---

## Test fixture setup

### Opt-in seed

```powershell
$env:CASHFLOW_ALLOW_SAME_HOUSEHOLD_TEST_SEED = "YES"
node scripts/seed-same-household-two-user-privacy-test-users.mjs
```

Creates/reuses **C130 Same-Household Two-User Privacy Test Household**:

| Role | Email | Profile |
|------|-------|---------|
| Owner | `cashflow.two-user.owner+e2e@example.com` | Teles |
| Member | `cashflow.two-user.member+e2e@example.com` | Nicole |
| Removed | `cashflow.two-user.removed+e2e@example.com` | (no active profile) |
| Invited-only | `cashflow.two-user.invited+e2e@example.com` | pending invitation only |

Credentials written only to `.tmp/c130-same-household-smoke.env` (gitignored). Metadata: `.tmp/c130-seed-metadata.json`.

### Shared fixtures (both active members)

- Bills, bill instances, debt accounts/payments, shared manual expenses
- Household settings, people/profile rows, import batches/records

### Owner-private fixtures

- Cash snapshot `C130 OWNER PRIVATE CASH` ($1303.30)
- Cash audit `C130 OWNER CASH AUDIT`
- Paycheck $1301.30, savings `C130 OWNER SAVINGS`, receipts `C130 OWNER RECEIPT`
- Private manual expense `C130 OWNER PRIVATE EXPENSE`

### Member-private fixtures

- Cash snapshot `C130 MEMBER PRIVATE CASH` ($1304.30)
- Cash audit `C130 MEMBER CASH AUDIT`
- Paycheck $1302.30, savings `C130 MEMBER SAVINGS`, receipts `C130 MEMBER RECEIPT`
- Private manual expense `C130 MEMBER PRIVATE EXPENSE`

### Removed/invited fixtures

- Removed user has `C130 REMOVED PRIVATE CASH` but inactive membership
- Invited-only email has pending `household_invitations` row, no active access

### Cleanup

```powershell
node scripts/cleanup-same-household-two-user-privacy-test-users.mjs
$env:CASHFLOW_CONFIRM_SAME_HOUSEHOLD_TEST_CLEANUP = "YES"
node scripts/cleanup-same-household-two-user-privacy-test-users.mjs
```

Dry-run PASS (metadata-only mode when service role unavailable).

---

## Shared same-household data behavior (smoke design)

Both active owner and member can read via anon client:

- `bills`, `bill_instances`, `debt_accounts`, `debt_payments`
- Shared `manual_expenses`, `household_settings`, `people`
- `import_batches`, `import_batch_records`

---

## Personal view privacy behavior (smoke design)

- Owner/member read own private cash, paycheck, savings, receipts via own-user queries
- Personal-view cash query (`.eq("user_id", auth.uid())`) returns own labels only
- Member cannot read owner private rows by id (cash, paycheck, savings, cash audit)
- Owner personal UI must not show member private labels (`C130 MEMBER PRIVATE CASH`, etc.)

---

## Owner Admin view read/read-only behavior (smoke design)

- Owner can read active member private rows at table level (migration 034 admin SELECT)
- Owner cannot read removed member private cash
- Owner cannot UPDATE/DELETE member private rows (noop or error; C129 `assertUpdateDeniedOrNoop` pattern)
- Admin UI: toggle visible, banner + household admin overview shows member cash summary
- Admin overview is read-only (no edit/delete controls)
- Switching back to Personal view hides member private labels

---

## Member privacy behavior (smoke design)

- Member cannot read owner private cash, paycheck, savings, receipts, cash audit
- Member cannot use Admin toggle
- Member cannot invite, remove, change cashflow start, or modify imports
- Member cannot update owner private rows or household settings

---

## RPC and owner-action isolation (smoke design)

- Member cannot call `pay_source_from_current_cash` on owner private manual/savings source ids
- Owner cannot call pay/deduct on member private source ids
- Failed RPCs must not create cash snapshots or payment transactions
- Service role never used in smoke assertions

---

## UI/browser isolation (smoke design)

Separate Playwright contexts for owner and member. Routes: Dashboard, Bills, Expenses, Debt, Calendar, Printable Report, Settings.

- Dev server default: `http://127.0.0.1:5230`
- Unreachable dev server → UI NOT_RUN (not a leak)

```powershell
npm run dev -- --host 127.0.0.1 --port 5230 --strictPort
$env:CASHFLOW_E2E_BASE_URL = "http://127.0.0.1:5230"
node scripts/smoke-same-household-two-user-privacy.mjs
```

---

## Validation results

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1379 tests, includes 11 new same-household registry tests) |
| `node scripts/audit-rls-policies.mjs` | PASS |
| `node scripts/audit-database-functions.mjs` | PASS |

---

## Smoke/cleanup result

| Step | Result |
|------|--------|
| Seed | BLOCKED — `SUPABASE_SERVICE_ROLE_KEY` missing |
| API/RPC smoke | NOT_RUN — requires seed |
| UI smoke | NOT_RUN — requires seed + dev server |
| Cleanup dry-run | PASS |

---

## Privacy guarantees preserved

- No RLS weakening
- No broadening beyond OWNER-001 active-owner Admin read exception
- Non-owner members cannot use Admin view
- Removed/invited users excluded from active member access
- Owner Admin view read-only for other users' private rows
- No service-role keys in frontend or committed files

---

## Ready to commit

**No** — result is PARTIAL until local seed + live smoke pass with service role key.

After unblocking:

1. Add `SUPABASE_SERVICE_ROLE_KEY` to local `.env` (never commit)
2. Run seed + smoke commands above
3. Re-run validation; update result JSON to PASS if all smoke checks pass

---

## Next task

**CASHFLOW-CURSOR-131** — migration replay tests
