# CASHFLOW-CURSOR-094 — Import upload UI

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Settings card named “Spreadsheet import” | **Chosen** |
| New `/import` route | Rejected — would require `App.tsx` and nav changes |
| Drawer/dialog workflow | Rejected — upload staging fits a persistent Settings section |

Smallest safe surface: a dedicated `ImportUploadCard` on the existing Settings page, below the cashflow start date card. No routing or navigation changes.

## Files changed

| File | Change |
|------|--------|
| `src/lib/import-upload.ts` | Pure helpers for extension, size, empty-file validation, metadata, and readable errors |
| `src/lib/import-upload.test.ts` | Vitest coverage for allowed/rejected files, metadata, and privacy-safe labels |
| `src/components/import-upload-card.tsx` | Settings card with file picker, drag/drop, summary, remove, and disabled next step |
| `src/pages/settings.tsx` | Wire spreadsheet import card |
| `docs/automation/task_reports/CASHFLOW-CURSOR-094.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-094.result.json` | Machine-readable report |

## Schema/RLS decision

**No migration or RLS change.**

Upload staging is client-side only in component state. No Supabase Storage, no import tables, and no writes are required for C094.

## Behavior implemented

### Spreadsheet import card (Settings)

- Accepts `.csv` and `.xlsx` via accessible file input and optional drag/drop on a labeled drop zone.
- Rejects unsupported extensions, empty files, and files over 10 MB with readable errors.
- Shows selected file metadata: name, extension, type, size, last modified, and selected status.
- Shows next-step copy that parsing/preview happens later and no records have changed.
- Provides **Remove file** to reset selection.
- **Next: parse and preview** button is visible but disabled (placeholder for C095/C096).

### Not implemented (later tasks)

- Row parsing, column mapping, row validation, confirmed writes, duplicate strategy, rollback.

## Upload validation behavior

| Rule | Behavior |
|------|----------|
| Extensions | `.csv`, `.xlsx` (case-insensitive) |
| Empty file | Rejected |
| Max size | 10 MB (shown in UI and tested) |
| MIME type | Informational; valid extension wins even when MIME is inconsistent |
| Paths | Basename only; full local paths never shown |

## Privacy / no-write guarantees

- Files stay in browser memory only; nothing uploaded to Supabase Storage.
- No parsing, mapping, or record creation.
- No changes to bills, expenses, debt, savings, cash snapshots, dashboard, or safe-to-spend logic.
- Error messages are privacy-safe; no file contents logged.

## Tests added/updated

- `src/lib/import-upload.test.ts` — 13 cases

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (811 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-094.mjs` against `http://127.0.0.1:5190`:

- Settings loads; Spreadsheet import section visible
- `.csv` file can be selected; summary and next-step copy shown
- `.xlsx` file can be selected
- Unsupported file shows readable error
- Remove/reset clears selection
- Copy confirms no records changed
- Dashboard, Bills, Expenses, Debt, and Settings savings section load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Selected file is lost on navigation (acceptable for C094).
- Next step button is disabled until parser/preview tasks land.
- Drag/drop accepts one file only (first dropped file).

## Next recommended task

**CASHFLOW-CURSOR-095 — Spreadsheet parser**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
