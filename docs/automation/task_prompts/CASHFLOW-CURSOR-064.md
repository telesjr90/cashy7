# CASHFLOW-CURSOR-064 — Dashboard bill/expense/savings drilldowns

## Goal

Add dashboard drilldown/detail views for bill, expense, and savings summary areas so the user can understand the numbers behind dashboard totals without changing calculation behavior.

## Scope

Implement a small dashboard detail/drilldown UI using an inline panel, drawer, dialog, or collapsible section inside the existing Dashboard workflow.

Prefer the smallest low-risk UI change that fits the current dashboard structure.

Do not add a new route unless the existing app structure clearly makes that safer.

## Required behavior

### 1. Dashboard drilldown entry points

Add clear actions from dashboard summary cards/sections where relevant, such as:

- View bills
- View expenses
- View savings
- View debt/payment detail
- Why this amount?

Use existing dashboard data already loaded by the page where possible.

### 2. Bill detail

The bill drilldown should show visible bills for the selected dashboard period/month context.

Show at minimum:

- bill name
- due date or period
- total amount
- Teles amount
- Nicole amount
- paid/unpaid state if already available
- debt-linked indicator if already available

Do not change paid/unpaid behavior.

### 3. Expense detail

The expense drilldown should show visible manual expenses for the current dashboard context if that data is already available or can be safely loaded through existing helpers.

Show at minimum:

- date
- description or merchant
- amount
- category
- payer / split information if already available

Do not change expense CRUD behavior.

### 4. Savings detail

The savings drilldown must respect existing privacy rules.

Allowed:

- show the current user their own savings contribution details if already available
- show shared savings goal labels or requirements only if existing app rules already allow it

Forbidden:

- do not reveal the other user’s private savings amount
- do not reveal the other user’s private cash balance
- do not infer hidden values through combined totals

### 5. Safe-to-spend explanation

If the dashboard has safe-to-spend or remaining cash cards, add a small explanation panel or drawer using existing calculation inputs only.

Do not rewrite the formula unless an existing bug is found and narrowly covered by tests.

### 6. No schema or RLS changes

Do not create Supabase migrations.

Do not change RLS.

Do not add RPCs.

Do not add new tables.

### 7. No payment or cash behavior changes

Do not change:

- payment marking
- debt payment sync
- bill split formulas
- current amount formulas
- savings formulas
- dashboard period selection behavior
- safe-to-spend formulas

This task is UI/detail visibility only.

## Expected implementation approach

1. Inspect the existing dashboard page and helpers.
2. Reuse existing formatters and calculation helpers.
3. Add a small local component if it keeps the dashboard readable.
4. Add tests only where there is pure helper logic.
5. Keep browser/UI behavior simple and low risk.

## Suggested files

Likely files:

- src/pages/dashboard.tsx
- optionally src/components/dashboard-drilldown-panel.tsx
- optionally src/lib/dashboard-drilldowns.ts
- optionally src/lib/dashboard-drilldowns.test.ts

Do not modify unrelated pages unless inspection proves it is necessary.

## Validation

Run:

./scripts/validate-cashflow.sh

Manual browser smoke:

- Dashboard loads.
- Period/month selector still works.
- Existing dashboard totals do not change unexpectedly.
- Bill drilldown opens/closes and shows bill details.
- Expense drilldown opens/closes and shows expense details if expenses exist.
- Savings drilldown opens/closes and does not reveal hidden user amounts.
- Safe-to-spend explanation opens/closes if implemented.
- Bills, Expenses, Debt, Settings pages still load.
- No console errors.

## Report requirements

Write:

- docs/automation/task_reports/CASHFLOW-CURSOR-064.md
- docs/automation/task_reports/CASHFLOW-CURSOR-064.result.json

JSON result shape:

{
  "taskId": "CASHFLOW-CURSOR-064",
  "result": "PASS",
  "filesChanged": [],
  "migrationsCreated": [],
  "validation": {
    "typecheck": "PASS",
    "build": "PASS",
    "testRun": "PASS"
  },
  "browserSmoke": {
    "required": true,
    "result": "PASS"
  },
  "privacy": "PASS",
  "productRules": "PASS",
  "readyToCommit": true,
  "nextTaskId": "CASHFLOW-CURSOR-065"
}

If validation or browser smoke cannot be run, result must be PARTIAL, not PASS.
