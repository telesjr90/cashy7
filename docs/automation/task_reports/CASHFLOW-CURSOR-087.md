# CASHFLOW-CURSOR-087 — Paycheck schedule / future income in safe-to-spend forecast

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline Settings card for paycheck schedule | **Chosen** |
| New route for income settings | Rejected — Settings already hosts private user data |
| Forecast configuration on Dashboard | Rejected — forecast stays read-only; settings belong in Settings |
| Reuse `people.paycheck_amount` | Rejected — household-visible RLS would expose amounts |

Smallest safe surface: `PaycheckScheduleSettingsPanel` on Settings; forecast card consumes signed-in user's schedule only.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260622000001_021_paycheck_schedules.sql` | User-scoped `paycheck_schedules` table + RLS |
| `src/lib/types.ts` | `PaycheckSchedule` type |
| `src/lib/paycheck-schedule.ts` | Schedule validation, pay-date math, forecast income events, Supabase fetch/save |
| `src/lib/paycheck-schedule.test.ts` | Vitest coverage for schedule + income behavior |
| `src/lib/safe-to-spend-forecast.ts` | Income events in running balance; configured/not-configured summary |
| `src/lib/safe-to-spend-forecast.test.ts` | Income integration tests |
| `src/components/paycheck-schedule-settings.tsx` | Settings panel with privacy copy |
| `src/components/dashboard-safe-to-spend-forecast.tsx` | Income metric + description updates |
| `src/pages/settings.tsx` | Load/save paycheck schedule panel |
| `src/pages/dashboard.tsx` | Fetch private schedule for forecast input |
| `docs/automation/task_reports/CASHFLOW-CURSOR-087.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-087.result.json` | Machine-readable report |

## Schema/RLS decision

**Migration added** — `people` table fields are household-readable via existing RLS, so paycheck amount/schedule cannot be stored there without exposing one user's income to the other household member.

New `paycheck_schedules` table:
- One row per `user_id` (unique)
- RLS mirrors `cash_snapshots` — select/insert/update/delete only when `user_id = auth.uid()` and household matches `get_my_household_id()`
- No weakening of existing policies

Migration applied to remote `cashy7` project for smoke validation.

## Behavior implemented

### Paycheck schedule settings (Settings)

- Private per-user schedule configuration: disabled, 15th+30th, or 15th+last business day (weekend-aware)
- Amount per paycheck
- Privacy copy: schedule private to you; only your forecast includes income; other members cannot see amount
- Weekend-aware last-business-day limitation labeled clearly (not holiday-aware)

### Forecast income integration (Dashboard)

- Expected paycheck rows as positive `income` events
- Running projected balance adds income after obligations on each date
- Summary shows income in forecast (amount or "Not configured"), ending balance, lowest balance, shortfalls
- Incomplete-data warning when paycheck schedule not configured
- Window selector from C086 unchanged

### Unchanged

- Current-period safe-to-spend formulas
- Bill/debt/savings/expense/cash mutation flows (except new schedule save)
- C082/C083/C084 drilldowns and C085 debt summary
- Forecast remains read-only on Dashboard

## Paycheck schedule behavior

| Schedule type | Pay dates |
|---------------|-----------|
| `semi_monthly_15_30` | 15th and 30th (day 30 clamps to month end) |
| `semi_monthly_15_last_business_day` | 15th and weekend-aware last business day |
| `disabled` | No forecast income events |

Pay dates after the cash snapshot date and inside the selected forecast window are included.

## Forecast income behavior

1. Starting balance from private cash snapshot
2. Add expected paycheck inflows (negative `signedAmount` in ledger math)
3. Subtract bills, debt, savings obligations, expenses/adjustments (C086 rules)
4. Recompute shortfall detection on running balance

## Privacy behavior

- `paycheck_schedules` RLS: user can only read/write own row
- Forecast filters income events to `signedInUserId` even if other rows are passed
- No exposure of other user's paycheck amount, schedule, current cash, savings, or audit rows
- Labels avoid raw UUIDs in user-facing text

## Tests added/updated

- `src/lib/paycheck-schedule.test.ts` — 11 cases
- `src/lib/safe-to-spend-forecast.test.ts` — income configured/not-configured, balance impact, other-user exclusion

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (688 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-087.mjs` against `http://127.0.0.1:5187`:

- Settings loads; paycheck schedule section + privacy copy visible
- Schedule type/amount fields and save button work
- Dashboard forecast section loads; income metric visible
- Forecast window selector works
- C082/C083/C084 drilldowns still open
- C085 debt summary still works
- Bills, Debt, Expenses, Settings load
- No console errors

## Supabase validation

**PASS** — migration `021_paycheck_schedules` applied to `cashy7` via Supabase MCP; table + RLS policies created.

## Remaining known limitations

- Last business day is weekend-aware only (no holiday calendar)
- Savings obligations still placed at period-end dates (C086 behavior)
- Dashboard period summary still uses hardcoded `TELES_PAYCHECK` / `NICOLE_PAYCHECK` constants in `periods.ts` (unchanged; separate from forecast schedule)

## Exact next recommended small task

**CASHFLOW-CURSOR-088**
