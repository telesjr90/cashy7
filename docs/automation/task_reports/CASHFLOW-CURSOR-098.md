# CASHFLOW-CURSOR-098 — Confirmed import writes records

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend `ImportUploadCard` with `ImportConfirmPanel` after validation | **Chosen** |
| New route for confirm/apply | Rejected — confirm is the final step of Settings import staging |
| Separate full-page apply workflow | Rejected — smallest surface below existing mapping/validation panels |

Smallest safe surface: confirmation summary, alert-dialog apply guard, result summary, and owner-only messaging inline on Settings → Spreadsheet import. No route or `App.tsx` changes.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000001_023_import_batches.sql` | Import batch + created-record link tables and owner-only RLS |
| `src/lib/types.ts` | `import_batches` / `import_batch_records` types |
| `src/lib/import-apply.ts` | Pure create-plan, confirmation/result summaries, owner check, source notes |
| `src/lib/import-apply.test.ts` | 17 Vitest cases |
| `src/lib/import-apply-service.ts` | Supabase fetch context + apply writes + batch tracking |
| `src/lib/import-apply-service.test.ts` | Permission/error sanitization tests |
| `src/components/import-confirm-panel.tsx` | Confirm summary, dialog, apply progress, result summary |
| `src/components/import-upload-card.tsx` | Wire confirm panel + auth context |
| `src/components/import-validation-panel.tsx` | Remove disabled placeholder button |
| `src/lib/import-upload.ts` | Confirm copy constants |
| `src/lib/import-validation.test.ts` | Smoke CSV validation case |
| `docs/automation/task_reports/CASHFLOW-CURSOR-098.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-098.result.json` | Machine-readable report |

## Schema/RLS decision

Added minimal tracking tables:

- `import_batches` — household-scoped metadata (`source_file_name`, `source_file_kind`, `status`, `created_by`)
- `import_batch_records` — links batch to created rows (`target_table`, `target_id`, source sheet/row)

RLS:

- SELECT: active household members via `get_my_household_id()`
- INSERT: household owner only via `is_my_household_owner()` (reuses C093 helper)
- No spreadsheet contents stored
- No weakening of existing table policies

Migration applied to remote Supabase project `cashy7`.

## Behavior implemented

### Confirmed write flow

1. After validation with zero error rows, `ImportConfirmPanel` appears.
2. Summary shows file, sheet, rows to create, skipped/warning/error counts, and per-type create counts.
3. **Apply import** opens an alert dialog; **Cancel** performs no writes.
4. On confirm, owner-only service creates an import batch, writes create-only rows, and records `import_batch_records` links.
5. Result summary shows created/skipped/failed counts and no-cash-deduction copy.

### Create-only writes

| Row type | Write target | Rules |
|----------|--------------|-------|
| Bill + recurring marker | `bills` template | Unpaid template only; import note appended |
| Bill (no recurring marker) | `bill_instances` | Unpaid; split 51/49 when shares absent |
| Debt | `debt_accounts` (if needed), `bill_instances`, `debt_payments` | Unpaid linked bill; no balance mutation on import |
| Expense | `manual_expenses` | Shared scope; unpaid; no cash transactions |
| Savings | `savings_contributions` | Signed-in user only; goal matched by category/name; no cash deduction |

Conservative duplicate skips for exact safe matches (same bill instance key, expense description/date/amount, debt payment, savings contribution, bill template name).

### Owner-only apply

Non-owners see read-only messaging: “Only a household owner can apply spreadsheet imports.”

### Not implemented (later tasks)

- Duplicate/re-import strategy beyond conservative skip (C099)
- Rollback/delete UI (C100)

## Privacy / no-cash guarantees

- No spreadsheet upload or file contents stored in Supabase
- No cash snapshots or `cash_payment_transactions`
- Savings contributions created for signed-in user only
- No other-user cash/savings/private expense exposure through import path
- User-facing errors sanitized to avoid raw UUIDs

## Tests added/updated

- `src/lib/import-apply.test.ts` — 17 cases
- `src/lib/import-apply-service.test.ts` — 2 cases
- `src/lib/import-validation.test.ts` — smoke CSV validation case

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (886 tests) |

## Supabase validation

Remote migration `023_import_batches` applied successfully via Supabase MCP.

## Browser smoke result

**PASS** — Settings import flow with `.tmp-smoke-098-files/import-apply.csv`:

- Upload/parse/map/validate
- Confirm dialog open + cancel (no writes) + apply
- Result summary with no-cash copy
- Dashboard, Bills, Expenses, Debt, Settings load without console errors

## Ready to commit

Yes — validation and smoke pass; scope matches C098; no credentials changed.

## Next recommended task

**CASHFLOW-CURSOR-099** — Duplicate/re-import strategy
