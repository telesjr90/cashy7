# CASHFLOW-CURSOR-125 — Mobile forms/dialogs

## Result: PASS

Major forms, sheets, dialogs, and alert dialogs are usable on 320–390 px mobile viewports while preserving validation, save/cancel behavior, focus management, guards, privacy, and data rules.

## UI scope decision

| Option | Decision |
|---|---|
| Reuse existing dialog/sheet components | **Chosen** — hardened shadcn/Radix primitives |
| New mobile-only routes | Rejected |
| Schema/RLS changes | Rejected — UI/CSS only |

**Why:** Base `Dialog`, `Sheet`, and `AlertDialog` updates propagate mobile-safe defaults to all consumers with the smallest diff. Targeted patches address known overflow hotspots (paycheck select, household emails, report month toolbar, import preview tables).

**Files intentionally avoided:** `src/App.tsx`, dashboard/list card components (C122–C124), financial formula modules, Supabase migrations.

## Files changed

| Area | Files |
|---|---|
| Shared primitives | `src/components/ui/dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx` |
| Shared helpers | `src/lib/mobile-form-layout.ts`, `mobile-form-layout.test.ts`, `src/index.css` |
| Bills | `bill-edit-panel.tsx`, `bill-template-panel.tsx`, `bill-detail-panel.tsx` |
| Debt | `debt-payment-detail-panel.tsx`, `debt-schedule-replacement-dialog.tsx` |
| Savings | `savings-goal-edit-dialog.tsx`, `savings-target-edit-dialog.tsx`, `savings-detail-panel.tsx` |
| Settings/import/household | `paycheck-schedule-settings.tsx`, `import-column-mapping-panel.tsx`, `household-invite-card.tsx`, `household-member-management-card.tsx`, `settings.tsx` |
| Reports | `monthly-report.tsx` (print/export toolbar only) |
| Smoke | `scripts/smoke-mobile-forms-dialogs.mjs` |

## Schema/RLS

No migration. RLS unchanged.

## Behavior implemented

### Dialog/sheet viewport (mobile)

- Modals use `z-[60]` (above C122 bottom nav `z-50`), `max-h-[min(85vh,calc(100dvh-2rem))]`, `min-w-0`, and internal vertical scroll.
- Sheet side panels are full-width on mobile with `overflow-y-auto`; bottom sheets cap height at 85vh with safe-area padding.
- Footers stack on mobile with full-width touch targets (`min-h-10`).

### Form fields

- Two-column amount/split/date grids use `MOBILE_FORM_GRID_TWO_COL` (single column below `md`).
- Detail sheet rows use `min-w-0 break-words` for long labels/values.
- Import mapping preview tables are wrapped in contained horizontal scroll.

### Bills / Debt / Expenses

- Bill edit, template, generation, detail sheet, and recurring scope confirmation inherit mobile dialog defaults.
- Debt payment detail sheet and schedule replacement dialog fit narrow viewports.
- Expense edit/detail dialogs already used scrollable content; base primitive updates apply.

### Settings / import / receipt / household

- Paycheck schedule select wraps long schedule labels on 320 px.
- Import column mapping stacks fields and constrains preview table overflow.
- Household member/invite emails use `break-all` to prevent page overflow.
- Savings edit/detail dialogs use responsive grids and shared modal defaults.

### Reports

- Monthly report month/year toolbar wraps and uses narrower selects on mobile; print/export buttons remain visible.

## Privacy

- No cross-user data exposure.
- Owner-only gates, privacy copy, and cash mutation rules unchanged.
- `isSafeDisplayLabel` helper tests guard against raw UUID labels in mobile form copy.

## Validation

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1325 tests, including 3 new mobile-form-layout tests) |

## Browser smoke

Command: `node scripts/smoke-mobile-forms-dialogs.mjs` against dev server `127.0.0.1:5225`

| Viewport | Result |
|---|---|
| 390×844 mobile | PASS |
| 320×740 narrow | PASS |
| 1280×800 desktop sanity | PASS |

Checks: Bills/Debt/Expenses/Settings/Reports load; dialogs/sheets open/close without horizontal overflow when data exists; dialog actions above bottom nav; no console errors.

## Remaining limitations

- Dense import validation tables may still scroll horizontally inside their contained panel (by design).
- Some inline page forms on Debt (account/payment create) were not individually restyled; they already used `md:grid-cols-2`.

## Next task

`CASHFLOW-CURSOR-126` — Android viewport smoke tests.
