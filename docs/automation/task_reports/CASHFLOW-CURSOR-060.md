# CASHFLOW-CURSOR-060 — Recent Cash Activity on Dashboard

## 1. Result

**PASS**

## 2. Files changed

| File | Change |
|------|--------|
| `src/lib/cash-activity.ts` | Added combined mapper, fetch/display limits, unified display row type |
| `src/lib/cash-activity.test.ts` | Added Vitest tests for merge, cap, formatting, fallbacks |
| `src/pages/dashboard.tsx` | Added fetch, refresh integration, and Recent cash activity card |
| `docs/automation/task_reports/CASHFLOW-CURSOR-060.md` | Task report |

## 3. Migration created

None.

## 4. Behavior implemented

- Dashboard loads up to 10 signed-in-user payment deductions and 10 adjustment credits via existing `getMy*` helpers.
- Bill, debt payment, and manual expense lookups mirror Settings history behavior.
- `mapRecentCashActivityForDisplay` merges both streams, sorts newest first, and shows the latest 5 rows.
- Read-only **Recent cash activity** card appears immediately after **Your current available amount**.
- Empty state: “No cash activity yet.”

## 5. Dashboard UI placement

Card inserted after **Your current available amount** and before **My bill total for this view**.

Title: **Recent cash activity**  
Description: **Recent changes to your current amount.**

## 6. Recent cash activity behavior

- Fetches own `cash_payment_transactions` and `cash_adjustment_transactions` (limit 10 each).
- Merges and displays top 5 combined rows by date descending.
- Refreshes on Dashboard mount and via existing `refreshDashboardData` focus/visibility path.

## 7. Deduction display behavior

- Uses `formatDeductionAmount()` via `mapCashPaymentDeductionsForDisplay` (e.g. `− CA$7.77`).
- Row type label: **Deduction**.
- Source label + description follow Settings pattern (e.g. `Manual expense · C054 pay deduct delete test`).

## 8. Credit display behavior

- Uses `formatCurrency()` for positive amounts (e.g. `CA$3.00`).
- Row type label: **Credit**.
- Description from adjustment lookup with fallback **Manual expense adjustment**.

## 9. Source description behavior

- Bill instance → bill name
- Manual expense → expense description
- Debt payment → debt account name (`test` verified in browser)
- Missing lookups use human-readable fallbacks; no raw UUIDs shown

## 10. Dashboard refresh behavior

- `fetchRecentCashActivity()` runs on mount.
- `refreshDashboardData()` calls `fetchRecentCashActivity({ background: true })` after other Dashboard data refresh.
- Navigating away (Expenses/Settings/Bills/Debt) and back to Dashboard reloads the card (component remount + refresh path).

## 11. Privacy guarantees preserved

- Only signed-in-user `getMyCashPaymentTransactions` / `getMyCashAdjustmentTransactions` queries.
- Lookups limited to IDs from the user’s own transactions within the household.
- No household-wide transaction history reads.
- Settings history cards unchanged; no other users’ cash/savings/private data exposed.

## 12. Tests added/updated

- `src/lib/cash-activity.test.ts` — 7 tests covering merge order, cap, formatting, debt descriptions, fallbacks, empty input.

## 13. Validation results

```
powershell -ExecutionPolicy Bypass -File scripts\validate-cashflow.ps1
```

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (290 tests) |

## 14. Supabase validation result

Not required. No schema or migration changes.

## 15. Browser smoke test result

**PASS** (playwright-cli against `http://localhost:5180/`)

| Step | Result |
|------|--------|
| Login and open Dashboard | PASS |
| Recent cash activity card visible | PASS |
| Deductions show minus-prefixed amounts | PASS (`− CA$7.77`, etc.) |
| Credits show positive amounts | PASS (`CA$3.00`) |
| Debt payment uses account name `test` | PASS |
| No raw UUIDs in UI | PASS |
| Existing pay deduct + adjustment credit rows present | PASS |
| Return to Dashboard after navigation refreshes card | PASS |
| Settings history cards load | PASS |
| Bills, Debt, Expenses, Settings, Dashboard load | PASS |
| Browser console app errors | None (React DevTools info + autocomplete warning only) |

## 16. Remaining known limitations

- Dashboard activity card shows 5 combined rows; full history remains in Settings (10 per stream).
- Activity fetch duplicates limited payment/adjustment queries on refresh (separate from unlimited payment fetch used for safe-to-spend).
- Credit source label is fixed as **Adjustment** (matches combined-row design; Settings shows description only).

## 17. Exact next recommended small task

**CASHFLOW-CURSOR-061** — Manual expense / adjustment detail view

## Supervisor commit readiness

**Ready for supervisor commit** — Result PASS, validation passed, browser smoke passed, scope matches task, no credentials or migrations changed.
