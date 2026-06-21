# CASHFLOW-CURSOR-068 — Recurring edit branching prompt

## 1. Result

**PASS** — Generated recurring bill instances now show an explicit edit-scope prompt before save. Instance-only edits stay local; template-and-future edits update the recurring template and eligible unpaid generated rows without touching paid, cash-deducted, debt-linked, or manual instances.

## 2. Files changed

| File | Change |
|------|--------|
| `src/lib/recurring-bill-edits.ts` | Pure helpers for branching detection, template mapping, bulk candidate filtering, and edit plans |
| `src/lib/recurring-bill-edits.test.ts` | Vitest coverage for branching rules and payload builders |
| `src/components/bill-edit-panel.tsx` | Scope confirmation dialog and save paths for instance-only vs template-and-future |
| `src/pages/bills.tsx` | Pass template/context into edit panel; merge template + bulk instance updates in page state |
| `docs/automation/task_reports/CASHFLOW-CURSOR-068.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-068.result.json` | Machine-readable report |

## 3. Schema decision

**No migration.**

Existing schema already supports branching behavior:

- `bill_instances.bill_id` links generated rows to recurring templates
- `bill_instances.year` / `month` identify instance period for same-or-future bulk updates
- `bill_instances.paid_status` / `is_paid` protect historical paid rows
- `bill_instances.notes` uses the C067 `[Generated for {Month} {Year}]` prefix to distinguish generated rows from manual template-linked rows
- `bills` stores recurring template defaults (`default_amount`, `due_day`, `period_bucket`, `category`, `notes`, active range, `is_variable`)

Cash-deducted and debt-linked protection uses existing payment/debt context already loaded on the Bills page — no new columns or RPCs required.

## 4. UI scope decision

| Option | Verdict |
|--------|---------|
| Nested confirmation inside existing `BillEditPanel` dialog | **Chosen** |
| New route | Rejected — no deep-link requirement |
| Separate page workflow | Rejected — over-scoped |

## 5. Behavior implemented

### Branching detection

- **Manual instances** (`bill_id` null): existing C065 save path, no prompt
- **Generated recurring instances** (`bill_id` set + generated notes prefix): prompt before save
- **Debt-linked instances**: still blocked from regular edit at page level; no branching prompt

### Prompt options

1. **Edit this bill only** — updates selected `bill_instances` row only
2. **Edit this and future bills** — updates recurring `bills` template plus eligible generated instances from the same template
3. **Cancel** — no database changes

Copy includes:

- Paid bills will not be changed
- Debt-linked bills are managed from Debt

### Instance-only path

- Updates only the selected instance via existing C065 validation and payload builder
- Does not update template or other instances
- Paid status / cash-deduction behavior unchanged

### Template-and-future path

- Maps safe instance edit fields onto template update (`name`, `default_amount`, `due_day` from due date, `period_bucket`, `notes` with generated prefix stripped)
- Preserves template `category`, active range, `is_variable`, and `is_active`
- Bulk-updates same-or-later generated instances that are:
  - linked to the template
  - marked generated via notes prefix
  - unpaid
  - not debt-linked
  - not cash-deducted
- Recalculates per-month due dates from template due day and reapplies generated notes prefix
- Paid historical rows are never included in bulk updates

### Boundaries preserved

- No RLS changes
- No RPCs
- No migrations
- Pay & deduct cash unchanged
- Mark paid unchanged
- Dashboard / safe-to-spend / debt schedule generation unchanged
- No automatic regeneration of monthly instances beyond explicit safe bulk updates

## 6. Historical paid-record protection

Bulk candidate selection excludes any instance where `paid_status === "paid"` or `is_paid === true`. Template-and-future saves therefore never rewrite paid historical generated rows. Cash-deducted and debt-linked rows are also excluded.

## 7. Tests added/updated

`src/lib/recurring-bill-edits.test.ts` covers:

- manual vs generated branching requirement
- debt-linked exclusion from branching
- instance-only payload scope
- template update mapping
- paid / cash-deducted / debt-linked / manual bulk exclusions
- due-day extraction and generated notes handling
- invalid amount validation integration

## 8. Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (412 tests) |

## 9. Browser smoke test

**PASS** — `.tmp-smoke-068.mjs`

Verified:

- Core pages load without console errors
- Template create + monthly generation still works
- Generated bill edit shows branching prompt with required copy
- Cancel makes no persisted change
- Instance-only path updates only the selected generated row while template name stays unchanged

## 10. Privacy / product rules

- PASS — no cross-user cash, savings, or private payment exposure
- PASS — mark paid vs pay & deduct cash semantics unchanged
- PASS — debt-linked bills remain protected from regular edit branching

## 11. Remaining known limitations

- Bulk future-instance updates require fetching all template-linked instances for the household; very large histories may benefit from a future server-side filter task, but current volume is safe client-side
- Instance edit form does not expose template-only fields (`category`, `is_variable`, active range); those remain on the template panel
- Variable template amount edits on instance form set template `default_amount`; variable placeholder behavior for future generation remains C069 scope

## 12. Exact next recommended small task

**CASHFLOW-CURSOR-069** — Variable bill warning workflow for generated variable templates.
