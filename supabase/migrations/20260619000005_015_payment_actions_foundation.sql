/*
  CASHFLOW-CURSOR-039 — payment actions foundation

  Append-only cash deductions via cash_payment_transactions and pay_source_from_current_cash RPC.
*/

-- Allow negative cash snapshot balances after Pay deductions.
alter table public.cash_snapshots
  drop constraint if exists cash_snapshots_amount_non_negative;

alter table public.manual_expenses
  add column if not exists is_paid boolean not null default false;

alter table public.manual_expenses
  add column if not exists paid_at timestamptz;

create table if not exists public.cash_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null,
  person_id uuid,
  source_type text not null,
  source_id uuid not null,
  amount numeric(12, 2) not null,
  previous_cash_snapshot_id uuid,
  new_cash_snapshot_id uuid,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint cash_payment_transactions_household_id_fkey
    foreign key (household_id) references public.households(id) on delete cascade,
  constraint cash_payment_transactions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint cash_payment_transactions_person_id_fkey
    foreign key (person_id) references public.people(id) on delete set null,
  constraint cash_payment_transactions_previous_snapshot_fkey
    foreign key (previous_cash_snapshot_id) references public.cash_snapshots(id) on delete set null,
  constraint cash_payment_transactions_new_snapshot_fkey
    foreign key (new_cash_snapshot_id) references public.cash_snapshots(id) on delete set null,
  constraint cash_payment_transactions_source_type_check
    check (source_type in ('bill_instance', 'debt_payment', 'manual_expense')),
  constraint cash_payment_transactions_amount_non_negative
    check (amount >= 0)
);

create unique index if not exists idx_cash_payment_transactions_unique_source
  on public.cash_payment_transactions(household_id, user_id, source_type, source_id);

create index if not exists idx_cash_payment_transactions_household_user_paid_at
  on public.cash_payment_transactions(household_id, user_id, paid_at desc);

create index if not exists idx_cash_payment_transactions_source
  on public.cash_payment_transactions(source_type, source_id);

alter table public.cash_payment_transactions enable row level security;

drop policy if exists "cash_payment_transactions_select_own" on public.cash_payment_transactions;
drop policy if exists "cash_payment_transactions_insert_own" on public.cash_payment_transactions;

create policy "cash_payment_transactions_select_own"
on public.cash_payment_transactions
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and user_id = (select auth.uid())
);

create policy "cash_payment_transactions_insert_own"
on public.cash_payment_transactions
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and user_id = (select auth.uid())
);

create or replace function public.pay_source_from_current_cash(
  p_source_type text,
  p_source_id uuid,
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
  v_latest_snapshot record;
  v_new_amount numeric(12, 2);
  v_new_snapshot_id uuid;
  v_payment_tx_id uuid;
  v_snapshot_notes text;
  v_debt_payment record;
  v_debt_account record;
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

  if p_amount is null or p_amount < 0 then
    raise exception 'Invalid payment amount';
  end if;

  if p_source_type not in ('bill_instance', 'debt_payment', 'manual_expense') then
    raise exception 'Invalid source type';
  end if;

  if exists (
    select 1
    from public.cash_payment_transactions cpt
    where cpt.household_id = v_household_id
      and cpt.user_id = v_user_id
      and cpt.source_type = p_source_type
      and cpt.source_id = p_source_id
  ) then
    raise exception 'DUPLICATE_PAYMENT';
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

  v_new_amount := round((v_latest_snapshot.amount - p_amount)::numeric, 2);
  v_snapshot_notes := coalesce(
    p_notes,
    'Paid ' || p_source_type || ' ' || p_source_id::text
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

  insert into public.cash_payment_transactions (
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
    p_source_type,
    p_source_id,
    p_amount,
    v_latest_snapshot.id,
    v_new_snapshot_id,
    p_notes
  )
  returning id into v_payment_tx_id;

  if p_source_type = 'bill_instance' then
    update public.bill_instances bi
    set
      is_paid = true,
      paid_status = 'paid',
      paid_at = now(),
      paid_by_user_id = v_user_id,
      updated_at = now()
    where bi.id = p_source_id
      and bi.household_id = v_household_id
      and bi.is_paid = false;

    select dp.id, dp.debt_account_id, dp.total_payment, dp.paid_status, dp.linked_bill_instance_id
    into v_debt_payment
    from public.debt_payments dp
    where dp.linked_bill_instance_id = p_source_id
      and dp.household_id = v_household_id
    limit 1;

    if v_debt_payment.id is not null and v_debt_payment.paid_status = false then
      update public.debt_payments
      set paid_status = true
      where id = v_debt_payment.id;

      select da.id, da.current_balance
      into v_debt_account
      from public.debt_accounts da
      where da.id = v_debt_payment.debt_account_id;

      if v_debt_account.id is not null then
        update public.debt_accounts
        set current_balance = greatest(
          0,
          round((v_debt_account.current_balance - v_debt_payment.total_payment)::numeric, 2)
        )
        where id = v_debt_account.id;
      end if;
    end if;

  elsif p_source_type = 'debt_payment' then
    select dp.id, dp.debt_account_id, dp.total_payment, dp.paid_status, dp.linked_bill_instance_id
    into v_debt_payment
    from public.debt_payments dp
    where dp.id = p_source_id
      and dp.household_id = v_household_id;

    if v_debt_payment.id is null then
      raise exception 'Debt payment not found';
    end if;

    if v_debt_payment.paid_status = false then
      update public.debt_payments
      set paid_status = true
      where id = v_debt_payment.id;

      if v_debt_payment.linked_bill_instance_id is not null then
        update public.bill_instances
        set
          is_paid = true,
          paid_status = 'paid',
          paid_at = now(),
          paid_by_user_id = v_user_id,
          updated_at = now()
        where id = v_debt_payment.linked_bill_instance_id;
      end if;

      select da.id, da.current_balance
      into v_debt_account
      from public.debt_accounts da
      where da.id = v_debt_payment.debt_account_id;

      if v_debt_account.id is not null then
        update public.debt_accounts
        set current_balance = greatest(
          0,
          round((v_debt_account.current_balance - v_debt_payment.total_payment)::numeric, 2)
        )
        where id = v_debt_account.id;
      end if;
    end if;

  elsif p_source_type = 'manual_expense' then
    update public.manual_expenses me
    set
      is_paid = true,
      paid_at = now(),
      updated_at = now()
    where me.id = p_source_id
      and me.household_id = v_household_id
      and (
        me.expense_scope = 'shared'
        or me.created_by_user_id = v_user_id
      );

    if not found then
      raise exception 'Manual expense not found or not accessible';
    end if;
  end if;

  return json_build_object(
    'payment_transaction_id', v_payment_tx_id,
    'new_cash_snapshot_id', v_new_snapshot_id,
    'new_amount', v_new_amount,
    'previous_amount', v_latest_snapshot.amount
  );
end;
$$;

revoke all on function public.pay_source_from_current_cash(text, uuid, numeric, text) from public;
grant execute on function public.pay_source_from_current_cash(text, uuid, numeric, text) to authenticated;
