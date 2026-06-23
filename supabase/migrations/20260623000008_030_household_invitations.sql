/*
  CASHFLOW-CURSOR-107: Household invitations for owner-initiated second-user invites.

  Invitations are household-scoped and owner-managed. Invited emails do not gain
  household data access until membership acceptance (C108).
*/

create table if not exists public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role text not null default 'member'
    check (role in ('member')),
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'cancelled', 'expired')),
  invited_by uuid not null references auth.users(id),
  invited_user_id uuid null references auth.users(id),
  expires_at timestamptz null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_household_invitations_household_status
  on public.household_invitations(household_id, status, created_at desc);

create unique index if not exists idx_household_invitations_pending_email
  on public.household_invitations(household_id, lower(email))
  where status = 'invited';

create or replace function public.set_household_invitations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists household_invitations_set_updated_at on public.household_invitations;

create trigger household_invitations_set_updated_at
before update on public.household_invitations
for each row
execute function public.set_household_invitations_updated_at();

alter table public.household_invitations enable row level security;

drop policy if exists "household_invitations_select_owner" on public.household_invitations;
drop policy if exists "household_invitations_insert_owner" on public.household_invitations;
drop policy if exists "household_invitations_update_owner" on public.household_invitations;

create policy "household_invitations_select_owner"
on public.household_invitations
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
);

create policy "household_invitations_insert_owner"
on public.household_invitations
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and invited_by = (select auth.uid())
  and (select public.is_my_household_owner()) = true
);

create policy "household_invitations_update_owner"
on public.household_invitations
for update
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
)
with check (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
);
