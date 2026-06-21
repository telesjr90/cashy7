# CASHFLOW-CURSOR-065 — Regular bill edit UI

## 1. Result

**PASS** — Regular bill instances on the Bills page can be edited through a dialog without changing paid status, debt sync, payment, savings, or dashboard formulas.

## 2. Files changed

| File | Change |
|------|--------|
| `src/lib/bill-edit.ts` | Pure helpers for edit eligibility, 51/49 split detection, validation, and update payload building |
| `src/lib/bill-edit.test.ts` | Vitest coverage for split, validation, and debt-linked eligibility |
| `src/components/bill-edit-panel.tsx` | Dialog form for editing regular bill fields with save/cancel and split controls |
| `src/pages/bills.tsx` | Edit action for regular bills only; wired save refresh; removed debt-linked readonly edit dialog |
| `docs/automation/task_reports/CASHFLOW-CURSOR-065.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-065.result.json` | Machine-readable report |

## 3. Migration created

No.

## 4. Behavior implemented

### UI scope decision

| Option | Verdict |
|--------|---------|
| Dialog on existing Bills page | **Chosen** |
| Inline panel in table row | Rejected — crowded table layout |
| Drawer | Rejected — dialog matches existing expense edit pattern |
| New route | Avoided — no deep-link requirement |

Smallest safe surface: shadcn `Dialog` opened from the existing Bills table Edit action. No route or schema changes.

### Editable fields (regular bills only)

- Bill name
- Total amount
- Teles amount
- Nicole amount
- Pay period (`1_14` / `15_eom`)
- Due date (optional)
- Notes (optional)

Paid status is preserved on save. Year/month are not edited in-place (bill stays in the viewed month list).

### Split behavior

- Bills using the default 51/49 split auto-recalculate Teles/Nicole when total amount changes.
- Custom splits are preserved until the user edits Teles/Nicole manually or clicks **Apply 51/49 split**.
- Uses existing `split5149` rounding behavior from `src/lib/format.ts`.

### Debt-linked bills

- Regular Edit action is hidden for debt-linked bill instances.
- Existing inline message still directs users to the Debt page.
- Debt bill display, paid/unpaid sync, and delete guard unchanged.

### Validation

- Rejects empty/invalid/non-positive totals and invalid share amounts.
- Rejects splits that do not add up to the total.
- Shows user-visible error in the dialog; no partial save.

## 5. Privacy guarantees preserved

- Updates only `bill_instances` rows already visible on the Bills page under existing RLS.
- No exposure of another user's cash, savings, or private payment transactions.
- No schema, RLS, RPC, or migration changes.

## 6. Product rules preserved

- Mark paid checkbox behavior unchanged.
- Pay & deduct cash behavior unchanged.
- Debt payment sync unchanged.
- Dashboard calculation formulas unchanged.
- Savings and expense logic unchanged.

## 7. Tests added/updated

- `src/lib/bill-edit.test.ts` — edit eligibility, default split detection, amount-change split recalculation, custom split preservation, validation, update payload mapping.

## 8. Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (356 tests) |

## 9. Browser smoke test result

**PASS** — Playwright smoke against `http://127.0.0.1:5180`:

- Bills page loads with Edit on regular bills
- Edit dialog opens/closes
- Invalid amount shows error and does not save
- Valid save closes dialog
- Debt-linked rows do not expose Edit
- Dashboard, Debt, Expenses, and Settings pages load
- No console errors observed

## 10. Remaining known limitations

- Bill month/year cannot be moved through this edit dialog (by design for this task scope).
- No category field on `bill_instances` (not in schema).

## 11. Exact next recommended small task

**CASHFLOW-CURSOR-066** — per task queue.

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials or migrations changed.
