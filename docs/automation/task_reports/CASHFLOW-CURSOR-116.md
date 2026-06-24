# CASHFLOW-CURSOR-116 — B.C. statutory holiday hardening/coverage

## Result

**PASS**

Hardened the B.C. statutory holiday helper and expanded test coverage for both paycheck schedules (`semi_monthly_15_30`, `semi_monthly_15_last_business_day`). No schema migration; no paycheck behavior changes except Canada Day statutory date accuracy when July 1 falls on Sunday (BC ESA).

## Files changed

| File | Change |
|------|--------|
| `src/lib/bc-statutory-holidays.ts` | Documented rule-based strategy; added supported-year constants, holiday name list, Canada Day Sunday rule; clarified business-day helpers |
| `src/lib/bc-statutory-holidays.test.ts` | Expanded MVP holiday, business-day, dedupe, range, and year-boundary tests |
| `src/lib/paycheck-schedule.test.ts` | Cross-schedule regression tests; 2022–2030 forecast coverage; all-pay-dates-are-business-days assertion |
| `scripts/smoke-paycheck-settings.mjs` | C116 label check for business-day/B.C. holiday copy |
| `docs/automation/task_reports/CASHFLOW-CURSOR-116.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-116.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.**
- **RLS unchanged.** `paycheck_schedules` remains own-user-only.

## Holiday source/coverage decision

| Topic | Decision |
|-------|----------|
| Official source | [BC statutory holidays](https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/statutory-holidays) (Employment Standards Act definitions) |
| Strategy | **Rule-based (Option B)** — deterministic formulas, not a yearly maintained table |
| Good Friday | Western Easter algorithm minus 2 days |
| Victoria Day | Monday on or before May 24 (Monday preceding May 25) |
| Canada Day | July 1; when July 1 is **Sunday**, statutory holiday is **July 2** (BC ESA only observed substitution implemented) |
| Truth and Reconciliation | September 30 from 2021 onward |
| Paycheck adjustment | Previous business day when anchor lands on weekend/holiday; never forward; no general observed-day substitution |
| Verified years | `BC_FORECAST_SUPPORTED_YEARS`: **2022–2030** (11 holidays/year from 2021+) |
| Out-of-range years | Rules still compute dates; forecast should stay within verified range |

2026 dates verified against BC.gov published table (Jan 2026 update).

## What was implemented

### Holiday helper hardening

- Stable local `YYYY-MM-DD` strings (no UTC parsing).
- Deduped, sorted holiday lists via `Set`.
- Exported: `BC_FORECAST_SUPPORTED_YEARS`, `BC_STATUTORY_HOLIDAY_NAMES`, `BC_STATUTORY_HOLIDAY_SOURCE_URL`, `isForecastYearInSupportedRange`.
- Existing helper names preserved: `getBcStatutoryHolidayDatesForYear`, `getBcStatutoryHolidayDates`, `isBcStatutoryHoliday`, `isBusinessDay`, `adjustToPreviousBusinessDay`.
- `getLastBusinessDayOfMonth` remains in `paycheck-schedule.ts` (uses shared holiday helpers).

### Paycheck schedule integration

Both schedules use `getBcStatutoryHolidaySet` + `adjustToPreviousBusinessDay` via `adjustAnchorPayDate`. C114/C115 regression tests pass unchanged except Canada Day edge case (2029).

### UI copy

Settings paycheck UI already uses business-day + B.C. holiday language (from C115). Privacy copy unchanged:

- “Only you can see your paycheck amount.”
- “This is used for your forecast only.”
- “Other household members cannot see your paycheck settings.”

## Business-day behavior

| Rule | Behavior |
|------|----------|
| Business day | Mon–Fri, not a B.C. statutory holiday |
| `adjustToPreviousBusinessDay` | Same date if already business day; walks backward across weekends/holidays/consecutive non-business days; never forward |
| `getLastBusinessDayOfMonth` | Starts at calendar month end; walks backward via `isBusinessDay` |
| Year boundary | e.g. 2026-01-01 (holiday) → 2025-12-31; 2022-01-02 (Sunday) → 2021-12-31 |

## Paycheck schedule regression behavior

| Case | C114 (15/30) | C115 (15/last BD) |
|------|--------------|-------------------|
| June 2026 | Jun 15, Jun 30 | Jun 15, Jun 30 |
| August 2026 (Sat 15th) | Aug 14, Aug 28 | Aug 14, Aug 31 |
| April 2022 (Good Friday 15th) | Apr 14, Apr 29 | Apr 14, Apr 29 |
| September 2026 (Sep 30 holiday) | Sep 15, **Sep 29** | Sep 15, **Sep 29** |
| February clamp (2026) | Feb 13, Feb 27 | (unchanged C115 paths) |
| Forecast income | Adjusted dates only | Adjusted dates only |
| Disabled/missing | No dates/events | No dates/events |
| Other user | Filtered out | Filtered out |

All pay dates in 2022–2030 ranges are business days.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1225 tests) |

## Browser smoke result

**PASS** — `scripts/smoke-paycheck-settings.mjs` against `http://127.0.0.1:5212`:

- Settings and paycheck card load
- Privacy copy visible
- Business-day/B.C. holiday schedule label present
- 15th + last business day schedule saved; invalid amount blocked
- Dashboard reflects saved amount; no hardcoded Teles/Nicole amounts
- Bills, expenses, debt, receipt sections load
- No console errors

## Privacy guarantees preserved

- Paycheck amount/schedule own-user-only (RLS unchanged)
- Dashboard shows other-user income as “Private”
- No hardcoded user-name paycheck amounts
- Forecast uses signed-in user schedule only

## Remaining known limitations

- Rule-based dates beyond 2030 are computed but not verified against BC.gov until manually checked.
- Only Canada Day has BC ESA observed-date substitution; other holidays use calendar statutory dates (no Boxing Day/Easter Monday).
- C117 will display actual paycheck dates; C118 may extend forecast integration.

## Exact next recommended small task

**CASHFLOW-CURSOR-117** — Display actual paycheck dates in UI.
