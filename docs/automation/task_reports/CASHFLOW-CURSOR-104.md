# CASHFLOW-CURSOR-104 — Receipt approval UI (review/edit draft)

## Result

**PASS**

Implementation and validation pass. Browser smoke pass for Settings/receipt section and core pages. Live review-dialog open/save was not exercised this run because the test account had no pending candidates and extraction did not yield a savable candidate during smoke prep; unit/service tests cover review validation, draft update payload, and scoped service update.

## UI scope decision

| Option | Verdict |
|--------|---------|
| `ReceiptCandidateReviewDialog` opened from `ReceiptCandidatePanel` | **Chosen** |
| Extend inline preview only | Rejected — edit form needs focused dialog surface |
| New route for candidate review | Rejected — no deep-link requirement |
| `App.tsx` changes | Avoided |

Smallest safe surface: **Review candidate** action on each pending row opens a dialog with editable draft fields, read-only extraction context, save draft, and disabled approve placeholder.

## Files changed

| File | Change |
|------|--------|
| `src/lib/receipt-candidate-review.ts` | Pure form model, validation, update payload, display helpers |
| `src/lib/receipt-candidate-review.test.ts` | 13 Vitest cases |
| `src/lib/receipt-candidate-service.ts` | `updateReceiptCandidateDraft` scoped to uploader pending rows |
| `src/lib/receipt-candidate-service.test.ts` | 3 additional update/draft service tests |
| `src/components/receipt-candidate-review-dialog.tsx` | Review/edit dialog UI |
| `src/components/receipt-candidate-panel.tsx` | **Review candidate** action per pending row |
| `src/components/receipt-upload-card.tsx` | Review dialog wiring + candidate refresh on save |
| `docs/automation/task_reports/CASHFLOW-CURSOR-104.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-104.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration.**

Existing `receipt_candidates` columns cover editable draft fields:

- `merchant`, `transaction_date`, `total_amount`, `tax_amount`, `category`
- Read-only in C104: `line_items`, `confidence`, `field_confidence`, `warnings`, `source_status`

**Limitations without schema change:**

- **Notes** — no candidate notes column; not editable in C104
- **Line items** — read-only in review dialog (editable summary fields only)

RLS unchanged: candidates remain visible only to `created_by = auth.uid()`.

## Behavior implemented

### Review entry point

- Pending candidate rows show **Review candidate**
- Dialog states draft/private copy, **No expense has been created.**, **Only you can see this candidate until you approve it.**, and **Approval that creates an expense happens in the next step.**

### Editable fields

- Merchant/description, transaction date, total, tax, category
- Client validation blocks invalid dates, non-numeric amounts, negative totals/taxes; warns when tax exceeds total

### Save draft

- **Save draft** updates only the uploader-owned pending candidate row
- Success copy: **Candidate updated.** + **No expense has been created.**
- Candidate list refreshes after save

### Dismiss compatibility

- Existing C103 dismiss from list unchanged with confirmation
- Review dialog uses Cancel/close without dismiss

### Approval placeholder

- Disabled **Approve and create expense** with copy **Approval creates a shared manual expense in the next task.**
- No approve action wired

### Source context (read-only)

- File name, upload date, extraction status, confidence, warnings, line items, field confidence
- No raw storage paths or UUID labels

## Privacy / no-expense behavior

- Review UI only for uploader’s pending candidates
- Update service scoped to `created_by = userId` and `status = pending`
- No manual expense, bill, debt, savings, cash snapshot, or cash payment mutations
- No shared visibility added
- No provider secrets or raw provider response in UI

## Tests added/updated

- `receipt-candidate-review.test.ts` — form model, validation, payload scope, UUID-safe labels/errors
- `receipt-candidate-service.test.ts` — draft update scope, no manual expense helper, safe failure message

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1002 tests) |

## Browser smoke result

**PASS** — `.tmp-smoke-104.mjs` against `http://127.0.0.1:5201`:

- Settings receipt upload section loads
- Pending receipt candidates section loads
- No expense has been created copy visible
- Dashboard, Bills, Expenses, Debt, Settings, import section load
- No console errors

**Note:** Live review-dialog open/invalid-total block/save refresh not exercised because no pending candidates were available during smoke; covered by helper/service tests and dialog implementation.

## Remaining known limitations

- Notes field not available without migration
- Line items read-only in review UI
- Approve → shared manual expense deferred to **CASHFLOW-CURSOR-105**
- Live save in browser depends on having a pending candidate (from prior extract/save)

## Ready to commit

Yes — validation and smoke pass; scope matches C104; no migration; no credentials changed.

## Next task

**CASHFLOW-CURSOR-105**
