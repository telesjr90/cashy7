# CASHFLOW-CURSOR-121 — CSV export

## Result

**PASS**

## Summary

Added privacy-safe, client-side CSV export for the monthly cashflow report at `/reports/monthly`. Export is derived from the existing `buildMonthlyPrintReport` model with RFC 4180 escaping, formula-injection protection, and browser download via `Blob` + object URL.

## Files changed

- `src/lib/csv-export.ts` — pure CSV generation, escaping, formula neutralization, filename sanitization, browser download helper
- `src/lib/csv-export.test.ts` — CSV helper unit tests
- `src/lib/monthly-report-export.ts` — maps monthly print report sections to normalized CSV rows
- `src/lib/monthly-report-export.test.ts` — report export unit tests
- `src/pages/monthly-report.tsx` — Export CSV button, loading/error/success states
- `scripts/smoke-csv-export.mjs` — browser smoke for export download and route regression
- `docs/automation/task_reports/CASHFLOW-CURSOR-121.md`
- `docs/automation/task_reports/CASHFLOW-CURSOR-121.result.json`

## Schema / RLS

No migration. No RLS changes. Export is read-only and derived from existing report helpers that already enforce own-user cash, paycheck, and savings privacy.

## Behavior

- `/reports/monthly` shows **Export CSV** beside **Print report** (`.no-print`).
- Exports the currently selected month as `cashflow-report-YYYY-MM.csv`.
- One CSV file with normalized rows and required columns: `section`, `type`, `date`, `period`, `title`, `status`, `category`, `amount`, `effect`, `source`, `notes`, `warning`, `privacy_scope`.
- Sections: metadata, cash position, bills, debt, savings, expenses, income, forecast, warnings, calendar/list events.

## CSV security

- RFC 4180 quoting for commas, quotes, CR/LF.
- UTF-8 BOM for Excel compatibility.
- Formula injection neutralization for `=`, `+`, `-` (text), `@`, tab, CR prefixes.
- Safe currency/numeric strings preserved.
- Filename sanitizer strips unsafe characters; no UUIDs or emails in filename.

## Privacy

- Own-user cash, paycheck, savings only.
- Household-shared bills/debt/expenses/calendar events per existing RLS-backed report model.
- No raw UUIDs, secrets, or other-user private labels in export.
- No data mutations.

## Validation

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test:run` — PASS (1312 tests)

## Browser smoke

- Dev server: `npm run dev -- --host 127.0.0.1 --port 5221 --strictPort`
- `node scripts/smoke-csv-export.mjs` — PASS

## Next task

CASHFLOW-CURSOR-122
