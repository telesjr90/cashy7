# CASHFLOW-CURSOR-077 — Savings edit/delete flows

## Result

**PASS**

## Summary

Added privacy-safe savings edit and delete flows on the Settings savings section using existing schema and RLS. Goal metadata edits, own-target edits/resets, and own-contribution edits/deletes are available via focused dialogs with validation and explicit confirmation where required.

## Schema decision

**No migration.** Existing `savings_goals`, `savings_goal_participants`, and `savings_contributions` tables plus current RLS policies already support:

- Creator-only goal update/delete
- Own participant update/delete
- Own contribution update/delete

No archive column exists; private goal delete uses hard delete with confirmation. Shared goal delete is blocked in-app because cascade would remove another member's private history.

## Files changed

- `src/lib/savings-edit.ts` — validation, ownership checks, privacy-safe display helpers, delete eligibility
- `src/lib/savings-edit.test.ts` — privacy and validation tests (24 tests)
- `src/lib/savings.ts` — update/delete Supabase helpers for goals, participants, contributions
- `src/components/savings-goal-edit-dialog.tsx` — edit goal metadata + delete private goals
- `src/components/savings-target-edit-dialog.tsx` — edit/reset own target
- `src/components/savings-contribution-edit-dialog.tsx` — edit/delete own contribution with confirmation
- `src/pages/settings.tsx` — wired dialogs into savings goal panels; shared-goal privacy copy

## Behavior implemented

### Goal edit (creator only)

- Editable: name, goal type (private→shared allowed; shared→private blocked), household target amount, start/end dates
- Delete: allowed for private goals with confirmation; blocked for shared goals with explanation

### Own target edit

- Dialog: target amount, contribution period, optional period start/end
- Reset removes only the signed-in user's participant row; contributions remain

### Own contribution edit/delete

- Editable: amount, date, notes
- Delete requires confirmation; no cash or audit mutations

## Savings privacy behavior

- RLS unchanged; helpers enforce user_id / creator ownership in app layer
- Shared goals show privacy copy; no other-user target or saved amount
- `buildPrivacySafeSharedGoalDisplay` never exposes combined saved totals or other-user amounts
- `producesCashDeductionMutation()` documents that edit/delete flows do not touch cash

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (550 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-077.mjs` against `http://127.0.0.1:5180`:

- Settings savings section loads
- Edit goal / Edit my target / Edit contribution dialogs open and close
- Invalid target and contribution amounts blocked
- Contribution edit save and delete confirmation path verified (cancel)
- Dashboard, Bills, Debt, Expenses, Settings load
- No console errors

## Remaining known limitations

- Shared goals cannot be deleted (by design); no archive/deactivate column in schema
- Goal notes/category not supported by current schema
- Savings UI remains on Settings (no dedicated route)
- Contribution delete smoke verifies confirm/cancel only to avoid mutating shared test data heavily

## Next recommended task

**CASHFLOW-CURSOR-078**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no migrations, RLS changes, or credentials in source.
