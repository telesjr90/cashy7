# CASHFLOW-CURSOR-082 — Dashboard bill drilldown

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Reuse existing `DashboardDrilldownPanel` Sheet from C064 | **Chosen** |
| New route | Rejected |
| Inline panel only | Rejected — Sheet already exists |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: harden the existing unpaid-bills Sheet drilldown on the Dashboard with pure helpers for row selection, labels, and reconciliation.

## Files changed

| File | Change |
|------|--------|
| `src/lib/dashboard-bill-drilldown.ts` | Pure helpers: view label, unpaid row builder, reconciliation |
| `src/lib/dashboard-bill-drilldown.test.ts` | Vitest coverage for C082 contract |
| `src/components/dashboard-drilldown-panel.tsx` | Unpaid drilldown rows, reconciliation block, read-only copy, Bills link |
| `src/pages/dashboard.tsx` | Wire helper, debt payment map, clickable unpaid card, full view label |
| `docs/automation/task_reports/CASHFLOW-CURSOR-082.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-082.result.json` | Machine-readable report |

## Migration created

No.

## Behavior implemented

### Unpaid bill drilldown

- **My unpaid bills** card is clickable/tappable (keyboard Enter/Space supported) plus existing “View unpaid bills” link.
- Opens existing Sheet with kind `unpaid-bills`.
- Shows only unpaid bill rows for the selected month + period view (same filter as dashboard card total).
- Read-only drilldown with link to **Bills page** for pay/edit workflows.

### Row fields

Each row shows: name, due date, period bucket, total, Teles/Nicole amounts, paid/unpaid badge, debt-linked indicator + Debt link, source label (manual/template/generated/debt), variable amount warning when applicable, cash-deducted status from signed-in user’s payment history when loaded, and your share amount.

### Reconciliation

- Dashboard card total (your unpaid share)
- Sum of your shares in listed rows
- **Totals match** when equal
- Privacy-safe mismatch copy when totals differ (no hidden values exposed)

### Context

- Drilldown header/description uses `June 2026 · 1st - 14th` style label via `buildDashboardBillViewLabel`.
- Empty state: “No unpaid bills are included in this view.”

## Privacy guarantees preserved

- Only signed-in user’s payment transactions used for cash-deducted labels.
- No other user’s current cash, savings, or expenses exposed.
- No raw UUIDs in user-facing labels.
- Bills remain household-visible; share totals remain user-scoped.

## Product rules preserved

- No dashboard formula changes.
- Mark paid / Pay & deduct cash unchanged.
- Bills filters/detail, generation, recurring branching, variable warnings unchanged except safe reuse of helpers.
- No migrations, RLS, or RPC changes.

## Tests added/updated

- `src/lib/dashboard-bill-drilldown.test.ts` — unpaid inclusion/exclusion, period filtering, labels, reconciliation, empty state, privacy copy.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (625 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-082.mjs` against `http://127.0.0.1:5183`:

- Dashboard loads; unpaid bills card visible
- “View unpaid bills” opens drilldown with context, reconciliation, read-only copy
- Sheet closes normally
- Bills, Debt, Expenses, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Cash-deducted label omitted while payment history is still loading (privacy-safe fallback message shown).
- Regular “View bills” drilldown (all bills) still uses the simpler C064 row model without reconciliation block.

## Next recommended task

**CASHFLOW-CURSOR-083**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
