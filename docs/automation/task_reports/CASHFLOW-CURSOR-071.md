# CASHFLOW-CURSOR-071 — Bills audit/detail view

## Result

**PASS**

## Summary

Added a read-only bill audit/detail sheet on the Bills page. Users can open **View details** on any bill instance row to inspect identity, amounts, paid/cash context, debt/template/variable context, and edit/delete guard explanations without leaving the page or changing payment behavior.

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse existing component | Used existing `Sheet` pattern from Expenses detail |
| Inline panel | Rejected — table rows are already dense |
| Dialog/drawer | **Chosen** — `BillDetailPanel` sheet |
| New route | Rejected — no deep-link requirement |

**Why:** Sheet matches the established Expenses audit pattern, keeps C070 filters/search on the same page, and avoids `App.tsx` changes.

## Files changed

- `src/lib/bill-detail.ts` — pure detail/audit view builder
- `src/lib/bill-detail.test.ts` — helper tests
- `src/components/bill-detail-panel.tsx` — read-only sheet UI
- `src/pages/bills.tsx` — View details action + panel wiring

## Schema decision

**No migration.** Existing `bill_instances`, `bills`, `debt_payments`, and signed-in-user `cash_payment_transactions` loaded on the Bills page provide all read-only audit context.

## Behavior implemented

- Eye **View details** action on each displayed bill row
- Sheet opens/closes with standard sheet controls (including Close)
- Detail content built from existing page data and helpers only
- Filters/search unchanged (detail uses full `bills` list, not filtered subset, so a filtered-out row cannot be opened from a stale selection)
- Read-only — edits still use existing C065/C068 flows from row actions

## Detail / audit content

- **Identity:** name, due date, month/year, period bucket, category, notes, source label
- **Amounts:** total, Teles, Nicole, split summary, variable amount status, needs-confirmation warning
- **Paid/cash:** paid/unpaid, marked-paid-only vs Pay & deduct cash, cash deduction status, payment date/amount/source/notes when available
- **Debt:** linked label, Debt-managed explanation, link to Debt page
- **Recurring/template:** generated status, template name/status, generated note label, recurring edit scope explanation
- **Variable:** variable/fixed context and forecast-incomplete explanation
- **Guards:** edit/delete availability badges with plain-language reasons

## Guard explanations

- Debt-linked bills managed from Debt (edit/delete unavailable)
- Paid/cash-deducted bulk template protection messaging
- Generated recurring bills require edit scope choice (C068)
- Variable bills need confirmed amount (C069)
- No raw UUIDs in user-facing detail strings

## Privacy

- Uses only household bill data already on the Bills page
- Cash payment context limited to signed-in user's transactions (existing RLS)
- No exposure of another user's private cash, savings, or payment rows

## Product rules preserved

- Mark paid, Pay & deduct cash, bill generation (C067), recurring edit branching (C068), variable confirmation (C069), and filters (C070) unchanged

## Tests added

- `src/lib/bill-detail.test.ts` — manual, generated, debt-linked, variable confirmation, paid/cash-deducted, guard reasons, UUID exclusion, missing-context fallbacks

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (450 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-071.mjs` against `http://127.0.0.1:5180`:

- Bills page loads; filters/search controls present
- View details opens/closes sheet with audit sections
- Edit dialog still opens/cancels from row actions
- Dashboard, Debt, Expenses, Settings load
- No console errors

## Remaining known limitations

- Detail sheet does not deep-link to a bill URL
- Debt payment label uses bill name (`Debt: …`) rather than a separate debt-account fetch
- Informational guard list may repeat related edit/delete messages for debt-linked bills (intentional audit clarity)

## Next recommended task

**CASHFLOW-CURSOR-072**

## Ready to commit

Yes — when user approves commit (validation and browser smoke passed; scope matches task).
