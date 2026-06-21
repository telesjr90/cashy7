-- CASHFLOW-CURSOR-073: archive/close debt accounts without deleting history.
-- debt_accounts had no status field; add narrow archive columns only.

alter table public.debt_accounts
  add column if not exists is_archived boolean not null default false;

alter table public.debt_accounts
  add column if not exists archived_at timestamptz;

alter table public.debt_accounts
  add column if not exists archive_reason text;

comment on column public.debt_accounts.is_archived is
  'When true, account is hidden from the active Debt tracker list; history is preserved.';

comment on column public.debt_accounts.archived_at is
  'Timestamp when the account was archived or closed.';

comment on column public.debt_accounts.archive_reason is
  'Optional user note explaining why the account was archived.';
