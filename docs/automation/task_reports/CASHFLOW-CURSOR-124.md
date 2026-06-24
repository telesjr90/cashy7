# CASHFLOW-CURSOR-124 — Responsive Bills/Debt/Expenses lists

## Result

**PASS**

Bills, Debt, and Expenses list areas now render mobile-friendly stacked cards below the `md` breakpoint while preserving desktop tables and all existing actions, guards, filters, and privacy boundaries.

## Files changed

| File | Change |
|------|--------|
| `src/components/responsive-list-card.tsx` | Shared mobile list card wrapper |
| `src/components/debt-progress-dashboard.tsx` | Mobile progress cards; desktop table hidden below `md` |
| `src/pages/bills.tsx` | Mobile bill cards, responsive filters, page/list test ids |
| `src/pages/debt.tsx` | Mobile account/payment cards, page/list test ids |
| `src/pages/expenses.tsx` | Mobile expense cards, responsive filters, page/list test ids |
| `scripts/smoke-responsive-lists.mjs` | Browser smoke for 320/390/1280 viewports |
| `docs/automation/task_reports/CASHFLOW-CURSOR-124.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-124.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.**
- **RLS unchanged.** Component/CSS/smoke work only.

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse existing page + inline mobile cards | **Chosen** |
| New routes | Rejected — not required |
| Global form/dialog redesign | Rejected — C125 scope |
| Shared helper module for row models | Rejected — duplication avoided via same filtered data + handlers |

Desktop tables remain at `md+`. Mobile uses `ResponsiveListCard` instances mapped from the same filtered arrays with identical handlers.

## What was implemented

### Bills

- Filters/search stack on narrow screens; active filter badges wrap.
- Mobile bill cards show name, due date, period, amounts, Teles/Nicole split, status, source, variable confirmation, pre-start badge, debt-linked copy, and pay/edit/delete/details actions.
- Desktop table unchanged at `md+`.

### Debt

- Debt progress by account stacks as mobile cards; summary metrics already used responsive grid.
- Debt account rows and payment rows render as mobile cards below `md`.
- Payment cards preserve archive badge, pre-start label, cash-deduction status, pay/edit/delete/details actions.

### Expenses

- Filters stack; search input is full width on mobile.
- Mobile expense cards show description, date, category, scope, amount, split, adjustment labels, pre-start badge, pay/credit/edit/delete/details actions.
- Desktop table unchanged at `md+`.

### Accessibility / privacy

- Mobile cards use semantic `article` + `h3` headings.
- Action buttons retain `aria-label` text (mobile uses labeled buttons instead of icon-only where helpful).
- No private cross-user data exposure; existing scope/privacy labels preserved.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1322 tests) |

## Browser smoke result

`node scripts/smoke-responsive-lists.mjs` against `http://127.0.0.1:5224` — **PASS**

- Mobile 390×844 and narrow 320×740: Bills/Debt/Expenses load without horizontal overflow; filters fit; mobile cards render; detail sheets open/close when data exists; bottom nav visible.
- Desktop 1280×800: desktop tables visible; mobile bottom nav hidden.
- Dashboard, Calendar, Reports, Settings load.
- No console errors.

## Remaining known limitations

- Bill templates table on Bills page remains desktop table only (secondary surface; instances list is primary C124 target).
- Calendar page may still have pre-existing horizontal overflow at some widths (out of C124 scope; smoke only verifies route load).

## Next recommended task

**CASHFLOW-CURSOR-125** — Mobile forms/dialogs polish.
