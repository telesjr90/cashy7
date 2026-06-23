/*
  CASHFLOW-CURSOR-103: Pending receipt candidate persistence.

  Stores extracted receipt data as uploader-private draft candidates.
  No manual expense, cash mutation, or household sharing in this migration.
*/

create table if not exists public.receipt_candidates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  receipt_upload_id uuid not null references public.receipt_uploads(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'dismissed')),
  merchant text null,
  transaction_date date null,
  total_amount numeric null,
  tax_amount numeric null,
  category text null,
  line_items jsonb not null default '[]'::jsonb,
  confidence numeric null,
  field_confidence jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}'::text[],
  source_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_candidates_confidence_range
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create unique index if not exists idx_receipt_candidates_one_pending_per_upload
  on public.receipt_candidates(receipt_upload_id)
  where status = 'pending';

create index if not exists idx_receipt_candidates_uploader_created
  on public.receipt_candidates(created_by, created_at desc);

create index if not exists idx_receipt_candidates_household
  on public.receipt_candidates(household_id);

drop trigger if exists set_receipt_candidates_updated_at on public.receipt_candidates;
create trigger set_receipt_candidates_updated_at
before update on public.receipt_candidates
for each row
execute function public.set_updated_at();

alter table public.receipt_candidates enable row level security;

drop policy if exists "receipt_candidates_select_own" on public.receipt_candidates;
drop policy if exists "receipt_candidates_insert_own" on public.receipt_candidates;
drop policy if exists "receipt_candidates_update_own" on public.receipt_candidates;
drop policy if exists "receipt_candidates_delete_own" on public.receipt_candidates;

create policy "receipt_candidates_select_own"
on public.receipt_candidates
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
);

create policy "receipt_candidates_insert_own"
on public.receipt_candidates
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.receipt_uploads ru
    where ru.id = receipt_upload_id
      and ru.uploaded_by = (select auth.uid())
      and ru.household_id = (select public.get_my_household_id())
  )
);

create policy "receipt_candidates_update_own"
on public.receipt_candidates
for update
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
  and status in ('pending', 'dismissed')
)
with check (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
  and status in ('pending', 'dismissed')
);

create policy "receipt_candidates_delete_own"
on public.receipt_candidates
for delete
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and created_by = (select auth.uid())
  and status in ('pending', 'dismissed')
);
