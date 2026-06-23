/*
  CASHFLOW-CURSOR-098: Import batch tracking for confirmed spreadsheet writes.

  Stores batch metadata and created-record links only. No spreadsheet file contents.
  Owner-only apply; household members can read batch metadata for rollback (C100).
*/

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  source_file_name text not null,
  source_file_kind text not null,
  status text not null default 'applied'
    check (status in ('applied', 'partial', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.import_batch_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_sheet_name text,
  source_row_number integer,
  row_type text not null,
  target_table text not null,
  target_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_batches_household_created
  on public.import_batches(household_id, created_at desc);

create index if not exists idx_import_batch_records_batch
  on public.import_batch_records(import_batch_id);

create index if not exists idx_import_batch_records_household
  on public.import_batch_records(household_id);

alter table public.import_batches enable row level security;
alter table public.import_batch_records enable row level security;

drop policy if exists "import_batches_select_household" on public.import_batches;
drop policy if exists "import_batches_insert_owner" on public.import_batches;
drop policy if exists "import_batch_records_select_household" on public.import_batch_records;
drop policy if exists "import_batch_records_insert_owner" on public.import_batch_records;

create policy "import_batches_select_household"
on public.import_batches
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "import_batches_insert_owner"
on public.import_batches
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
  and (select public.is_my_household_owner()) = true
);

create policy "import_batch_records_select_household"
on public.import_batch_records
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "import_batch_records_insert_owner"
on public.import_batch_records
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
);
