# CASHFLOW-CURSOR-090 — Expenses page cashflow-start handling

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline notice + checkbox toggle on existing Recorded expenses card | **Chosen** |
| Separate pre-start section below active list | Rejected (toggle + row badges is smaller) |
| New route | Rejected |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: reuse the existing Expenses page list, hide pre-start manual expenses and adjustments from the default filterable set, and expose a checkbox to reveal them with row/detail labels.

## Files changed

| File | Change |
|------|--------|
| `src/lib/expense-cashflow-start.ts` | Pure helpers for pre-start classification, visible-set selection, and labels |
| `src/lib/expense-cashflow-start.test.ts` | Vitest coverage for classification, toggle behavior, filters, and categories |
| `src/lib/expense-detail.ts` | Detail model field for before-cashflow-start label |
| `src/lib/expense-detail.test.ts` | Detail label coverage |
| `src/pages/expenses.tsx` | Load household cashflow start date, toggle, notice, filtered list, row/detail labels |
| `docs/automation/task_reports/CASHFLOW-CURSOR-090.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-090.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration. No RLS change.**

`household_settings.cashflow_start_date` already exists and is read through `getHouseholdSettings`. Classification compares each row's `expense_date` (including adjustment rows) against the configured start date using the same on-or-after boundary as Dashboard planning (`expense_date >= cashflow_start_date`).

## Behavior implemented

### Expenses page cashflow-start boundary

- Loads household `cashflow_start_date` from existing settings.
- When configured, pre-start manual expenses and adjustment rows are excluded from the default active/filterable list.
- When not configured, Expenses behavior is unchanged (C088 dashboard warning remains the prompt).
- Pre-start rows are never deleted or mutated.

### Toggle and notice

- When pre-start expenses exist and a start date is set, shows:
  - “Expenses before the cashflow start date are hidden from the active list.”
  - “Show pre-start expenses” checkbox
- Card description reports active-list count vs hidden pre-start count.

### Labels

- Visible pre-start rows show a **Before cashflow start** badge and muted row styling.
- Expense detail (C061) shows the same label in the sheet header when applicable.

### Unchanged

- Expense create/edit/delete
- Cash adjustments and Pay & deduct cash
- Dashboard formulas and C088 warnings
- Bills C089 start-date behavior
- Debt, Savings, paycheck, and forecast calculations
- Month/period navigation and C062 filters (applied to the cashflow-visible set)

## Filter/detail/category behavior

- C062 filters/search run on the cashflow-visible set only.
- Clearing filters does not reveal pre-start expenses unless the toggle is on.
- Search cannot surface hidden pre-start rows while the toggle is off.
- When the toggle is on, filters/search apply normally to pre-start and active rows.
- Derived category suggestions (C063) use the cashflow-visible set, so pre-start-only categories stay hidden unless the toggle is on.
- Expense detail receives `cashflowStartDate` and surfaces a readable pre-start label without raw UUIDs.

## Privacy guarantees preserved

- Only household settings already readable by the signed-in user are used.
- No other-user cash, savings, expenses, or audit rows are exposed.
- No raw UUIDs in user-facing pre-start labels.

## Tests added/updated

- `src/lib/expense-cashflow-start.test.ts` — 17 cases
- `src/lib/expense-detail.test.ts` — 3 cases for pre-start detail labels

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (745 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-090.mjs` against `http://127.0.0.1:5190`:

- Expenses page loads; filters/search controls present
- Pre-start notice and toggle appear when applicable
- Toggle reveals **Before cashflow start** badges; detail sheet shows cashflow-start context
- Expense detail opens/closes; edit cancel still works when available
- Category management collapsible still works
- Dashboard, Bills, Debt, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Pre-start classification uses `expense_date` only; rows with unparseable dates remain in the active list (not classified as pre-start).
- Toggle state is session-local and not persisted across reloads.
- Summary counts in the card header still reflect all loaded expenses, including hidden pre-start rows.

## Next recommended task

**CASHFLOW-CURSOR-091**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
