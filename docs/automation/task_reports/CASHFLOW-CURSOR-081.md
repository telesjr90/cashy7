# CASHFLOW-CURSOR-081 — Savings contribution cash deduction

## Result

**PASS**

## Product decision

Implemented an explicit two-path savings contribution flow:

1. **Log contribution only** (default) — records `savings_contributions` only; no cash snapshot or audit changes.
2. **Log and deduct from my current cash** — records the contribution, then deducts the signed-in user’s private current cash via the existing `pay_source_from_current_cash` RPC and `cash_payment_transactions` audit pattern.

Savings contributions never silently deduct current cash.

## Schema/RLS decision

**Migration added:** `supabase/migrations/20260621000001_020_savings_contribution_cash_deduction.sql`

- Extends `cash_payment_transactions.source_type` check to include `savings_contribution`
- Updates `pay_source_from_current_cash` to accept `savings_contribution`, verify the contribution belongs to the signed-in user, and perform cash deduction only (no bill/expense/debt side effects)
- Existing unique index on `(household_id, user_id, source_type, source_id)` prevents duplicate deductions
- **No RLS changes**

## Files changed

- `supabase/migrations/20260621000001_020_savings_contribution_cash_deduction.sql`
- `src/lib/savings-cash-actions.ts` — pure helpers for cash action validation, payloads, duplicate guard, labels
- `src/lib/savings-cash-actions.test.ts`
- `src/lib/savings.ts` — `addMySavingsContributionWithCashAction`
- `src/lib/savings-detail.ts` — per-contribution cash-deduction context labels
- `src/lib/savings-detail.test.ts`
- `src/lib/payments.ts` — savings contribution source labels and lookup support
- `src/lib/payments.test.ts`
- `src/lib/types.ts` — `savings_contribution` payment source type
- `src/pages/settings.tsx` — log-only vs log-and-deduct UI, cash history lookup, refresh after deduction
- `src/components/savings-contribution-edit-dialog.tsx` — guard when cash deduction exists
- `src/components/savings-detail-panel.tsx` — show cash-deduction label on contribution rows
- `docs/automation/task_reports/CASHFLOW-CURSOR-081.md`
- `docs/automation/task_reports/CASHFLOW-CURSOR-081.result.json`

## What was implemented

### Contribution creation (Settings)

- Radio choice: **Log contribution only** (default) vs **Log and deduct from my current cash**
- Dynamic submit button label matches the selected path
- Privacy copy: reduces only your private current cash; other user’s cash/savings remain private
- Success messages distinguish log-only vs log-and-deduct outcomes

### Cash deduction / audit behavior

- Log-and-deduct: insert contribution → `paySourceFromCurrentCash` with `source_type = savings_contribution`, `source_id = contribution.id`
- Audit notes: `Savings contribution · {goal name}` (fallback: `Savings contribution`)
- Duplicate deduction blocked by RPC + unique index + client pre-check in `paySourceFromCurrentCash`
- Edit/delete contribution: no automatic cash adjustment or audit reversal (C077 preserved)
- Edit dialog shows separate cash-deduction guard when audit record exists

### Savings detail & cash history

- Detail view shows per-contribution cash-deduction label or privacy-safe fallback
- Settings cash payment deductions list shows **Savings contribution · {goal name}** when lookup available

## Savings privacy behavior

- Only signed-in user’s contributions and cash audit rows are queried (existing RLS)
- Other user’s cash, targets, saved amounts, and contributions remain hidden
- No combined saved totals; no raw UUIDs in user-facing labels
- Shared-goal privacy copy unchanged (C079)

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (615 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-081.mjs` against `http://127.0.0.1:5183`:

- Settings and Savings section load
- Log-only vs log-and-deduct options visible with privacy copy
- Submit button label changes with selection
- View details, edit goal/target/contribution, rollover continue/cancel preserved
- Dashboard, Bills, Debt, Expenses load
- No console errors

## Supabase validation

Migration file created locally; remote apply not run in this session. Apply migration before log-and-deduct works against production Supabase.

## Remaining known limitations

- Editing/deleting a contribution does not reverse or adjust linked cash deductions (by design for C081)
- Partial failure: contribution may be saved while cash deduction fails; user can retry deduction only if no audit row exists yet
- Dashboard recent cash activity uses fallback label unless savings lookup is wired later

## Next recommended task

**CASHFLOW-CURSOR-082**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed; apply migration before deploy.
