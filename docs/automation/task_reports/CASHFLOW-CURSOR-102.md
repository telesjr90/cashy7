# CASHFLOW-CURSOR-102 — Receipt extraction function

## Result

**PARTIAL**

Implementation, validation, and UI smoke pass locally. Remote Edge Function deployment was not applied in this session (autonomous deploy blocked); deploy before expecting live extraction.

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend `ReceiptUploadCard` on Settings with per-row Extract action + inline preview | **Chosen** |
| New route for extraction review | Rejected — no deep-link requirement |
| Dialog/drawer for extraction preview | Rejected — inline preview beside list row is smaller |
| `App.tsx` changes | Avoided |
| Migrations / RLS | Avoided |

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/extract-receipt/index.ts` | Edge Function: auth, ownership, storage download, extraction invoke |
| `supabase/functions/extract-receipt/receipt-extraction.ts` | Server adapter `extractReceiptFromBytes` with OpenAI optional provider |
| `src/lib/receipt-extraction.ts` | Shared result model, normalization, sanitization, labels |
| `src/lib/receipt-extraction.test.ts` | 10 Vitest cases |
| `src/lib/receipt-extraction-service.ts` | Client `supabase.functions.invoke('extract-receipt')` helper |
| `src/lib/receipt-extraction-service.test.ts` | 7 mocked service tests |
| `src/lib/receipt-upload.ts` | Extract action label + updated help/pending copy |
| `src/components/receipt-upload-card.tsx` | Extract action, loading, preview, safe errors, draft copy |
| `docs/automation/task_reports/CASHFLOW-CURSOR-102.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-102.result.json` | Machine-readable report |

## Function / provider decision

- **Server-side Supabase Edge Function** `extract-receipt` with JWT verification (`verify_jwt: true`).
- **Provider adapter**: `extractReceiptFromBytes({ bytes, mimeType, fileName })`.
- **Provider**: OpenAI vision (`gpt-4o-mini`) when `RECEIPT_EXTRACTION_OPENAI_API_KEY` or `OPENAI_API_KEY` is set in Supabase project secrets only.
- **No provider configured**: returns `status: "not_configured"`, `providerConfigured: false` — does not fake successful extraction.
- **PDF**: when provider is configured, returns `unreadable` with clear message (image-only provider path in C102).
- Secrets are never read in frontend code.

### Deploy command (not run in session)

```bash
supabase functions deploy extract-receipt --project-ref nasyeoywmcifabusfpti
```

### Optional secret names (values not stored in repo)

- `RECEIPT_EXTRACTION_OPENAI_API_KEY` (preferred)
- `OPENAI_API_KEY` (fallback)

## Schema / RLS decision

No migration. No candidate table. No `receipt_uploads` status changes. Existing uploader-only table + storage RLS unchanged. Extraction output is transient (UI state only).

## Behavior implemented

### Edge Function

- Authenticates caller JWT.
- Accepts `{ receiptId }` only.
- Loads `receipt_uploads` under caller RLS; rejects other users.
- Requires `status = 'uploaded'`.
- Downloads private storage object server-side (no signed URL to browser).
- Invokes extraction adapter; returns structured JSON result.
- Safe statuses: `success`, `not_configured`, `unsupported`, `unreadable`, `provider_error`, `unauthorized`, `not_found`.
- Does not log file bytes/base64/provider raw output.

### Frontend service

- `extractReceipt({ receiptId })` via `supabase.functions.invoke`.
- Normalizes/sanitizes results and transport errors.

### Settings UI

- **Extract receipt** action on own uploaded receipts.
- Loading state while invoking function.
- Inline preview for success / `not_configured`.
- Safe error messages + draft copy on failures.
- Copy: “Extraction is a draft.”, “No expense has been created.”, review-before-save messaging.

## Extraction result behavior

Returns merchant, date, total, tax, category, line items, confidence, field confidence, warnings. Missing merchant/date/total warnings on successful-but-partial parses. No Postgres persistence. No manual expense or candidate rows created.

## Privacy / no-expense-creation

- Only uploader can extract own receipt.
- Storage remains private; download happens inside Edge Function.
- No public URLs, no service-role in browser, no household sharing of receipt files.
- No expenses, bills, debt payments, savings, cash snapshots, or payment transactions created.

## Tests added/updated

- `receipt-extraction.test.ts` — normalization, not_configured, unsupported/unreadable, sanitization, confidence clamp, warnings, line items, invoke payload.
- `receipt-extraction-service.test.ts` — invoke payload, not_configured, unauthorized, not_found, sanitized transport errors, no DB side effects.

Edge Function Deno tests: not added (no project Deno/vitest harness for functions); behavior covered via adapter unit tests on client + function source review.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (967 tests) |

## Browser smoke / function deployment

- **UI smoke**: **PASS** — `.tmp-smoke-102.mjs` against `http://127.0.0.1:5201`
  - Settings receipt section loads
  - Extract receipt action visible
  - Loading + draft/no-expense copy shown after extract attempt
  - Dashboard, Bills, Expenses, Debt, Settings import sections load
  - Console CORS noise ignored only for undeployed `extract-receipt` function
- **Edge Function deployment**: **NOT RUN** — deploy command documented above; live invoke currently returns transport/CORS failure until deployed

## Remaining known limitations

- Function must be deployed + optional provider secret set for real extraction.
- PDF extraction not implemented for OpenAI path in C102.
- Extracted data is not persisted (C103 candidate table).
- No approval/expense creation (later tasks).

## Ready to commit

**No** — task instructions said do not commit. After deploy + review, ready for a dedicated commit.

## Next recommended task

**CASHFLOW-CURSOR-103**

## Deployment closeout

Edge Function extract-receipt was deployed to Supabase project 
asyeoywmcifabusfpti. Browser smoke passed after deployment. Provider secrets are not stored in source.
