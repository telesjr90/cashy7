/*
  CASHFLOW-CURSOR-055 — manual expense adjustment foundation

  Adds adjustment columns to manual_expenses for planning corrections
  without editing paid-through-app expenses or cash snapshots.
*/

alter table public.manual_expenses
  add column if not exists adjusts_manual_expense_id uuid,
  add column if not exists adjustment_direction text,
  add column if not exists adjustment_reason text;

alter table public.manual_expenses
  drop constraint if exists manual_expenses_adjusts_manual_expense_id_fkey;

alter table public.manual_expenses
  add constraint manual_expenses_adjusts_manual_expense_id_fkey
    foreign key (adjusts_manual_expense_id)
    references public.manual_expenses(id)
    on delete restrict;

alter table public.manual_expenses
  drop constraint if exists manual_expenses_adjustment_direction_check;

alter table public.manual_expenses
  add constraint manual_expenses_adjustment_direction_check
    check (
      adjustment_direction is null
      or adjustment_direction in ('increase', 'decrease')
    );

alter table public.manual_expenses
  drop constraint if exists manual_expenses_adjustment_fields_consistency_check;

alter table public.manual_expenses
  add constraint manual_expenses_adjustment_fields_consistency_check
    check (
      (
        adjusts_manual_expense_id is null
        and adjustment_direction is null
      )
      or (
        adjusts_manual_expense_id is not null
        and adjustment_direction is not null
      )
    );

alter table public.manual_expenses
  drop constraint if exists manual_expenses_no_self_adjustment_check;

alter table public.manual_expenses
  add constraint manual_expenses_no_self_adjustment_check
    check (
      adjusts_manual_expense_id is null
      or adjusts_manual_expense_id <> id
    );

create index if not exists idx_manual_expenses_adjusts_manual_expense_id
  on public.manual_expenses(adjusts_manual_expense_id)
  where adjusts_manual_expense_id is not null;
