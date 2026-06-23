/*
  CASHFLOW-CURSOR-099: Import duplicate strategy and per-record action tracking.

  Stores chosen duplicate strategy and optional replacement scope on batches.
  Tracks created/updated/skipped/replaced/deleted per batch record for C100 rollback.
*/

alter table public.import_batches
  add column if not exists strategy text
    check (strategy in ('create_new_only', 'update_matching', 'replace_selected_month')),
  add column if not exists scope_year integer,
  add column if not exists scope_month integer
    check (scope_month is null or (scope_month >= 1 and scope_month <= 12));

alter table public.import_batch_records
  add column if not exists action text not null default 'created'
    check (action in ('created', 'updated', 'skipped', 'replaced', 'deleted'));
