# CASHFLOW-CURSOR-072 — Debt schedule replacement flow

## Result

**PASS**

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse existing component | Reused Debt page schedule form fields and Dialog pattern from bill generation |
| Inline panel | Rejected — preview lists are too long for inline |
| Dialog | **Chosen** — `DebtScheduleReplacementDialog` |
| New route | Rejected — no deep-link requirement |

**Why:** Dialog keeps the user on the Debt page, shows a full preview before writes, and avoids `App.tsx` changes.

## Files changed

- `src/lib/debt-schedule-replacement.ts` — pure planning/protection/mutation helpers
- `src/lib/debt-schedule-replacement.test.ts` — helper tests
- `src/components/debt-schedule-replacement-dialog.tsx` — preview + confirm dialog
- `src/pages/debt.tsx` — replacement action wiring on account edit form

## Schema decision

**No migration.** Existing `debt_accounts`, `debt_payments`, and linked `bill_instances` fields are sufficient:

- `paid_status` identifies paid rows to preserve
- `payment_date` identifies historical rows before replacement start
- signed-in user's `cash_payment_transactions` (via `source_type = debt_payment`) identifies cash-deducted rows to preserve
- `linked_bill_instance_id` supports linked bill preview and safe delete/recreate

## Behavior implemented

- **Replace future unpaid scheduled payments** button on the Debt account edit form when the account already has payments
- Uses existing Payment Planning fields (payments left, first payment date, amount, split)
- Opens preview dialog before any database writes
- Explicit **Confirm replacement** and **Cancel** actions
- Cancel closes the dialog with no mutations

## Replacement / preview behavior

Preview sections show:

- Summary counts (replace, create, linked bills affected, preserved, skipped duplicates)
- Existing rows to replace (labeled **Existing · scheduled**)
- New scheduled payments (labeled **New · linked bill: …**)
- Skipped proposed rows when a preserved month would duplicate
- Preserved payments with protection reason copy
- Linked bill instances that will be removed and recreated

Planning reuses `computeDebtPaymentAmounts`, `computeProjectedRemainingBalances`, `splitDebtPayment`, and `debtBillInstanceName`.

On confirm:

1. Delete linked bill instances for replaceable rows only
2. Delete replaceable debt payments only
3. Insert new bill instances + debt payments (same pattern as existing schedule generation)

## Paid / cash-deducted protection

- **Paid** (`paid_status = true`): always preserved; never in mutation candidates
- **Cash-deducted** (signed-in user has `cash_payment_transactions` for the debt payment): always preserved
- **Historical** (`payment_date` before replacement start date): preserved
- Proposed rows skip months that already have preserved payments to prevent duplicate future schedule rows

## Privacy

- Uses household debt data already loaded on the Debt page
- Cash-deduction context limited to signed-in user's transactions (existing RLS)
- No exposure of another user's private cash, savings, or payment rows

## Product rules preserved

- Mark paid, Pay & deduct cash, bill generation (C067), recurring edit branching (C068), variable workflow (C069), Bills filters/detail (C070/C071) unchanged
- Generate Payment Schedule flow unchanged (replacement is a separate explicit action)

## Tests added

- `src/lib/debt-schedule-replacement.test.ts` — replaceable vs protected rows, duplicate skip, linked bill preview, mutation safety, summary counts, readable labels

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (462 tests) |

## Browser smoke

| Check | Result |
|-------|--------|
| Dashboard, Bills, Debt, Expenses, Settings load | PASS |
| Debt account list displays | PASS |
| Debt payment edit dialog opens/closes | PASS |
| Replacement dialog opens with required copy | PASS |
| Cancel closes dialog without errors | PASS |
| No console errors | PASS |

## Remaining known limitations

- Replacement uses account `current_balance` as the schedule basis (same as existing generate flow); it does not recompute balance from preserved unpaid rows
- Confirm replacement was not exercised in smoke to avoid mutating shared test data; preview/cancel path verified
- Generate Payment Schedule still warns about duplicates instead of redirecting to replacement (intentionally unchanged)

## Next recommended task

**CASHFLOW-CURSOR-073**
