/*
  CASHFLOW-001 baseline/repair contract

  This migration is intentionally idempotent so it can repair a partial
  Bolt-created database while preserving the frontend's current schema usage.
*/

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid default auth.uid(),
  owner_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint households_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  constraint households_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete set null
);

alter table public.households add column if not exists name text;
alter table public.households add column if not exists created_by uuid default auth.uid();
alter table public.households add column if not exists owner_id uuid default auth.uid();
alter table public.households add column if not exists created_at timestamptz default now();
alter table public.households alter column id set default gen_random_uuid();
alter table public.households alter column created_by set default auth.uid();
alter table public.households alter column owner_id set default auth.uid();
alter table public.households alter column created_at set default now();

update public.households
set created_by = owner_id
where created_by is null and owner_id is not null;

update public.households
set owner_id = created_by
where owner_id is null and created_by is not null;

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null,
  email text,
  display_name text,
  role text not null default 'member',
  status text not null default 'active',
  is_owner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint household_members_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint household_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint household_members_role_check check (role in ('owner', 'member')),
  constraint household_members_status_check check (status in ('active', 'invited'))
);

alter table public.household_members add column if not exists household_id uuid;
alter table public.household_members add column if not exists user_id uuid;
alter table public.household_members add column if not exists email text;
alter table public.household_members add column if not exists display_name text;
alter table public.household_members add column if not exists role text default 'member';
alter table public.household_members add column if not exists status text default 'active';
alter table public.household_members add column if not exists is_owner boolean default false;
alter table public.household_members add column if not exists is_active boolean default true;
alter table public.household_members add column if not exists created_at timestamptz default now();
alter table public.household_members alter column id set default gen_random_uuid();
alter table public.household_members alter column role set default 'member';
alter table public.household_members alter column status set default 'active';
alter table public.household_members alter column is_owner set default false;
alter table public.household_members alter column is_active set default true;
alter table public.household_members alter column created_at set default now();

update public.household_members
set role = case when coalesce(is_owner, false) then 'owner' else 'member' end
where role is null;

update public.household_members
set status = case when coalesce(is_active, true) then 'active' else 'invited' end
where status is null;

update public.household_members
set is_owner = (role = 'owner')
where is_owner is null;

update public.household_members
set is_active = (status = 'active')
where is_active is null;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  name text not null,
  paycheck_amount numeric not null default 0,
  pay_schedule_description text,
  pay_schedule text not null default '',
  color text,
  created_at timestamptz not null default now(),
  constraint people_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade
);

alter table public.people add column if not exists household_id uuid;
alter table public.people add column if not exists name text;
alter table public.people add column if not exists paycheck_amount numeric default 0;
alter table public.people add column if not exists pay_schedule_description text;
alter table public.people add column if not exists pay_schedule text default '';
alter table public.people add column if not exists color text;
alter table public.people add column if not exists created_at timestamptz default now();
alter table public.people alter column id set default gen_random_uuid();
alter table public.people alter column paycheck_amount set default 0;
alter table public.people alter column pay_schedule set default '';
alter table public.people alter column created_at set default now();

update public.people
set pay_schedule_description = pay_schedule
where pay_schedule_description is null and nullif(pay_schedule, '') is not null;

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  name text not null,
  category text not null default 'other',
  default_amount numeric,
  due_day text,
  period_bucket text not null default '1_14',
  recurring boolean not null default true,
  active_from date not null default current_date,
  active_until date,
  notes text,
  is_variable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint bills_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint bills_period_bucket_check check (period_bucket in ('1_14', '15_eom'))
);

