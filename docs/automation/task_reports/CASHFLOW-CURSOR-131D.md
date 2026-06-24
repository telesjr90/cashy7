# CASHFLOW-CURSOR-131D — Reports Charts UI

## Result: PASS

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/reports-expense-charts.tsx` | **New** — Chart section component with 5 tabs using C131C helpers |
| `src/pages/monthly-report.tsx` | **Modified** — Import and render `<ReportsExpenseCharts>` below printable report |
| `src/lib/report-chart-ui.test.ts` | **New** — Vitest data-pipeline tests for chart UI privacy and correctness |
| `scripts/smoke-reports-charts.mjs` | **New** — Browser smoke test for desktop + mobile viewports |
| `docs/automation/task_reports/CASHFLOW-CURSOR-131D.md` | **New** — This file |
| `docs/automation/task_reports/CASHFLOW-CURSOR-131D.result.json` | **New** — Machine-readable result |

---

## Dependencies Added

None. `recharts ^3.8.0` and `src/components/ui/chart.tsx` were already present.

---

## Charts Implemented

| Tab | Chart Type | Helper | data-testid |
|-----|-----------|--------|------------|
| By Category | Horizontal bar (sorted desc) | `buildExpensesByCategoryChartData` | `reports-expenses-by-category-chart` |
| By Month | Vertical bar (chronological) | `buildExpensesByMonthChartData` | `reports-expenses-by-month-chart` |
| By Pay Period | Vertical bar (angled labels) | `buildExpensesByPayPeriodChartData` | `reports-expenses-by-pay-period-chart` |
| Category × Month | Stacked bar + legend | `buildExpenseCategoryByMonthChartData` | `reports-category-by-month-chart` |
| Category × Period | Stacked bar + legend | `buildExpenseCategoryByPayPeriodChartData` | `reports-category-by-pay-period-chart` |

---

## Data Helpers Consumed

All five C131C pure helpers are used:
- `buildExpensesByCategoryChartData` — grouping + "Other" rollup + percentages
- `buildExpensesByMonthChartData` — chronological month buckets
- `buildExpensesByPayPeriodChartData` — 1_14 / 15_eom ordering
- `buildExpenseCategoryByMonthChartData` — stacked month series
- `buildExpenseCategoryByPayPeriodChartData` — stacked pay-period series

Helpers are called via `useMemo`; no re-calculation unless `expenses` or `cashflowStartDate` change.

---

## UI Scope Decision

- Options considered: new route, inline section on existing `/reports/monthly` page
- Chosen: **inline section** added to `MonthlyReportPage` below `<MonthlyPrintableReport>`
- Why smallest safe option: expenses already loaded via `getManualExpenses`; no new Supabase calls needed; no deep-linking required; task requires no new route
- `src/App.tsx` not modified
- Chart section has `className="no-print"` so it is hidden in print/PDF views

---

## Empty / Mobile / Accessibility Behavior

- **Empty state**: `data-testid="reports-expense-chart-empty-state"` shown when a helper returns zero rows; message: "No expense data for this period."
- **Mobile (390px)**: tabs are scrollable via `overflow-x-auto`; chart containers use `w-full` + explicit height via inline `style`; smoke-verified no horizontal overflow at 390×844
- **Category chart height**: scales with number of rows (42px per bar, min 240px)
- **X-axis labels**: angled at −30° when more than 7 items; `interval="preserveStartEnd"` to avoid crowding
- **Accessibility**: `<section>` with `aria-labelledby`; chart containers carry `aria-label`; empty state has `role="status"` + `aria-label`; tabs are keyboard-navigable (Arrow keys); no raw UUIDs in any label
- **Print**: entire chart section uses `no-print` class — not included in printable report

---

## Personal / Admin Privacy Behavior

- `ReportsExpenseCharts` receives `expenses` from the parent `MonthlyReportPage`, which loads them via `getManualExpenses(household.id)` — the same RLS-filtered query used by the printable report
- The chart helpers are pure functions: they emit no UUIDs, user IDs, or household IDs in their output
- Personal view: only the authenticated user's allowed expenses reach the chart helpers
- Owner Admin view: the admin sees the same expenses the current session is allowed to see (governed by existing RLS policies on `manual_expenses`)
- Member view: no owner-private data reaches the member's session because RLS blocks it at the DB layer, before any data reaches the chart helpers
- No new Supabase queries, no service-role reads, no RLS changes, no migrations

---

## Tests Added / Updated

**`src/lib/report-chart-ui.test.ts`** — 40 tests covering:

| Suite | Focus |
|-------|-------|
| Empty input | All 5 helpers return `[]` for empty input |
| Category chart | Grouping, sort order, fallback to "Uncategorized", `categoryId=null`, percentage sum, "Other" rollup, decrease-adjustment, transactionCount |
| Month chart | Month grouping, ascending order, monthLabel readable, transactionCount, cashflowStartDate filter |
| Pay period chart | 1_14 before 15_eom ordering, periodLabel human-readable, transactionCount, chronological ordering across months |
| Stacked category × month | One row per month, correct category keys, "Other" grouping, no raw UUIDs |
| Stacked category × period | Pay-period ordering, no raw UUIDs |
| Privacy | No `created_by_user_id`/`household_id` in any helper output; helpers are pure (same input → same output) |
| Formula preservation | Arithmetic correctness; month totals match manual sum |
| Serialization | All helper outputs are JSON-serializable |

All 1536 tests pass (89 test files).

---

## Validation Results

| Step | Result |
|------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (89 files, 1536 tests) |
| `node scripts/audit-rls-policies.mjs` | PASS |
| `node scripts/audit-database-functions.mjs` | PASS |

---

## Browser Smoke Result

Script: `scripts/smoke-reports-charts.mjs`  
Run with: `CASHFLOW_E2E_BASE_URL=http://127.0.0.1:5233 node scripts/smoke-reports-charts.mjs`

| Viewport | Result |
|----------|--------|
| desktop-1280x800 | PASS |
| mobile-390x844 | PASS |

Verified per viewport:
- Charts section and tabs visible
- Each tab shows chart or empty state  
- No raw UUIDs
- No horizontal overflow
- Keyboard tab navigation works
- No console errors

---

## Ready to Commit

Yes — all gates passed:
- typecheck PASS
- build PASS
- tests PASS (no regressions)
- RLS audit PASS
- function audit PASS
- browser smoke PASS (desktop + mobile)
- no credentials or secrets changed
- no migrations
- no RLS changes
- no formula changes
- changed files match task scope
