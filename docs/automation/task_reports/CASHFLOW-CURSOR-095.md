# CASHFLOW-CURSOR-095 — Spreadsheet parser

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Extend existing `ImportUploadCard` | **Chosen** |
| New parse preview route | Rejected — parse preview is contextual to Settings import staging |
| Separate child component file | Rejected — card remains cohesive and C094-sized |

Smallest safe surface: extend the existing Settings import card with explicit **Parse file** action, parse status, summary, sheet list, and candidate row preview. No route or `App.tsx` changes.

## Dependency decision

| Package | Decision | Why |
|---------|----------|-----|
| `xlsx` (SheetJS) | **Added** | No spreadsheet parser existed. Required for client-side `.xlsx` workbook/sheet parsing. |
| CSV parser dependency | **Not added** | Small RFC 4180-style parser implemented in `import-parser.ts` with quoted-comma/newline tests. |

## Files changed

| File | Change |
|------|--------|
| `package.json` | Add `xlsx` dependency |
| `package-lock.json` | Lock `xlsx` |
| `src/lib/import-parser.ts` | Pure parser helpers, types, CSV + XLSX parsing, warnings/errors |
| `src/lib/import-parser.test.ts` | 14 Vitest cases |
| `src/lib/import-upload.ts` | Parse-step copy constants and next-step label update |
| `src/components/import-upload-card.tsx` | Parse action, status, summary, sheet list, preview, reset |
| `docs/automation/task_reports/CASHFLOW-CURSOR-095.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-095.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration or RLS change.**

Parsing is client-side only. No Supabase Storage, no import batch tables, and no app record writes.

## Behavior implemented

### Parser (`import-parser.ts`)

- Detects `.csv` vs `.xlsx` from validated file metadata/extension.
- **CSV**: one logical sheet (`CSV`), header-row heuristic, quoted fields, empty-row skip.
- **XLSX**: all workbook sheets, preserved sheet names, normalized cell values, empty-row skip, zip-signature guard for corrupt files.
- Returns candidate-only `ImportParseResult` with sheets, rows, warnings, and totals.
- Stable row ids (`sheet-slug:rowNumber`), no UUIDs.
- Sanitized file names and error messages (no local full paths).

### Import card UI

- **Parse file** button after valid selection (explicit user action).
- Parse status: ready / parsing / parsed / error.
- Parsed summary: file name, kind, sheet count, total rows, non-empty rows, warnings count.
- Sheet list with row counts.
- Preview of first five candidate rows.
- Copy: candidates only, no app records changed, column mapping next.
- **Next: preview and map columns** remains disabled (C096).
- **Remove file** clears file and parse result.

### Not implemented (later tasks)

- Column mapping, app-level validation, confirmed writes, batches, rollback.

## Candidate-only / no-write guarantees

- Parsed rows stay in component state only.
- No bills, bill instances, debt payments, expenses, savings, cash snapshots, or payment transactions created.
- No file upload to Supabase; no file contents stored server-side.
- No RLS/RPC/schema changes.
- No file contents logged.

## Tests added/updated

- `src/lib/import-parser.test.ts` — 14 cases covering CSV/XLSX parsing, warnings, corrupt files, ids, and path privacy.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (825 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-095.mjs` against `http://127.0.0.1:5191`:

- Settings and Spreadsheet import card load
- `.csv` can be selected and parsed; summary and preview visible
- `.xlsx` can be selected and parsed; sheet row counts visible
- Unsupported file still shows C094 validation error
- Remove/reset clears file and parse result
- Candidate/no-write/mapping copy visible
- Dashboard, Bills, Expenses, Debt, Settings savings section load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Parse result is lost on navigation (acceptable for C095).
- CSV header detection is heuristic (numeric first rows are treated as data).
- Large workbooks increase client memory use; 10 MB upload cap from C094 still applies.
- Column mapping/preview step remains disabled until C096.

## Next recommended task

**CASHFLOW-CURSOR-096 — Import column mapping / preview**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
