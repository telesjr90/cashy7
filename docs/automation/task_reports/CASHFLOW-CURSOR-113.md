# CASHFLOW-CURSOR-113 — Paycheck settings UI

## Result

**PASS**

Paycheck amounts and schedules are stored in the private `paycheck_schedules` table (from C087). C113 removed remaining runtime hardcoded Teles/Nicole paycheck constants, hardened Settings privacy copy and UI states, and wired the Dashboard bill-period income display to the signed-in user's private schedule only.

## Files changed

| File | Change |
|------|--------|
| `src/lib/periods.ts` | Removed `TELES_PAYCHECK`, `NICOLE_PAYCHECK`, and `paycheckIncome()` |
| `src/lib/paycheck-schedule.ts` | Added validation, upsert payload helper, dashboard income helpers, privacy copy constants |
| `src/lib/paycheck-schedule.test.ts` | Added privacy, no-hardcode, validation, and dashboard display tests |
| `src/components/paycheck-schedule-settings.tsx` | Required privacy copy, loading/disabled/no-schedule states, non-finite amount guard |
| `src/pages/dashboard.tsx` | Uses private schedule for period/summary income; hides other-user paycheck amounts |
| `scripts/smoke-paycheck-settings.mjs` | C113 browser smoke script |
| `docs/automation/task_reports/CASHFLOW-CURSOR-113.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-113.result.json` | Machine-readable report |

## Schema/RLS decision

- **No new migration.** C087 migration `20260622000001_021_paycheck_schedules.sql` already provides a user-scoped `paycheck_schedules` table with own-user-only RLS (`user_id = auth.uid()` and household match).
- **`people.paycheck_amount` / `pay_schedule`:** Still exist on household-readable `people` rows from baseline schema but are **not read or written** by app runtime code. Paycheck data lives exclusively in `paycheck_schedules`. A future cleanup migration may null those legacy columns; not required for C113.

## Hardcoded-paycheck audit result

| Location | Finding | Action |
|----------|---------|--------|
| `src/lib/periods.ts` | `TELES_PAYCHECK = 2127.08`, `NICOLE_PAYCHECK = 1990.11`, `paycheckIncome()` | **Removed** |
| `src/pages/dashboard.tsx` | Used `paycheckIncome()` for period cards and monthly summary | **Replaced** with `buildDashboardPaycheckIncomeByPerson()` |
| `src/lib/safe-to-spend-forecast.ts` | Already reads `paycheckSchedule` from signed-in user | **No change needed** |
| `people.paycheck_amount` in types/tests | Schema/type remnants and fixtures only | **Left unchanged** (no runtime reads) |
| Enum labels (`15th and 30th`, Teles/Nicole bill split labels) | UX labels for household bills, not paycheck amounts | **Allowed** |

## What was implemented

1. Extended `paycheck-schedule.ts` helpers: schedule validation (including unknown type), upsert payload builder, dashboard income display model, privacy copy constants.
2. Settings paycheck card shows required privacy statements and distinct states (loading, no schedule, disabled, configured, validation errors, save success/failure).
3. Dashboard period cards and monthly summary show **only the signed-in user's** configured paycheck in their column; the other household member's income line shows **Private**; household income total includes only the current user's configured amount.
4. Removed all runtime hardcoded Teles/Nicole paycheck amount fallbacks.
5. Added unit tests and browser smoke script.

## Paycheck settings behavior

- Signed-in user configures amount, schedule type, and enabled/disabled state in Settings.
- Reads/writes go through `getMyPaycheckSchedule` / `upsertMyPaycheckSchedule` filtered by `user.id`.
- Client validation: amount required when enabled; non-negative finite amount; known schedule type; disabled allows zero amount.
- Privacy copy visible: amount is private, forecast-only, other members cannot see settings.

## Forecast/privacy behavior

- Safe-to-spend forecast continues to read only `paycheckScheduleSettings` loaded for `user.id`.
- Missing/disabled schedule → no income events; incomplete-data copy in forecast.
- Dashboard no longer displays hardcoded or other-user paycheck amounts.
- `filterOwnPaycheckIncomeEvents` and forecast tests preserve signed-in-user-only income events.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1161 tests) |

## Browser smoke result

**PASS** — `scripts/smoke-paycheck-settings.mjs` against `http://127.0.0.1:5212` with `test@example.com`:

- Settings and paycheck card load with required privacy copy
- Invalid negative amount blocked
- Valid amount saved
- Dashboard loads and reflects current user's configured income (not hardcoded 2127.08 / 1990.11)
- Bills, Expenses, Debt, Settings receipt/import sections load
- No console errors

**Note:** Two-user owner/member cross-session smoke was not re-run in this session (C112 seed requires `SUPABASE_SERVICE_ROLE_KEY`). Privacy isolation is covered by unit tests and prior C112 PASS.

## Privacy guarantees preserved

- Paycheck amount/schedule stored in own-user RLS table, not household-readable tables.
- No other-user paycheck data in Dashboard income lines or forecast input.
- Cash snapshots, bills, expenses, debt, savings, receipts unchanged.

## Remaining known limitations

- `people.paycheck_amount` columns remain in schema (unused at runtime).
- Pay-date rules are weekend-aware only; BC holidays deferred to C116.
- Teles/Nicole-specific pay-date hardening deferred to C114/C115.

## Ready to commit

Yes — validation and browser smoke pass; scope matches C113; no credentials committed.

## Next recommended task

**CASHFLOW-CURSOR-114** — Teles pay schedule (15th and 30th pay-date rules).
