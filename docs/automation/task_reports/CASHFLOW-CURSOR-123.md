# CASHFLOW-CURSOR-123 — Responsive Dashboard cards

## Result: PASS

Dashboard cards, warnings, safe-to-spend metrics, forecast, debt summary, and month/period controls now stack cleanly on mobile viewports while preserving the desktop multi-column layout at `md+`.

## UI scope decision

**Option 1 — Reuse existing Dashboard page/components with Tailwind responsive classes**

- Chosen because all Dashboard sections already live on `dashboard.tsx` and dedicated child components; no new route, drawer, or page wrapper was needed
- Changes are limited to layout/CSS classes and smoke `data-testid` hooks
- Bills/Debt/Expenses list responsiveness remains owned by C124

## Files changed

| File | Change |
|------|--------|
| `src/pages/dashboard.tsx` | Responsive stacking for header, metric cards, breakdown rows, month/period controls, period cards, monthly summary grid |
| `src/components/dashboard-warnings.tsx` | Touch-friendly warning actions; `data-testid` |
| `src/components/dashboard-safe-to-spend-forecast.tsx` | Full-width forecast window selector on mobile; stacked event rows; responsive summary grid |
| `src/components/dashboard-debt-summary.tsx` | Responsive header, metrics grid, upcoming payment rows |
| `scripts/smoke-responsive-dashboard.mjs` | Browser smoke at 390×844, 320×740, and 1280×800 |

## Schema/RLS decision

No migration. No RLS changes. Component/CSS/smoke work only.

## Behavior implemented

### Dashboard card stacking

- Page root uses `min-w-0 overflow-x-hidden` to prevent horizontal scroll
- Household header stacks on narrow screens; Add Bill becomes icon-only with screen-reader label below `sm`
- Metric cards use single-column flow with wrapped headers and touch-friendly drilldown links (`min-h-10`)
- Large currency values use `text-xl sm:text-2xl`, `tabular-nums`, and `break-words`
- Safe-to-spend breakdown definition lists stack label/value vertically on mobile and align horizontally from `sm`
- Period mini-summary grids stack below 400px width (`min-[400px]:grid-cols-3`)
- Monthly summary uses `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`

### Safe-to-spend cards

- Current amount, bill totals, unpaid bills, manual expenses, safe-to-spend before/after cards remain readable
- Drilldown buttons and card keyboard activation preserved
- No formula or calculation changes

### Warnings

- Warning card remains visible when present; empty state still renders nothing (safe)
- Severity hierarchy, badges, and action links remain touch-friendly

### Forecast

- Window selector is full width on mobile, fixed width from `sm`
- Summary metrics and event rows stack cleanly; amounts align left on mobile
- Paycheck date summary and warnings preserved

### Debt summary

- Header wraps; metrics grid stacks on mobile
- Progress bar and upcoming payment rows remain readable

### Month/period controls

- Month/year selectors wrap with prev/next icons; Today button stacks below on mobile
- Period toggle buttons use `min-h-10`

## Accessibility & privacy

- Touch targets sized to at least ~40px on primary actions
- Focus rings preserved on interactive cards
- Heading hierarchy unchanged
- No private labels or privacy copy removed
- No cross-user data exposure; no formula or RLS changes

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1322 tests) |

## Browser smoke

| Check | Result |
|-------|--------|
| Dashboard loads at 390×844 and 320×740 | PASS |
| No horizontal overflow on dashboard/main/body | PASS |
| Warnings visible or safely absent | PASS |
| Safe-to-spend cards render and stack | PASS |
| Currency values within card bounds | PASS |
| Unpaid bills drilldown opens/closes | PASS |
| Forecast section renders; window selector works | PASS |
| Debt summary renders without overflow | PASS |
| Month/period controls fit viewport | PASS |
| Bottom mobile nav visible; desktop nav hidden on mobile | PASS |
| Desktop summary uses multi-column grid | PASS |
| Bills, Expenses, Debt, Calendar, Reports, Settings load | PASS |
| No console errors | PASS |

Command: `node scripts/smoke-responsive-dashboard.mjs` against dev server on `127.0.0.1:5223`

## Remaining limitations

- Bills, Debt, and Expenses list page responsiveness is owned by C124
- Mobile form/dialog polish is owned by C125
- Full Android viewport smoke suite is owned by C126
- Drilldown sheet internal table layouts were not redesigned in this task

## Next recommended task

**CASHFLOW-CURSOR-124** — Responsive Bills/Debt/Expenses lists