alter table public.bills add column if not exists household_id uuid;
alter table public.bills add column if not exists name text;
alter table public.bills add column if not exists category text default 'other';
alter table public.bills add column if not exists default_amount numeric;
alter table public.bills add column if not exists due_day text;
alter table public.bills add column if not exists period_bucket text default '1_14';
alter table public.bills add column if not exists recurring boolean default true;
alter table public.bills add column if not exists active_from date default current_date;
alter table public.bills add column if not exists active_until date;
alter table public.bills add column if not exists notes text;
alter table public.bills add column if not exists is_variable boolean default false;
alter table public.bills add column if not exists is_active boolean default true;
alter table public.bills add column if not exists created_at timestamptz default now();
alter table public.bills alter column id set default gen_random_uuid();
alter table public.bills alter column category set default 'other';
alter table public.bills alter column period_bucket set default '1_14';
alter table public.bills alter column recurring set default true;
alter table public.bills alter column active_from set default current_date;
alter table public.bills alter column is_variable set default false;
alter table public.bills alter column is_active set default true;
alter table public.bills alter column created_at set default now();

create table if not exists public.bill_instances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  bill_id uuid,
  year integer not null,
  month integer not null,
  period_bucket text not null,
  name text not null,
  amount numeric not null default 0,
  teles_amount numeric not null default 0,
  nicole_amount numeric not null default 0,
  due_date date,
  is_paid boolean not null default false,
  paid_status text not null default 'unpaid',
  paid_at timestamptz,
  paid_by_user_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint bill_instances_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint bill_instances_bill_id_fkey foreign key (bill_id) references public.bills(id) on delete set null,
  constraint bill_instances_paid_by_user_id_fkey foreign key (paid_by_user_id) references auth.users(id) on delete set null,
  constraint bill_instances_period_bucket_check check (period_bucket in ('1_14', '15_eom')),
  constraint bill_instances_paid_status_check check (paid_status in ('unpaid', 'paid'))
);

alter table public.bill_instances add column if not exists household_id uuid;
alter table public.bill_instances add column if not exists bill_id uuid;
alter table public.bill_instances add column if not exists year integer;
alter table public.bill_instances add column if not exists month integer;
alter table public.bill_instances add column if not exists period_bucket text;
alter table public.bill_instances add column if not exists name text;
alter table public.bill_instances add column if not exists amount numeric default 0;
alter table public.bill_instances add column if not exists teles_amount numeric default 0;
alter table public.bill_instances add column if not exists nicole_amount numeric default 0;
alter table public.bill_instances add column if not exists due_date date;
alter table public.bill_instances add column if not exists is_paid boolean default false;
alter table public.bill_instances add column if not exists paid_status text default 'unpaid';
alter table public.bill_instances add column if not exists paid_at timestamptz;
alter table public.bill_instances add column if not exists paid_by_user_id uuid;
alter table public.bill_instances add column if not exists notes text;
alter table public.bill_instances add column if not exists created_at timestamptz default now();
alter table public.bill_instances add column if not exists updated_at timestamptz default now();
alter table public.bill_instances alter column id set default gen_random_uuid();
alter table public.bill_instances alter column amount set default 0;
alter table public.bill_instances alter column teles_amount set default 0;
alter table public.bill_instances alter column nicole_amount set default 0;
alter table public.bill_instances alter column is_paid set default false;
alter table public.bill_instances alter column paid_status set default 'unpaid';
alter table public.bill_instances alter column created_at set default now();
alter table public.bill_instances alter column updated_at set default now();

update public.bill_instances
set paid_status = case when coalesce(is_paid, false) then 'paid' else 'unpaid' end
where paid_status is null;

create table if not exists public.debt_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  name text not null,
  original_amount numeric not null default 0,
  current_balance numeric not null default 0,
  target_payoff_date date,
  notes text,
  created_at timestamptz not null default now(),
  constraint debt_accounts_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade
);

