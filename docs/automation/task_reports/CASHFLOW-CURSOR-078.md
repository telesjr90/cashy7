# CASHFLOW-CURSOR-078 — Savings detail view

## Result

**PASS**

## Summary

Added a read-only savings goal detail sheet on Settings → Savings goals. Users can open **View details** on any visible goal to inspect goal metadata, current period context, own target progress, and own contributions without exposing another member's private savings data.

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse existing component | Used existing `Sheet` pattern from bill/debt detail panels |
| Inline panel | Rejected — savings goal cards are already dense with edit/log flows |
| Dialog/drawer | **Chosen** — `SavingsDetailPanel` sheet |
| New route | Rejected — no deep-link requirement |

**Why:** Sheet matches C071/C075 audit patterns, keeps C077 edit dialogs on the same page, and avoids `App.tsx` changes.

## Schema decision

**No migration.** Existing `savings_goals`, `savings_goal_participants`, and `savings_contributions` plus current RLS (`select own` for participants/contributions; shared goal metadata visible at goal level) already provide all read-only detail fields. Missing goal-level notes are omitted rather than adding schema.

## Files changed

- `src/lib/savings-detail.ts` — pure detail view builder, progress helper, privacy copy, UUID guard
- `src/lib/savings-detail.test.ts` — privacy and display-model tests (12 tests)
- `src/components/savings-detail-panel.tsx` — read-only sheet UI with edit action links
- `src/pages/settings.tsx` — View details action and panel wiring

## Behavior implemented

- **View details** button on each savings goal panel
- Read-only sheet with goal metadata, current period, own target, own contributions
- Shared goals show explicit privacy copy
- Edit goal / Edit my target buttons in detail sheet delegate to existing C077 dialogs
- Contribution edit path documented in detail sheet; row-level edit unchanged on goal card

## Savings detail content

- **Goal metadata:** name, private/shared type, household target amount, start/end dates, owner label
- **Current period:** month label, contribution period, period start/end, summary hint
- **Your target:** target amount, period/frequency, remaining obligation, progress percentage (own values only)
- **Your contributions:** dated list with amount/notes, period total, all-time total
- **Edit actions:** links/buttons to existing C077 goal and target dialogs

## Savings privacy behavior

- Only signed-in user's participant row and contributions are loaded (existing RLS)
- Shared goals show:
  - "Only your target and contribution details are shown."
  - "The other user's target and saved amount remain private."
- No combined saved total, no other-user target/saved amount, no inferred household remainder
- Private goals show only the signed-in user's data
- No raw UUIDs in user-facing detail strings

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (562 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-078.mjs` against `http://127.0.0.1:5180`:

- Settings page and Savings section load
- View details opens/closes
- Private goal detail sections render
- Shared goal privacy copy verified when present
- Edit goal / Edit my target / Edit contribution dialogs still open and close
- Dashboard, Bills, Debt, Expenses, Settings load
- No console errors

## Remaining known limitations

- Goal-level notes/category not supported by current schema
- Contribution edit from detail sheet is via explanatory copy + row actions on the goal card (no per-row edit inside the sheet)
- Current period summary follows the same month/period rules as Settings summaries (period_start month when set)

## Next recommended task

**CASHFLOW-CURSOR-079**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no migrations, RLS changes, or credentials in source.
