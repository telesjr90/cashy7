# CASHFLOW-CURSOR-105 — Approved receipt creates manual expense

## Result

**PASS**

Implementation, validation, remote migration, and browser smoke pass. Live approve-and-create flow was not exercised in browser because the test account had no pending receipt candidates during smoke; helper/service tests and dialog implementation cover approval validation, expense payload, candidate linking, and idempotency guards.

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend `ReceiptCandidateReviewDialog` with confirm + approve action | **Chosen** |
| New route for approval | Rejected — no deep-link requirement |
| Inline approval on candidate list | Rejected — confirmation + field review need focused dialog |
| `App.tsx` changes | Avoided |

Smallest safe surface: enable **Approve and create expense** in the existing review dialog with confirmation `AlertDialog`, success copy, and approved read-only state; extend candidate list/preview for approved status.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000006_028_receipt_candidate_approval.sql` | Approval audit columns, `approved` status, update RLS for pending→approved |
| `src/lib/types.ts` | `receipt_candidates` approval fields + `approved` status |
| `src/lib/receipt-approval.ts` | Pure approval validation, expense/candidate/upload payloads, copy |
| `src/lib/receipt-approval.test.ts` | 12 Vitest cases |
| `src/lib/receipt-approval-service.ts` | Sequenced approve service (expense insert → candidate link → upload metadata) |
| `src/lib/receipt-approval-service.test.ts` | 6 mocked service tests |
| `src/lib/receipt-candidates.ts` | Approved status label + list copy |
| `src/lib/receipt-candidate-review.ts` | Updated approval action copy |
| `src/lib/receipt-candidate-service.ts` | List pending + approved candidates |
| `src/lib/receipt-candidate-service.test.ts` | Updated list filter expectations + approval fields in fixtures |
| `src/lib/receipt-candidate-review.test.ts` | Approval fields in fixtures |
| `src/lib/receipt-candidates.test.ts` | Approval fields in fixtures |
| `src/components/receipt-candidate-review-dialog.tsx` | Approve action, confirmation, success, approved read-only state |
| `src/components/receipt-candidate-panel.tsx` | Approved status in list/preview, expense link, dismiss only for pending |
| `src/components/receipt-upload-card.tsx` | Approval wiring (household, upload, membership, refresh) |
| `docs/automation/task_reports/CASHFLOW-CURSOR-105.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-105.result.json` | Machine-readable report |

## Schema/RLS decision

### Added to `receipt_candidates`

- `approved_at timestamptz null`
- `approved_by uuid null references auth.users(id)`
- `linked_manual_expense_id uuid null references manual_expenses(id) on delete set null`
- Status value `approved`

### RLS

- SELECT unchanged: uploader-only via `created_by = auth.uid()`
- UPDATE narrowed: only `pending` rows can be updated; `with check` allows transition to `pending` or `approved`
- DELETE unchanged: only pending/dismissed (approved rows preserved)
- Receipt upload approval metadata uses existing `approved_for_shared_expense`, `approved_at`, `approved_by` (no new upload link column)

### Source of truth

- Candidate row holds approval audit + link to manual expense
- Receipt upload mirrors approval metadata only; candidate remains private audit source

Remote migration `028_receipt_candidate_approval` applied to Supabase project `cashy7` (`nasyeoywmcifabusfpti`).

## Behavior implemented

### Approval entry point

- **Approve and create expense** enabled for pending uploader-owned candidates in review dialog
- Approved candidates show read-only fields, success copy, expense summary, and **View in Expenses** link
- Dismissed candidates cannot be approved (service guard + no dismiss path for approved)

### Confirmation

Required copy before approval:

- This will create a manual expense.
- No cash will be deducted.
- Receipt and extraction details will be preserved for audit.
- You can edit the expense later from Expenses.
- Only your receipt/candidate audit stays private to you.

Cancel makes no changes.

### Manual expense creation

- Maps merchant → description, date → expense_date (required for approval), total → amount, category → category
- Shared scope, 51/49 split, unpaid / not cash-deducted
- Audit note on expense references receipt candidate/file without UUIDs
- No cash payment transactions, snapshots, bills, debt, or savings mutations

### Candidate audit preservation

- Candidate status → `approved`; sets approval timestamp/user and `linked_manual_expense_id`
- Preserves extraction audit fields (line items, confidence, warnings, source status, upload link)
- Does not delete candidate, upload, or storage object

### Idempotency

- Blocks re-approval when status is `approved` or `linked_manual_expense_id` is set
- Partial failure message if expense insert succeeds but candidate link fails

### Review/edit integration

- Approval uses current form values (no separate save required)
- C104 validation runs; approval additionally requires transaction date and positive total

## Privacy / no-cash-deduction behavior

- Candidate/receipt rows remain uploader-private
- Created manual expense follows normal household shared expense visibility
- No cash deduction, no public receipt URLs, no provider secrets in frontend

## Tests added/updated

- `receipt-approval.test.ts` — readiness, payload mapping, audit update shape, copy, UUID sanitization
- `receipt-approval-service.test.ts` — insert/link flow, double approval block, owner guard, partial failure, no cash payment
- Updated receipt candidate fixtures for new columns

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1020 tests) |

## Supabase validation

Remote migration `028_receipt_candidate_approval` applied via Supabase MCP.

## Browser smoke result

**PASS** — `.tmp-smoke-105.mjs` against `http://127.0.0.1:5201`:

- Settings receipt upload section loads
- Receipt candidates section loads
- Dashboard, Bills, Expenses, Debt, Settings, import section load
- No console errors

**Note:** Live review-dialog invalid-date block, confirm/cancel, and approve-create path not exercised because no pending candidates were available during smoke; covered by helper/service tests and dialog implementation.

## Remaining known limitations

- Live browser approval depends on having a pending candidate (from prior extract/save)
- Receipt file remains uploader-private after approval; only the shared manual expense is household-visible
- Upload approval metadata update failure is non-blocking after candidate link succeeds

## Ready to commit

Yes — validation and smoke pass; scope matches C105; migration applied; no credentials changed.

## Next task

**CASHFLOW-CURSOR-106**
