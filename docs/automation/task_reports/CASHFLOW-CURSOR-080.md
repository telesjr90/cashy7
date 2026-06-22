# CASHFLOW-CURSOR-080 — Savings recurring/rollover support

## Result

**PASS**

## Summary

Added privacy-safe recurring period and rollover helpers using existing `savings_goal_participants` period fields, plus Settings UI to show current period status, own contributions/remaining obligation, rollover copy, next-period preview, and a confirmed “Continue to next period” action that updates only the signed-in user’s participant row.

## Schema/RLS decision

**No migration. No RLS changes.**

Existing fields support a no-migration MVP:
- `contribution_period`, `period_start`, `period_end`, `target_contribution_amount` on `savings_goal_participants`
- `contribution_date` on `savings_contributions`

Rollover shortfall is derived only from the signed-in user’s own target and contributions when both period dates are set and the configured period has ended. Without both period dates, UI shows **Rollover not configured** instead of guessing.

## Files changed

- `src/lib/savings-rollover.ts` — period status, contribution totals, rollover, next-period preview, continue payload, display view
- `src/lib/savings-rollover.test.ts` — pure helper tests (22 tests)
- `src/lib/savings-privacy.test.ts` — rollover privacy regression test
- `src/components/savings-rollover-panel.tsx` — inline panel + continue-period dialog
- `src/pages/settings.tsx` — wired recurring/rollover section into Savings goals
- `docs/automation/task_reports/CASHFLOW-CURSOR-080.md`
- `docs/automation/task_reports/CASHFLOW-CURSOR-080.result.json`

## What was implemented

### Pure helpers (`savings-rollover.ts`)

- Current period status: active / upcoming / expired / undated
- Own target, contributed amount, and remaining obligation for the configured or calendar period
- Prior-period shortfall and rollover amount (own data only, when period dates complete and period expired)
- Next period preview for monthly / 1_14 / 15_eom contribution periods
- Safe continue payload scoped to own participant id and user id
- Privacy-safe display labels and shared-goal copy

### Settings UI

- **Recurring period & rollover** section on each goal with an own target
- Shows current period label, dates, own target, contributions, remaining, rollover status, next-period preview
- **Continue to next period** opens review + confirm dialogs; cancel makes no changes; confirm updates only own participant period/target via existing `upsertMySavingsGoalParticipant`
- C077 edit goal / edit my target / edit contribution and C078 detail view preserved
- C079 shared privacy copy preserved

## Recurring/rollover behavior

- **Active period:** shows current obligation and “No prior-period shortfall — your current period is still active.”
- **Expired period with dates:** computes own shortfall; preview adds rollover to suggested next target when continuing
- **Undated period:** uses calendar bounds for display; rollover shows **Rollover not configured**
- **Continue action:** advances period_start/period_end to the next window and sets target to base + rollover shortfall (when applicable)

## Savings privacy behavior

- Queries remain narrowed to own participant/contribution rows (RLS + client filters)
- Shared goals show only household metadata plus own period/target/contribution details
- Never shows other user target, saved amount, contribution rows, combined totals, or inferred remainders
- Privacy copy present for shared goals

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (596 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-080.mjs` against `http://127.0.0.1:5183`:

- Settings page and Savings section load
- Recurring period & rollover section visible when own target exists
- Shared goal privacy copy remains visible
- Continue to next period dialog opens/closes on cancel
- C077 edit goal / edit my target / edit contribution still work
- C078 View details still works
- Dashboard, Bills, Debt, Expenses load
- No console errors

## Remaining known limitations

- Rollover requires both period start and end; no dedicated rollover-enabled flag in schema
- Continue action overwrites the single participant row (one active period window per goal per user)
- Dashboard safe-to-spend still uses existing period summary rules (unchanged)
- Cash is not deducted for savings contributions (deferred to C081)

## Next recommended task

**CASHFLOW-CURSOR-081**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no migrations, RLS changes, or credentials in source.
