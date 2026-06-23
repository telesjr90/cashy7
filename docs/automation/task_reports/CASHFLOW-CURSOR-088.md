# CASHFLOW-CURSOR-088 — Dashboard warnings

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Grouped warnings card near safe-to-spend / forecast | **Chosen** |
| Scattered per-card alerts (existing pattern) | Replaced for the six warning categories |
| New route | Rejected |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: one `DashboardWarnings` card placed immediately before the safe-to-spend cards, driven by a pure `buildDashboardWarnings` helper.

## Files changed

| File | Change |
|------|--------|
| `src/lib/dashboard-warnings.ts` | Pure warning builder: detection, severity, privacy-safe labels, action hints |
| `src/lib/dashboard-warnings.test.ts` | Vitest coverage for all required warning categories |
| `src/components/dashboard-warnings.tsx` | Grouped warnings UI with severity badges and actions |
| `src/pages/dashboard.tsx` | Wire warnings input, remove duplicate top alerts, place warnings card |
| `docs/automation/task_reports/CASHFLOW-CURSOR-088.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-088.result.json` | Machine-readable report |

## Migration created

No.

## Behavior implemented

### Dashboard warnings layer

Read-only grouped section near safe-to-spend and forecast with severity labels (Critical / Warning / Info), affected-area badges, explanations, and action links or drilldown buttons.

### Warning categories

1. **Stale / missing cash snapshot** — missing snapshot or snapshot older than selected view start or 7 days; links to Settings.
2. **Missing budget profile** — no signed-in person/share mapping; links to Settings.
3. **Missing variable bill amount** — reuses C069 dashboard/forecast variable counts; links to Bills.
4. **Negative safe-to-spend** — before or after savings below zero; opens existing drilldowns.
5. **Forecast shortfall** — reuses C086/C087 `hasShortfall` / `firstShortfallDate` from rest-of-month forecast summary.
6. **Unpaid required obligations** — informational summary of unpaid bills, non-duplicated debt payments, and remaining savings obligation in the current view.
7. **No cashflow start date** — household setting missing; links to Settings.

### Unchanged

- Dashboard and safe-to-spend formulas
- Paycheck schedule / forecast event calculations
- C082/C083/C084 drilldowns and C085 debt summary
- Bill, debt, savings, expense, cash, and payment mutation flows
- RLS and schema

## Privacy guarantees preserved

- Only the signed-in user's cash snapshot is considered (`user_id` match).
- Other-user cash/savings/expense rows ignored if passed accidentally.
- No raw UUIDs in warning titles, descriptions, or action labels.
- No exposure of another user's private amounts in warning copy.

## Tests added/updated

- `src/lib/dashboard-warnings.test.ts` — 21 cases covering all required categories, stale/fresh cash, forecast reuse, debt dedupe, and privacy-safe labels.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (709 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-088.mjs` against `http://127.0.0.1:5188`:

- Dashboard loads after sign-in
- Future safe-to-spend forecast section visible; window selector works
- C082 unpaid bill, C083 expense, and C084 savings drilldowns still open
- C085 debt summary still visible
- Bills, Debt, Expenses, Settings load
- Warning action links navigate without error when warnings are present (test account had no active warnings, so section correctly hidden)
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Warnings card is hidden when there are zero active warnings (by design).
- Stale cash rule uses a conservative 7-day age threshold plus selected-view start date; not user-configurable yet.
- Forecast shortfall warning uses the rest-of-month window summary for consistency with the default forecast card, not every selectable forecast window.
- Unpaid obligation warning is informational and does not list individual row names.

## Next recommended task

**CASHFLOW-CURSOR-089**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
