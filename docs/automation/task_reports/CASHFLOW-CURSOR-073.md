# CASHFLOW-CURSOR-073 — Debt account close/archive

## Result

**PASS**

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse existing component | Reused Debt page table, AlertDialog, Checkbox toggle |
| Inline panel | Rejected — archive confirmation needs focused warning copy |
| Dialog | **Chosen** — `DebtAccountArchiveDialog` for close/archive confirm |
| New route | Rejected — no deep-link requirement |

**Why:** Dialog confirms archive/close with balance-aware warnings while keeping users on the Debt page. A checkbox toggle exposes archived accounts without a new route.

## Files changed

- `supabase/migrations/20260621000000_019_debt_account_archive.sql` — archive columns on `debt_accounts`
- `src/lib/types.ts` — `DebtAccount` archive fields
- `src/lib/debt-accounts.ts` — pure archive/reopen/filter helpers
- `src/lib/debt-accounts.test.ts` — helper tests
- `src/lib/sync-bill-paid-status.ts` — debt-linked bill context includes archived account flag
- `src/lib/bill-detail.ts` — archived debt account label in bill audit detail
- `src/lib/bill-detail.test.ts` — archived debt context test
- `src/components/debt-account-archive-dialog.tsx` — confirm dialog with optional reason
- `src/components/debt-schedule-replacement-dialog.tsx` — blocks replacement on archived accounts
- `src/components/bill-detail-panel.tsx` — shows archived debt label
- `src/pages/debt.tsx` — active/archived lists, archive/reopen actions, schedule guards
- `src/pages/bills.tsx` — passes archived debt context into bill detail view

## Schema decision

**Migration required.** `debt_accounts` had no existing active/archive/status field. Added narrow columns only:

- `is_archived boolean not null default false`
- `archived_at timestamptz nullable`
- `archive_reason text nullable`

No RLS changes needed — existing household update policy already covers these columns.

Migration applied to Supabase project `nasyeoywmcifabusfpti`.

## Behavior implemented

- **Close account** for zero/negative remaining balance with simple confirmation
- **Archive account** for positive remaining balance with explicit unpaid warning
- Optional archive reason input
- Active debt list hides archived accounts by default
- **Show archived/closed accounts** checkbox when archived accounts exist
- Archived rows show badge (`Closed` or `Archived`), total paid, remaining balance, archived date, reason, and **Reopen**
- Reopen clears archive fields only — no payment/bill regeneration
- Payment history remains visible; archived account names show badge in payments table
- Schedule generate/replace blocked for archived accounts (C072 behavior preserved for active accounts)
- Bills page still shows debt-linked bills; detail view adds **Debt account archived** when parent debt account is archived
- No delete mutations in archive/reopen flows

## Close/archive behavior

| Balance | Action label | Warning |
|---------|--------------|---------|
| `<= 0` | Close account | Paid-off confirmation; history preserved |
| `> 0` | Archive account | Remaining balance warning; not labeled paid off |

## History preservation

Archive/reopen updates only `is_archived`, `archived_at`, and `archive_reason` on `debt_accounts`. No deletes on:

- `debt_accounts` (archive path)
- `debt_payments`
- `bill_instances`
- `cash_payment_transactions`

Paid/cash-deducted rows are not mutated by archive/reopen.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (472 tests) |

## Browser smoke result

**PASS** via `.tmp-smoke-073.mjs`:

- Dashboard, Bills, Debt, Expenses, Settings load
- Debt archive dialog opens and cancel makes no changes
- Show archived toggle works when archived accounts exist
- Bills detail drawer opens/closes
- No console errors

## Privacy guarantees preserved

- No changes to current cash, savings, or private payment exposure
- Archive is household-scoped via existing RLS
- Pay & deduct cash and Mark paid behavior unchanged

## Remaining known limitations

- Delete debt account action remains on active rows (pre-existing); archive is the recommended path for preserving history
- Dashboard has no standalone active-debt summary card to filter; no formula changes were required
- Browser smoke archive confirm path depends on test data having at least one active debt account with archive button visible

## Next recommended task

**CASHFLOW-CURSOR-074**
