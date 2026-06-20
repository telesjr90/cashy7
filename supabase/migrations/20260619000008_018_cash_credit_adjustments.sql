/*
  CASHFLOW-CURSOR-056 — cash credit for decrease manual expense adjustments

  Optional explicit cash credits when a decrease adjustment corrects over-deducted cash.
*/

create table if not exists public.cash_adjustment_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null,
  person_id uuid,
  source_type text not null,
  source_id uuid not null,
  amount numeric(12, 2) not null,
  previous_cash_snapshot_id uuid,
  new_cash_snapshot_id uuid,
  credited_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint cash_adjustment_transactions_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint cash_adjustment_transactions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint cash_adjustment_transactions_person_id_fkey
    foreign key (person_id) references public.people(id) on delete set null,
  constraint cash_adjustment_transactions_source_id_fkey
    foreign key (source_id) references public.manual_expenses(id) on delete restrict,
  constraint cash_adjustment_transactions_previous_snapshot_fkey
    foreign key (previous_cash_snapshot_id) references public.cash_snapshots(id) on delete set null,
  constraint cash_adjustment_transactions_new_snapshot_fkey
    foreign key (new_cash_snapshot_id) references public.cash_snapshots(id) on delete set null,
  constraint cash_adjustment_transactions_source_type_check
    check (source_type in ('manual_expense_adjustment')),
  constraint cash_adjustment_transactions_amount_positive
    check (amount > 0)
);

create unique index if not exists idx_cash_adjustment_transactions_unique_source
  on public.cash_adjustment_transactions(household_id, user_id, source_type, source_id);

create index if not exists idx_cash_adjustment_transactions_household_user_credited_at
  on public.cash_adjustment_transactions(household_id, user_id, credited_at desc);

create index if not exists idx_cash_adjustment_transactions_source
  on public.cash_adjustment_transactions(source_type, source_id);

alter table public.cash_adjustment_transactions enable row level security;

drop policy if exists "cash_adjustment_transactions_select_own" on public.cash_adjustment_transactions;
drop policy if exists "cash_adjustment_transactions_insert_own" on public.cash_adjustment_transactions;

create policy "cash_adjustment_transactions_select_own"
on public.cash_adjustment_transactions
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and user_id = (select auth.uid())
);

create policy "cash_adjustment_transactions_insert_own"
on public.cash_adjustment_transactions
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and user_id = (select auth.uid())
);

create or replace function public.credit_manual_expense_adjustment_to_current_cash(
  p_adjustment_manual_expense_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_household_id uuid;
  v_person_id uuid;
  v_adjustment record;
  v_latest_snapshot record;
  v_new_amount numeric(12, 2);
  v_new_snapshot_id uuid;
  v_adjustment_tx_id uuid;
  v_snapshot_notes text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_household_id := public.get_my_household_id();
  if v_household_id is null then
    raise exception 'No active household';
  end if;

  select hm.person_id
  into v_person_id
  from public.household_members hm
  where hm.user_id = v_user_id
    and hm.household_id = v_household_id
    and hm.is_active = true
  limit 1;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid credit amount';
  end if;

  select me.*
  into v_adjustment
  from public.manual_expenses me
  where me.id = p_adjustment_manual_expense_id
    and me.household_id = v_household_id;

  if v_adjustment.id is null then
    raise exception 'Manual expense not found';
  end if;

  if v_adjustment.adjusts_manual_expense_id is null then
    raise exception 'NOT_ADJUSTMENT: Only manual expense adjustments can be credited to cash';
  end if;

  if v_adjustment.adjustment_direction <> 'decrease' then
    raise exception 'NOT_DECREASE_ADJUSTMENT: Only decrease adjustments can be credited to cash';
  end if;

  if exists (
    select 1
    from public.cash_adjustment_transactions cat
    where cat.household_id = v_household_id
      and cat.user_id = v_user_id
      and cat.source_type = 'manual_expense_adjustment'
      and cat.source_id = p_adjustment_manual_expense_id
  ) then
    raise exception 'DUPLICATE_CASH_ADJUSTMENT';
  end if;

  select cs.*
  into v_latest_snapshot
  from public.cash_snapshots cs
  where cs.household_id = v_household_id
    and cs.user_id = v_user_id
  order by cs.snapshot_date desc, cs.created_at desc
  limit 1;

  if v_latest_snapshot.id is null then
    raise exception 'NO_CASH_SNAPSHOT';
  end if;

  v_new_amount := round((v_latest_snapshot.amount + p_amount)::numeric, 2);
  v_snapshot_notes := coalesce(
    p_notes,
    'Cash credit for manual expense adjustment ' || p_adjustment_manual_expense_id::text
  );

  insert into public.cash_snapshots (
    household_id,
    user_id,
    amount,
    snapshot_date,
    notes
  )
  values (
    v_household_id,
    v_user_id,
    v_new_amount,
    current_date,
    v_snapshot_notes
  )
  returning id into v_new_snapshot_id;

  insert into public.cash_adjustment_transactions (
    household_id,
    user_id,
    person_id,
    source_type,
    source_id,
    amount,
    previous_cash_snapshot_id,
    new_cash_snapshot_id,
    notes
  )
  values (
    v_household_id,
    v_user_id,
    v_person_id,
    'manual_expense_adjustment',
    p_adjustment_manual_expense_id,
    p_amount,
    v_latest_snapshot.id,
    v_new_snapshot_id,
    p_notes
  )
  returning id into v_adjustment_tx_id;

  return json_build_object(
    'cash_adjustment_transaction_id', v_adjustment_tx_id,
    'new_cash_snapshot_id', v_new_snapshot_id,
    'new_amount', v_new_amount,
    'previous_amount', v_latest_snapshot.amount
  );
end;
$$;

revoke all on function public.credit_manual_expense_adjustment_to_current_cash(uuid, numeric, text) from public;
grant execute on function public.credit_manual_expense_adjustment_to_current_cash(uuid, numeric, text) to authenticated;