alter table public.debt_accounts add column if not exists household_id uuid;
alter table public.debt_accounts add column if not exists name text;
alter table public.debt_accounts add column if not exists original_amount numeric default 0;
alter table public.debt_accounts add column if not exists current_balance numeric default 0;
alter table public.debt_accounts add column if not exists target_payoff_date date;
alter table public.debt_accounts add column if not exists notes text;
alter table public.debt_accounts add column if not exists created_at timestamptz default now();
alter table public.debt_accounts alter column id set default gen_random_uuid();
alter table public.debt_accounts alter column original_amount set default 0;
alter table public.debt_accounts alter column current_balance set default 0;
alter table public.debt_accounts alter column created_at set default now();

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  debt_account_id uuid not null,
  payment_date date not null,
  month integer not null,
  year integer not null,
  period_bucket text not null default '1_14',
  total_payment numeric not null default 0,
  teles_amount numeric not null default 0,
  nicole_amount numeric not null default 0,
  remaining_balance_after_payment numeric,
  paid_status boolean not null default false,
  linked_bill_instance_id uuid,
  created_at timestamptz not null default now(),
  constraint debt_payments_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint debt_payments_debt_account_id_fkey foreign key (debt_account_id) references public.debt_accounts(id) on delete cascade,
  constraint debt_payments_linked_bill_instance_id_fkey foreign key (linked_bill_instance_id) references public.bill_instances(id) on delete set null,
  constraint debt_payments_period_bucket_check check (period_bucket = '1_14')
);

alter table public.debt_payments add column if not exists household_id uuid;
alter table public.debt_payments add column if not exists debt_account_id uuid;
alter table public.debt_payments add column if not exists payment_date date;
alter table public.debt_payments add column if not exists month integer;
alter table public.debt_payments add column if not exists year integer;
alter table public.debt_payments add column if not exists period_bucket text default '1_14';
alter table public.debt_payments add column if not exists total_payment numeric default 0;
alter table public.debt_payments add column if not exists teles_amount numeric default 0;
alter table public.debt_payments add column if not exists nicole_amount numeric default 0;
alter table public.debt_payments add column if not exists remaining_balance_after_payment numeric;
alter table public.debt_payments add column if not exists paid_status boolean default false;
alter table public.debt_payments add column if not exists linked_bill_instance_id uuid;
alter table public.debt_payments add column if not exists created_at timestamptz default now();
alter table public.debt_payments alter column id set default gen_random_uuid();
alter table public.debt_payments alter column period_bucket set default '1_14';
alter table public.debt_payments alter column total_payment set default 0;
alter table public.debt_payments alter column teles_amount set default 0;
alter table public.debt_payments alter column nicole_amount set default 0;
alter table public.debt_payments alter column paid_status set default false;
alter table public.debt_payments alter column created_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'households_created_by_fkey'
      and conrelid = 'public.households'::regclass
  ) then
    alter table public.households
      add constraint households_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'households_owner_id_fkey'
      and conrelid = 'public.households'::regclass
  ) then
    alter table public.households
      add constraint households_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'household_members_household_id_fkey'
      and conrelid = 'public.household_members'::regclass
  ) then
    alter table public.household_members
      add constraint household_members_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'household_members_user_id_fkey'
      and conrelid = 'public.household_members'::regclass
  ) then
    alter table public.household_members
      add constraint household_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'household_members_role_check'
      and conrelid = 'public.household_members'::regclass
  ) then
    alter table public.household_members
      add constraint household_members_role_check
      check (role in ('owner', 'member')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'household_members_status_check'
      and conrelid = 'public.household_members'::regclass
  ) then
    alter table public.household_members
      add constraint household_members_status_check
      check (status in ('active', 'invited')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'people_household_id_fkey'
      and conrelid = 'public.people'::regclass
  ) then
    alter table public.people
      add constraint people_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bills_household_id_fkey'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bills_period_bucket_check'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_period_bucket_check
      check (period_bucket in ('1_14', '15_eom')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bill_instances_household_id_fkey'
      and conrelid = 'public.bill_instances'::regclass
  ) then
    alter table public.bill_instances
      add constraint bill_instances_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bill_instances_bill_id_fkey'
      and conrelid = 'public.bill_instances'::regclass
  ) then
    alter table public.bill_instances
      add constraint bill_instances_bill_id_fkey
      foreign key (bill_id) references public.bills(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bill_instances_paid_by_user_id_fkey'
      and conrelid = 'public.bill_instances'::regclass
  ) then
    alter table public.bill_instances
      add constraint bill_instances_paid_by_user_id_fkey
      foreign key (paid_by_user_id) references auth.users(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bill_instances_period_bucket_check'
      and conrelid = 'public.bill_instances'::regclass
  ) then
    alter table public.bill_instances
      add constraint bill_instances_period_bucket_check
      check (period_bucket in ('1_14', '15_eom')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bill_instances_paid_status_check'
      and conrelid = 'public.bill_instances'::regclass
  ) then
    alter table public.bill_instances
      add constraint bill_instances_paid_status_check
      check (paid_status in ('unpaid', 'paid')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_accounts_household_id_fkey'
      and conrelid = 'public.debt_accounts'::regclass
  ) then
    alter table public.debt_accounts
      add constraint debt_accounts_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_payments_household_id_fkey'
      and conrelid = 'public.debt_payments'::regclass
  ) then
    alter table public.debt_payments
      add constraint debt_payments_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_payments_debt_account_id_fkey'
      and conrelid = 'public.debt_payments'::regclass
  ) then
    alter table public.debt_payments
      add constraint debt_payments_debt_account_id_fkey
      foreign key (debt_account_id) references public.debt_accounts(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_payments_linked_bill_instance_id_fkey'
      and conrelid = 'public.debt_payments'::regclass
  ) then
    alter table public.debt_payments
      add constraint debt_payments_linked_bill_instance_id_fkey
      foreign key (linked_bill_instance_id) references public.bill_instances(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'debt_payments_period_bucket_check'
      and conrelid = 'public.debt_payments'::regclass
  ) then
    alter table public.debt_payments
      add constraint debt_payments_period_bucket_check
      check (period_bucket = '1_14') not valid;
  end if;
