# CASHFLOW-CURSOR-079 — Shared savings privacy polish

## Result

**PASS**

## Summary

Audited all shared-savings reads, helpers, and UI. Existing RLS and C077/C078 flows were already privacy-safe at the query layer. This pass added defense-in-depth contribution filtering by `user_id`, privacy copy polish for shared goal metadata, and focused regression tests that fail if other-user or combined totals leak into display models.

## Schema/RLS decision

**No migration. No RLS changes.**

Existing policies already enforce:
- shared `savings_goals` metadata visible to household;
- `savings_goal_participants` and `savings_contributions` select/update/delete limited to `auth.uid()` rows.

Queries (`getMySavingsGoalParticipants`, `getMySavingsContributions`) already narrow reads to the signed-in user. Helpers were tightened so display builders ignore other-user rows even if mistakenly passed in.

## Files changed

- `src/lib/savings-edit.ts` — `SHARED_GOAL_METADATA_ONLY_COPY` constant
- `src/lib/savings.ts` — `filterMyContributionsForGoal` / `sumMyContributionsForGoal` require `userId`
- `src/lib/savings-detail.ts` — pass `userId` into contribution filters
- `src/lib/savings-detail.test.ts` — stronger other-user contribution exclusion test
- `src/lib/savings.test.ts` — updated filter/sum tests for `userId`
- `src/lib/savings-edit.test.ts` — participant delete guard test
- `src/lib/savings-privacy.test.ts` — consolidated shared-savings privacy regression suite (10 tests)
- `src/components/savings-detail-panel.tsx` — shared metadata copy + household target label
- `src/pages/settings.tsx` — household target label, metadata copy, `userId` filters
- `docs/automation/task_reports/CASHFLOW-CURSOR-079.md`
- `docs/automation/task_reports/CASHFLOW-CURSOR-079.result.json`

## What was audited

- `supabase/migrations/20260619000003_013_savings_foundation.sql` — RLS policies unchanged and sufficient
- `src/lib/savings.ts`, `savings-edit.ts`, `savings-detail.ts` — reads, summaries, edit/delete guards
- `src/pages/settings.tsx` — savings cards, detail sheet wiring, shared privacy copy
- `src/pages/dashboard.tsx` + `src/lib/dashboard-drilldowns.ts` — only signed-in user targets/contributions in safe-to-spend and drilldown
- `src/components/savings-*` — detail panel and edit dialogs
- Prior task reports C077/C078

## What was implemented or confirmed

### Confirmed safe (no behavior change needed)

- Dashboard safe-to-spend and savings drilldown use only `getMySavingsGoalParticipants` / `getMySavingsContributions`
- Edit/delete flows mutate only own participant/contribution rows (API `.eq("user_id", userId)` + ownership helpers)
- Shared detail view shows household goal metadata plus own target/contributions only
- No combined saved total, combined progress, or household remainder inference in UI

### Implemented polish

- Contribution helpers filter by both goal id and signed-in `user_id`
- Shared goal metadata copy: **Shared goal metadata only.**
- Shared goal labels use **Household target** instead of ambiguous **Target**
- Consolidated privacy regression tests in `savings-privacy.test.ts`

## Shared savings privacy guarantees

- Other user's target contribution is never shown
- Other user's saved amount is never shown
- Other user's contribution rows/count are never shown
- Combined saved total is never shown
- Combined progress percent is never shown
- Household remaining amount is not inferred from shared target minus own values
- Privacy copy present on shared goals:
  - Only your target and contribution details are shown.
  - The other user's target and saved amount remain private.
  - Shared goal metadata only.
- No raw UUIDs in user-facing shared-savings strings

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (573 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-079.mjs` against `http://127.0.0.1:5180`:

- Settings page and Savings section load
- Shared goal privacy copy visible when applicable (including metadata-only copy)
- Savings detail opens/closes; shared detail has no forbidden combined/other-user labels
- C077 edit goal / edit my target / edit contribution dialogs still work
- Dashboard, Bills, Debt, Expenses load without shared-savings combined/private leakage
- No console errors

## Remaining known limitations

- Household shared goal `target_amount` remains visible as agreed shared metadata (not another member's personal target)
- Detail/edit contribution actions remain on the goal card rows, not inside the detail sheet

## Next recommended task

**CASHFLOW-CURSOR-080**
