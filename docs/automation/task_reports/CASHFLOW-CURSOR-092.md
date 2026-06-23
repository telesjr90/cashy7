# CASHFLOW-CURSOR-092 — Savings page/Settings cashflow-start handling

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline notice + checkbox toggle on existing Settings → Savings card | **Chosen** |
| Per-goal pre-start sections | Rejected (single household toggle matches C089/C090/C091) |
| New route | Rejected |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: reuse the existing Settings → Savings goal panels, hide pre-start own contributions from the default active list, and expose a checkbox to reveal them with row/detail labels. Period summaries, rollover, and active totals use planning-filtered contributions.

## Files changed

| File | Change |
|------|--------|
| `src/lib/savings-cashflow-start.ts` | Pure helpers for pre-start classification, visible-set selection, active/pre-start totals, and labels |
| `src/lib/savings-cashflow-start.test.ts` | Vitest coverage for classification, toggle behavior, totals, and labels |
| `src/lib/savings-detail.ts` | Detail model fields for cashflow-start totals, notice, and per-row labels |
| `src/lib/savings-detail.test.ts` | Detail cashflow-start coverage |
| `src/lib/savings-rollover.ts` | Exclude pre-start contributions from period-window sums when start date is set |
| `src/lib/savings-rollover.test.ts` | Rollover pre-start exclusion regression |
| `src/components/savings-detail-panel.tsx` | Active/pre-start total labels and per-row before-cashflow-start label |
| `src/pages/settings.tsx` | Load cashflow start date, savings toggle/notice, filtered lists/totals, wiring to detail/rollover |
| `docs/automation/task_reports/CASHFLOW-CURSOR-092.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-092.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration. No RLS change.**

`household_settings.cashflow_start_date` already exists and is read through existing `getHouseholdSettings` / `settings` state on the Settings page. Classification compares each row's `contribution_date` against the configured start date using the same on-or-after boundary as Dashboard, Bills (C089), Expenses (C090), and Debt (C091) (`contribution_date >= cashflow_start_date`).

## Behavior implemented

### Settings → Savings cashflow-start boundary

- Uses household `cashflow_start_date` already loaded on Settings.
- When configured, pre-start own contributions are excluded from the default active contribution list per goal.
- When not configured, Savings behavior is unchanged (C088 dashboard warning remains the prompt).
- Pre-start rows are never deleted or mutated.

### Toggle and notice

- When visible own contributions include pre-start rows and a start date is set, shows:
  - “Savings contributions before the cashflow start date are hidden from the active list.”
  - “Show pre-start savings contributions” checkbox
- Per-goal contribution rows show a **Before cashflow start** badge when the toggle is on.
- Period summary and active total copy note that active totals exclude pre-start amounts.

### Labels and totals

- Default list label switches from “My all-time contributions” to “My active contributions” when a start date is set.
- Detail panel splits totals into **Total (active planning)** and **Total (before cashflow start)** when applicable.
- Cash-deducted pre-start contributions retain audit visibility for the signed-in user with the same before-cashflow-start label.

### Unchanged

- C077 edit goal / edit my target / edit contribution flows
- C079 shared savings privacy copy
- C080 rollover continue-period mutation flow (uses planning-filtered contributions for display/preview only)
- C081 log-only / log-and-deduct contribution flow
- Dashboard formulas and C088 warnings
- Bills C089, Expenses C090, and Debt C091 start-date behavior

## Savings detail/rollover/cash-action behavior

- **Detail (C078):** Accepts `cashflowStartDate` and `showPreStartSavingsContributions`; period totals use active planning contributions; list respects toggle; pre-start rows labeled when visible.
- **Rollover (C080):** `sumOwnContributionsInPeriodWindow` ignores pre-start rows when a start date is configured so shortfall/remaining calculations stay in active planning mode.
- **Cash actions (C081):** No mutation changes; pre-start cash-deducted rows keep existing audit labels plus before-cashflow-start context when shown.

## Privacy guarantees preserved

- Only the signed-in user's own contributions are filtered or totaled.
- Shared goal privacy copy unchanged; other-user targets, saved amounts, contribution rows, and counts remain hidden.
- No raw UUIDs in user-facing pre-start labels.

## Tests added/updated

- `src/lib/savings-cashflow-start.test.ts` — 13 cases
- `src/lib/savings-detail.test.ts` — 3 additional cases
- `src/lib/savings-rollover.test.ts` — 1 additional case

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (783 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-092.mjs` against `http://127.0.0.1:5190`:

- Settings page loads
- Savings section loads
- Pre-start notice/toggle verified when applicable
- Pre-start badges when toggle enabled
- Savings detail opens/closes
- Edit goal / edit my target / edit contribution dialogs open and close
- Dashboard, Bills, Expenses, Debt load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Pre-start classification uses `contribution_date` only; rows with unparseable dates remain in the active list (not classified as pre-start).
- Toggle state is session-local and not persisted across reloads.
- Savings goal metadata and household target amounts remain visible even when a goal only has pre-start contributions.

## Next recommended task

**CASHFLOW-CURSOR-093**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
