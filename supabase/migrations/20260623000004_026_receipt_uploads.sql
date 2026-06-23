/*
  CASHFLOW-CURSOR-101: Receipt upload storage foundation.

  Private receipt metadata and Supabase Storage bucket. Receipts belong to the
  uploader only until a later approval flow links a shared expense (C104/C105).
  No OCR, extraction, or expense creation in this migration.
*/

create table if not exists public.receipt_uploads (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'deleted')),
  approved_for_shared_expense boolean not null default false,
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_uploads_size_bytes_positive check (size_bytes > 0)
);

create unique index if not exists idx_receipt_uploads_storage_path
  on public.receipt_uploads(storage_bucket, storage_path);

create index if not exists idx_receipt_uploads_uploader_created
  on public.receipt_uploads(uploaded_by, created_at desc);

create index if not exists idx_receipt_uploads_household
  on public.receipt_uploads(household_id);

drop trigger if exists set_receipt_uploads_updated_at on public.receipt_uploads;
create trigger set_receipt_uploads_updated_at
before update on public.receipt_uploads
for each row
execute function public.set_updated_at();

alter table public.receipt_uploads enable row level security;

drop policy if exists "receipt_uploads_select_own" on public.receipt_uploads;
drop policy if exists "receipt_uploads_insert_own" on public.receipt_uploads;
drop policy if exists "receipt_uploads_update_own" on public.receipt_uploads;
drop policy if exists "receipt_uploads_delete_own" on public.receipt_uploads;

create policy "receipt_uploads_select_own"
on public.receipt_uploads
for select
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and uploaded_by = (select auth.uid())
);

create policy "receipt_uploads_insert_own"
on public.receipt_uploads
for insert
to authenticated
with check (
  household_id = (select public.get_my_household_id())
  and uploaded_by = (select auth.uid())
);

create policy "receipt_uploads_update_own"
on public.receipt_uploads
for update
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and uploaded_by = (select auth.uid())
)
with check (
  household_id = (select public.get_my_household_id())
  and uploaded_by = (select auth.uid())
);

create policy "receipt_uploads_delete_own"
on public.receipt_uploads
for delete
to authenticated
using (
  household_id = (select public.get_my_household_id())
  and uploaded_by = (select auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-uploads',
  'receipt-uploads',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipt_uploads_storage_insert_own" on storage.objects;
drop policy if exists "receipt_uploads_storage_select_own" on storage.objects;
drop policy if exists "receipt_uploads_storage_delete_own" on storage.objects;

create policy "receipt_uploads_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipt-uploads'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "receipt_uploads_storage_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipt-uploads'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "receipt_uploads_storage_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipt-uploads'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
