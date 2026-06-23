# CASHFLOW-CURSOR-100 — Import deletion/rollback

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| `ImportHistoryPanel` card below `ImportUploadCard` on Settings | **Chosen** |
| New route for import history/rollback | Rejected — no deep-link requirement |
| Rollback inside upload card only | Rejected — history is a separate read/review surface |

Smallest safe surface: read-only import history table plus inline rollback preview/confirmation on Settings → Spreadsheet import. No route or `App.tsx` changes.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260623000003_025_import_batch_rollback.sql` | Rollback batch statuses + owner-only UPDATE policies |
| `src/lib/types.ts` | Extended `import_batches.status` union |
| `src/lib/import-rollback.ts` | Pure rollback history/preview/eligibility/delete-plan/result helpers |
| `src/lib/import-rollback.test.ts` | 17 Vitest cases |
| `src/lib/import-rollback-service.ts` | Fetch batches/preview + apply rollback deletes |
| `src/lib/import-rollback-service.test.ts` | Permission/status helper tests |
| `src/components/import-history-panel.tsx` | Import history list, preview, confirm dialog, result summary |
| `src/pages/settings.tsx` | Wire `ImportHistoryPanel` below upload card |
| `src/lib/import-apply.ts` | Rollback-later copy points to Import history |
| `docs/automation/task_reports/CASHFLOW-CURSOR-100.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-100.result.json` | Machine-readable report |

## Schema/RLS decision

Extended existing `import_batches.status` check with:

- `rolled_back`
- `rollback_partial`
- `rollback_failed`

Added narrow owner-only UPDATE policies (matching C098/C099 apply gate):

- `import_batches_update_owner`
- `import_batch_records_update_owner`

No new tables. No spreadsheet contents stored. SELECT/INSERT policies unchanged. No cash snapshot/payment/adjustment tables touched.

Remote migration `025_import_batch_rollback` applied to Supabase project `cashy7` (`nasyeoywmcifabusfpti`).

## Behavior implemented

### Import history

- Lists prior batches with file name/kind, imported date, creator label, status, strategy, scope, action counts, rollback availability.
- No raw UUIDs in normal UI.

### Rollback preview

- Owner opens batch review from Settings.
- Linked records grouped by target type (templates, instances, debt accounts/payments, linked debt bills, expenses, savings).
- Each row shows label, date/month, amount when safe, source sheet/row, eligibility badge, and protection reason.
- Missing targets show “Already removed”.

### Protection / delete rules

- Only `action = created` batch records are deletable.
- Skips paid, cash-deducted, debt-linked (unless batch-owned pair), archived debt accounts, templates with outside/protected instances, accounts with outside/protected payments, other-user savings, private expenses not owned by signer, and updated/skipped/replaced/deleted batch markers.
- Deletes in safe dependency order (payments → linked bills → instances → expenses → savings → accounts → templates).
- Does not delete cash snapshots, payment transactions, or adjustment audit rows.

### Batch status after rollback

- `rolled_back` when all eligible records deleted with no skips/failures
- `rollback_partial` when protected/missing/failed rows remain
- `rollback_failed` when nothing deleted and failures occurred

### Confirmation copy

Includes required warnings: batch-only deletes, protected skips, no cash history change, irreversible from this screen.

## Privacy / cash-history guarantees

- Owner-only rollback (same gate as apply).
- Household-scoped reads only; no broad admin powers.
- Other users’ private savings/expenses not exposed; protected with skip reasons.
- Rollback deletes imported domain rows only; cash audit history unchanged.

## Tests added/updated

- `src/lib/import-rollback.test.ts` — 17 cases
- `src/lib/import-rollback-service.test.ts` — 6 cases

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (928 tests) |

## Supabase validation

Remote migration `025_import_batch_rollback` applied via Supabase MCP.

## Browser smoke result

**PASS** — `.tmp-smoke-100.mjs` against `http://127.0.0.1:5199`:

- Settings shows Import history
- Batch review opens grouped preview with eligibility labels
- Cancel makes no deletes
- Confirm rollback deletes eligible imported records and shows result summary
- Status updates in history
- Dashboard, Bills, Expenses, Debt, Settings load without console errors

## Remaining known limitations

- Rollback is partial by design when protected/cash-audited rows remain
- `updated` import records are never deleted on rollback
- Re-import after rollback is a separate import flow (not deduped against rolled-back rows)

## Ready to commit

Yes — validation and smoke pass; scope matches C100; no credentials changed.

## Next recommended task

**CASHFLOW-CURSOR-101**
