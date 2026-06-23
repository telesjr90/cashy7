# CASHFLOW-CURSOR-083 — Dashboard expense drilldown

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Reuse existing `DashboardDrilldownPanel` Sheet from C064/C082 | **Chosen** |
| New route | Rejected |
| Inline panel only | Rejected — Sheet already exists |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: harden the existing manual-expenses Sheet drilldown on the Dashboard with pure helpers for row selection, labels, reconciliation, and local filters.

## Files changed

| File | Change |
|------|--------|
| `src/lib/dashboard-expense-drilldown.ts` | Pure helpers: included rows, display model, reconciliation, local filters |
| `src/lib/dashboard-expense-drilldown.test.ts` | Vitest coverage for C083 contract |
| `src/components/dashboard-drilldown-panel.tsx` | Expense drilldown rows, filters, reconciliation, read-only copy, Expenses link |
| `src/pages/dashboard.tsx` | Wire helper, clickable manual expenses card, reconciliation props |
| `docs/automation/task_reports/CASHFLOW-CURSOR-083.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-083.result.json` | Machine-readable report |

## Migration created

No.

## Behavior implemented

### Manual expense drilldown

- **My manual expenses for this view** card is clickable/tappable (keyboard Enter/Space supported) plus existing “View expenses” link.
- Opens existing Sheet with kind `expenses`.
- Shows only manual expense and adjustment rows counted in the dashboard card total for the selected month + period view (after snapshot, excluding paid-through-app duplicates).
- Read-only drilldown with link to **Expenses page** for add/edit/delete workflows.

### Row fields

Manual expenses show: date, description, category, amount, split type, Teles/Nicole amounts, paid-by person when available, scope/source label, notes when present, and your signed share.

Adjustment rows show: adjustment type label, direction badge, linked original description (privacy-safe fallback when unavailable), reason, and your signed share.

### Reconciliation

- Dashboard card total (your manual expense share)
- Sum of your shares in listed rows
- **Totals match** when equal
- Privacy-safe mismatch copy when totals differ (no hidden values exposed)

### Local filters

- Text search across description, category, notes, source/type labels
- Category filter from included rows
- Row type filter: manual expense vs adjustment
- Clear filters; reconciliation always uses all included rows

### Context

- Drilldown header/description uses `June 2026 · 1st - 14th` style label via `buildDashboardBillViewLabel`.
- Empty state: “No manual expenses or adjustments are included in this view.”

## Privacy guarantees preserved

- Drilldown uses data already loaded through existing RLS-scoped helpers.
- No other user’s current cash, savings, or private expenses exposed.
- No raw UUIDs in user-facing labels.
- C082 unpaid bill drilldown behavior preserved.

## Product rules preserved

- No dashboard formula changes.
- Manual expense CRUD and cash adjustment behavior unchanged.
- Mark paid / Pay & deduct cash unchanged.
- No migrations, RLS, or RPC changes.

## Tests added/updated

- `src/lib/dashboard-expense-drilldown.test.ts` — inclusion/exclusion, adjustments, labels, reconciliation, filters, empty state, privacy copy.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (634 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-083.mjs` against `http://127.0.0.1:5183`:

- Dashboard loads; manual expenses card visible
- “View expenses” opens drilldown with context, reconciliation, read-only copy, Expenses link
- Sheet closes normally
- C082 unpaid bill drilldown still opens
- Bills, Debt, Expenses, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- No separate merchant field on manual expenses; description is the primary label.
- Reconciliation may briefly mismatch while payment history is still loading (same pattern as dashboard card total).
- Local filters hide rows visually but do not change reconciliation totals.

## Next recommended task

**CASHFLOW-CURSOR-084**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
