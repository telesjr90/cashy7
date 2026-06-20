Task: CASHFLOW-CURSOR-062 — Expense filters and search

Use Composer 2.5 Fast.

You are working in:

C:\Users\tjr_\Downloads\project_cashflow

Goal:
Add filters and text search to the Expenses page so users can narrow the visible expense/adjustment table without changing expense business rules or payment behavior.

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
Do not add category management yet (that is C063).
Do not change Bills, Debt, or Settings behavior.
Do not touch Supabase migrations unless absolutely required.
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

The table currently shows all RLS-visible expenses ordered by date. Users need a way to filter and search within that visible set.

Before editing:

1. Run `git status`.
2. Confirm the working tree is clean except ignored/local files.
3. Inspect:

   * `src/pages/expenses.tsx`
   * `src/lib/expenses.ts`
   * `src/lib/expense-detail.ts`
   * `src/lib/payments.ts`
   * `src/lib/cash-adjustments.ts`
4. Tell me:

   * how expenses are currently loaded and rendered
   * which fields are already available for filtering without new schema
   * whether filters should be client-side on loaded rows or require new queries
   * which files you plan to modify

UI scope gate:
Prefer inline filter controls on the Expenses page (toolbar above the table or compact filter row). Do not add a new route unless deep-linking is explicitly required.

Required behavior:

1. Add filters on Expenses page only
   Filter the visible table rows by:

   * month or date range
   * period bucket (`1_14`, `15_eom`)
   * paid status (mark-paid / unpaid, and optionally cash deduction status if easy using existing helpers)
   * scope (`private` / `shared`)
   * category (text match on existing category field; no category management UI)
   * adjustment type (all / originals only / adjustments only / increase / decrease)
   * text search across description, category, notes, adjustment reason

2. Preserve existing row behavior
   Filtered-out rows must not appear in the table, but existing actions on visible rows must still work:

   * mark paid
   * Pay & deduct cash
   * create adjustment
   * credit current amount
   * edit/delete
   * open detail Sheet from C061

3. Empty/filtered states
   Show a clear empty state when no rows match current filters.
   Provide a way to reset/clear filters.

4. Privacy
   Filter only within expenses already visible under existing RLS rules.
   Do not fetch or expose another user's private expenses.
   Do not expose another user's cash transactions or current cash amount.

5. Preserve product rules
   Do not change:

   * expense create/edit/delete rules
   * mark paid behavior
   * Pay & deduct cash behavior
   * cash credit behavior
   * Dashboard calculations
   * Settings history cards
   * Bills/Debt behavior
   * Supabase RPC behavior
   * RLS policies

6. Tests
   No component tests required.

   If you add pure filter helpers (recommended), add/update Vitest tests for:

   * date range filtering
   * period bucket filtering
   * paid status filtering
   * scope filtering
   * category filtering
   * adjustment type filtering
   * text search across description/category/notes/reason
   * combined filters
   * empty input / reset behavior

   Do not unit-test Supabase I/O.

Implementation constraints:

* Keep filter UI compact and consistent with existing shadcn components.
* Prefer pure helpers in `src/lib/` for filter logic.
* Avoid large unrelated refactors in `expenses.tsx`.
* Do not introduce new dependencies.

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
3. Confirm unfiltered table still loads.
4. Apply text search and confirm matching rows only.
5. Apply at least two filters together (e.g. scope + adjustment type) and confirm results narrow correctly.
6. Clear/reset filters and confirm full visible list returns.
7. Open detail Sheet for a filtered row and confirm C061 detail still works.
8. Confirm mark paid / pay / create adjustment / credit still work on a visible row where applicable.
9. Confirm Bills, Debt, Settings, and Dashboard still load.
10. Confirm browser console has no app errors.
11. Write the final report to:
    `docs/automation/task_reports/CASHFLOW-CURSOR-062.md`

Do not commit yet.

Return:

1. Result: PASS / PARTIAL / BLOCKED
2. Files changed
3. Filters implemented
4. Filter UX placement
5. Privacy guarantees preserved
6. Tests added/updated, if any
7. Validation results
8. Browser smoke test result
9. Remaining known limitations
10. Exact next recommended small task
