/*
  Idempotent migration: private per-user paycheck schedule for forecast income.
  RLS mirrors cash_snapshots — users can only read/write their own row.
*/

create table if not exists public.paycheck_schedules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null,
  amount numeric not null default 0,
  schedule_type text not null default 'disabled',
  first_pay_day integer,
  second_pay_day integer,
  use_last_business_day boolean not null default false,
  is_active boolean not null default true,
  effective_from date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paycheck_schedules_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint paycheck_schedules_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint paycheck_schedules_user_id_unique unique (user_id),
  constraint paycheck_schedules_amount_non_negative check (amount >= 0),
  constraint paycheck_schedules_schedule_type_check check (
    schedule_type in (
      'disabled',
      'semi_monthly_15_30',
      'semi_monthly_15_last_business_day'
    )
  )
);

create index if not exists idx_paycheck_schedules_household
  on public.paycheck_schedules(household_id);

create index if not exists idx_paycheck_schedules_user
  on public.paycheck_schedules(user_id);

alter table public.paycheck_schedules enable row level security;

drop policy if exists "paycheck_schedules_select_own" on public.paycheck_schedules;
drop policy if exists "paycheck_schedules_insert_own" on public.paycheck_schedules;
drop policy if exists "paycheck_schedules_update_own" on public.paycheck_schedules;
drop policy if exists "paycheck_schedules_delete_own" on public.paycheck_schedules;

create policy "paycheck_schedules_select_own"
on public.paycheck_schedules
for select
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "paycheck_schedules_insert_own"
on public.paycheck_schedules
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "paycheck_schedules_update_own"
on public.paycheck_schedules
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

create policy "paycheck_schedules_delete_own"
on public.paycheck_schedules
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);
