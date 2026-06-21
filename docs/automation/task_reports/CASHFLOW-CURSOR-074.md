# CASHFLOW-CURSOR-074 — Debt progress dashboard

## Result

**PASS**

## UI scope decision

| Option | Decision |
|--------|----------|
| Reuse existing component | Reused Debt page layout, Card, Table, Progress, Badge |
| Inline panel | Rejected — summary spans multiple accounts and needs grouped cards |
| Dialog/drawer | Rejected — read-only overview belongs on page, not hidden |
| New route | Rejected — no deep-link requirement |

**Chosen pattern:** Inline dashboard section at the top of the existing Debt page via `DebtProgressDashboard`, backed by pure helpers in `debt-progress.ts`.

**Why:** Smallest safe surface that shows household and per-account payoff progress without changing payment, bill, cash, or dashboard behavior.

**Files expected to change:** `src/lib/debt-progress.ts`, `src/lib/debt-progress.test.ts`, `src/components/debt-progress-dashboard.tsx`, `src/pages/debt.tsx`

**Files intentionally avoided:** `src/App.tsx`, migrations, RLS, RPCs, payment/bill sync modules, dashboard formulas

## Files changed

- `src/lib/debt-progress.ts` — pure read-only debt progress calculations
- `src/lib/debt-progress.test.ts` — helper unit tests
- `src/components/debt-progress-dashboard.tsx` — summary cards and per-account progress table
- `src/pages/debt.tsx` — wires progress helpers and dashboard above existing sections
- `docs/automation/task_reports/CASHFLOW-CURSOR-074.md`
- `docs/automation/task_reports/CASHFLOW-CURSOR-074.result.json`

## Schema decision

**No migration.** Existing fields support read-only summaries:

- `debt_accounts.original_amount`, `is_archived`
- `debt_payments.total_payment`, `paid_status`, `payment_date`

Payoff estimates derive from unpaid scheduled payment rows only.

## Behavior implemented

- **Active summary cards:** total original, total paid, total remaining, overall progress %, next payment due, estimated payoff (active accounts only)
- **Per-account progress table:** remaining balance, progress bar, next payment, unpaid scheduled count, estimated payoff label
- **Archived section:** shown only when C073 “Show archived/closed accounts” is enabled; labeled separately and excluded from active totals
- **Empty state:** dashboard card visible with guidance when no accounts exist
- Read-only — no mutations to debt, bill, payment, or cash rows
- Existing debt account list, payment controls, C072 replacement, and C073 archive/reopen unchanged

## Debt progress calculations

| Metric | Rule |
|--------|------|
| Total paid | Sum of `total_payment` where `paid_status === true` |
| Remaining | `original_amount - total_paid`, clamped at 0 |
| Progress % | `total_paid / original_amount`, clamped 0–100; 0 if original is 0 |
| Next payment | Earliest unpaid payment by `payment_date` |
| Upcoming | All unpaid payments sorted by date |
| Est. payoff | Date of last unpaid payment whose cumulative total reaches remaining balance; fallback **Not enough scheduled payments** |
| Paid off | Label **Paid off** when remaining is 0 |

## Active vs archived behavior

- Active totals use `filterActiveDebtAccounts` — archived accounts excluded by default
- Archived progress rows appear in a separate labeled section when the C073 toggle is on
- Archived badge (`Archived` / `Closed`) shown on archived progress rows
- Active totals never mix archived balances unless user reads the separate archived section (explicitly labeled “not included in active totals”)

## Privacy guarantees preserved

- No private cash, savings, or expense data exposed
- No UUIDs shown in UI
- Read-only queries on existing household-scoped debt data

## Tests added/updated

- `src/lib/debt-progress.test.ts` — 13 cases covering paid filtering, balances, progress clamping, next/upcoming payments, payoff estimate/fallback, archived totals exclusion, zero-original guard

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (485 tests) |

## Browser smoke test result

**PASS** — Debt progress dashboard visible; active summary metrics when active accounts exist; archived toggle respected; archive dialog cancel; payment edit dialog cancel; C072 replacement cancel; Bills/Dashboard/Expenses/Settings load; no console errors.

## Remaining known limitations

- Household estimated payoff uses the latest active-account payoff date when all active accounts have estimable schedules; otherwise shows **Not enough scheduled payments**
- Per-account “total paid” in progress dashboard uses paid payment rows, which may differ slightly from `current_balance`-derived totals shown in the legacy accounts table (that table still uses existing C073 helper)

## Exact next recommended small task

**CASHFLOW-CURSOR-075**