end $$;

create or replace function public.get_my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hm.household_id
  from public.household_members hm
  where hm.user_id = (select auth.uid())
    and coalesce(hm.is_active, true) = true
    and coalesce(hm.status, 'active') = 'active'
  order by hm.created_at asc
  limit 1
$$;

revoke all on function public.get_my_household_id() from public;
grant execute on function public.get_my_household_id() to authenticated;
grant execute on function public.get_my_household_id() to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bill_instances_updated_at on public.bill_instances;
create trigger set_bill_instances_updated_at
before update on public.bill_instances
for each row
execute function public.set_updated_at();

create index if not exists idx_households_created_by on public.households(created_by);
create index if not exists idx_households_owner_id on public.households(owner_id);
create index if not exists idx_household_members_user_active on public.household_members(user_id, is_active, status);
create index if not exists idx_household_members_household on public.household_members(household_id);
create index if not exists idx_people_household on public.people(household_id);
create index if not exists idx_bills_household on public.bills(household_id);
create index if not exists idx_bills_active_period on public.bills(household_id, is_active, period_bucket);
create index if not exists idx_bill_instances_period on public.bill_instances(household_id, year, month, period_bucket);
create index if not exists idx_bill_instances_bill_id on public.bill_instances(bill_id);
create index if not exists idx_debt_accounts_household on public.debt_accounts(household_id);
create index if not exists idx_debt_payments_household on public.debt_payments(household_id);
create index if not exists idx_debt_payments_debt_account on public.debt_payments(debt_account_id);
create index if not exists idx_debt_payments_linked_bill_instance on public.debt_payments(linked_bill_instance_id);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.people enable row level security;
alter table public.bills enable row level security;
alter table public.bill_instances enable row level security;
alter table public.debt_accounts enable row level security;
alter table public.debt_payments enable row level security;

drop policy if exists "select_household_membership" on public.households;
drop policy if exists "insert_household_owner" on public.households;
drop policy if exists "update_household_owner" on public.households;
drop policy if exists "delete_household_owner" on public.households;
drop policy if exists "households_select_active_member" on public.households;
drop policy if exists "households_insert_self_owned" on public.households;
drop policy if exists "households_update_active_member" on public.households;
drop policy if exists "households_delete_active_member" on public.households;

create policy "households_select_active_member"
on public.households
for select
to authenticated
using (
  id = (select public.get_my_household_id())
  or owner_id = (select auth.uid())
  or created_by = (select auth.uid())
);

