Task: CASHFLOW-CURSOR-061 — Manual expense / adjustment detail view

Use Composer 2.5 Fast.

You are working in:

C:\Users\tjr_\Downloads\project_cashflow

Goal:
Add a read-only detail view for a manual expense or adjustment so the user can see expense context, linked adjustments, cash payment/credit status, and why edit/delete actions are allowed or blocked.

Do not scaffold a new app.
Do not add spreadsheet import.
Do not add receipt upload.
Do not add OCR.
Do not add invite user.
Do not add BC holiday logic.
Do not redesign the app.
Do not expose or print environment variable values.
Do not commit credentials.
Do not put test login credentials into source files or `.env`.
Do not change Pay behavior.
Do not change Mark Paid behavior.
Do not mutate old cash snapshots.
Do not change Dashboard safe-to-spend formulas.
Do not add expense filters/search yet (that is C062).
Do not add category management yet (that is C063).
Do not touch Supabase migrations unless a required relation/index is missing.
Do not refactor unrelated files.

Context:
Expenses page already supports:
- create/edit/delete manual expenses
- mark paid
- Pay & deduct cash
- create increase/decrease adjustments
- cash credit for decrease adjustments
- paid-through-app edit/delete guards

Dashboard now shows recent cash activity (C060).
Settings shows cash payment deductions and adjustment credits (C057–C059).

The expenses table shows summary rows, but there is no focused detail/audit view for one expense or adjustment.

Before editing:

1. Run `git status`.
2. Confirm the working tree is clean except ignored/local files.
3. Inspect:

   * `src/pages/expenses.tsx`
   * `src/App.tsx`
   * `src/lib/expenses.ts`
   * `src/lib/expenses.test.ts`
   * `src/lib/payments.ts`
   * `src/lib/cash-adjustments.ts`
   * `src/lib/cash-activity.ts`
4. Tell me:

   * how expenses and adjustments are currently listed
   * which helpers already expose paid-through-app and credited-adjustment status
   * whether detail should be a route, drawer, or inline panel
   * which files you plan to modify

Required behavior:

1. Open detail for one expense or adjustment
   From Expenses, let the user open a detail view for a visible row.

Suggested UX (pick the smallest fit):
- route like `/expenses/:expenseId`, or
- drawer/panel from the expenses table

Detail must work for:
- original manual expenses
- adjustment rows (`adjusts_manual_expense_id` set)

2. Show core expense fields
   For the selected row, show read-only:
- description
- scope (private/shared)
- amount
- date
- period bucket
- split (Teles/Nicole amounts)
- category (if any)
- notes (if any)
- created/updated timestamps only if already easy to show without new schema

3. Show adjustment context
   If row is an adjustment:
- direction (increase/decrease)
- reason
- linked original expense description (human-readable, no raw UUID)
- list of sibling adjustments for the same original when visible under privacy rules

   If row is an original expense:
- list its visible adjustments (increase/decrease), newest first

4. Show payment / cash audit context
   Reuse existing signed-in-user helpers only.

   Show clearly:
- mark-paid status
- cash deduction status (`unpaid`, `marked_paid_only`, `deducted_from_cash`)
- whether a Pay & deduct cash transaction exists for this expense
- for decrease adjustments: whether cash credit was applied
- relevant payment/credit amount, date, and notes when available

   Use existing labels/helpers where possible:
- `getCashDeductionStatus`, `cashDeductionStatusLabel`
- `isManualExpensePaidThroughApp`
- `isAdjustmentAlreadyCredited`, `canShowCashCreditActionForAdjustment`
- payment/adjustment display mappers from `payments.ts` / `cash-adjustments.ts` when useful

5. Explain action availability
   Read-only explanations for why actions are enabled/disabled:
- edit expense
- delete expense
- create adjustment
- Pay & deduct cash
- credit adjustment to current amount

   Reuse existing guard messages already shown in Expenses where possible.
   Do not add new business rules.

6. Privacy
   Do not expose:
- another user's private expenses
- another user's cash payment transactions
- another user's cash adjustment transactions
- another user's current cash amount

   Respect existing RLS and expense visibility rules already used on Expenses page.

7. Preserve existing behavior
   Do not change:
- expense create/edit/delete rules
- mark paid behavior
- Pay & deduct cash behavior
- cash credit behavior
- Dashboard calculations
- Settings history cards
- Bills/Debt behavior

8. Tests
   No component tests required.

   If you add pure helpers for detail mapping (e.g. build expense audit summary), add/update Vitest tests.

   Recommended tests if a mapper is added:
- original expense with adjustments maps linked rows
- paid-through-app status preserved
- credited decrease adjustment status preserved
- missing linked descriptions use fallbacks, not raw UUIDs
- private expense visibility rules preserved in mapper inputs/outputs

Do not unit-test Supabase I/O.

Validation:
Run:

* `npm run typecheck`
* `npm run build`
* `npm run test:run`

Browser smoke test with test login:

* Email: [test@example.com](mailto:test@example.com)
* Password: admin

Do not commit credentials.

Smoke steps:

1. Log in.
2. Go to Expenses.
3. Open detail for a normal manual expense.
4. Confirm core fields, mark-paid status, and action-availability explanations appear.
5. Open detail for an expense that was Pay & deducted; confirm deducted-from-cash context appears.
6. Open detail for a decrease adjustment; confirm linked original and cash credit status appear.
7. Confirm no raw UUIDs are visible in normal UI.
8. Confirm existing Expenses table actions still work (mark paid, pay, create adjustment as applicable).
9. Confirm Bills, Debt, Settings, and Dashboard still load.
10. Confirm browser console has no app errors.

Return:

1. Result: PASS / PARTIAL / BLOCKED
2. Files changed
3. Detail UX chosen (route/drawer/panel)
4. Fields shown
5. Adjustment context behavior
6. Payment/cash audit behavior
7. Action availability explanations
8. Privacy guarantees preserved
9. Tests added/updated, if any
10. Validation results
11. Browser smoke test result
12. Remaining known limitations
13. Exact next recommended small task
