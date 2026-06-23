# CASHFLOW-CURSOR-085 — Debt summary on Dashboard

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Reuse existing Dashboard card pattern + C074 debt progress helpers | **Chosen** |
| Inline panel on Dashboard | Rejected — summary needs grouped metrics and upcoming list |
| Dialog/drawer | Rejected — read-only household overview belongs on Dashboard |
| New route | Rejected — Debt page already exists for full detail |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: compact read-only `DashboardDebtSummary` card on the main Dashboard, backed by pure helpers that reuse C074 `debt-progress.ts` calculations.

## Files changed

| File | Change |
|------|--------|
| `src/lib/dashboard-debt-summary.ts` | Pure helpers: active-only totals, upcoming rows, payoff labels, privacy guard |
| `src/lib/dashboard-debt-summary.test.ts` | Vitest coverage for C085 contract |
| `src/components/dashboard-debt-summary.tsx` | Compact summary cards, progress bar, upcoming list, Debt page link |
| `src/pages/dashboard.tsx` | Load household debt data, build summary, render card |
| `docs/automation/task_reports/CASHFLOW-CURSOR-085.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-085.result.json` | Machine-readable report |

## Migration created

No.

## Behavior implemented

### Dashboard debt summary

- Read-only card placed after safe-to-spend-after-savings and before month navigation.
- Uses active, non-archived debt accounts only.
- Summary metrics: total original, total paid, total remaining, progress %, next payment due, projected payoff.
- Household progress bar with accessible label.
- Compact upcoming scheduled payments list (unpaid rows sorted by date, capped at 8).
- Empty state when no active debts.
- **View debt details** link to `/debt`.

### Upcoming payment rows

Each row shows when available: account name, payment date, total payment, Teles/Nicole split, period bucket, paid/unpaid badge, linked bill badge.

### Unchanged

- C074 Debt page progress dashboard
- C082 bill drilldown, C083 expense drilldown, C084 savings drilldown
- Debt schedule replacement, archive, payment detail, bills, expenses, savings, cash, safe-to-spend formulas
- No DB writes

## Debt summary calculations

| Metric | Rule |
|--------|------|
| Total paid | Sum of `total_payment` where `paid_status === true` (C074 helper) |
| Remaining | `original_amount - total_paid`, clamped at 0 |
| Progress % | C074 `computeProgressPercentage`, clamped 0–100 |
| Next payment | Earliest unpaid payment across active accounts |
| Upcoming list | Unpaid payments sorted by date, active accounts only |
| Projected payoff | C074 `resolvePayoffLabel` / `estimatePayoffDate` logic |

## Active vs archived behavior

- `filterActiveDebtAccounts` excludes archived/closed accounts from Dashboard totals and upcoming list.
- Archived debts never mix into active summary metrics.

## Privacy guarantees preserved

- Debt/bills are household-shared; no private cash, savings, or expense data shown.
- No cash audit rows exposed.
- No raw UUIDs in user-facing labels.
- Read-only Supabase queries on existing household-scoped debt tables.

## Tests added/updated

- `src/lib/dashboard-debt-summary.test.ts` — 11 cases covering active/archived inclusion, paid/unpaid totals, progress clamping, next/upcoming payments, payoff estimate/fallback, empty state, linked bill label, UUID privacy guard.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (658 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-085.mjs` against `http://127.0.0.1:5186`:

- Dashboard loads; debt summary card visible
- Remaining debt, next payment, projected payoff metrics visible
- Progress bar visible when active debts exist
- View debt details link opens Debt page; C074 Debt Progress still loads
- C082 unpaid bill, C083 expense, C084 savings drilldowns still open
- Bills, Debt, Expenses, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Upcoming list capped at 8 rows; full schedule on Debt page.
- Dashboard debt summary is household-wide (not filtered by selected month/period view).
- Projected payoff uses scheduled unpaid payments only; does not infer cash availability.

## Next recommended task

**CASHFLOW-CURSOR-086**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
