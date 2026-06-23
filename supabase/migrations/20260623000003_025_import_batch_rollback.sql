/*
  CASHFLOW-CURSOR-100: Import batch rollback status and owner-only update policies.

  Extends batch status for rollback outcomes. Owner can update batch metadata after rollback.
  No spreadsheet contents stored. SELECT/INSERT policies unchanged.
*/

alter table public.import_batches
  drop constraint if exists import_batches_status_check;

alter table public.import_batches
  add constraint import_batches_status_check
  check (status in (
    'applied',
    'partial',
    'failed',
    'rolled_back',
    'rollback_partial',
    'rollback_failed'
  ));

drop policy if exists "import_batches_update_owner" on public.import_batches;
drop policy if exists "import_batch_records_update_owner" on public.import_batch_records;

create policy "import_batches_update_owner"
on public.import_batches
for update
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
)
with check (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
);

create policy "import_batch_records_update_owner"
on public.import_batch_records
for update
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
)
with check (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
);