create policy "households_insert_self_owned"
on public.households
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  or created_by = (select auth.uid())
);

create policy "households_update_active_member"
on public.households
for update
to authenticated
using (
  id = (select public.get_my_household_id())
  or owner_id = (select auth.uid())
  or created_by = (select auth.uid())
)
with check (
  id = (select public.get_my_household_id())
  or owner_id = (select auth.uid())
  or created_by = (select auth.uid())
);

create policy "households_delete_active_member"
on public.households
for delete
to authenticated
using (
  id = (select public.get_my_household_id())
  or owner_id = (select auth.uid())
  or created_by = (select auth.uid())
);

drop policy if exists "household_members_select_active_household" on public.household_members;
drop policy if exists "household_members_insert_active_household" on public.household_members;
drop policy if exists "household_members_update_active_household" on public.household_members;
drop policy if exists "household_members_delete_active_household" on public.household_members;

create policy "household_members_select_active_household"
on public.household_members
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  or user_id = (select auth.uid())
);

create policy "household_members_insert_active_household"
on public.household_members
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  or (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.households h
      where h.id = household_members.household_id
        and (
          h.owner_id = (select auth.uid())
          or h.created_by = (select auth.uid())
        )
    )
  )
);

create policy "household_members_update_active_household"
on public.household_members
for update
to authenticated
using (household_id = (select public.get_my_household_id()))
with check (household_id = (select public.get_my_household_id()));

create policy "household_members_delete_active_household"
on public.household_members
for delete
to authenticated
using (household_id = (select public.get_my_household_id()));

drop policy if exists "select_people_membership" on public.people;
drop policy if exists "insert_people_membership" on public.people;
drop policy if exists "update_people_membership" on public.people;
drop policy if exists "delete_people_membership" on public.people;
drop policy if exists "people_select_active_household" on public.people;
drop policy if exists "people_insert_active_household" on public.people;
drop policy if exists "people_update_active_household" on public.people;
drop policy if exists "people_delete_active_household" on public.people;

create policy "people_select_active_household"
on public.people
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "people_insert_active_household"
on public.people
for insert
to authenticated
with check (household_id = (select public.get_my_household_id()));

create policy "people_update_active_household"
on public.people
for update
to authenticated
using (household_id = (select public.get_my_household_id()))
with check (household_id = (select public.get_my_household_id()));

create policy "people_delete_active_household"
on public.people
for delete
to authenticated
using (household_id = (select public.get_my_household_id()));

drop policy if exists "select_bills_membership" on public.bills;
drop policy if exists "insert_bills_membership" on public.bills;
drop policy if exists "update_bills_membership" on public.bills;
drop policy if exists "delete_bills_membership" on public.bills;
drop policy if exists "bills_select_active_household" on public.bills;
drop policy if exists "bills_insert_active_household" on public.bills;
drop policy if exists "bills_update_active_household" on public.bills;
drop policy if exists "bills_delete_active_household" on public.bills;

create policy "bills_select_active_household"
on public.bills
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "bills_insert_active_household"
on public.bills
for insert
to authenticated
with check (household_id = (select public.get_my_household_id()));

create policy "bills_update_active_household"
on public.bills
for update
to authenticated
using (household_id = (select public.get_my_household_id()))
with check (household_id = (select public.get_my_household_id()));

create policy "bills_delete_active_household"
on public.bills
for delete
to authenticated
using (household_id = (select public.get_my_household_id()));

drop policy if exists "select_bill_instances_membership" on public.bill_instances;
drop policy if exists "insert_bill_instances_membership" on public.bill_instances;
drop policy if exists "update_bill_instances_membership" on public.bill_instances;
drop policy if exists "delete_bill_instances_membership" on public.bill_instances;
drop policy if exists "bill_instances_select_active_household" on public.bill_instances;
drop policy if exists "bill_instances_insert_active_household" on public.bill_instances;
drop policy if exists "bill_instances_update_active_household" on public.bill_instances;
drop policy if exists "bill_instances_delete_active_household" on public.bill_instances;

