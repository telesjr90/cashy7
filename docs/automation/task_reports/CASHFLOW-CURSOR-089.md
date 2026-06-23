# CASHFLOW-CURSOR-089 — Bills page cashflow-start handling

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline notice + checkbox toggle on existing Bills card | **Chosen** |
| Separate pre-start section below active list | Rejected (toggle + row badges is smaller) |
| New route | Rejected |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: reuse the existing Bills page list, hide pre-start instances from the default filterable set, and expose a checkbox to reveal them with row/detail labels.

## Files changed

| File | Change |
|------|--------|
| `src/lib/bill-cashflow-start.ts` | Pure helpers for pre-start classification, visible-set selection, and labels |
| `src/lib/bill-cashflow-start.test.ts` | Vitest coverage for classification, toggle behavior, and filter boundary |
| `src/lib/bill-detail.ts` | Detail model fields for before-cashflow-start label |
| `src/lib/bill-detail.test.ts` | Detail label coverage |
| `src/components/bill-detail-panel.tsx` | Show pre-start badge and detail row |
| `src/pages/bills.tsx` | Load household cashflow start date, toggle, notice, filtered list, row labels |
| `docs/automation/task_reports/CASHFLOW-CURSOR-089.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-089.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration. No RLS change.**

`household_settings.cashflow_start_date` already exists and is read through `getHouseholdSettings`. Classification reuses the existing `cashflow-filter.ts` dashboard date boundary (`year` / `month` / `period_bucket` fallback via `billInstanceDashboardDate`) so Bills matches Dashboard planning behavior.

## Behavior implemented

### Bills page cashflow-start boundary

- Loads household `cashflow_start_date` from existing settings.
- When configured, pre-start bill instances are excluded from the default active/filterable list.
- When not configured, Bills behavior is unchanged (C088 dashboard warning remains the prompt).
- Pre-start rows are never deleted or mutated.

### Toggle and notice

- When the selected month contains pre-start bills and a start date is set, shows:
  - “Bills before the cashflow start date are hidden from the active list.”
  - “Show pre-start bills” checkbox
- Card description reports active-list count vs hidden pre-start count.

### Labels

- Visible pre-start rows show a **Before cashflow start** badge and muted row styling.
- Bill detail (C071) shows the same label in the sheet header and Bill identity section.

### Unchanged

- Pay & deduct cash
- Mark paid
- Bill generation
- Recurring edit branching
- Variable bill warnings/counts
- Month navigation and period selector
- C067 source labels
- Summary total cards (still reflect all loaded month instances)
- Dashboard formulas, safe-to-spend, debt, savings, expenses, and forecast calculations

## Filter/detail behavior

- C070 filters/search run on the cashflow-visible set only.
- Clearing filters does not reveal pre-start bills unless the toggle is on.
- Search cannot surface hidden pre-start bills while the toggle is off.
- When the toggle is on, filters/search apply normally to pre-start and active bills.
- Bill detail receives `cashflowStartDate` and surfaces a readable pre-start label without raw UUIDs.

## Privacy guarantees preserved

- Only household settings already readable by the signed-in user are used.
- No other-user cash, savings, expenses, or audit rows are exposed.
- No raw UUIDs in user-facing pre-start labels.

## Tests added/updated

- `src/lib/bill-cashflow-start.test.ts` — 12 cases
- `src/lib/bill-detail.test.ts` — 2 cases for pre-start detail labels

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (725 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-089.mjs` against `http://127.0.0.1:5190`:

- Bills page loads; filters/search controls present
- Pre-start notice and toggle appear when applicable
- Toggle reveals **Before cashflow start** badges; detail sheet shows cashflow-start context
- Bill detail opens/closes; edit cancel still works when available
- Dashboard, Debt, Expenses, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Pre-start classification uses the same dashboard date fallback as Dashboard (`billInstanceDashboardDate`), not a separate `due_date`-only rule, to keep planning boundaries consistent.
- Month summary total cards still include all loaded instances for the month, including hidden pre-start rows.
- Toggle state is session-local and not persisted across reloads.

## Next recommended task

**CASHFLOW-CURSOR-090**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
