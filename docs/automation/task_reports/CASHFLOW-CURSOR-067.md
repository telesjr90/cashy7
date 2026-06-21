# CASHFLOW-CURSOR-067 — Generate monthly bill instances

## 1. Result

**PASS** — Monthly bill instances can be generated from recurring bill templates for the selected Bills page month, with duplicate-safe skipping and clear result messaging. No migration required.

## 2. Files changed

| File | Change |
|------|--------|
| `src/lib/bill-instance-generation.ts` | Pure planning/build helpers for month eligibility, due dates, 51/49 amounts, duplicate detection, and summary messaging |
| `src/lib/bill-instance-generation.test.ts` | Vitest coverage for generation rules and duplicate prevention |
| `src/lib/bill-templates.ts` | Generated-instance note prefix and `generated from template` source label |
| `src/lib/bill-templates.test.ts` | Source label test for generated instances |
| `src/components/bill-generation-dialog.tsx` | Preview + generate dialog wired to Supabase insert |
| `src/pages/bills.tsx` | Generate control, dialog wiring, result alert, source label notes |
| `docs/automation/task_reports/CASHFLOW-CURSOR-067.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-067.result.json` | Machine-readable report |

## 3. Schema decision

**No migration.**

Existing schema already supports duplicate-safe generation:

- `bills` stores recurring templates (`recurring`, `is_active`, `active_from`, `active_until`, `due_day`, `default_amount`, `is_variable`, `period_bucket`, `notes`)
- `bill_instances` links generated rows via `bill_id`, plus `year`, `month`, `due_date`, amounts, and `notes`

Duplicate key used in app logic: **`bill_id + year + month`**. Existing rows (manual or generated, paid or unpaid) are never updated or overwritten.

Generated rows are distinguished from manual template-linked rows using a notes prefix: `[Generated for {Month} {Year}]`.

## 4. Behavior implemented

### UI scope decision

| Option | Verdict |
|--------|---------|
| Dialog on Bills page near Bill Templates | **Chosen** |
| New route | Rejected — no deep-link requirement |
| Inline-only without preview | Rejected — preview/summary improves safety |

### Generation control

- **Generate monthly bills** button in Bill Templates section
- Uses the Bills page month/year selectors as the target period
- Dialog preview shows create / already-exist / inactive-or-out-of-range counts
- Confirm runs insert-only generation
- Result summary shown in dialog and page alert
- Safe rerun skips duplicates

### Generation rules

- Includes only `recurring` templates
- Skips inactive templates and templates outside `active_from` / `active_until` for the selected month
- Computes due date from `due_day`, clamping to month length (e.g. day 31 → Feb 28)
- Copies `period_bucket`, name, and notes
- Fixed templates use `default_amount` with `split5149`
- Variable templates with no default generate amount `0` (visible for C069); placeholder defaults are used when present
- Never mutates existing instances

### Source labels

Bill list shows:

- `generated from template` for generated rows
- `template` for manual template-linked rows
- `manual instance` / debt messaging unchanged

### Boundaries preserved

- No recurring edit branching (C068)
- No variable bill warning workflow (C069)
- No bill filters/search (C070)
- No bills audit/detail view (C071)
- Debt payment schedule generation unchanged
- Pay & deduct cash, mark paid, dashboard formulas unchanged

## 5. Duplicate prevention strategy

Before insert, the dialog loads existing `bill_instances` for the target `year` + `month`. `planBillInstanceGeneration()` skips any template when an instance already exists with the same `bill_id`, `year`, and `month`. Generation is insert-only; paid and manual rows are never updated.

## 6. Privacy guarantees preserved

- Uses existing household-scoped RLS on `bills` and `bill_instances`
- No exposure of private cash, savings, or payment transactions
- No schema or RPC changes

## 7. Tests added/updated

`src/lib/bill-instance-generation.test.ts` — 15 tests covering:

- Active/inactive/out-of-range month eligibility
- Due day clamping (Feb 31 → last day)
- Period bucket copy
- Fixed 51/49 split
- Variable template handling
- Duplicate prevention
- Paid/manual existing instance skip behavior

`src/lib/bill-templates.test.ts` — added generated source label test

## 8. Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (398 tests) |

## 9. Browser smoke test result

**PASS** — Bills generation dialog visible; first run creates instances labeled `generated from template`; second run reports already-existing skips; Bills/Templates/C065 edit/C066 template flows still load; Dashboard, Debt, Expenses, Settings load with no console errors.

## 10. Remaining known limitations

- Duplicate prevention is application-level only (no DB unique index on `bill_id + year + month`)
- Variable templates without a default amount generate `$0.00` instances until C069 warning workflow
- Custom split values entered in the template form are not persisted on the template row; generation uses default 51/49 from amount

## 11. Exact next recommended small task

**CASHFLOW-CURSOR-068** — Recurring bill edit branching (this instance vs future instances).
