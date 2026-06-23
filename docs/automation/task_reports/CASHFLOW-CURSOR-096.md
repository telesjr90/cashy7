# CASHFLOW-CURSOR-096 — Import preview and column mapping

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend existing `ImportUploadCard` with child panel | **Chosen** |
| New route for column mapping | Rejected — mapping is contextual to Settings import staging |
| Inline-only without child component | Rejected — mapping UI is large enough to warrant `ImportColumnMappingPanel` |

Smallest safe surface: extend the existing Settings import card with sheet selection, column mapping controls, mapped preview table, and disabled validate-next action. No route or `App.tsx` changes.

## Files changed

| File | Change |
|------|--------|
| `src/lib/import-column-mapping.ts` | Pure mapping helpers, auto-detect, preview, conflicts, warnings |
| `src/lib/import-column-mapping.test.ts` | 15 Vitest cases |
| `src/lib/import-upload.ts` | Mapping/validation copy constants |
| `src/components/import-column-mapping-panel.tsx` | Column mapping UI section |
| `src/components/import-upload-card.tsx` | Sheet selection, mapping state, panel integration |
| `docs/automation/task_reports/CASHFLOW-CURSOR-096.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-096.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration or RLS change.**

Mapping and preview are client-side only. No Supabase writes, storage, or batch tables.

## Behavior implemented

### Mapping helpers (`import-column-mapping.ts`)

- Builds source column options from parsed sheet headers or `Column A/B/C` fallbacks.
- Conservative auto-detect for English and listed Portuguese headers.
- User-overridable mapping with per-field clear, reset-to-suggested, and clear-all.
- Duplicate source-column selection clears the prior field (conflict prevention).
- Required-field reminders for core fields (month, period, due date, name, amount).
- Mapped preview rows with source row number and mapped field values.
- Readable field labels (no raw UUIDs in labels).

### Import card UI

- After successful parse, **Column mapping** section appears for the selected sheet.
- Multi-sheet workbooks expose a sheet selector; changing sheets resets suggested mapping for that sheet.
- Detected columns list, grouped mapping selects (core, type markers, optional).
- Mapped row preview table updates as mappings change.
- Copy: mapped rows are candidates only, no app records changed, validation happens next.
- **Next: validate rows** remains disabled (C097).
- Remove file / new file / re-parse clears mapping state.

### Not implemented (later tasks)

- Row-level validation errors (C097).
- Confirmed writes, batches, rollback (C098–C100).

## Candidate-only / no-write guarantees

- Mapped rows stay in component state only.
- No bills, bill instances, debt payments, expenses, savings, cash snapshots, or payment transactions created.
- No file upload to Supabase; no file contents stored server-side.
- No RLS/RPC/schema changes.

## Tests added/updated

- `src/lib/import-column-mapping.test.ts` — 15 cases covering column options, auto-detect, overrides, reset/clear, conflicts, preview rows, warnings, and label privacy.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (840 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-096.mjs` against `http://127.0.0.1:5192`:

- Settings and Spreadsheet import card load
- `.csv` can be selected and parsed; column mapping section appears
- Auto-suggested mappings appear when headers match
- User can change, clear, and reset mappings
- Mapped preview table and candidate/no-write/validation copy visible
- `.xlsx` can be selected and parsed; multi-sheet selector works
- Unsupported file type still shows C094 error
- Remove/reset clears file, parse result, and mapping state
- Dashboard, Bills, Expenses, Debt, and Settings savings section load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Mapping state is lost on navigation (acceptable for C096).
- Auto-detect is conservative; ambiguous headers may need manual mapping.
- Required-field warnings are informational only; they do not block mapping.
- Full row validation and import writes remain in C097+.

## Next recommended task

**CASHFLOW-CURSOR-097 — Import row validation**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
