# CASHFLOW-CURSOR-131C — Reports Expense Chart Data Helpers

**Result: PASS**

---

## Files Changed

| File | Action |
|------|--------|
| `src/lib/report-chart-data.ts` | Created |
| `src/lib/report-chart-data.test.ts` | Created |
| `docs/automation/task_reports/CASHFLOW-CURSOR-131C.md` | Created |
| `docs/automation/task_reports/CASHFLOW-CURSOR-131C.result.json` | Created |

## Migrations Created

None. This task is data helpers only.

## Helpers Implemented

Five pure exported functions with no Supabase calls:

1. **`buildExpensesByCategoryChartData(expenses, options)`**
   - Groups `ManualExpense` rows by `category` string, falling back to `"Uncategorized"`.
   - Applies date filtering via `startDate`, `endDate`, and `cashflowStartDate`.
   - Sorted descending by net amount.
   - Supports `topCategoryCount` + `"Other"` grouping.
   - Computes `percentage` of total for each row.
   - `categoryId` is always `null` (no separate categories table exists).

2. **`buildExpensesByMonthChartData(expenses, options)`**
   - Groups expenses by `YYYY-MM` month key.
   - Produces human-readable `monthLabel` (e.g. `"Jun 2026"`).
   - Sorted ascending chronologically.
   - Supports `includeEmptyPeriods` to fill gaps between range start and end.

3. **`buildExpensesByPayPeriodChartData(expenses, options)`**
   - Groups expenses by the app's `"1_14"` / `"15_eom"` pay period buckets.
   - Uses `expense.period_bucket` from the stored DB row.
   - `periodKey` format: `"YYYY-MM-1_14"` or `"YYYY-MM-15_eom"`.
   - `periodLabel` format: `"Jun 1–14"` / `"Jun 15–30"` (actual last day of month).
   - Sorted chronologically with `"1_14"` always before `"15_eom"` within a month (custom comparator, not lexicographic).
   - Supports `includeEmptyPeriods`.

4. **`buildExpenseCategoryByMonthChartData(expenses, options)`**
   - Returns one row per calendar month with category names as series keys.
   - Compatible with Recharts stacked bar chart format.
   - Collapses categories beyond `topCategoryCount` into `"Other"`.
   - Missing categories default to `0` per period.

5. **`buildExpenseCategoryByPayPeriodChartData(expenses, options)`**
   - Same as above but by pay period bucket.
   - Correctly handles leap year February (Feb 15–29 for 2028).

## Grouping Behavior

- Each helper accepts a `ReadonlyArray<ManualExpense>`.
- No Supabase queries inside the helpers.
- Caller is responsible for passing only RLS-visible rows.
- Decrease-adjustments (`adjustment_direction === "decrease"`) contribute negative amounts.
- Increase-adjustments contribute positive amounts.
- Empty input always returns `[]`.

## Date / Pay-Period Behavior

- `cashflowStartDate` and `startDate` are both respected; the later of the two is the effective floor.
- `endDate` is the ceiling.
- `includeEmptyPeriods: true` generates all months/periods between range start and end, with zero amounts.
- Period labels show actual last day of month (e.g. `"Feb 15–28"` for non-leap, `"Feb 15–29"` for leap year).
- Pay period sort uses a custom comparator: `"1_14"` before `"15_eom"` within the same month.

## Amount / Category Behavior

- Amounts are raw `number` values (no currency formatting).
- `roundCents` (2 decimal precision via `Math.round(x * 100) / 100`) is used throughout.
- No CAD currency conversion.
- `"Uncategorized"` fallback for `null` or blank `category`.
- `categoryId` is always `null` — the app stores categories as plain strings, not FK references.

## Privacy / No-Raw-UUID Behavior

- Helpers are pure: they only process rows passed by the caller.
- No user data can be inferred beyond what is in the passed rows.
- `categoryId: null` — no UUIDs appear in any chart-facing label.
- `periodKey` and `periodLabel` contain only year, month abbreviation, and numeric day ranges.
- `monthKey` is `"YYYY-MM"` only.
- Test suite includes a dedicated privacy section verifying no raw UUIDs appear in any label.

## Tests Added

77 Vitest tests in `src/lib/report-chart-data.test.ts` covering:

- Category grouping sums, percentages, sort order
- Uncategorized fallback
- Top-N + Other grouping
- Decrease/increase adjustment semantics
- Empty input
- `startDate`, `endDate`, `cashflowStartDate` filtering
- Non-mutation of input arrays
- Monthly grouping: chronological sort, empty months, labels
- Pay-period grouping: 1_14/15_eom assignment, February (non-leap and leap), correct last-day labels, empty periods
- Stacked category-by-month: category keys, missing categories default to 0, stability
- Stacked category-by-pay-period: same coverage
- Privacy: isolated caller results, no raw UUIDs in any label

## Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1499 tests, 88 test files) |
| `node scripts/audit-rls-policies.mjs` | PASS |
| `node scripts/audit-database-functions.mjs` | PASS |

## Browser Smoke Test

Not required. This task is pure data helpers with no UI.

## Ready to Commit

Yes — all validation gates pass, no credentials changed, scope matches task.

## Next Task

**CASHFLOW-CURSOR-131D** — Render report chart UI using the helpers created here.
