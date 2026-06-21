# CASHFLOW-CURSOR-069 — Variable bill workflow

## Result

**PASS**

## Schema decision

**No migration.** Existing fields support the workflow:

- `bills.is_variable` and `bills.default_amount` identify variable templates and placeholder defaults.
- `bill_instances.amount` stores generated/confirmed amounts (0 when no default).
- `bill_instances.notes` + `bill_id` identify generated template instances.
- Paid status uses existing `is_paid` / `paid_status`.

Confirmation is inferred: unpaid variable instances with amount ≤ 0 or amount equal to the template placeholder default need confirmation. Saving a non-placeholder amount via the existing edit flow clears the warning.

## Files changed

- `src/lib/variable-bills.ts` — detection, placeholder logic, dashboard view counting
- `src/lib/variable-bills.test.ts` — pure helper tests
- `src/pages/bills.tsx` — warnings, filter, confirm action path
- `src/pages/dashboard.tsx` — forecast incompleteness notice
- `src/components/bill-edit-panel.tsx` — confirm amount copy and button label
- `docs/automation/task_reports/CASHFLOW-CURSOR-069.md`
- `docs/automation/task_reports/CASHFLOW-CURSOR-069.result.json`

## Behavior implemented

- Detects variable bill instances linked to `is_variable` templates; excludes debt-linked and manual non-variable bills.
- Flags unpaid instances with zero/missing or placeholder-default amounts.
- Bills page: summary alert, per-row badge/message, “Needs confirmation” filter, **Confirm amount** button opening existing edit dialog.
- Dashboard: warning when current period view includes unconfirmed variable bills; calculations unchanged.
- Generated variable instances labeled “Variable amount” in source line.
- Edit panel shows confirm-specific title, description, and save label when confirmation is needed.

## Variable bill warning behavior

| Condition | Flagged? |
|-----------|----------|
| Unpaid generated variable, amount 0 | Yes |
| Unpaid generated variable, amount = template placeholder default | Yes |
| Unpaid generated variable, confirmed non-zero amount ≠ placeholder | No |
| Paid variable | No |
| Fixed bill, amount 0 | No |
| Debt-linked bill | No |
| Manual bill without variable template | No |

Copy: “Forecast is incomplete until this variable bill amount is confirmed.”

## Validation results

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (432 tests) |

## Browser smoke result

**PASS** — Bills/Dashboard/Debt/Expenses/Settings load; variable template generation shows warning; confirm amount via edit clears warning; no console errors.

## Privacy guarantees preserved

No changes to RLS, cash visibility, savings privacy, or payment audit behavior.

## Product rules preserved

Mark paid, Pay & deduct cash, debt schedule generation, recurring edit branching (C068), and generation duplicate skip (C067) unchanged.

## Remaining known limitations

- If a variable bill’s actual amount exactly equals the template placeholder default, the warning remains until the user enters a different amount (no dedicated `amount_confirmed` column in MVP).
- Dashboard warning may persist if other months/views still have unconfirmed variable bills.

## Next recommended task

**CASHFLOW-CURSOR-070**

## Ready to commit

Yes (when user approves commit).
