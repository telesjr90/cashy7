/*
  CASHFLOW-CURSOR-022 — harden user-to-person mapping RLS

  Restrict household_members updates to the caller's own row and validate
  person_id belongs to the same household.
*/

drop policy if exists "household_members_update_active_household" on public.household_members;

create policy "household_members_update_active_household"
on public.household_members
for update
to authenticated
using (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
)
with check (
  user_id = (select auth.uid())
  and household_id = (select public.get_my_household_id())
  and (
    person_id is null
    or exists (
      select 1
      from public.people p
      where p.id = person_id
        and p.household_id = household_members.household_id
    )
  )
);
