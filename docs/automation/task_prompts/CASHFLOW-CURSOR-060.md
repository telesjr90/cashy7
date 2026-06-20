Task: CASHFLOW-CURSOR-060 — Recent Cash Activity on Dashboard

Use Composer 2.5 Fast.

You are working in:

C:\Users\tjr_\Downloads\project_cashflow

Goal:
Add a small read-only “Recent cash activity” section/card on Dashboard that shows the signed-in user’s recent cash deductions and credits.

This should reuse the Settings history work from C057–C059.

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
Do not change bills, debt, or expenses behavior.
Do not change Dashboard safe-to-spend formulas.
Do not touch Supabase migrations unless a required relation/index is missing.
Do not refactor unrelated files.

Context:
Settings now shows:

* “Cash payment deductions” from `cash_payment_transactions`
* “Cash adjustment credits” from `cash_adjustment_transactions`

Recent work added:

* payment deduction labels for `bill_instance`, `manual_expense`, and `debt_payment`
* debt payment lookup via `debt_payments → debt_accounts.name`
* manual expense and bill instance description lookups
* cash adjustment credit display helpers
* own-row RLS for cash activity tables

Goal:
Dashboard should give the user a quick view of recent cash movement without needing to open Settings.

Before editing:

1. Run `git status`.
2. Confirm the working tree is clean except ignored/local files.
3. Inspect:

   * `src/pages/dashboard.tsx`
   * `src/pages/settings.tsx`
   * `src/lib/payments.ts`
   * `src/lib/payments.test.ts`
   * `src/lib/cash-adjustments.ts`
   * `src/lib/cash-adjustments.test.ts`
   * `src/lib/format.ts`
4. Tell me:

   * where Dashboard current amount is rendered
   * which helpers Settings uses for payment deduction display rows
   * which helpers Settings uses for cash adjustment credit display rows
   * whether a shared combined cash activity mapper would reduce duplication
   * which files you plan to modify

Required behavior:

1. Load recent signed-in-user cash activity on Dashboard
   Load:

* recent `cash_payment_transactions`
* recent `cash_adjustment_transactions`

Use existing helpers:

* `getMyCashPaymentTransactions(household.id, user.id, limit)`
* `getMyCashAdjustmentTransactions(household.id, user.id, limit)`

Use a small limit:

* fetch up to 5 or 10 from each source
* merge/sort newest first
* display only the latest 5 combined rows on Dashboard

Do not read household-wide transaction histories.

2. Show a Dashboard card
   Add a small card near the current amount / private finance cards.

Suggested title:
“Recent cash activity”

Suggested description:
“Recent changes to your current amount.”

Rows should show:

* date
* type: Deduction or Credit
* amount
* source label + description
* optional notes if already shown in Settings pattern

Suggested empty state:
“No cash activity yet.”

3. Formatting
   For deductions:

* use `formatDeductionAmount(amount)`
* example: `− CA$5.00`

For credits:

* use `formatCurrency(amount)`
* example: `CA$3.00`

Do not use `formatDeductionAmount()` for credits.

4. Source descriptions
   Reuse the same mapping behavior already used in Settings.

For deductions:

* `bill_instance` → bill name
* `manual_expense` → manual expense description
* `debt_payment` → debt account name from the debt payment lookup
* fallback labels should be human-readable
* no raw UUIDs

For credits:

* manual expense adjustment description when available
* fallback: “Manual expense adjustment”
* no raw UUIDs

5. Shared helper preferred
   If Settings and Dashboard would duplicate mapping/merge logic, add small pure helpers in `payments.ts`, `cash-adjustments.ts`, or a new focused lib file.

Suggested helper:
`mapRecentCashActivityForDisplay({ deductions, credits, lookups, limit })`

Possible display row shape:

* `id`
* `kind: "deduction" | "credit"`
* `date`
* `amountLabel`
* `sourceLabel`
* `description`
* `notes`

Keep it small.

6. Dashboard refresh behavior
   Dashboard already refreshes on focus/visibility return.

Ensure the recent cash activity card refreshes with the same Dashboard refresh path.

Do not create a separate fetch loop.
Do not create a continuous polling mechanism.

7. Privacy
   Do not expose:

* another user’s cash payment transactions
* another user’s cash adjustment transactions
* another user’s cash snapshots
* another user’s private expenses
* another user’s savings target/contributions

Use only signed-in-user helper queries and existing RLS.

8. Preserve existing behavior
   Do not change:

* Settings history cards
* current amount save/update
* cash snapshot creation
* Pay & deduct cash behavior
* cash credit behavior
* Mark Paid behavior
* Dashboard calculations
* Bills/Debt/Expenses page behavior
* Supabase RPC behavior

9. Tests
   No component tests required.

If you add or change pure helper logic, add/update Vitest tests.

Recommended tests if a combined mapper is added:

* deductions and credits merge newest first
* output is capped to requested limit
* deductions use minus-prefixed labels
* credits use positive currency labels
* debt payment descriptions are preserved
* missing descriptions use fallbacks
* empty input returns empty rows
* no raw UUID fallback labels

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
2. Go to Dashboard.
3. Confirm “Recent cash activity” card appears.
4. Confirm recent deductions appear with minus-prefixed amounts.
5. Confirm recent credits appear as positive amounts.
6. Confirm debt payment deduction uses debt account name, not generic fallback, when lookup data exists.
7. Confirm no raw UUIDs are visible in normal UI.
8. Trigger or use an existing Pay & deduct cash item, return to Dashboard, and confirm activity refreshes after navigation/focus.
9. Trigger or use an existing decrease-adjustment cash credit, return to Dashboard, and confirm activity refreshes.
10. Confirm Settings history cards still load and display correctly.
11. Confirm Bills, Debt, Expenses, Settings, and Dashboard all load.
12. Confirm browser console has no app errors.

Return:

1. Result: PASS / PARTIAL / BLOCKED
2. Files changed
3. Dashboard UI placement
4. Recent cash activity behavior
5. Deduction display behavior
6. Credit display behavior
7. Source description behavior
8. Dashboard refresh behavior
9. Privacy guarantees preserved
10. Tests added/updated, if any
11. Validation results
12. Browser smoke test result
13. Remaining known limitations
14. Exact next recommended small task
