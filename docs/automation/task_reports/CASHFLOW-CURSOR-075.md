# CASHFLOW-CURSOR-075 — Debt payment audit/detail view

## Result

**PASS**

## Summary

Added a read-only debt payment audit/detail sheet on the Debt page. Users can open **View details** on any debt payment row to inspect payment identity, linked bill context, cash payment/audit status, balance impact, and action guard explanations without leaving the page or mutating history.

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse existing component | Used existing `Sheet` pattern from C071 bill detail |
| Inline panel | Rejected — payment table is already dense |
| Dialog/drawer | **Chosen** — `DebtPaymentDetailPanel` sheet |
| New route | Rejected — no deep-link requirement |

**Why:** Sheet matches the established bill audit pattern (C071), keeps C072/C073/C074 controls on the same page, and avoids `App.tsx` changes.

## Files changed

- `src/lib/debt-payment-detail.ts` — pure detail/audit view builder
- `src/lib/debt-payment-detail.test.ts` — helper tests
- `src/components/debt-payment-detail-panel.tsx` — read-only sheet UI
- `src/pages/debt.tsx` — linked bill load, View details action, panel wiring

## Schema decision

**No migration.** Existing `debt_payments`, `debt_accounts`, `bill_instances` (via `linked_bill_instance_id`), and signed-in-user `cash_payment_transactions` already loaded or narrowly fetched on the Debt page provide all read-only audit context.

## Behavior implemented

- Eye **View details** action on each debt payment row
- Sheet opens/closes with standard sheet controls (including Close)
- Detail content built from existing page data plus linked bill instances fetched by ID
- Read-only — edits still use existing row pencil/delete flows
- C072 replacement, C073 archive/reopen, and C074 progress dashboard unchanged

## Detail / audit content

- **Payment identity:** debt account name, payment date, month/year, period bucket, amounts, source label, archived account badge
- **Linked bill:** bill name, due date, paid/unpaid, cash deduction status, Debt-managed explanation
- **Cash payment & audit:** paid/unpaid, marked-paid-only vs Pay & deduct cash, cash deduction status, payment amount/date/source/notes when visible to signed-in user
- **Balance impact:** original debt amount, total paid before/through payment when derivable, remaining after payment (stored or derived), fallback when history incomplete
- **Guards:** edit/delete/replacement availability with plain-language reasons; paid/cash-deducted history preservation messaging

## Balance impact behavior

- Uses loaded household debt payments for the same account, sorted chronologically
- **Total paid before** sums prior paid payments only
- **Total paid through** includes current payment when marked paid
- **Remaining after** prefers stored `remaining_balance_after_payment`; otherwise derives from paid history when safe
- Shows `DEBT_PAYMENT_DETAIL_BALANCE_FALLBACK` when payment is missing from loaded rows or remaining cannot be verified

## Privacy behavior

- Cash payment context limited to signed-in user's `cash_payment_transactions` (existing RLS)
- When a payment is marked paid but no cash transaction is visible for the user, shows **No cash deduction record visible for your user**
- No exposure of another user's private cash, savings, or payment rows

## Product rules preserved

- Mark paid, Pay & deduct cash, debt schedule replacement (C072), archive/reopen (C073), progress dashboard (C074), bill generation, recurring/variable bill flows, bills filters/detail (C065–C071) unchanged
- No raw UUIDs in user-facing detail strings

## Tests added

- `src/lib/debt-payment-detail.test.ts` — unpaid, paid, cash-deducted, linked bill, no linked bill, archived account, guard reasons, UUID exclusion, balance fallback

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (498 tests) |

## Browser smoke

| Check | Result |
|-------|--------|
| Debt page loads | PASS |
| C074 Debt Progress dashboard visible | PASS |
| View details opens/closes | PASS |
| Detail sections render | PASS |
| Edit payment dialog still works | PASS |
| C072 replacement preview opens/cancels | PASS |
| C073 archive dialog opens/cancels | PASS |
| Bills, Dashboard, Expenses, Settings load | PASS |
| No console errors | PASS |

## Remaining known limitations

- Payment source cannot distinguish schedule generation vs manual add vs replacement-generated when all use linked debt bills — labeled as **Scheduled payment with linked bill** when bill name uses `Debt:` prefix
- Running balance before payment depends on complete loaded payment history for the account on the Debt page

## Next recommended task

**CASHFLOW-CURSOR-076**
