# CASHFLOW-CURSOR-120 — Printable report

## Result

**PASS**

Added a browser-printable monthly cashflow report at `/reports/monthly` using print CSS first (`@media print`, `@page`, `.no-print`). The report is read-only, privacy-safe, and derived from existing calendar, dashboard, forecast, and warning helpers. No schema migration; no CSV/PDF export.

## Files changed

| File | Change |
|------|--------|
| `src/lib/monthly-print-report.ts` | Pure helper building printable report display model from existing data/helpers |
| `src/lib/monthly-print-report.test.ts` | Required helper/privacy/reconciliation tests |
| `src/components/monthly-printable-report.tsx` | Read-only printable report sections UI |
| `src/pages/monthly-report.tsx` | Route page with month selector, print action, data loading |
| `src/App.tsx` | `/reports/monthly` route, Reports nav item, `no-print` header |
| `src/index.css` | Print CSS (`@media print`, `@page`, `.no-print`, `.print-section`) |
| `scripts/smoke-printable-report.mjs` | Browser smoke for report route, sections, print CSS, regression routes |
| `docs/automation/task_reports/CASHFLOW-CURSOR-120.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-120.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.**
- **RLS unchanged.** Report reads the same own-user-scoped queries as Dashboard/Calendar (own cash snapshot, own paycheck schedule, own savings participants/contributions, own cash payment transactions).
- UI/helper/test work only.

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse Calendar inline | Rejected — report needs dedicated print layout and deep-linkable URL |
| Drawer/dialog | Rejected — multi-section printable document is too large |
| **New route `/reports/monthly`** | **Chosen** — task requires direct URL, month selection, and standalone printable page |

## What was implemented

### Route and navigation

- Route: `/reports/monthly`
- Nav label: **Reports** (Printer icon)
- Page title: **Printable Report**

### Month selector

- Month/year selects, previous/next, **Today** shortcut
- Report title: `Cashflow Report — {Month} {Year}`

### Print action

- **Print report** button calls `window.print()`
- Interactive controls use `.no-print` and are hidden in print output

### Report helper (`buildMonthlyPrintReport`)

Composes existing helpers:

- `buildCashflowCalendar` — calendar/list summary
- `buildSafeToSpendForecast` — forecast section (`current_period`, full month)
- `buildDashboardWarnings` — warnings section
- `buildDashboardDebtSummary` — debt section
- `buildManualExpenseDrilldown` — expenses section
- `buildPaycheckForecastIncomeEvents` + `filterOwnPaycheckIncomeEvents` — income section
- `filterOwnCashSnapshot`, `filterOwnSavingsParticipants`, `filterOwnSavingsContributions` — privacy filtering
- Bill-share and savings totals — cash position and bills

## Printable report sections

| Section | Content |
|---------|-----------|
| Header | Title, month, generated timestamp, household name, private-section note |
| Cash position | Own current amount, safe-to-spend before/after savings, projected ending balance, stale/missing snapshot copy |
| Bills | Totals, unpaid/paid, variable confirmation count, period breakdown, row lists with debt-linked labels |
| Debt | Active summary, remaining debt, payoff, next payment, upcoming payments |
| Savings | Own target, contributions, remaining obligation, shared-goal privacy copy |
| Expenses | Manual expenses/adjustments total, category summary, row list |
| Income | Own paycheck income only, adjusted dates, projected total, disabled/missing schedule copy |
| Forecast | Income/obligations/ending/lowest balance, first shortfall, incomplete-data warnings |
| Warnings | Dashboard warnings (C088 categories) |
| Calendar summary | C119 chronological day/event list (compact) |

## Print CSS / browser-print behavior

- `@page { margin: 0.75in; }`
- White background, dark text in print
- `.no-print` hides nav, month selector, print button, page chrome
- `.print-section` avoids awkward page breaks
- Tables sized for print; browser print dialog can save as PDF

## Forecast / reconciliation behavior

- Uses existing `buildSafeToSpendForecast` with same inputs as Calendar (`current_period`, `full` month view)
- Bill, expense, savings, and income totals use the same share/savings helpers as Dashboard
- No new formulas introduced

## Privacy behavior

- Own cash snapshot only (`filterOwnCashSnapshot`)
- Own paycheck schedule/income only (`filterOwnPaycheckIncomeEvents`)
- Own savings targets/contributions only (`filterOwnSavingsParticipants/Contributions`)
- Shared bills/debt visible per existing RLS
- Shared savings privacy copy included; no other-user target/saved/combined totals
- Labels checked for UUID absence in tests
- Print metadata checked for secret/credential patterns in tests

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1287 tests) |

## Browser smoke result

| Check | Result |
|-------|--------|
| `node scripts/smoke-printable-report.mjs` | PASS |
| Report route + all 9 sections | PASS |
| Print CSS / print media hiding controls | PASS |
| Dashboard, Calendar, Bills, Expenses, Debt, Settings | PASS |
| Receipt/import + paycheck preview | PASS |
| Console errors | None |

## Remaining known limitations

- Report uses full-month view only (no dashboard 1–14 / 15–EOM period toggle)
- Calendar summary is chronological list (not month grid) for compact print
- CSV export deferred to CASHFLOW-CURSOR-121

## Exact next recommended small task

**CASHFLOW-CURSOR-121 — CSV export**

## Ready to commit

Yes — validation and browser smoke pass; scope matches task; no credentials or migrations.
