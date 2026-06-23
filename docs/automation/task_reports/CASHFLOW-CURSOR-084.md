# CASHFLOW-CURSOR-084 — Dashboard savings drilldown

## Result

**PASS**

## UI scope decision

| Option | Verdict |
|--------|---------|
| Reuse existing `DashboardDrilldownPanel` Sheet from C064/C082/C083 | **Chosen** |
| New route | Rejected |
| Inline panel only | Rejected — Sheet already exists |
| `App.tsx` changes | Avoided |
| Migrations / RLS / RPCs | Avoided |

Smallest safe surface: harden the existing savings Sheet drilldown on the Dashboard with pure helpers for row selection, labels, reconciliation, shared-goal privacy copy, and local filters.

## Files changed

| File | Change |
|------|--------|
| `src/lib/dashboard-savings-drilldown.ts` | Pure helpers: included rows, display model, reconciliation, local filters, privacy guards |
| `src/lib/dashboard-savings-drilldown.test.ts` | Vitest coverage for C084 contract |
| `src/components/dashboard-drilldown-panel.tsx` | Savings drilldown summary, rows, filters, reconciliation, read-only copy, Settings link |
| `src/pages/dashboard.tsx` | Wire helper, clickable after-savings card, reconciliation props |
| `docs/automation/task_reports/CASHFLOW-CURSOR-084.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-084.result.json` | Machine-readable report |

## Migration created

No.

## Behavior implemented

### Savings drilldown

- **Safe to spend after savings** card is clickable/tappable (keyboard Enter/Space supported) plus existing “View savings” link.
- Opens existing Sheet with kind `savings`.
- Shows only the signed-in user’s savings target and contribution rows included in the dashboard after-savings calculation for the selected month + period view.
- Read-only drilldown with link to **Settings → Savings** for edit/add workflows.

### Row fields

Target rows show: goal name, private/shared status, period label, period start/end when set, own target, own contributed amount, own remaining obligation, and source label “Your period target”.

Contribution rows show: date, amount, notes, source label “Your contribution”, and cash-deducted badge when a matching payment transaction is visible.

Rollover rows are not added — the dashboard after-savings formula does not include C080 rollover shortfall.

### Reconciliation

- Dashboard remaining savings obligation (after-savings impact)
- Sum of remaining obligations in listed target rows
- **Totals match** when equal
- Privacy-safe mismatch copy when totals differ (no hidden values exposed)

### Summary block

- Your savings target total
- Your contributions counted in this view
- Remaining savings obligation

### Local filters

- Text search by goal name, scope, source
- Private/shared filter
- Row type filter: period targets / contributions / cash-deducted contributions
- Clear filters; reconciliation always uses all included rows

### Context

- Drilldown header/description uses `June 2026 · Full month` style label via `buildDashboardBillViewLabel`.
- Empty state: “No savings targets or contributions are included in this view.”

## Privacy guarantees preserved

- Drilldown uses data already loaded through existing RLS-scoped helpers (`getMySavingsGoalParticipants`, `getMySavingsContributions`).
- Other-user participant/contribution rows are excluded even if accidentally passed in.
- Shared goals show explicit privacy copy; no other-user target/saved amount, combined saved total, or combined progress.
- No raw UUIDs in user-facing labels.
- C082 bill and C083 expense drilldown behavior preserved.

## Product rules preserved

- No dashboard formula changes.
- Savings edit/delete, detail, privacy, rollover, and cash-deduction behavior unchanged.
- Mark paid / Pay & deduct cash unchanged.
- No migrations, RLS, or RPC changes.

## Tests added/updated

- `src/lib/dashboard-savings-drilldown.test.ts` — inclusion/exclusion, privacy, reconciliation, filters, empty state, label safety.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (647 tests) |

## Browser smoke

**PASS** — `.tmp-smoke-084.mjs` against `http://127.0.0.1:5186`:

- Dashboard loads; after-savings card visible
- Full-month view opens savings drilldown with context, summary, reconciliation, read-only copy, Settings link
- Sheet closes normally
- C082 unpaid bill and C083 expense drilldowns still open
- Bills, Debt, Expenses, Settings load
- No console errors

## Supabase validation

Not applicable (no schema changes).

## Remaining known limitations

- Reconciliation may briefly mismatch while payment history or savings goals are still loading (same pattern as other dashboard drilldowns).
- Local filters hide rows visually but do not change reconciliation totals.
- Cash-deducted badges depend on visible payment transactions for the signed-in user only.

## Next recommended task

**CASHFLOW-CURSOR-085**

## Ready to commit

Yes — validation and browser smoke passed; scope matches task; no credentials committed.
