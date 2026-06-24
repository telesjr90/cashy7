# CASHFLOW-CURSOR-115 — 15th + last business day pay schedule

## Result

**PASS**

Hardened the reusable `semi_monthly_15_last_business_day` paycheck schedule so pay dates use **B.C. holiday-aware business-day logic** for both the 15th anchor and the month-end paycheck. No schema migration; no user-name-based runtime logic.

## Files changed

| File | Change |
|------|--------|
| `src/lib/paycheck-schedule.ts` | Added `getLastBusinessDayOfMonth`, `getFifteenthAndLastBusinessDayPayDates`; wired `computePayDatesForMonth`; updated schedule label; removed weekend-only limitation constant |
| `src/lib/paycheck-schedule.test.ts` | Comprehensive 15th + last-business-day tests; forecast/privacy tests for this schedule |
| `src/components/paycheck-schedule-settings.tsx` | Removed outdated weekend-only limitation note |
| `scripts/smoke-paycheck-settings.mjs` | Select/save 15th + last business day schedule; robust dashboard amount wait |
| `docs/automation/task_reports/CASHFLOW-CURSOR-115.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-115.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.** Existing `semi_monthly_15_last_business_day` enum value in `paycheck_schedules` remains sufficient.
- **RLS unchanged.** Paycheck schedules stay own-user-only.

## What was implemented

### Schedule type

- Internal value: `semi_monthly_15_last_business_day`
- UI label: “15th and last business day of each month (previous business day if weekend or B.C. holiday)”
- Not labeled “Nicole schedule” anywhere in runtime logic

### Pay-date helpers

| Helper | Purpose |
|--------|---------|
| `getLastBusinessDayOfMonth` | Calendar month end → walk backward to previous Mon–Fri non-holiday |
| `getFifteenthAndLastBusinessDayPayDates` | Adjusted 15th anchor + last business day; sorted, deduped |
| `getPaycheckDatesForSchedule` | Existing entry point; now uses holiday-aware logic for this schedule |

### C114 compatibility

All C114 `semi_monthly_15_30` tests still pass unchanged. Shared `adjustToPreviousBusinessDay` / B.C. holiday helpers reused without modification.

## 15th/last-business-day pay-date behavior

| Case | Result |
|------|--------|
| June 2026 (15th weekday) | Jun 15, Jun 30 |
| August 2026 (15th Saturday) | Aug 14, Aug 31 |
| March 2026 (15th Sunday) | Mar 13, Mar 31 |
| April 2022 (15th Good Friday) | Apr 14, Apr 29 |
| May 2026 (month-end Saturday) | May 15, May 29 |
| April 2023 (month-end Sunday) | Apr 15, Apr 28 |
| September 2026 (Sep 30 holiday) | Sep 15, Sep 29 |
| December 2027 (Christmas weekend) | Dec 15, Dec 31 |

Pay dates never move forward. Window filtering excludes dates outside the requested range.

## Forecast/privacy behavior

- Forecast income events use adjusted pay dates for `semi_monthly_15_last_business_day`.
- Amount per event comes from the signed-in user's private schedule only.
- Disabled/missing schedule → no dates, no income events.
- Other-user schedule remains ignored via `filterOwnPaycheckIncomeEvents`.
- Privacy copy unchanged in settings UI.
- No hardcoded Teles/Nicole paycheck amount fallbacks.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1199 tests) |

## Browser smoke result

**PASS** — `scripts/smoke-paycheck-settings.mjs` against `http://127.0.0.1:5212`:

- Settings and paycheck card load with privacy copy
- User selects/saves 15th + last business day schedule
- Invalid negative amount blocked
- Dashboard reflects saved paycheck amount for current user
- Bills, Expenses, Debt, receipt/import sections load
- No console errors

## Privacy guarantees preserved

- Own-user-only `paycheck_schedules` RLS unchanged
- Dashboard hides other household member paycheck amounts as “Private”
- No user-name/profile/email-based schedule routing

## Remaining known limitations

- C116 still owns broader B.C. statutory holiday hardening/coverage audit
- C117 owns display of actual paycheck dates in UI
- C118 owns any remaining forecast integration polish

## Ready to commit

Yes — all validation and browser smoke pass; scope matches task.

## Next task

**CASHFLOW-CURSOR-116** — B.C. statutory holiday hardening/coverage
