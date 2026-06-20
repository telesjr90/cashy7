/*
  CASHFLOW-CURSOR-054 — block delete for paid-through-app manual expenses

  Protects the payment audit trail when cash_payment_transactions reference a manual expense.
*/

create or replace function public.prevent_paid_manual_expense_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.cash_payment_transactions cpt
    where cpt.source_type = 'manual_expense'
      and cpt.source_id = OLD.id
  ) then
    raise exception 'PAID_EXPENSE_DELETE_BLOCKED: Manual expense has already been deducted from cash and cannot be deleted';
  end if;

  return OLD;
end;
$$;

drop trigger if exists prevent_paid_manual_expense_delete on public.manual_expenses;
create trigger prevent_paid_manual_expense_delete
before delete on public.manual_expenses
for each row
execute function public.prevent_paid_manual_expense_delete();
