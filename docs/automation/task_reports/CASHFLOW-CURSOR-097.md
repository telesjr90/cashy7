# CASHFLOW-CURSOR-097 — Import validation errors

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend `ImportUploadCard` with `ImportValidationPanel` child | **Chosen** |
| New route for validation review | Rejected — validation is contextual to Settings import staging |
| Dialog for row issues | Rejected — users need summary counts and filterable table together |

Smallest safe surface: automatic in-memory validation below the existing column mapping panel, with summary counts, filterable preview table, expandable issue messages, and disabled confirm-writes placeholder. No route or `App.tsx` changes.

## Files changed

| File | Change |
|------|--------|
| `src/lib/import-validation.ts` | Pure validation model, row-type inference, date/month/period parsing, summary/filter helpers |
| `src/lib/import-validation.test.ts` | 26 Vitest cases |
| `src/lib/import-column-mapping.ts` | `buildAllMappedRows` helper for full-sheet validation |
| `src/lib/import-upload.ts` | Validation/confirm-writes copy constants |
| `src/components/import-validation-panel.tsx` | Validation summary, filters, preview table, continue messaging |
| `src/components/import-column-mapping-panel.tsx` | Remove disabled validate button; validation runs automatically below |
| `src/components/import-upload-card.tsx` | Wire automatic validation after mapping |
| `docs/automation/task_reports/CASHFLOW-CURSOR-097.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-097.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration or RLS change.**

Validation is client-side only. No Supabase writes, storage, or batch tables.

## Behavior implemented

### Validation helpers (`import-validation.ts`)

- Explicit types for row issues, statuses, validated rows, and summary.
- Mapping-level issues for missing name, amount/shares, date context, and type markers.
- Row-type inference from bill/debt/expense/savings markers with `unknown` and `ambiguous` handling.
- Common field validation: name, amount, shares, reconciliation, optional category/notes.
- Row-type-specific rules for bill, debt, expense, and savings candidates.
- Month/date/period parsing and normalization to app buckets (`1_14`, `15_eom`).
- Empty parsed rows marked `skipped`.
- Summary counts and `canContinue` when no error rows remain.
- Filter helper for all/errors/warnings/valid/skipped.
- Display sanitization to avoid raw UUIDs and local file paths in user-facing text.

### Validation UI

- Appears automatically after parse + mapping on the selected sheet.
- Summary counts: total, valid, warning, error, skipped, can continue.
- Mapping-level alerts when core mappings are incomplete.
- Filterable validation table with sheet, row, type, status badge, key values, and expandable issues.
- Blocking copy when errors remain; warning-only guidance for C098.
- Disabled **Next: confirm import writes** placeholder.
- Candidate-only / no-write copy preserved.
- Remove/reset/re-parse clears validation with mapping state.

### Not implemented (later tasks)

- Confirmed import writes (C098).
- Duplicate/re-import strategy (C099).
- Rollback/delete imported batch (C100).

## Candidate-only / no-write guarantees

- Validated rows stay in component state only.
- No bills, bill instances, debt payments, expenses, savings, cash snapshots, or payment transactions created.
- No file upload to Supabase; no file contents stored server-side.
- No RLS/RPC/schema changes.

## Tests added/updated

- `src/lib/import-validation.test.ts` — 26 cases covering valid row types, errors, shares, periods, dates, summary, filters, mapping-level issues, and privacy-safe labels.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (866 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-097.mjs` against `http://127.0.0.1:5193`:

- Settings and Spreadsheet import card load
- `.csv` can be selected and parsed; column mapping and validation panel appear
- Valid and error row statuses visible; error/valid filters work
- Summary counts and no-write copy visible
- **Next: confirm import writes** remains disabled
- Remove/reset clears validation state
- `.xlsx` parses and validates across sheets
- Dashboard, Bills, Expenses, Debt, and Settings savings section load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Validation state is lost on navigation (acceptable for C097).
- Unknown row type when no marker is mapped is an error; users must map type markers for reliable inference.
- Parser drops wholly empty spreadsheet lines before validation (skipped status applies to parser-empty rows only when they remain in the candidate set).
- Warning-only rows may or may not proceed in C098.
- Import writes remain disabled until C098.

## Next recommended task

**CASHFLOW-CURSOR-098 — Confirm import writes**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
