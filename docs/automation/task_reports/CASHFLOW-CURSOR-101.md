# CASHFLOW-CURSOR-101 — Receipt upload storage

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| `ReceiptUploadCard` on Settings below import panels | **Chosen** |
| Receipt section on Expenses page | Rejected — Expenses page is large and payment-heavy; higher regression risk |
| New route for receipt uploads | Rejected — no deep-link requirement |

Smallest safe surface: private receipt upload card on Settings with own list and delete confirm. No route or `App.tsx` changes.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000004_026_receipt_uploads.sql` | `receipt_uploads` table, private bucket, table + storage RLS |
| `src/lib/types.ts` | `receipt_uploads` table types + exports |
| `src/lib/receipt-upload.ts` | Pure validation/path/metadata/display helpers |
| `src/lib/receipt-upload.test.ts` | 14 Vitest cases |
| `src/lib/receipt-upload-service.ts` | Upload/list/delete service with cleanup on partial failure |
| `src/lib/receipt-upload-service.test.ts` | 8 mocked service tests |
| `src/components/receipt-upload-card.tsx` | Upload UI, list, delete confirm |
| `src/pages/settings.tsx` | Wire card below import history |
| `docs/automation/task_reports/CASHFLOW-CURSOR-101.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-101.result.json` | Machine-readable report |

## Schema/Storage/RLS decision

### `receipt_uploads`

- Household-scoped metadata only; no raw file bytes in Postgres
- Status values: `uploaded`, `deleted` (schema-ready; delete uses hard delete in C101)
- Approval fields reserved for C104/C105 (`approved_for_shared_expense`, `approved_at`, `approved_by`)
- `linked_manual_expense_id` omitted until C105

### Table RLS (uploader-only)

- SELECT/INSERT/UPDATE/DELETE require `uploaded_by = auth.uid()` and household match via `get_my_household_id()`
- Other household members cannot read receipt metadata

### Storage

- Private bucket `receipt-uploads` (not public)
- Path: `{auth.uid()}/{receipt_id}/{sanitized_file_name}`
- `storage.objects` policies allow authenticated users to insert/select/delete only within their own first path segment
- 10 MB limit; MIME allowlist matches client validation

Remote migration `026_receipt_uploads` applied to Supabase project `cashy7` (`nasyeoywmcifabusfpti`).

## Behavior implemented

### Upload

- JPEG, PNG, WebP, PDF accepted; empty/oversized/unsupported rejected with readable errors
- Explicit **Upload receipt** action uploads to private Storage then inserts metadata
- Storage failure → no metadata insert
- Metadata failure → storage object cleanup
- Success copy states no expense created and later extraction/approval

### List

- Signed-in user sees own uploads only: file name, date, status, type/size, pending copy
- No raw UUIDs in normal labels

### Delete

- Uploader can delete own receipt with confirmation
- Removes storage object and metadata row
- No expense deletion (none created)

## Privacy / no-expense-creation

- Receipt rows private to uploader; owner cannot see another member’s receipts
- Storage objects private to uploader folder scope
- No public URLs, no OCR, no extraction, no expense/bill/debt/savings/cash mutations
- No provider secrets in frontend

## Tests added/updated

- `receipt-upload.test.ts` — validation, sanitization, path scope, display privacy, success copy
- `receipt-upload-service.test.ts` — upload path, metadata scope, failure cleanup, list filters, delete guards

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (950 tests) |

## Supabase validation

Remote migration `026_receipt_uploads` applied via Supabase MCP.

## Browser smoke result

**PASS** — `.tmp-smoke-101.mjs` against `http://127.0.0.1:5200`:

- Settings shows Receipt upload storage section
- Unsupported `.txt` rejected with readable error
- Tiny PNG uploads successfully
- Uploaded receipt appears in own list
- UI states no expense has been created
- Dashboard, Bills, Expenses, Debt, Settings, and Spreadsheet import load
- No console errors

## Remaining known limitations

- No OCR/extraction (C102+)
- No approval-to-shared-expense flow (C104/C105)
- No download/preview of stored receipt files in UI
- Soft-delete status exists in schema but delete uses hard delete in C101

## Ready to commit

Yes — validation and smoke pass; scope matches C101; no credentials changed.

## Next recommended task

**CASHFLOW-CURSOR-102**
