/*
  CASHFLOW-CURSOR-105: Receipt candidate approval audit fields.

  Adds approved status, approval metadata, and manual expense link on
  receipt_candidates. Keeps candidate/receipt rows uploader-private.
*/

alter table public.receipt_candidates
  drop constraint if exists receipt_candidates_status_check;

alter table public.receipt_candidates
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by uuid null references auth.users(id),
  add column if not exists linked_manual_expense_id uuid null
    references public.manual_expenses(id) on delete set null;

alter table public.receipt_candidates
  add constraint receipt_candidates_status_check
    check (status in ('pending', 'dismissed', 'approved'));

create index if not exists idx_receipt_candidates_linked_manual_expense
  on public.receipt_candidates(linked_manual_expense_id)
  where linked_manual_expense_id is not null;

drop policy if exists "receipt_candidates_update_own" on public.receipt_candidates;

create policy "receipt_candidates_update_own"
on public.receipt_candidates
for update
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
  and status = 'pending'
)
with check (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
  and status in ('pending', 'approved')
);