create policy "bill_instances_select_active_household"
on public.bill_instances
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "bill_instances_insert_active_household"
on public.bill_instances
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and (
    bill_id is null
    or exists (
      select 1
      from public.bills b
      where b.id = bill_instances.bill_id
        and b.household_id = bill_instances.household_id
    )
  )
);

create policy "bill_instances_update_active_household"
on public.bill_instances
for update
to authenticated
using (household_id = (select public.get_my_household_id()))
with check (
  household_id = (select public.get_my_household_id())
  and (
    bill_id is null
    or exists (
      select 1
      from public.bills b
      where b.id = bill_instances.bill_id
        and b.household_id = bill_instances.household_id
    )
  )
);

create policy "bill_instances_delete_active_household"
on public.bill_instances
for delete
to authenticated
using (household_id = (select public.get_my_household_id()));

drop policy if exists "select_debt_accounts" on public.debt_accounts;
drop policy if exists "insert_debt_accounts" on public.debt_accounts;
drop policy if exists "update_debt_accounts" on public.debt_accounts;
drop policy if exists "delete_debt_accounts" on public.debt_accounts;
drop policy if exists "debt_accounts_select_active_household" on public.debt_accounts;
drop policy if exists "debt_accounts_insert_active_household" on public.debt_accounts;
drop policy if exists "debt_accounts_update_active_household" on public.debt_accounts;
drop policy if exists "debt_accounts_delete_active_household" on public.debt_accounts;

create policy "debt_accounts_select_active_household"
on public.debt_accounts
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "debt_accounts_insert_active_household"
on public.debt_accounts
for insert
to authenticated
with check (household_id = (select public.get_my_household_id()));

create policy "debt_accounts_update_active_household"
on public.debt_accounts
for update
to authenticated
using (household_id = (select public.get_my_household_id()))
with check (household_id = (select public.get_my_household_id()));

create policy "debt_accounts_delete_active_household"
on public.debt_accounts
for delete
to authenticated
using (household_id = (select public.get_my_household_id()));

drop policy if exists "select_debt_payments" on public.debt_payments;
drop policy if exists "insert_debt_payments" on public.debt_payments;
drop policy if exists "update_debt_payments" on public.debt_payments;
drop policy if exists "delete_debt_payments" on public.debt_payments;
drop policy if exists "debt_payments_select_active_household" on public.debt_payments;
drop policy if exists "debt_payments_insert_active_household" on public.debt_payments;
drop policy if exists "debt_payments_update_active_household" on public.debt_payments;
drop policy if exists "debt_payments_delete_active_household" on public.debt_payments;

create policy "debt_payments_select_active_household"
on public.debt_payments
for select
to authenticated
using (household_id = (select public.get_my_household_id()));

create policy "debt_payments_insert_active_household"
on public.debt_payments
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and period_bucket = '1_14'
  and exists (
    select 1
    from public.debt_accounts da
    where da.id = debt_payments.debt_account_id
      and da.household_id = debt_payments.household_id
  )
  and (
    linked_bill_instance_id is null
    or exists (
      select 1
      from public.bill_instances bi
      where bi.id = debt_payments.linked_bill_instance_id
        and bi.household_id = debt_payments.household_id
    )
  )
);

create policy "debt_payments_update_active_household"
on public.debt_payments
for update
to authenticated
using (household_id = (select public.get_my_household_id()))
with check (
  household_id = (select public.get_my_household_id())
  and period_bucket = '1_14'
  and exists (
    select 1
    from public.debt_accounts da
    where da.id = debt_payments.debt_account_id
      and da.household_id = debt_payments.household_id
  )
  and (
    linked_bill_instance_id is null
    or exists (
      select 1
      from public.bill_instances bi
      where bi.id = debt_payments.linked_bill_instance_id
        and bi.household_id = debt_payments.household_id
    )
  )
);

create policy "debt_payments_delete_active_household"
on public.debt_payments
for delete
to authenticated
using (household_id = (select public.get_my_household_id()));
