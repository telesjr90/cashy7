/*
  CASHFLOW-CURSOR-036 — manual expenses schema and privacy foundation

  Idempotent migration: private/shared manual expenses with household-scoped RLS.
*/

create table if not exists public.manual_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  created_by_user_id uuid not null,
  person_id uuid,
  expense_scope text not null,
  description text not null,
  category text,
  amount numeric(12, 2) not null,
  expense_date date not null default current_date,
  period_bucket text not null,
  split_type text not null default 'personal',
  teles_amount numeric(12, 2) not null default 0,
  nicole_amount numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_expenses_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint manual_expenses_created_by_user_id_fkey
    foreign key (created_by_user_id) references auth.users(id) on delete cascade,
  constraint manual_expenses_person_id_fkey
    foreign key (person_id) references public.people(id) on delete set null,
  constraint manual_expenses_expense_scope_check
    check (expense_scope in ('private', 'shared')),
  constraint manual_expenses_amount_non_negative
    check (amount >= 0),
  constraint manual_expenses_period_bucket_check
    check (period_bucket in ('1_14', '15_eom')),
  constraint manual_expenses_split_type_check
    check (split_type in ('personal', 'equal', '51_49', 'custom')),
  constraint manual_expenses_teles_amount_non_negative
    check (teles_amount >= 0),
  constraint manual_expenses_nicole_amount_non_negative
    check (nicole_amount >= 0)
);

create index if not exists idx_manual_expenses_household_expense_date
  on public.manual_expenses(household_id, expense_date desc);

create index if not exists idx_manual_expenses_household_period_expense_date
  on public.manual_expenses(household_id, period_bucket, expense_date desc);

create index if not exists idx_manual_expenses_created_by_expense_date
  on public.manual_expenses(created_by_user_id, expense_date desc);

create index if not exists idx_manual_expenses_person_expense_date
  on public.manual_expenses(person_id, expense_date desc);

drop trigger if exists set_manual_expenses_updated_at on public.manual_expenses;
create trigger set_manual_expenses_updated_at
before update on public.manual_expenses
for each row
execute function public.set_updated_at();

alter table public.manual_expenses enable row level security;

drop policy if exists "manual_expenses_select_household_or_own_private" on public.manual_expenses;
drop policy if exists "manual_expenses_insert_own_household" on public.manual_expenses;
drop policy if exists "manual_expenses_update_creator" on public.manual_expenses;
drop policy if exists "manual_expenses_delete_creator" on public.manual_expenses;

create policy "manual_expenses_select_household_or_own_private"
on public.manual_expenses
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and (
    expense_scope = 'shared'
    or (
      expense_scope = 'private'
      and created_by_user_id = (select auth.uid())
    )
  )
);

create policy "manual_expenses_insert_own_household"
on public.manual_expenses
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and created_by_user_id = (select auth.uid())
);

create policy "manual_expenses_update_creator"
on public.manual_expenses
for update
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and created_by_user_id = (select auth.uid())
)
with check (
  household_id = (select public.get_my_household_id())
  and created_by_user_id = (select auth.uid())
);

create policy "manual_expenses_delete_creator"
on public.manual_expenses
for delete
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and created_by_user_id = (select auth.uid())
);
