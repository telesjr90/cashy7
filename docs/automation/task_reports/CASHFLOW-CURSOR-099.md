# CASHFLOW-CURSOR-099 — Import duplicate/re-import strategy

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend `ImportConfirmPanel` with inline duplicate strategy + preview | **Chosen** |
| New route for strategy selection | Rejected — strategy is part of confirm step |
| Separate full-page duplicate workflow | Rejected — smallest surface below validation |

Smallest safe surface: strategy selector, preview groups, and extended confirm dialog inside existing Settings import staging. No route or `App.tsx` changes.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000002_024_import_batch_strategy.sql` | Strategy/scope on batches; action on batch records |
| `src/lib/types.ts` | Extended import batch types |
| `src/lib/import-duplicates.ts` | Pure match/plan/summary helpers |
| `src/lib/import-duplicates.test.ts` | 17 Vitest cases |
| `src/lib/import-duplicate-context.ts` | Extended fetch with protection + imported-record scope |
| `src/lib/import-apply.ts` | `allowDuplicates` flag; extended result counts |
| `src/lib/import-apply-service.ts` | Strategy-aware apply (create/update/replace-delete) |
| `src/lib/import-apply-service.test.ts` | Strategy planning service tests |
| `src/components/import-duplicate-strategy-panel.tsx` | Strategy selector + preview groups |
| `src/components/import-confirm-panel.tsx` | Wire strategy plan + extended result summary |
| `docs/automation/task_reports/CASHFLOW-CURSOR-099.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-099.result.json` | Machine-readable report |

## Schema/RLS decision

Extended existing C098 tables (no new tables):

- `import_batches.strategy` — `create_new_only` | `update_matching` | `replace_selected_month`
- `import_batches.scope_year` / `scope_month` — replacement scope
- `import_batch_records.action` — `created` | `updated` | `skipped` | `replaced` | `deleted`

RLS unchanged. Owner-only apply preserved. No spreadsheet contents stored.

Remote migration `024_import_batch_strategy` applied to `cashy7`.

## Duplicate/re-import strategy behavior

1. **Create new only (default)** — exact matches skipped; non-matches created (C098-compatible).
2. **Update matching** — safe exact matches updated (amount/date/notes/category fields); protected/ambiguous skipped.
3. **Replace selected month** — deletes only previously imported, unprotected records in derived/selected scope; then creates new rows. Non-imported records are never deleted.

Preview shows planned creates, updates, duplicate skips, protected skips, ambiguous skips, and replace/delete counts before apply.

## Protection/skip behavior

Skipped with user-facing reasons when records are:

- Paid bills/expenses/debt payments
- Cash-deducted bills/expenses/debt payments
- Debt-linked bills
- Archived debt accounts
- Ambiguous or possible (non-exact) matches
- Other-user savings rows (not fetched/matched)

Replace/delete never targets cash audit rows, snapshots, or payment transactions.

## Import batch/audit behavior

Each apply stores chosen strategy and scope on `import_batches`. Per-record `action` tracked on `import_batch_records` for C100 rollback compatibility.

## Privacy / no-cash-deduction behavior

- No spreadsheet upload/storage in Supabase
- No cash snapshots or payment transactions created
- Savings contributions remain signed-in user only
- User-facing labels sanitized (no raw UUIDs)
- RLS unchanged

## Tests added/updated

- `src/lib/import-duplicates.test.ts` — 17 cases
- `src/lib/import-apply-service.test.ts` — 4 cases

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (905 tests) |

## Supabase validation

Remote migration `024_import_batch_strategy` applied via Supabase MCP.

## Browser smoke result

**PASS** — `.tmp-smoke-099.mjs` against `http://127.0.0.1:5186`:

- Settings import upload/parse/map/validate
- Duplicate strategy selector + create/update/replace previews
- Cancel makes no writes; apply create-new-only succeeds for unique row
- Result summary with no-cash copy
- Dashboard, Bills, Expenses, Debt, Settings load without console errors

## Remaining known limitations

- Replace month only deletes records previously linked via `import_batch_records` (not manual non-import rows)
- Debt payment update does not mutate linked bill instances or balances
- Full batch rollback UI remains C100

## Ready to commit

Yes — validation and smoke pass; scope matches C099; no credentials changed.

## Next recommended task

**CASHFLOW-CURSOR-100** — Import batch rollback/delete
