# CASHFLOW-CURSOR-086 — Future safe-to-spend forecast

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Reuse existing Dashboard card pattern near safe-to-spend cards | **Chosen** |
| Inline expandable panel on Dashboard | Rejected — summary + event list needs dedicated card |
| Dialog/drawer | Rejected — forecast is an overview users scan on Dashboard |
| New route | Rejected — task explicitly avoids route-level navigation |
| Chart library | Rejected — table/list + summary cards per task |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: read-only `DashboardSafeToSpendForecast` card placed after safe-to-spend-after-savings, backed by pure helpers in `safe-to-spend-forecast.ts`.

## Files changed

| File | Change |
|------|--------|
| `src/lib/safe-to-spend-forecast.ts` | Pure forecast helpers: windows, obligation selection, dedupe, running balance, shortfalls |
| `src/lib/safe-to-spend-forecast.test.ts` | Vitest coverage for C086 contract |
| `src/components/dashboard-safe-to-spend-forecast.tsx` | Forecast card: window selector, summary metrics, event rows, warnings |
| `src/pages/dashboard.tsx` | Multi-month bill fetch for forecast, forecast input wiring, render card |
| `docs/automation/task_reports/CASHFLOW-CURSOR-086.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-086.result.json` | Machine-readable report |

## Migration created

No.

## Behavior implemented

### Future safe-to-spend forecast

- Read-only section on Dashboard after safe-to-spend-after-savings.
- Starts from signed-in user's latest private current-cash snapshot.
- Window selector: current selected period, rest of this month, next month, next 30/60/90 days.
- Running projected balance over chronological events.
- Summary cards: starting amount, projected ending balance, lowest balance, total obligations, income status, window label.
- Expandable event list with date, type, label, amount, projected balance, period/source labels, variable-bill warnings.
- Shortfall highlighting on rows and summary alert when balance drops below zero.
- Empty/incomplete states for missing profile, missing cash snapshot, no obligations, unconfirmed variable bills.

### Forecast inputs

| Inflow | Rule |
|--------|------|
| Current cash snapshot | Starting balance |
| Paycheck/income | Deferred — labeled "Not configured" (C087 scope) |

| Outflow | Rule |
|---------|------|
| Unpaid bills | My share, due date in window, unpaid only |
| Debt payments | My share, unpaid, in window; skip when linked unpaid bill already counted |
| Savings obligations | Own targets only, remaining obligation per period bucket in window |
| Manual expenses/adjustments | Same dashboard rules: after snapshot, not cash-deducted |

### Unchanged

- C082 bill drilldown, C083 expense drilldown, C084 savings drilldown, C085 debt summary
- Existing safe-to-spend formulas for current selected period
- Bill/debt/savings/expense/cash mutation flows
- No DB writes

## Forecast window behavior

| Window | Date range |
|--------|------------|
| Current selected period | Dashboard `periodView` + selected month |
| Rest of this month | Today through end of current calendar month |
| Next month | Full following calendar month |
| Next 30/60/90 days | Today through N-day horizon |

Dashboard loads bill instances for all months covered by the 90-day horizon, next month, and current dashboard view.

## Forecast calculation behavior

1. Insert starting-balance event at window start (or today if later).
2. Collect unpaid bill, debt payment, savings obligation, and manual expense events in range.
3. Deduplicate debt-linked bill + debt payment pairs.
4. Sort by date, apply signed amounts to running balance.
5. Detect shortfalls when balance < 0.

## Shortfall / incomplete-data warnings

- Row-level destructive styling + "Shortfall" badge when projected balance < 0.
- Summary alert with first shortfall date when applicable.
- Variable bill unconfirmed count surfaced in summary and row badges.
- Income shown as deferred/not configured instead of guessing paycheck dates.

## Privacy guarantees preserved

- Only signed-in user's share amounts, cash snapshot, savings participants/contributions (own rows filtered).
- Other-user savings rows excluded even if passed accidentally.
- No other user's private cash, savings, expenses, or audit rows.
- No raw UUIDs in user-facing labels.
- Read-only queries only.

## Tests added/updated

- `src/lib/safe-to-spend-forecast.test.ts` — 16 cases covering windows, bills, dedupe, savings privacy, expenses, running balance, shortfalls, variable warnings, income deferral, empty states, label privacy.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (674 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-086.mjs` against `http://127.0.0.1:5187`:

- Dashboard loads; future safe-to-spend forecast section visible
- Forecast window selector works (Next 30 days)
- Summary metrics visible (starting, ending, lowest balance)
- C082 unpaid bill, C083 expense, C084 savings drilldowns still open
- C085 debt summary still works
- Bills, Debt, Expenses, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Paycheck/income projection deferred to C087.
- Savings obligations placed at period-end dates (not contribution-day schedule).
- Bill fetch limited to months intersecting 90-day + next-month + dashboard-view ranges.
- Forecast does not mutate or persist projections.

## Next recommended task

**CASHFLOW-CURSOR-087**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
