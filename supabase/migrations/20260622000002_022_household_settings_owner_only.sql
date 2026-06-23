/*
  CASHFLOW-CURSOR-093: Restrict household_settings writes to household owners.

  household_members already tracks owner status via role = 'owner' and is_owner.
  SELECT policy is unchanged so all members can still read the cashflow start date.
*/

create or replace function public.is_my_household_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.household_id = (select public.get_my_household_id())
      and coalesce(hm.is_active, true) = true
      and coalesce(hm.status, 'active') = 'active'
      and (
        coalesce(hm.is_owner, false) = true
        or hm.role = 'owner'
      )
  )
$$;

revoke all on function public.is_my_household_owner() from public;
grant execute on function public.is_my_household_owner() to authenticated;
grant execute on function public.is_my_household_owner() to service_role;

drop policy if exists "household_settings_insert_active_household" on public.household_settings;
drop policy if exists "household_settings_update_active_household" on public.household_settings;

create policy "household_settings_insert_active_household"
on public.household_settings
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and (select public.is_my_household_owner()) = true
);

create policy "household_settings_update_active_household"
on public.household_settings
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
