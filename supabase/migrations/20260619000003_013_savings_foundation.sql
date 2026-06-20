/*
  CASHFLOW-CURSOR-027 — savings schema and privacy foundation

  Idempotent migration: private/shared savings goals with per-user contribution privacy.
*/

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  name text not null,
  goal_type text not null,
  target_amount numeric(12, 2) not null,
  start_date date not null,
  end_date date not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint savings_goals_created_by_user_id_fkey
    foreign key (created_by_user_id) references auth.users(id) on delete cascade,
  constraint savings_goals_goal_type_check
    check (goal_type in ('private', 'shared')),
  constraint savings_goals_target_amount_non_negative
    check (target_amount >= 0),
  constraint savings_goals_date_range_check
    check (end_date >= start_date)
);

create table if not exists public.savings_goal_participants (
  id uuid primary key default gen_random_uuid(),
  savings_goal_id uuid not null,
  household_id uuid not null,
  user_id uuid not null,
  person_id uuid,
  target_contribution_amount numeric(12, 2) not null,
  contribution_period text not null,
  period_start date,
  period_end date,
  created_at timestamptz not null default now(),
  constraint savings_goal_participants_savings_goal_id_fkey
    foreign key (savings_goal_id) references public.savings_goals(id) on delete cascade,
  constraint savings_goal_participants_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint savings_goal_participants_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint savings_goal_participants_person_id_fkey
    foreign key (person_id) references public.people(id) on delete set null,
  constraint savings_goal_participants_target_contribution_amount_non_negative
    check (target_contribution_amount >= 0),
  constraint savings_goal_participants_contribution_period_check
    check (contribution_period in ('1_14', '15_eom', 'monthly'))
);

create table if not exists public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  savings_goal_id uuid not null,
  household_id uuid not null,
  user_id uuid not null,
  person_id uuid,
  amount numeric(12, 2) not null,
  contribution_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  constraint savings_contributions_savings_goal_id_fkey
    foreign key (savings_goal_id) references public.savings_goals(id) on delete cascade,
  constraint savings_contributions_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint savings_contributions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint savings_contributions_person_id_fkey
    foreign key (person_id) references public.people(id) on delete set null,
  constraint savings_contributions_amount_non_negative
    check (amount >= 0)
);

create unique index if not exists idx_savings_goal_participants_goal_user_unique
  on public.savings_goal_participants(savings_goal_id, user_id);

create index if not exists idx_savings_goals_household_goal_type
  on public.savings_goals(household_id, goal_type);

create index if not exists idx_savings_goal_participants_goal_user
  on public.savings_goal_participants(savings_goal_id, user_id);

create index if not exists idx_savings_goal_participants_household_user
  on public.savings_goal_participants(household_id, user_id);

create index if not exists idx_savings_contributions_goal_user_date
  on public.savings_contributions(savings_goal_id, user_id, contribution_date desc);

create index if not exists idx_savings_contributions_household_user_date
  on public.savings_contributions(household_id, user_id, contribution_date desc);

drop trigger if exists set_savings_goals_updated_at on public.savings_goals;
create trigger set_savings_goals_updated_at
before update on public.savings_goals
for each row
execute function public.set_updated_at();

alter table public.savings_goals enable row level security;
alter table public.savings_goal_participants enable row level security;
alter table public.savings_contributions enable row level security;

drop policy if exists "savings_goals_select_household_or_own_private" on public.savings_goals;
drop policy if exists "savings_goals_insert_own_household" on public.savings_goals;
drop policy if exists "savings_goals_update_creator" on public.savings_goals;
drop policy if exists "savings_goals_delete_creator" on public.savings_goals;

create policy "savings_goals_select_household_or_own_private"
on public.savings_goals
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and (
    goal_type = 'shared'
    or (
      goal_type = 'private'
      and created_by_user_id = (select auth.uid())
    )
  )
);

create policy "savings_goals_insert_own_household"
on public.savings_goals
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and created_by_user_id = (select auth.uid())
);

create policy "savings_goals_update_creator"
on public.savings_goals
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

create policy "savings_goals_delete_creator"
on public.savings_goals
for delete
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and created_by_user_id = (select auth.uid())
);

drop policy if exists "savings_goal_participants_select_own" on public.savings_goal_participants;
drop policy if exists "savings_goal_participants_insert_own" on public.savings_goal_participants;
drop policy if exists "savings_goal_participants_update_own" on public.savings_goal_participants;
drop policy if exists "savings_goal_participants_delete_own" on public.savings_goal_participants;

create policy "savings_goal_participants_select_own"
on public.savings_goal_participants
for select
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "savings_goal_participants_insert_own"
on public.savings_goal_participants
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "savings_goal_participants_update_own"
on public.savings_goal_participants
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

create policy "savings_goal_participants_delete_own"
on public.savings_goal_participants
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

drop policy if exists "savings_contributions_select_own" on public.savings_contributions;
drop policy if exists "savings_contributions_insert_own" on public.savings_contributions;
drop policy if exists "savings_contributions_update_own" on public.savings_contributions;
drop policy if exists "savings_contributions_delete_own" on public.savings_contributions;

create policy "savings_contributions_select_own"
on public.savings_contributions
for select
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "savings_contributions_insert_own"
on public.savings_contributions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);

create policy "savings_contributions_update_own"
on public.savings_contributions
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

create policy "savings_contributions_delete_own"
on public.savings_contributions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
);
