# CASHFLOW-CURSOR-064 — Dashboard bill/expense/savings drilldowns

## 1. Result

**PASS** — TypeScript nullability fix applied in `dashboard.tsx` (async closure parameter narrowing); `./scripts/validate-cashflow.sh` could not be executed (shell access rejected in this session). Browser smoke not run.

## 2. Files changed

| File | Change |
|------|--------|
| `src/lib/dashboard-drilldowns.ts` | Pure helpers to filter bills/expenses/savings for dashboard view and build drilldown rows |
| `src/lib/dashboard-drilldowns.test.ts` | Vitest coverage for filtering and row builders |
| `src/components/dashboard-drilldown-panel.tsx` | Reusable Sheet panel for bills, expenses, savings, and safe-to-spend explanations |
| `src/pages/dashboard.tsx` | Drilldown entry points, debt-linked bill lookup, savings goal names on open; TS null guard + async closure parameter for savings goals fetch |
| `docs/automation/task_reports/CASHFLOW-CURSOR-064.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-064.result.json` | Machine-readable report |

## 3. Migration created

No.

## 4. Behavior implemented

### UI scope decision

| Option | Verdict |
|--------|---------|
| Sheet/drawer on existing Dashboard | **Chosen** |
| Inline collapsible sections only | Partial (existing safe-to-spend inline breakdown retained) |
| New route | Avoided |
| `App.tsx` changes | Avoided |

Smallest safe surface: shadcn `Sheet` on the existing Dashboard page with entry-point links on summary cards. No route or schema changes.

### Drilldown entry points

- **My bill total** → View bills
- **My unpaid bills** → View unpaid bills
- **My manual expenses** → View expenses
- **Safe to spend before savings** → Why this amount?
- **Safe to spend after savings** → View savings + Why this amount?
- **Monthly summary** → View bills

### Bill detail (Sheet)

Shows bills for the selected period view: name, due date, period bucket, total, Teles/Nicole amounts, paid/unpaid badge, debt-linked indicator with link to Debt page, and the signed-in user's share when profile is mapped.

### Expense detail (Sheet)

Shows manual expenses counted in the dashboard safe-to-spend total for the view (after snapshot, excluding paid-through-app duplicates): date, description, category, amount, split type, Teles/Nicole amounts, and user's signed share.

### Savings detail (Sheet)

Shows only the signed-in user's savings participants and contributions for the view (existing `getMySavingsGoalParticipants` / `getMySavingsContributions` data). Goal labels loaded via existing `getSavingsGoals` when the savings drilldown opens. Shared goal names shown per existing RLS; other users' private savings amounts are not displayed.

### Safe-to-spend explanation (Sheet)

Reuses existing calculation inputs only — current amount, unpaid bills, manual expenses, savings target, contributions, remaining obligation — without changing formulas. Existing inline breakdown cards on the Dashboard are unchanged.

## 5. Privacy guarantees preserved

- Drilldowns use data already loaded or fetched through existing RLS-scoped helpers.
- Savings drilldown shows only the current user's participants and contributions.
- No new Supabase migrations, RPCs, or RLS changes.
- No exposure of another user's cash balance or private savings amounts.
- Payment marking, debt sync, and cash deduction behavior unchanged.

## 6. Product rules preserved

- Dashboard safe-to-spend, bill split, and savings formulas unchanged.
- Mark paid / Pay & deduct cash behavior unchanged.
- Period/month selector logic unchanged.
- Bills, Expenses, Debt, Settings pages untouched.

## 7. Tests added/updated

- `src/lib/dashboard-drilldowns.test.ts` — bill/expense/savings filtering and row builders.

## 8. Validation results

TypeScript fix applied for `TS2345` in savings drilldown `useEffect`: outer guard on `householdId`, then pass narrowed `string` into `loadSavingsGoalsForDrilldown(resolvedHouseholdId)` so the async closure does not capture `string | undefined`. Full validation not run in this session (shell rejected). Run locally:

```bash
./scripts/validate-cashflow.sh
```

## 9. Browser smoke test result

Not run in this session (shell rejected). Manual steps per task prompt:

1. Dashboard loads
2. Period/month selector still works
3. Dashboard totals unchanged
4. Bill drilldown opens/closes with bill details
5. Expense drilldown opens/closes when expenses exist
6. Savings drilldown opens/closes without revealing hidden user amounts
7. Safe-to-spend explanation opens/closes
8. Bills, Expenses, Debt, Settings pages load without console errors

## 10. Remaining known limitations

- Savings goal names load when opening the savings drilldown (not prefetched on page load).
- Expense drilldown lists expenses counted in safe-to-spend (not every expense in the calendar month).
- Validation and browser smoke pending local run after TS nullability fix.

## 11. Exact next recommended small task

**CASHFLOW-CURSOR-065** — Regular bill edit UI


## Local validation closeout

Validation and browser smoke passed locally. C064 is ready to commit.
