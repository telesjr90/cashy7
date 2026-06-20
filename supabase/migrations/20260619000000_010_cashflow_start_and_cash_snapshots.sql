/*
  CASHFLOW-CURSOR-017 — household cashflow start date and private cash snapshots

  Idempotent migration: safe to run once on databases that already have the 009 baseline.
*/

create table if not exists public.household_settings (
  household_id uuid primary key,
  cashflow_start_date date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_settings_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint household_settings_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null
);

alter table public.household_settings add column if not exists cashflow_start_date date;
alter table public.household_settings add column if not exists created_by uuid;
alter table public.household_settings add column if not exists created_at timestamptz default now();
alter table public.household_settings add column if not exists updated_at timestamptz default now();
alter table public.household_settings alter column created_at set default now();
alter table public.household_settings alter column updated_at set default now();

create table if not exists public.cash_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null,
  amount numeric(12, 2) not null,
  snapshot_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  constraint cash_snapshots_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint cash_snapshots_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint cash_snapshots_amount_non_negative check (amount >= 0)
);

alter table public.cash_snapshots add column if not exists household_id uuid;
alter table public.cash_snapshots add column if not exists user_id uuid;
alter table public.cash_snapshots add column if not exists amount numeric(12, 2);
alter table public.cash_snapshots add column if not exists snapshot_date date default current_date;
alter table public.cash_snapshots add column if not exists notes text;
alter table public.cash_snapshots add column if not exists created_at timestamptz default now();
alter table public.cash_snapshots alter column id set default gen_random_uuid();
alter table public.cash_snapshots alter column snapshot_date set default current_date;
alter table public.cash_snapshots alter column created_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'household_settings_household_id_fkey'
      and conrelid = 'public.household_settings'::regclass
  ) then
    alter table public.household_settings
      add constraint household_settings_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'household_settings_created_by_fkey'
      and conrelid = 'public.household_settings'::regclass
  ) then
    alter table public.household_settings
      add constraint household_settings_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cash_snapshots_household_id_fkey'
      and conrelid = 'public.cash_snapshots'::regclass
  ) then
    alter table public.cash_snapshots
      add constraint cash_snapshots_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cash_snapshots_user_id_fkey'
      and conrelid = 'public.cash_snapshots'::regclass
  ) then
    alter table public.cash_snapshots
      add constraint cash_snapshots_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cash_snapshots_amount_non_negative'
      and conrelid = 'public.cash_snapshots'::regclass
  ) then
    alter table public.cash_snapshots
      add constraint cash_snapshots_amount_non_negative
      check (amount >= 0) not valid;
  end if;
end $$;

create or replace function public.set_household_settings_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.created_by is null then
    new.created_by = (select auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists set_household_settings_created_by on public.household_settings;
create trigger set_household_settings_created_by
before insert on public.household_settings
for each row
execute function public.set_household_settings_created_by();

drop trigger if exists set_household_settings_updated_at on public.household_settings;
create trigger set_household_settings_updated_at
before update on public.household_settings
for each row
execute function public.set_updated_at();

create index if not exists idx_household_settings_household
  on public.household_settings(household_id);

create index if not exists idx_cash_snapshots_household_user_snapshot
  on public.cash_snapshots(household_id, user_id, snapshot_date desc, created_at desc);

alter table public.household_settings enable row level security;
alter table public.cash_snapshots enable row level security;

drop policy if exists "household_settings_select_active_household" on public.household_settings;
drop policy if exists "household_settings_insert_active_household" on public.household_settings;
drop policy if exists "household_settings_update_active_household" on public.household_settings;

create policy "household_settings_select_active_household"
on public.household_settings
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "household_settings_insert_active_household"
on public.household_settings
for insert
to authenticated
with check (household_id = (select public.get_my_household_id()));

create policy "household_settings_update_active_household"
on public.household_settings
for update
to authenticated
using (household_id = (select public.get_my_household_id()))
with check (household_id = (select public.get_my_household_id()));

drop policy if exists "cash_snapshots_select_own" on public.cash_snapshots;
drop policy if exists "cash_snapshots_insert_own" on public.cash_snapshots;
drop policy if exists "cash_snapshots_update_own" on public.cash_snapshots;
drop policy if exists "cash_snapshots_delete_own" on public.cash_snapshots;

create policy "cash_snapshots_select_own"
on public.cash_snapshots
for select
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "cash_snapshots_insert_own"
on public.cash_snapshots
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "cash_snapshots_update_own"
on public.cash_snapshots
for update
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
)
with check (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "cash_snapshots_delete_own"
on public.cash_snapshots
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);
