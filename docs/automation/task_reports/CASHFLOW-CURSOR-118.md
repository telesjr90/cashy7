# CASHFLOW-CURSOR-118 — Forecast income integration

## Result

**PASS**

Audit confirmed paycheck schedule integration in the future safe-to-spend forecast is complete from C087/C113–C117. No product source changes were required beyond regression tests, smoke hardening, and this report.

## Files changed

| File | Change |
|------|--------|
| `src/lib/safe-to-spend-forecast.test.ts` | Added forecast income regression tests (all windows, both schedules, business-day dates, shortfall, privacy, totals, sorting) |
| `scripts/smoke-paycheck-settings.mjs` | C118 smoke: forecast projected income metric, window selector, configured income copy; fixed schedule-label check via open dropdown |
| `docs/automation/task_reports/CASHFLOW-CURSOR-118.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-118.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.**
- **RLS unchanged.** `paycheck_schedules` remains own-user-only (`supabase/migrations/20260622000001_021_paycheck_schedules.sql`).

## Forecast integration audit result

| Area | Status | Notes |
|------|--------|-------|
| Forecast windows (6 kinds) | PASS | `buildSafeToSpendForecast` uses `buildPaycheckForecastIncomeEvents` for every window via `paycheckSchedule` input |
| Event construction | PASS | Signed-in user amount, adjusted dates, disabled/missing excluded, other-user filtered |
| Running balance | PASS | Income uses negative `signedAmount`; obligations unchanged; debt dedupe intact |
| Date/business-day | PASS | Shared helpers from `paycheck-schedule.ts`; Sep 2026 last BD = Sep 29 |
| UI | PASS | Dashboard shows projected income, event rows, paycheck-date summary, incomplete copy |
| Privacy | PASS | Dashboard loads only `getMyPaycheckSchedule(household.id, user.id)`; other user shows "Private" |
| No hardcoded amounts | PASS | No Teles/Nicole fallback in forecast or periods module |

## What was implemented or confirmed

### Confirmed (no code changes)

- `buildSafeToSpendForecast` builds income from `paycheckSchedule` when `incomeEvents` omitted.
- `filterOwnPaycheckIncomeEvents` strips other-user events.
- `dashboard.tsx` passes `paycheckScheduleSettings` from `getMyPaycheckSchedule` only.
- `dashboard-safe-to-spend-forecast.tsx` shows total projected income, income rows, and C117 paycheck-date display.

### Added

- End-to-end forecast regression tests in `safe-to-spend-forecast.test.ts`.
- C118 browser smoke checks for forecast income metric, configured label, and window selector.

## Forecast income behavior

- Income events use the signed-in user's private `paycheck_schedules.amount`.
- Events appear only after the cash snapshot date and within the selected window.
- `totalProjectedIncome` equals the sum of income event amounts.
- Disabled or missing schedules produce zero income events and `incomeStatus: "not_configured"`.
- Same-day paycheck + obligation ordering is deterministic (date, then label).

## Date/business-day behavior

- Weekend anchors move backward (e.g. Aug 2026 15th → Aug 14).
- B.C. statutory holiday anchors move backward (e.g. Sep 2026 30th → Sep 29).
- `semi_monthly_15_last_business_day` uses actual last business day of month.
- Forecast event dates match C117 display dates (no raw anchors when adjusted).

## Privacy behavior

- Only signed-in user's schedule affects forecast income, totals, running balance, shortfall, and paycheck-date display.
- Other-user schedule data ignored even when passed in test fixtures.
- No household-combined paycheck income in forecast.
- Labels remain UUID-free via existing privacy-safe helpers.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1251 tests) |

## Browser smoke result

| Check | Result |
|-------|--------|
| Settings / paycheck card | PASS |
| Save 15th/30th and 15th/last-BD schedules | PASS |
| Dashboard forecast projected income | PASS |
| Forecast window selector updates display | PASS |
| Adjusted paycheck dates in forecast | PASS |
| Other-user amount not visible | PASS |
| Bills / Expenses / Debt / routes load | PASS |
| Console errors | None |

## Remaining known limitations

- Forecast paycheck dates outside BC verified years (2022–2030) may be unavailable in preview copy; core helpers still compute dates.
- Same-day event ordering is alphabetical by label, not income-first.
- Period income cells on dashboard show only signed-in user's configured amount; partner column remains "Private".

## Ready to commit

Yes — validation and browser smoke pass; scope limited to tests/smoke/report.

## Next recommended task

**CASHFLOW-CURSOR-119** — Calendar view (Phase 11 final task per masterplan).
