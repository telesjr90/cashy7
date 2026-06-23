/*
  CASHFLOW-CURSOR-111: Active-member-only person profile uniqueness

  Replaces household-wide person_id uniqueness so removed/invited members do not
  reserve Teles/Nicole profiles for active members.
*/

drop index if exists public.idx_household_members_household_person_unique;

create unique index if not exists idx_household_members_active_person_unique
  on public.household_members(household_id, person_id)
  where person_id is not null
    and status = 'active'
    and is_active = true;
