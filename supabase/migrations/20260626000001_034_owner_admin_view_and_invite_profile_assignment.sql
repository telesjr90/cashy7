/*
  CASHFLOW-OWNER-001 — Owner admin view + invite profile assignment

  Two related, additive changes:

  Part A — Invite profile assignment
    Adds household_invitations.assigned_person_id so an owner can reserve a
    specific household profile (e.g. Nicole) when inviting a user. The profile
    must belong to the same household. Acceptance uses this profile.

  Part B — Owner admin read access (read-only)
    Adds a SECURITY DEFINER helper and additive SELECT policies so an ACTIVE
    household OWNER can read the private rows of ACTIVE members in the SAME
    household. INSERT/UPDATE/DELETE remain own-user only — owners never gain
    write access to another user's private rows. Cross-household access stays
    denied (helper requires the row household to equal the caller's household).
    Receipt storage object bytes remain uploader-only (no storage.objects change);
    only receipt metadata rows become owner-readable.

  Idempotent: safe to run once on databases already at the 033 baseline.
*/

-- ---------------------------------------------------------------------------
-- Part A — household_invitations.assigned_person_id
-- ---------------------------------------------------------------------------

alter table public.household_invitations
  add column if not exists assigned_person_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'household_invitations_assigned_person_id_fkey'
      and conrelid = 'public.household_invitations'::regclass
  ) then
    alter table public.household_invitations
      add constraint household_invitations_assigned_person_id_fkey
      foreign key (assigned_person_id)
      references public.people(id) on delete set null;
  end if;
end $$;

-- Reserve an assigned profile only while an invite is still pending.
create index if not exists idx_household_invitations_pending_assigned_person
  on public.household_invitations(household_id, assigned_person_id)
  where status = 'invited' and assigned_person_id is not null;

-- ---------------------------------------------------------------------------
-- Part B — owner admin read helper
-- ---------------------------------------------------------------------------

-- Returns true when the CURRENT user is the active owner of p_row_household_id
-- AND the row's owning user (p_row_user_id) is an active member of that same
-- household. Used only for additive owner-read SELECT policies.
create or replace function public.is_household_admin_viewer(
  p_row_user_id uuid,
  p_row_household_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_row_household_id is not null
    and p_row_household_id = (select public.get_my_household_id())
    and (select public.is_my_household_owner()) = true
    and exists (
      select 1
      from public.household_members hm
      where hm.user_id = p_row_user_id
        and hm.household_id = p_row_household_id
        and coalesce(hm.is_active, true) = true
        and coalesce(hm.status, 'active') = 'active'
    )
$$;

revoke all on function public.is_household_admin_viewer(uuid, uuid) from public;
grant execute on function public.is_household_admin_viewer(uuid, uuid) to authenticated;
grant execute on function public.is_household_admin_viewer(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Part B — additive owner-read SELECT policies (read-only)
-- ---------------------------------------------------------------------------

drop policy if exists "cash_snapshots_select_owner_admin" on public.cash_snapshots;
create policy "cash_snapshots_select_owner_admin"
on public.cash_snapshots
for select
to authenticated
using (public.is_household_admin_viewer(user_id, household_id));

drop policy if exists "cash_payment_transactions_select_owner_admin" on public.cash_payment_transactions;
create policy "cash_payment_transactions_select_owner_admin"
on public.cash_payment_transactions
for select
to authenticated
using (public.is_household_admin_viewer(user_id, household_id));

drop policy if exists "cash_adjustment_transactions_select_owner_admin" on public.cash_adjustment_transactions;
create policy "cash_adjustment_transactions_select_owner_admin"
on public.cash_adjustment_transactions
for select
to authenticated
using (public.is_household_admin_viewer(user_id, household_id));

drop policy if exists "paycheck_schedules_select_owner_admin" on public.paycheck_schedules;
create policy "paycheck_schedules_select_owner_admin"
on public.paycheck_schedules
for select
to authenticated
using (public.is_household_admin_viewer(user_id, household_id));

drop policy if exists "savings_goal_participants_select_owner_admin" on public.savings_goal_participants;
create policy "savings_goal_participants_select_owner_admin"
on public.savings_goal_participants
for select
to authenticated
using (public.is_household_admin_viewer(user_id, household_id));

drop policy if exists "savings_contributions_select_owner_admin" on public.savings_contributions;
create policy "savings_contributions_select_owner_admin"
on public.savings_contributions
for select
to authenticated
using (public.is_household_admin_viewer(user_id, household_id));

-- Private savings goals: owner may read another active member's private goals.
-- Shared goals are already household-readable via the existing select policy.
drop policy if exists "savings_goals_select_owner_admin" on public.savings_goals;
create policy "savings_goals_select_owner_admin"
on public.savings_goals
for select
to authenticated
using (
  goal_type = 'private'
  and public.is_household_admin_viewer(created_by_user_id, household_id)
);

-- Receipt metadata (not file bytes) becomes owner-readable.
drop policy if exists "receipt_uploads_select_owner_admin" on public.receipt_uploads;
create policy "receipt_uploads_select_owner_admin"
on public.receipt_uploads
for select
to authenticated
using (public.is_household_admin_viewer(uploaded_by, household_id));

drop policy if exists "receipt_candidates_select_owner_admin" on public.receipt_candidates;
create policy "receipt_candidates_select_owner_admin"
on public.receipt_candidates
for select
to authenticated
using (public.is_household_admin_viewer(created_by, household_id));
