/*
  CASHFLOW-CURSOR-106: Receipt duplicate detection and extraction error metadata.

  Adds uploader-private file hash, duplicate reference, and sanitized extraction
  error fields on receipt_uploads. No RLS or visibility changes.
*/

alter table public.receipt_uploads
  add column if not exists file_sha256 text null,
  add column if not exists duplicate_of_receipt_upload_id uuid null
    references public.receipt_uploads(id) on delete set null,
  add column if not exists last_extraction_status text null,
  add column if not exists last_extraction_error text null,
  add column if not exists last_extraction_at timestamptz null;

create index if not exists idx_receipt_uploads_uploader_file_sha256
  on public.receipt_uploads(uploaded_by, file_sha256)
  where file_sha256 is not null;

create index if not exists idx_receipt_uploads_uploader_file_metadata
  on public.receipt_uploads(uploaded_by, original_file_name, size_bytes, mime_type);
