# CASHFLOW-CURSOR-117 — Display actual paycheck dates

## Result

**PASS**

Added privacy-safe display of actual (holiday- and weekend-adjusted) paycheck dates in Settings and the Dashboard future safe-to-spend forecast card. No schema migration; no RLS changes.

## Files changed

| File | Change |
|------|--------|
| `src/lib/paycheck-schedule.ts` | Added `buildPaycheckDatePreview`, `buildForecastPaycheckDateDisplay`, date formatting helpers, and required copy constants |
| `src/lib/paycheck-schedule.test.ts` | Added display-model tests for preview, forecast alignment, privacy, and adjusted dates |
| `src/components/paycheck-schedule-settings.tsx` | Settings paycheck card shows upcoming adjusted dates preview |
| `src/components/dashboard-safe-to-spend-forecast.tsx` | Forecast card shows paycheck dates from forecast income events |
| `scripts/smoke-paycheck-settings.mjs` | C117 smoke: both schedule types, date preview, dashboard forecast dates |
| `docs/automation/task_reports/CASHFLOW-CURSOR-117.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-117.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.**
- **RLS unchanged.** `paycheck_schedules` remains own-user-only; UI reads only the signed-in user's row.

## What was implemented

### Pure display helpers

- `formatPaycheckDisplayDate` — readable dates (e.g. `Sep 29, 2026`).
- `buildPaycheckDatePreview` — Settings preview model using `computePayDatesInRange` (same path as forecast).
- `buildForecastPaycheckDateDisplay` / `buildForecastPaycheckDateDisplayFromIncomeEvents` — Dashboard model from `buildPaycheckForecastIncomeEvents` dates.
- Copy constants: `PAYCHECK_DATE_ADJUSTMENT_COPY`, `PAYCHECK_DATE_BUSINESS_DAY_EXPLANATION_COPY`, unsupported-range fallback.

### Settings UI

- “Upcoming paycheck dates” panel with schedule label, adjustment copy, and next 4 adjusted dates.
- Optional amount per date (signed-in user only).
- States: no schedule, disabled, amount required, configured, unsupported year window.

### Dashboard / forecast UI

- Compact “Upcoming paycheck dates” section inside the Future safe-to-spend forecast card.
- Dates and amounts sourced from forecast `income` events (same helpers as forecast math).
- Shows not-configured message when no paycheck income in the selected window.

## Paycheck date display behavior

| State | Settings behavior |
|-------|-------------------|
| No saved schedule | Setup prompt; no fabricated dates |
| Disabled saved schedule | Disabled copy; no dates |
| Enabled + amount | Next 4 adjusted dates from today |
| Unsupported year window | Safe fallback copy (2022–2030 verified range) |

Dates use `computePayDatesForMonth` / `computePayDatesInRange` — identical to forecast income generation. Weekend and B.C. statutory holiday anchors move to the **previous** business day only.

## Dashboard/forecast display behavior

- Forecast card lists paycheck dates included in the active forecast window.
- Amounts shown only for the signed-in user's income events.
- Other household members' paycheck dates/amounts are never shown.

## Privacy behavior

- Only signed-in user's `paycheck_schedules` row and computed dates.
- Required copy preserved in Settings alert:
  - “Only you can see your paycheck amount.”
  - “This is used for your forecast only.”
  - “Other household members cannot see your paycheck settings.”
- Preview labels pass UUID privacy check.
- Dashboard continues to show “Private” for the other person's income column.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1235 tests) |

## Browser smoke result

**PASS** — `scripts/smoke-paycheck-settings.mjs` against `http://127.0.0.1:5212`:

- Settings paycheck card loads with privacy copy
- 15th/30th schedule save + date preview
- 15th + last business day schedule save + date preview
- Business-day / B.C. holiday adjustment copy visible
- Invalid amount blocked
- Dashboard forecast shows upcoming paycheck dates for current user
- No hardcoded other-user amounts visible
- Bills, Expenses, Debt load
- No console errors

## Remaining known limitations

- Preview verified range follows `BC_FORECAST_SUPPORTED_YEARS` (2022–2030); dates outside that window show fallback copy.
- Dashboard date list reflects the selected forecast window, not a fixed “next N dates” list.
- C118 may wire additional forecast integration if gaps remain.

## Ready to commit

Yes — validation and browser smoke pass; scope matches C117; no credentials or RLS changes.

## Next task

**CASHFLOW-CURSOR-118** — Finish forecast integration only if needed.
