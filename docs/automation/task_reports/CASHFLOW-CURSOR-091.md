# CASHFLOW-CURSOR-091 — Debt page cashflow-start handling

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline notice + checkbox toggle on existing Debt Payments card | **Chosen** |
| Separate pre-start section below active list | Rejected (toggle + row badges matches C089/C090) |
| New route | Rejected |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: reuse the existing Debt page payment list, hide pre-start debt payments from the default list, and expose a checkbox to reveal them with row/detail labels. Progress dashboard uses an active-planning payment subset with a separate notice.

## Files changed

| File | Change |
|------|--------|
| `src/lib/debt-cashflow-start.ts` | Pure helpers for pre-start classification, visible-set selection, progress filter, and labels |
| `src/lib/debt-cashflow-start.test.ts` | Vitest coverage for classification, toggle behavior, progress filter, replacement boundary, and labels |
| `src/lib/debt-payment-detail.ts` | Detail model field for before-cashflow-start label |
| `src/lib/debt-payment-detail.test.ts` | Detail label coverage |
| `src/components/debt-payment-detail-panel.tsx` | Sheet badge and cashflow-start detail row |
| `src/pages/debt.tsx` | Load household cashflow start date, toggle, notices, filtered list, progress subset, row/detail labels |
| `docs/automation/task_reports/CASHFLOW-CURSOR-091.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-091.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration. No RLS change.**

`household_settings.cashflow_start_date` already exists and is read through `getHouseholdSettings`. Classification compares each row's `payment_date` against the configured start date using the same on-or-after boundary as Dashboard, Bills (C089), and Expenses (C090) (`payment_date >= cashflow_start_date`).

## Behavior implemented

### Debt page cashflow-start boundary

- Loads household `cashflow_start_date` from existing settings.
- When configured, pre-start debt payments are excluded from the default active payment list.
- When not configured, Debt behavior is unchanged (C088 dashboard warning remains the prompt).
- Pre-start rows are never deleted or mutated.

### Toggle and notice

- When pre-start debt payments exist and a start date is set, shows:
  - “Debt payments before the cashflow start date are hidden from the active list.”
  - “Show pre-start debt payments” checkbox
- Card description reports active-list count vs hidden pre-start count.
- Progress section shows “Debt progress excludes payments before the cashflow start date.” when applicable.

### Labels

- Visible pre-start rows show a **Before cashflow start** badge and muted row styling when the toggle is on.
- Debt payment detail (C075) shows the same label in the sheet header and identity section when applicable.

### Unchanged

- Debt account create/edit/delete, archive/reopen (C073)
- Debt payment edit, pay & deduct cash, linked bill protections
- Schedule replacement logic (C072) — still uses full payment set and existing replacement-start protection rules
- Debt edge-case validation (C076)
- Dashboard formulas and C088 warnings
- Bills C089 and Expenses C090 start-date behavior
- Savings, paycheck, safe-to-spend, and forecast calculations

## Schedule replacement / detail / progress behavior

- **Schedule replacement (C072):** Unchanged. Replacement preview and mutation still operate on the full loaded payment set. Pre-start unpaid rows remain protected by existing `before_start_date` replacement rules; the show-pre-start toggle does not affect replacement candidates.
- **Detail (C075):** Adds read-only `beforeCashflowStartLabel` when `payment_date` is before the household cashflow start date.
- **Progress (C074):** Display-only subset on the Debt page excludes pre-start payments from `buildActiveDebtProgressTotals` / account progress when a start date is configured, even if the list toggle reveals pre-start rows. Account table totals still use stored account balances.

## Privacy guarantees preserved

- Only household settings already readable by the signed-in user are used.
- No other-user cash, savings, expenses, or audit rows are exposed.
- No raw UUIDs in user-facing pre-start labels.

## Tests added/updated

- `src/lib/debt-cashflow-start.test.ts` — 15 cases
- `src/lib/debt-payment-detail.test.ts` — 3 cases for pre-start detail labels

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (763 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-091.mjs` against `http://127.0.0.1:5190`:

- Debt page loads
- Pre-start notice/toggle behavior verified when applicable
- Pre-start badges and detail context when toggle enabled
- Payment edit cancel still works when available
- Dashboard, Bills, Expenses, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Pre-start classification uses `payment_date` only; rows with unparseable dates remain in the active list (not classified as pre-start).
- Toggle state is session-local and not persisted across reloads.
- Payment card header total count still reflects all loaded payments, including hidden pre-start rows.
- Debt account table “Total Paid” / “Remaining” still reflect stored account balances, not the cashflow-filtered payment subset.

## Next recommended task

**CASHFLOW-CURSOR-092**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
