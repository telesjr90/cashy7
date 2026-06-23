# CASHFLOW-CURSOR-106 — Receipt duplicate/error handling

## Result

**PASS**

Implementation, validation, remote migration, and browser smoke pass. Unsupported-file, duplicate-on-reselect, persisted extraction errors, missing-total warnings, and approval duplicate guards are covered by helpers, services, UI, and smoke where test data allowed.

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend existing receipt upload card, candidate panel, review dialog | **Chosen** |
| New route for duplicate review | Rejected — no deep-link requirement |
| Inline-only warnings without persisted metadata | Rejected — reload should show prior extraction failures |
| `App.tsx` changes | Avoided |

Smallest safe surface: warnings/alerts in existing receipt upload list, selected-file metadata, extraction preview, candidate list, and approval confirmation dialog.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000007_029_receipt_duplicate_errors.sql` | File hash, duplicate reference, sanitized extraction error columns + indexes |
| `src/lib/types.ts` | `receipt_uploads` duplicate/error fields |
| `src/lib/receipt-errors.ts` | Pure error classification, labels, retry/savability helpers |
| `src/lib/receipt-errors.test.ts` | 10 Vitest cases |
| `src/lib/receipt-duplicates.ts` | Pure duplicate detection, labels, approval guard |
| `src/lib/receipt-duplicates.test.ts` | 9 Vitest cases |
| `src/lib/receipt-upload.ts` | Unsupported copy, display row error/retry metadata, hash insert fields |
| `src/lib/receipt-upload.test.ts` | Updated unsupported copy + fixture fields |
| `src/lib/receipt-upload-service.ts` | SHA-256 on upload, duplicate warnings, extraction status persistence |
| `src/lib/receipt-upload-service.test.ts` | Updated fixtures + update client mock |
| `src/lib/receipt-extraction.ts` | Missing-total warning copy |
| `src/lib/receipt-extraction.test.ts` | Updated missing-total expectation |
| `src/lib/receipt-extraction-service.ts` | Sanitized user-facing extraction errors |
| `src/lib/receipt-candidates.ts` | Missing-total candidate helpers |
| `src/lib/receipt-candidate-review.ts` | Review missing-total warnings helper |
| `src/lib/receipt-approval.ts` | Missing-total block + duplicate approval guard |
| `src/lib/receipt-approval-service.ts` | Duplicate-aware approval readiness |
| `src/lib/receipt-approval-service.test.ts` | Updated upload fixture fields |
| `src/lib/receipt-candidate-service.test.ts` | Updated upload fixture fields |
| `src/components/receipt-upload-card.tsx` | Duplicate/error UI, retry extraction, status persistence |
| `src/components/receipt-candidate-panel.tsx` | Missing-total + duplicate warnings in list |
| `src/components/receipt-candidate-review-dialog.tsx` | Missing-total near total field, duplicate confirm copy |
| `docs/automation/task_reports/CASHFLOW-CURSOR-106.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-106.result.json` | Machine-readable report |

## Schema/RLS decision

### Added to `receipt_uploads` (uploader-private via existing RLS)

- `file_sha256 text null`
- `duplicate_of_receipt_upload_id uuid null references receipt_uploads(id) on delete set null`
- `last_extraction_status text null`
- `last_extraction_error text null` (sanitized only)
- `last_extraction_at timestamptz null`

### Indexes

- `(uploaded_by, file_sha256)` partial where hash present
- `(uploaded_by, original_file_name, size_bytes, mime_type)` fallback duplicate lookup

No RLS, storage policy, or household visibility changes. Remote migration `029_receipt_duplicate_errors` applied to Supabase project `cashy7` (`nasyeoywmcifabusfpti`).

## Behavior implemented

### Unsupported file

- Client validation uses: “Unsupported receipt file. Upload a JPEG, PNG, WebP, or PDF.”
- Unsupported files are not uploaded and do not create candidates

### Unreadable / provider errors

- Extraction failures map to privacy-safe messages (unreadable, PDF-not-available-yet, rate limit, provider failure)
- Sanitized status/error persisted on own `receipt_uploads` row only
- Upload row stays visible; retry extraction available for retryable statuses
- No candidate auto-created from failed extraction

### Missing total

- Extraction/review warnings: “Total amount was not found.” + “Review/edit the candidate before approval.”
- Candidate may still save when C103 useful-field rules allow
- Approval blocked until valid total entered

### Duplicate detection (uploader-scoped only)

- Exact file duplicate: same uploader + SHA-256
- Fallback file duplicate: same uploader + sanitized name + size + MIME
- Candidate duplicate: same uploader + merchant + date + total
- Approved duplicate: matching approved candidate requires explicit confirmation in approval dialog
- Warnings show file/date/amount/status context without raw UUIDs
- Upload warns but does not hard-block re-upload

## Privacy / no-automatic-expense behavior

- Duplicate/error matching uses only current user’s uploads/candidates
- No public URLs, no raw provider output stored or shown
- No cash mutation, no automatic expense creation, no automatic receipt deletion
- Approval still uses explicit C105 path only

## Tests added/updated

- `receipt-errors.test.ts` — unsupported, unreadable, provider/rate-limit sanitization, missing total, retry, UUID-safe labels
- `receipt-duplicates.test.ts` — hash/metadata/candidate/approved duplicate detection, uploader scope, labels, approval guard
- Updated receipt upload/extraction/approval/service tests for new fields and copy

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1039 tests) |

## Browser smoke result

**PASS** — `.tmp-smoke-106.mjs` against `http://127.0.0.1:5201`:

- Settings + receipt upload section load
- Unsupported `.txt` shows unsupported-file copy
- Re-selecting tiny PNG shows duplicate warning
- Extract/retry button available when receipts exist
- Dashboard, Bills, Expenses, Debt, Settings/import load
- No console errors

**Note:** Live review-dialog missing-total block and approved-duplicate confirm path not exercised in browser because no suitable pending candidate was available during smoke; covered by helper/service tests and dialog wiring.

## Remaining known limitations

- Duplicate detection does not compare against non-receipt manual expenses unless linked through approved candidates
- PDF extraction availability depends on deployed edge function/provider path
- Persisted extraction errors require successful post-extract metadata update (RLS-scoped to uploader)

## Ready to commit

Yes — validation and smoke pass; scope matches C106; migration applied; no credentials changed.

## Next task

**CASHFLOW-CURSOR-107**
