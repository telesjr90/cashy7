/*
  CASHFLOW-CURSOR-109: Soft-remove household members with audit fields.

  Invitations already support cancelled status (C107). This migration adds removed
  membership state without hard-deleting rows or weakening RLS.
*/

alter table public.household_members
  add column if not exists removed_at timestamptz null,
  add column if not exists removed_by uuid null references auth.users(id);

alter table public.household_members
  drop constraint if exists household_members_status_check;

alter table public.household_members
  add constraint household_members_status_check
  check (status in ('active', 'invited', 'removed'));

create index if not exists idx_household_members_household_status_active
  on public.household_members(household_id, status, is_active);
