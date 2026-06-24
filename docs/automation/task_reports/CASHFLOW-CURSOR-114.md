# CASHFLOW-CURSOR-114 — Teles pay schedule: 15th and 30th (business-day adjusted)

## Result

**PASS**

Hardened the reusable `semi_monthly_15_30` paycheck schedule so pay dates are **anchored to the 15th and 30th** (30th clamped to month end), then moved **backward to the previous business day** when an anchor falls on a weekend or B.C. statutory holiday. Introduced a minimal shared B.C. holiday helper required for accurate Teles-style pay dates. No schema migration; no user-name-based runtime logic.

## Files changed

| File | Change |
|------|--------|
| `src/lib/bc-statutory-holidays.ts` | **New** — MVP B.C. statutory holiday calendar, `isWeekendDate`, `isBusinessDay`, `adjustToPreviousBusinessDay` |
| `src/lib/bc-statutory-holidays.test.ts` | **New** — holiday table and business-day adjustment tests |
| `src/lib/paycheck-schedule.ts` | Business-day adjustment in `getFixedFifteenthAndThirtiethPayDates`; re-exports shared helpers; updated schedule label |
| `src/lib/paycheck-schedule.test.ts` | Updated pay-date expectations and added weekend/holiday/forecast adjustment tests |
| `scripts/smoke-paycheck-settings.mjs` | Regex schedule selection, dashboard `CA$` amount assertion, wait for income row |
| `docs/automation/task_reports/CASHFLOW-CURSOR-114.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-114.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.** Existing `semi_monthly_15_30` enum value in `paycheck_schedules` remains sufficient.
- **RLS unchanged.** Paycheck schedules stay own-user-only.

## What was implemented

### Schedule anchoring and adjustment

1. **Anchor dates:** 15th and 30th of each month (30th clamped to last calendar day when the month is shorter).
2. **Actual pay date:** Previous business day when an anchor is a weekend or B.C. statutory holiday.
3. **Business day:** Monday–Friday, excluding configured B.C. statutory holidays.
4. **Never moves forward.** Dates sorted and deduplicated after adjustment.

### Shared helpers (C114 minimum; C116 can expand)

| Helper | Purpose |
|--------|---------|
| `getBcStatutoryHolidayDatesForYear` | MVP holiday list per year |
| `getBcStatutoryHolidayDates` | Holidays across forecast year range |
| `isWeekendDate` | Saturday/Sunday detection |
| `isBusinessDay` | Weekday and not B.C. holiday |
| `adjustToPreviousBusinessDay` | Walk backward to valid business day |
| `getFixedFifteenthAndThirtiethPayDates` | Anchor → clamp → adjust → dedupe |

Holiday table includes: New Year's Day, Family Day, Good Friday, Victoria Day, Canada Day, BC Day, Labour Day, National Day for Truth and Reconciliation (2021+), Thanksgiving, Remembrance Day, Christmas Day.

### Holiday scope note

Holiday support was introduced **only as the minimum shared helper needed** because weekends and B.C. statutory holidays affect real 15th/30th anchor pay dates. **C115** still owns Nicole's last-business-day pay schedule. **C116** still owns broader B.C. statutory holiday hardening/coverage, including verifying the holiday table and applying it to Nicole's last-business-day logic if not already complete.

## 15th/30th pay-date behavior (examples)

| Case | Anchor | Actual pay date |
|------|--------|-----------------|
| January 2026 | Jan 15, Jan 30 (weekdays) | Jan 15, Jan 30 |
| August 2026 | Aug 15 (Sat), Aug 30 (Sun) | Aug 14, Aug 28 |
| March 2026 | Mar 15 (Sun) | Mar 13 (Fri) |
| September 2026 | Sep 30 (holiday) | Sep 29 |
| April 2022 | Apr 15 (Good Friday) | Apr 14 (Thu) |
| February 2026 | Feb 15 (Sun), Feb 28 (Sat) | Feb 13, Feb 27 |
| July 1 anchor | Canada Day | Previous business day (e.g. Jun 30) |

## Forecast/privacy behavior

- Forecast income events use **adjusted** pay dates, not raw 15th/30th anchors.
- Amount per event comes from the signed-in user's private schedule only.
- Disabled/missing schedule → no dates, no income events.
- Other-user schedule remains ignored.
- No hardcoded Teles/Nicole paycheck amount fallbacks.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1187 tests) |

## Browser smoke result

**PASS** — `scripts/smoke-paycheck-settings.mjs` against `http://127.0.0.1:5212` with `test@example.com`:

- Settings and paycheck card load with privacy copy
- User selects/saves 15th/30th schedule (business-day-adjusted label)
- Invalid negative amount blocked
- Dashboard shows saved amount as `CA$2,345.67`
- Bills, Expenses, Debt, receipt/import sections load
- No console errors

## Privacy guarantees preserved

- Own-user-only `paycheck_schedules` RLS unchanged
- Dashboard hides other household member paycheck amounts as “Private”
- No user-name/profile/email-based schedule routing

## Remaining known limitations

- Nicole `semi_monthly_15_last_business_day` schedule remains weekend-aware only (not holiday-aware) — **C115/C116**
- Holiday table is MVP; C116 should audit coverage for future years and edge cases
- Pay-date display UI deferred to C117

## Exact next recommended small task

**CASHFLOW-CURSOR-115** — Nicole pay schedule: 15th and last business day (weekend-aware; holiday integration in C116).
