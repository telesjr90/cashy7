# CASHFLOW-CURSOR-093 — Cashflow start date admin/change protection

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Inline panel in existing Settings → Cashflow start date card | **Chosen** |
| New route | Rejected |
| `App.tsx` changes | Avoided |
| Broad admin settings page | Rejected |

Smallest safe surface: extract the cashflow start date card into a focused component on the existing Settings page, with an `AlertDialog` confirmation and impact preview for changes.

## Files changed

| File | Change |
|------|--------|
| `src/lib/cashflow-start-admin.ts` | Pure helpers for permission, validation, confirmation copy, and privacy-safe impact preview |
| `src/lib/cashflow-start-admin.test.ts` | Vitest coverage for permission, validation, confirmation, and impact preview |
| `src/lib/cashflow-settings.ts` | `loadCashflowStartImpactPreviewData` loader for visible household rows |
| `src/components/cashflow-start-date-settings-card.tsx` | Settings card with read-only state, first-time setup, confirmation dialog, and impact preview |
| `src/pages/settings.tsx` | Wire new cashflow start date card |
| `supabase/migrations/20260622000002_022_household_settings_owner_only.sql` | Owner-only insert/update RLS for `household_settings` |
| `docs/automation/task_reports/CASHFLOW-CURSOR-093.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-093.result.json` | Machine-readable report |

## Schema/RLS decision

**Migration added.**

`household_members` already exposes owner status via `role = 'owner'` and `is_owner`. Existing `household_settings` RLS allowed any active household member to insert/update. Added `is_my_household_owner()` and narrowed insert/update policies to owners only. SELECT policy is unchanged so all members can still read the cashflow start date.

## Behavior implemented

### Permission-aware display

- Settings shows the current cashflow start date.
- Household owners can set or change it.
- Non-owners see the date read-only with: “Only a household admin can change the cashflow start date.”
- Missing membership context defaults to read-only through `canUserEditCashflowStartDate`.

### First-time setup

- When no start date exists, authorized users see setup copy explaining the planning boundary.
- Save writes only `household_settings.cashflow_start_date`; no historical rows are mutated.

### Change protection

- Changing an existing start date opens an `AlertDialog` with non-destructive confirmation copy.
- Cancel closes the dialog and makes no update.
- Confirm performs the existing `upsertHouseholdCashflowStartDate` write and refreshes Settings state.

### Impact preview

Before confirming a change, the dialog shows privacy-safe counts from already-visible household data:

- Bills affected
- Expenses affected
- Debt payments affected
- Your savings contributions affected (signed-in user only)

Counts describe rows that would change between active and pre-start classification. No other-user private savings, cash, or expense counts are included.

### Post-save behavior

- Settings state refreshes after save.
- C089 Bills, C090 Expenses, C091 Debt, and C092 Savings continue using the updated `cashflow_start_date`.
- C088 dashboard no-cashflow-start warning clears after first-time setup.

## Privacy guarantees preserved

- Impact preview uses only household-visible bills/expenses/debt payments plus the signed-in user's own savings contributions.
- No other-user private cash, savings, expenses, or audit rows are counted.
- No raw UUIDs in user-facing labels.
- SELECT RLS unchanged; no broad admin powers added.

## Tests added/updated

- `src/lib/cashflow-start-admin.test.ts` — 15 cases covering permission, validation, confirmation rules, impact preview counts, and label privacy

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (798 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-093.mjs` against `http://127.0.0.1:5190`:

- Settings loads; cashflow start date section shows current state
- Authorized edit flow present; invalid date blocked
- Existing start date change opens confirmation with impact preview; cancel makes no changes
- Dashboard, Bills, Expenses, Debt, and Settings savings section load
- No console errors

## Supabase validation

**PASS** — migration `household_settings_owner_only` applied to project `nasyeoywmcifabusfpti`.

## Remaining known limitations

- UI permission check relies on membership data already loaded in auth context; database RLS is the enforcement layer for writes.
- Impact preview loads household bills/expenses/debt payments on demand when the confirmation dialog opens.
- Non-owner read-only verification depends on test account role data; smoke test accepts either authorized controls or read-only copy.

## Next recommended task

**CASHFLOW-CURSOR-094**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
