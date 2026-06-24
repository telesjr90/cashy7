# CASHFLOW-CURSOR-131A — Dashboard Card Simplification

**Result: PASS**

---

## 1. Files Changed

| File | Change |
|------|--------|
| `src/components/dashboard-summary-card.tsx` | New — reusable collapsible dashboard card shell |
| `src/lib/dashboard-total-available.ts` | New — pure helpers: `sumAllSavingsContributions`, `calculateTotalAmountAvailable` |
| `src/lib/dashboard-total-available.test.ts` | New — 16 Vitest unit tests covering formula, privacy, and formatting contract |
| `src/pages/dashboard.tsx` | Modified — cards refactored to `DashboardSummaryCard`, reordered, "Total amount available" added, "Safe to spend after savings" renamed |
| `scripts/smoke-dashboard-cards.mjs` | New — browser smoke script for dashboard card UI |

---

## 2. Dashboard Card UI Behavior

### Collapsed state (default)
Every card shows:
- Card title
- Primary amount (formatted currency, skeleton during load, or `—` when data unavailable)
- **Details** toggle button with chevron icon and `aria-expanded`

No secondary details, explanations, breakdowns, date ranges, or links are shown collapsed.

### Expanded state (on Details click)
The Collapsible content area reveals:
- All existing secondary detail content
- Calculation breakdowns
- Date range labels
- Drilldown action buttons
- Warning/error details
- Admin context labels (where applicable)

### Accessibility
- Toggle is a `<button>` element (keyboard usable)
- `aria-expanded` attribute set correctly
- `aria-label` announces card name on expand/collapse
- Focus ring applied via `focus-visible:ring-2`

---

## 3. Important Card Priority

Cards are ordered top-to-bottom:

1. **"Available to spend after savings"** — `priority="high"`, accent border, light background header
2. **"Total amount available"** — `priority="high"`, accent border, light background header
3. "Your current available amount"
4. "Safe to spend before savings"
5. "My unpaid bills for this view"
6. "My manual expenses for this view"
7. "My bill total for this view"
8. "Recent cash activity"
9. Dashboard warnings (unchanged)
10. Safe-to-spend forecast (unchanged)
11. Debt summary (unchanged)
12. Period controls + period cards
13. Monthly summary

---

## 4. Total Amount Available Calculation

**Formula:** `totalAmountAvailable = cashSnapshot.amount + sumAllSavingsContributions(savingsContributions)`

Where `savingsContributions` contains all of the signed-in user's savings contributions across all time (not period-filtered). The savings balance represents money that has been deducted from cash via "Pay & deduct cash" and accumulated in savings goals.

This formula is isolated in `src/lib/dashboard-total-available.ts` and tested in `dashboard-total-available.test.ts`.

**Existing formulas unchanged:** safe-to-spend-before-savings, safe-to-spend-after-savings, savings obligation, paycheck schedule math.

---

## 5. Personal/Admin Privacy Behavior

- **Personal view:** "Available to spend after savings" and "Total amount available" use `user.id`-scoped data fetched by `getMySavingsContributions` (RLS enforced). No other user's cash or savings is included.
- **Owner Admin view:** The existing Admin banner/toggle is preserved. Cards use the same owner's own private scoped data. The admin context where household totals are shown (Monthly Summary, period cards) is unchanged.
- **Member view:** Nicole's cards show only her own data. No admin toggle. No owner private values.

No RLS changes, no policy changes, no schema changes.

---

## 6. Tests Added/Updated

### New: `src/lib/dashboard-total-available.test.ts` (16 tests)

- `sumAllSavingsContributions`: 5 tests
  - Empty array returns 0
  - Single contribution summed
  - Multiple contributions summed
  - String-numeric amounts handled (Supabase numeric columns)
  - Isolation: only receives own contributions

- `calculateTotalAmountAvailable`: 7 tests
  - Returns null when cashAmount is null
  - Returns cash + savings when snapshot exists
  - Returns cashAmount when savings is zero
  - Handles fractional CAD amounts
  - Handles negative cashAmount (overdrawn)
  - Additive identity
  - Sanity: total >= safe-to-spend-after-savings

- Privacy: 2 tests
  - Personal view does not include another user's data
  - Member view equals own cash only when no savings

- Formatting contract: 1 test
  - Result is a plain finite number suitable for `formatCurrency`

---

## 7. Validation Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (86 files, 1394 tests) |
| `node scripts/audit-rls-policies.mjs` | PASS |
| `node scripts/audit-database-functions.mjs` | PASS |

---

## 8. Browser Smoke Result

**Result: PASS** (desktop 1280×800 + mobile 390×844)

Script: `scripts/smoke-dashboard-cards.mjs`

Checks verified:
- Dashboard loads on desktop and mobile
- "Available to spend after savings" card present
- "Total amount available" card present
- Both priority cards appear before secondary cards
- Details are hidden by default (collapsed)
- No horizontal overflow in collapsed state
- Expand "Available to spend after savings" → details visible
- No horizontal overflow when expanded
- Collapse again → details hidden
- Expand "Total amount available" → details visible
- No horizontal overflow when expanded
- Collapse again → details hidden
- No raw UUIDs visible
- No console errors

---

## 9. Ready to Commit

**Yes** — all checks pass, no credentials changed, no migrations, no unrelated refactor.

---

## 10. New Test IDs Added

| Test ID | Purpose |
|---------|---------|
| `dashboard-card-available-after-savings` | Priority card 1 wrapper |
| `dashboard-card-total-available` | Priority card 2 wrapper |
| `dashboard-card-toggle-available-after-savings` | Expand/collapse button for card 1 |
| `dashboard-card-toggle-total-available` | Expand/collapse button for card 2 |
| `dashboard-card-details-available-after-savings` | Details content area for card 1 |
| `dashboard-card-details-total-available` | Details content area for card 2 |

### Preserved Test IDs
- `dashboard-current-amount-card`
- `dashboard-bill-total-card`
- `dashboard-unpaid-bills-card`
- `dashboard-manual-expenses-card`
- `dashboard-safe-to-spend-before-card`
- `dashboard-page`
- `dashboard-month-controls`
- `dashboard-period-controls`
- `dashboard-monthly-summary`
- `dashboard-monthly-summary-grid`

---

## 11. Known Limitations

- **Component render tests** (collapsed hides details, toggle opens details) require jsdom. The current Vitest config uses `environment: "node"`. These interaction behaviors are covered by the Playwright smoke test instead.
- Admin view multi-user label test (Teles/Nicole) in expanded details is covered by visual smoke (no dedicated unit test, since it depends on seeded admin data).

---

## 12. Next Task

**CASHFLOW-CURSOR-131B** — Reports charts (mentioned as planned after this task).
