# CASHFLOW-CURSOR-061 — Manual expense / adjustment detail view

## 1. Result

**PASS**

## 2. Files changed

| File | Change |
|------|--------|
| `src/lib/expense-detail.ts` | Pure mapper, shared guard messages, adjustment/payment/action detail builders |
| `src/lib/expense-detail.test.ts` | Vitest coverage for mapper, guards, fallbacks |
| `src/pages/expenses.tsx` | Sheet detail panel, clickable row descriptions, centralized guard imports |
| `docs/automation/task_reports/CASHFLOW-CURSOR-061.md` | Task report |

## 3. Detail UX chosen

**Sheet (side drawer)** — opened from the Expenses table description cell. No new route; `App.tsx` unchanged.

## 4. Fields shown

Read-only in four sections:

- **Details:** description, scope, amount, date, period bucket, split type, Teles/Nicole amounts, category, notes, created/updated timestamps
- **Adjustments:** linked original (for adjustment rows), sibling/child adjustments (direction, amount, date, reason, description)
- **Cash & payment:** mark-paid status, cash deduction status, Pay & deduct transaction (amount/date/notes), decrease-adjustment cash credit status
- **Actions:** edit, delete, create adjustment, Pay & deduct cash, credit current amount — each with Available/Unavailable + explanation

## 5. Adjustment context behavior

- **Original expense:** lists visible child adjustments newest first from in-memory `visibleExpenses`
- **Adjustment row:** shows linked original description + amount; lists sibling adjustments excluding self
- Missing original uses **Original expense unavailable** — no raw UUIDs

## 6. Payment/cash audit behavior

Reuses existing helpers only:

- `getCashDeductionStatus`, `cashDeductionStatusLabel`
- `isManualExpensePaidThroughApp`, `canDeleteManualExpense`, `canEditManualExpenseFinancialFields`
- `isAdjustmentAlreadyCredited`, `canShowCashCreditActionForAdjustment`
- `mapCashPaymentDeductionsForDisplay`, `mapCashAdjustmentCreditsForDisplay`

Adjustments show planning-only mark-paid message; originals show mark-paid + deduction status; Pay & deducted rows show payment transaction details; credited decrease adjustments show credit amount/date/notes.

## 7. Action availability explanations

Read-only action list mirrors existing Expenses guards with centralized messages from `expense-detail.ts`:

- Edit blocked when deducted (`PAID_THROUGH_APP_EDIT_MESSAGE`) or not creator
- Delete blocked when deducted (`PAID_THROUGH_APP_DELETE_MESSAGE`) or not creator
- Create adjustment available only for creator on paid-through-app originals
- Pay blocked for adjustments (`ADJUSTMENT_PAY_DISABLED_MESSAGE`), marked-paid-only, or already deducted
- Credit available only for eligible decrease adjustments not yet credited

## 8. Privacy guarantees preserved

- Detail built only from RLS-visible `expenses` already on the page
- Payment/credit audit from signed-in-user `getMyCashPaymentTransactions` / `getMyCashAdjustmentTransactions` only
- Mapper returns `null` if selected expense is not in `visibleExpenses`
- No other users' cash, savings, or private transactions exposed

## 9. Tests added/updated

- `src/lib/expense-detail.test.ts` — 12 tests covering adjustment linking, newest-first ordering, fallbacks, paid-through-app/credit status, action explanations, non-creator guards

## 10. Validation results

```
powershell -ExecutionPolicy Bypass -File scripts\validate-cashflow.ps1

== Typecheck == PASS
== Build == PASS
== Tests == 303 passed (11 files)
```

## 11. Browser smoke test result

Test account used at runtime only (not stored in repo).

| Step | Result |
|------|--------|
| Log in | PASS |
| Expenses — normal expense detail (`Updated edit smoke`) | PASS — core fields, mark-paid, action explanations |
| Pay & deducted expense (`Smoke test expense`) | PASS — deducted-from-cash, payment amount/date/notes |
| Paid-through-app original with adjustments (`C054 pay deduct delete test`) | PASS — 3 adjustments listed, no UUIDs |
| Decrease adjustment detail | PASS — linked original, credited cash credit status |
| Bills, Debt, Settings, Dashboard load | PASS |
| Browser console app errors | None (React DevTools info only) |

## 12. Remaining known limitations

- No deep-link URL for a specific expense detail
- Detail closes on full page navigation away from Expenses
- Adjustments section hidden on originals with zero visible adjustments
- Sheet width capped at `sm:max-w-md` — long notes may require scroll

## 13. Ready for supervisor commit

**Yes** — PASS, validation green, browser smoke green, scope matches task.

## 14. Exact next recommended small task

**CASHFLOW-CURSOR-062 — Expense filters and search**
