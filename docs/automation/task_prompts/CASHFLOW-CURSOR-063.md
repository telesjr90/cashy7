Task: CASHFLOW-CURSOR-063 — Expense category management

Use Composer 2.5 Fast.

You are working in:

C:\Users\tjr_\Downloads\project_cashflow

Goal:
Add lightweight category management for manual expenses so users can pick from known categories instead of typing free text every time, without changing expense payment/credit behavior or Dashboard formulas.

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
Do not change cash payment transaction behavior.
Do not change cash adjustment credit behavior.
Do not change Dashboard safe-to-spend formulas.
Do not change expense filters/search behavior from C062 except to improve category pick/filter UX if needed.
Do not change Bills, Debt, or Settings behavior.
Do not touch Supabase migrations unless inspection proves a dedicated category table is required.
Do not refactor unrelated files.

Context:
Expenses page now supports:
- create/edit/delete manual expenses
- mark paid
- Pay & deduct cash
- create increase/decrease adjustments
- cash credit for decrease adjustments
- paid-through-app edit/delete guards
- read-only expense/adjustment detail Sheet from C061
- client-side filters/search from C062, including free-text category filter

Today, `manual_expenses.category` is optional free text on create/edit. There is no shared category list, autocomplete, or household category management UI.

Before editing:

1. Run `git status`.
2. Confirm the working tree is clean except ignored/local files.
3. Inspect:

   * `src/pages/expenses.tsx`
   * `src/lib/expenses.ts`
   * `src/lib/expense-filters.ts`
   * `src/lib/expense-filters.test.ts`
   * `supabase/migrations/` only if schema inspection is needed
4. Tell me:

   * how categories are stored today
   * whether a migration is actually required or existing category strings can be reused
   * smallest UI pattern for category pick/management
   * which files you plan to modify

UI scope gate:
Prefer the smallest safe UI on the Expenses page:
1. Reuse existing create/edit category inputs with suggestions/autocomplete
2. Inline category management panel on Expenses
3. Settings section only if Expenses page would become too crowded

Do not add a new route unless deep-linking is explicitly required.

Required behavior:

1. Category suggestions from existing data first
   Derive known categories from already loaded/visible manual expense rows for the household (RLS-safe), e.g. distinct non-empty `category` values.
   Use these for:
   - create expense category input suggestions
   - edit expense category input suggestions
   - optional category filter dropdown/combobox in C062 filter row

2. Lightweight category management
   Let the user manage a small household category list without breaking existing free-text categories on old rows.
   Preferred MVP order:
   - start with derived suggestions only, if that satisfies the task
   - only add persistent household category storage if derived suggestions are insufficient

   If persistent storage is added, keep it minimal and household-scoped under existing RLS assumptions.

3. Preserve existing expense behavior
   Category changes must not alter:
   - mark paid
   - Pay & deduct cash
   - adjustment create/edit rules
   - cash credit behavior
   - paid-through-app guards
   - C061 detail Sheet
   - C062 filters except improved category pick/filter UX

4. Privacy
   Category suggestions/management must only use expenses already visible under existing RLS rules.
   Do not fetch or expose another user's private expenses to build category lists.
   Do not expose another user's payment/credit transactions or current cash amount.

5. Preserve product rules
   Do not change:
   - Dashboard calculations
   - Bills/Debt/Settings behavior
   - Supabase RPC behavior for payments/credits
   - RLS policies unless absolutely required for a new category table

6. Tests
   No component tests required.

   If you add pure helpers (recommended), add/update Vitest tests for:
   - extracting distinct categories from visible expenses
   - normalizing/trimming category names
   - merging persisted categories with derived ones, if applicable
   - empty/null category handling

   Do not unit-test Supabase I/O unless a migration is added.

Implementation preference:
Prefer reusing existing `manual_expenses.category` strings and client-side derivation first. Do not add migrations, indexes, or new tables unless inspection proves derived suggestions cannot meet the requirement.

Validation:
Run:

* `npm run typecheck`
* `npm run build`
* `npm run test:run`

Or:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\validate-cashflow.ps1
```

Browser smoke test with test login:

* Email: test@example.com
* Password: admin

Do not commit credentials.

Smoke steps:

1. Log in.
2. Go to Expenses.
3. Confirm existing expenses still load with categories unchanged.
4. Start creating a new expense and confirm category suggestions appear from existing data.
5. Select or enter a category and create the expense successfully.
6. Edit an expense and confirm category suggestions still work.
7. Confirm C062 filters/search still work, including category filter.
8. Confirm C061 detail Sheet still opens and shows category when present.
9. Confirm mark paid / pay / create adjustment / credit still work where applicable.
10. Confirm Bills, Debt, Settings, and Dashboard still load.
11. Confirm browser console has no app errors.
12. Write the final report to:
    `docs/automation/task_reports/CASHFLOW-CURSOR-063.md`

Do not commit yet.

Return:

1. Result: PASS / PARTIAL / BLOCKED
2. Files changed
3. Category management behavior implemented
4. Whether migration was required
5. Privacy guarantees preserved
6. Tests added/updated, if any
7. Validation results
8. Browser smoke test result
9. Remaining known limitations
10. Exact next recommended small task
