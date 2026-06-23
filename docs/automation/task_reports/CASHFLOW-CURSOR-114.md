# CASHFLOW-CURSOR-114 — Teles pay schedule: 15th and 30th

## Result

**PASS**

Hardened the reusable `semi_monthly_15_30` (`15th and 30th of each month`) paycheck schedule with dedicated pay-date helpers, comprehensive unit tests, and browser smoke verification. No schema migration; no user-name-based runtime logic.

## Files changed

| File | Change |
|------|--------|
| `src/lib/paycheck-schedule.ts` | Added `getFixedFifteenthAndThirtiethPayDates`, `getPaycheckDatesForSchedule`; wired 15/30 month logic through the dedicated helper |
| `src/lib/paycheck-schedule.test.ts` | Added C114 pay-date rule tests (Jan/Apr, Feb clamp, window filtering, disabled/missing schedule, forecast amount privacy) |
| `scripts/smoke-paycheck-settings.mjs` | Updated smoke labels for C114 (select/save 15th/30th schedule) |
| `docs/automation/task_reports/CASHFLOW-CURSOR-114.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-114.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.** Existing C087 migration `20260622000001_021_paycheck_schedules.sql` already defines `semi_monthly_15_30` in the schedule type check constraint.
- **RLS unchanged.** Paycheck schedules remain own-user-only (`user_id = auth.uid()`).

## What was implemented

1. **Schedule type:** `semi_monthly_15_30` with UI label “15th and 30th of each month” (Settings dropdown from C113).
2. **Pay-date helpers:**
   - `getFixedFifteenthAndThirtiethPayDates(year, month)` — pure 15th + clamped 30th dates.
   - `getPaycheckDatesForSchedule(settings, range)` — range-filtered dates; returns `[]` for null/disabled/missing schedule.
   - Existing `computePayDatesForMonth`, `computePayDatesInRange`, and `buildPaycheckForecastIncomeEvents` already consume the hardened logic.
3. **Forecast integration:** `safe-to-spend-forecast.ts` already builds income via `buildPaycheckForecastIncomeEvents` using the signed-in user's private schedule only (no change required).
4. **Settings UI:** Already includes the 15th/30th option and required privacy copy from C113 (no change required).
5. **Dashboard:** Already reads only the signed-in user's schedule via `getMyPaycheckSchedule` (no change required).

## 15th/30th pay-date behavior

| Month | Pay dates |
|-------|-----------|
| January 2026 | 2026-01-15, 2026-01-30 |
| April 2026 | 2026-04-15, 2026-04-30 |
| February 2026 (non-leap) | 2026-02-15, 2026-02-28 (30 clamped) |
| February 2028 (leap) | 2028-02-15, 2028-02-29 (30 clamped) |

- Window starting after the 15th includes only the 30th/last-day date.
- Window ending before the 30th includes only the 15th.
- No weekend adjustment (C115/C116 scope).
- Dates are stable `YYYY-MM-DD` strings built from local calendar year/month/day (no UTC off-by-one).

## Forecast/privacy behavior

- Forecast income events use the signed-in user's private `paycheck_schedules.amount` only.
- Disabled or missing schedule → no pay dates, no income events.
- `filterOwnPaycheckIncomeEvents` excludes other-user events even if accidentally passed in.
- No hardcoded Teles/Nicole paycheck amount fallbacks.
- Privacy copy remains visible in Settings.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1169 tests) |

## Browser smoke result

**PASS** — `scripts/smoke-paycheck-settings.mjs` against `http://127.0.0.1:5212` with `test@example.com`:

- Settings and paycheck card load with required privacy copy
- User selects and saves “15th and 30th of each month”
- Invalid negative amount blocked
- Dashboard loads and reflects saved paycheck amount (not hardcoded 2127.08 / 1990.11)
- Bills, Expenses, Debt, Settings receipt/import sections load
- No console errors

## Privacy guarantees preserved

- Paycheck amount/schedule stored in own-user-only `paycheck_schedules` table
- Dashboard shows other household member income as “Private”
- No runtime reads of another user's paycheck schedule for forecast or dashboard
- No user-name/profile/email-based schedule routing

## Remaining known limitations

- Last-business-day schedule (Nicole pattern) is present but not holiday-aware — C115/C116 scope
- Pay-date display in UI deferred to C117
- `people.paycheck_amount` legacy columns still exist in schema but are unused by app runtime

## Exact next recommended small task

**CASHFLOW-CURSOR-115** — Nicole pay schedule: 15th and last business day (weekend-aware, not holiday-aware).
