/*
  CASHFLOW-CURSOR-021 — user-to-person mapping foundation

  Idempotent migration: links auth users to household people via household_members.person_id.
*/

alter table public.household_members add column if not exists person_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_members_person_id_fkey'
      and conrelid = 'public.household_members'::regclass
  ) then
    alter table public.household_members
      add constraint household_members_person_id_fkey
      foreign key (person_id) references public.people(id) on delete set null;
  end if;
end $$;

create index if not exists idx_household_members_person_id
  on public.household_members(person_id);

create unique index if not exists idx_household_members_household_person_unique
  on public.household_members(household_id, person_id)
  where person_id is not null;
