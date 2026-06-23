# CASHFLOW-CURSOR-103 — Pending receipt candidate persistence

## Result

**PASS**

Implementation, validation, remote migration, and browser smoke pass. Live save-candidate flow in browser was not exercised this run because OpenAI returned HTTP 429 during extraction smoke; unit/service tests cover persistence, and smoke verified UI gating plus candidate list section.

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend `ReceiptUploadCard` with save action + `ReceiptCandidatePanel` child | **Chosen** |
| New route for candidate review | Rejected — no deep-link requirement |
| Dialog/drawer for candidate preview | Rejected — inline list + expandable preview is smaller |
| `App.tsx` changes | Avoided |

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000005_027_receipt_candidates.sql` | `receipt_candidates` table, unique pending-per-upload index, uploader-only RLS |
| `src/lib/types.ts` | `receipt_candidates` table types + exports |
| `src/lib/receipt-candidates.ts` | Pure normalization, savability, display, privacy copy |
| `src/lib/receipt-candidates.test.ts` | 10 Vitest cases |
| `src/lib/receipt-candidate-service.ts` | Create/replace/list/dismiss service helpers |
| `src/lib/receipt-candidate-service.test.ts` | 9 mocked service tests |
| `src/components/receipt-upload-card.tsx` | Save/replace candidate action, candidate list wiring |
| `src/components/receipt-candidate-panel.tsx` | Pending candidate list, preview, dismiss confirm |
| `docs/automation/task_reports/CASHFLOW-CURSOR-103.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-103.result.json` | Machine-readable report |

## Schema/RLS decision

### `receipt_candidates`

- Household-scoped draft metadata linked to `receipt_uploads`
- Status values in C103: `pending`, `dismissed` (schema-ready)
- No raw receipt bytes, public URLs, or provider raw response stored
- Partial unique index: one `pending` candidate per `receipt_upload_id`

### Table RLS (uploader-only)

- SELECT/INSERT/UPDATE/DELETE require `created_by = auth.uid()` and household match via `get_my_household_id()`
- INSERT additionally requires owning `receipt_uploads` row
- Other household members (including owner) cannot read another user’s pending candidates
- `receipt_uploads` and Storage policies unchanged

Remote migration `027_receipt_candidates` applied to Supabase project `cashy7` (`nasyeoywmcifabusfpti`).

## Behavior implemented

### Extraction-to-candidate flow

- After successful extraction with useful fields, user clicks **Save as pending candidate**
- Candidate created only on explicit user action
- If a pending candidate already exists for the upload, create is blocked and **Update pending candidate** replaces after explicit action
- No manual expense, bill, debt, savings, cash snapshot, or cash payment mutation

### Candidate list

- Settings receipt section shows uploader’s pending candidates with merchant/title fallback, date, total, category, confidence, linked file name, pending review copy, and no-expense copy

### Candidate preview

- Read-only preview shows merchant, date, total, tax, category, line items, field confidence, warnings
- Copy states draft candidate, no expense created, private to uploader until approval

### Candidate dismiss

- Uploader can dismiss own pending candidate with confirm
- Deletes candidate row only; receipt upload and storage file remain

### Idempotency

- Unique partial index + service guard prevent duplicate pending candidates per receipt upload

## Candidate privacy / no-expense behavior

- Candidate rows private to uploader via RLS
- Receipt upload and storage object remain uploader-private
- No public URLs, no provider secrets in frontend, no cash mutation
- UI states no expense has been created and approval happens later

## Tests added/updated

- `receipt-candidates.test.ts` — payload build, savability, line items, confidence labels, duplicate warning, privacy copy
- `receipt-candidate-service.test.ts` — uploader scope, duplicate block, replace, list filters, dismiss guards, no manual expense insert

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (986 tests) |

## Supabase validation

Remote migration `027_receipt_candidates` applied via Supabase MCP.

## Browser smoke result

**PASS** — `.tmp-smoke-103.mjs` against `http://127.0.0.1:5201`:

- Settings receipt upload section loads
- Pending receipt candidates section loads
- Extract receipt action runs; safe provider-error state shown when OpenAI returns 429
- Save button hidden when extraction is not savable
- No expense has been created copy visible
- Dashboard, Bills, Expenses, Debt, Settings load
- No console errors

**Note:** End-to-end save + preview path not exercised live this run due to provider HTTP 429; covered by service tests.

## Remaining known limitations

- No approval/shared-expense flow (C104/C105)
- No automatic expense creation by design
- Dismiss uses hard delete of candidate row (schema also supports `dismissed` status for later use)
- Browser save flow depends on successful live extraction when provider quota allows

## Ready to commit

Yes — validation and smoke pass; scope matches C103; no credentials changed; migration applied remotely.

## Next task

**CASHFLOW-CURSOR-104**
