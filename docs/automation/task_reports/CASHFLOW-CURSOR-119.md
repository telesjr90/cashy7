# CASHFLOW-CURSOR-119 — Calendar view

## Result

**PASS**

## Files changed

| File | Change |
|------|--------|
| `src/lib/cashflow-calendar.ts` | Pure calendar display model: month grid, events, daily net effect, forecast/debt summaries |
| `src/lib/cashflow-calendar.test.ts` | Required helper regression tests (20 cases) |
| `src/components/cashflow-calendar.tsx` | Read-only month grid, chronological list, day detail sheet |
| `src/pages/calendar.tsx` | Calendar page with month selector and dashboard-aligned data loading |
| `src/App.tsx` | `/calendar` route and Calendar nav link |
| `scripts/smoke-calendar-view.mjs` | Browser smoke for calendar and core routes |
| `docs/automation/task_reports/CASHFLOW-CURSOR-119.md` | Task report |
| `docs/automation/task_reports/CASHFLOW-CURSOR-119.result.json` | Machine-readable report |

## Schema/RLS decision

- **No migration.**
- **RLS unchanged.** Calendar is derived from existing queries/helpers (`bill_instances`, `debt_payments`, own-user savings/paycheck/cash snapshot, household-shared bills/debt/expenses).

## What was implemented

### Pure helper (`cashflow-calendar.ts`)

- Builds month grid with weekday alignment, period buckets, and capped visible events per day.
- Builds chronological day summaries with income, obligations, net effect, and forecast balance when available.
- Reuses `buildSafeToSpendForecast`, paycheck schedule helpers, savings target/contribution helpers, debt progress totals, and cashflow-start filters.
- Debt-linked bill/debt payment dedupe matches forecast behavior.

### UI

- Dedicated read-only page at `/calendar` with month/year selector, prev/next, and Today shortcut.
- Month grid + chronological list hybrid (Actual Budget reference pattern).
- Day detail sheet for overflow/capped cells.
- Loading, error, empty, missing profile, missing cash snapshot, and disabled paycheck schedule states.

### Navigation

- Added Calendar nav item with active state on `/calendar`.

## Calendar event/model behavior

Event types: `bill`, `debt_payment`, `savings`, `expense`, `income`, `safe_to_spend`, `remaining_debt`, `period_marker`.

Each event includes date, title, amount/effect, signed-in user share label, status (paid/unpaid/variable-needs-confirmation/etc.), source label, warnings, and whether it counts toward daily net effect. Labels are UUID-free.

## Calendar UI behavior

- Month selector mirrors Dashboard patterns.
- Grid shows compact badges (max 3/day) with `+N more` and sheet detail.
- Chronological list groups by date with net effect and projected balance when forecast data exists.
- Month summary card shows income, obligations, net effect, and remaining debt.

## Forecast/safe-to-spend behavior

- Uses existing `buildSafeToSpendForecast` for full selected month (`periodView: "full"`).
- Month summary exposes forecast ending balance and incomplete reasons.
- Per-day projected balance appears in the chronological list from forecast event dates when cash snapshot exists.
- **Limitation:** Full per-day safe-to-spend event rows are not duplicated in the grid; C119 shows month-level forecast summary plus per-day net effect from obligations/income. Detailed forecast rows remain on Dashboard.

## Privacy behavior

- Paycheck income from signed-in user's schedule only (`getMyPaycheckSchedule`, `filterOwnPaycheckIncomeEvents`).
- Savings targets/contributions filtered to own user (`filterOwnSavingsParticipants`, `filterOwnSavingsContributions`).
- Cash snapshot is own-user only (`getMyLatestCashSnapshot`).
- No raw UUIDs in user-facing labels.
- No mutations to bills, debt, expenses, savings, cash, receipts, or imports.

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (1271 tests) |

## Browser smoke result

| Check | Result |
|-------|--------|
| `npm run dev -- --host 127.0.0.1 --port 5219 --strictPort` | PASS |
| `node scripts/smoke-calendar-view.mjs` | PASS |
| Calendar nav/route | PASS |
| Month selector + grid + list | PASS |
| Dashboard/Bills/Expenses/Debt/Settings | PASS |
| Paycheck preview in Settings | PASS |
| Console errors | None |

## Remaining known limitations

- Per-day safe-to-spend forecast rows are summarized at month level rather than fully mirrored in every day cell (by design for C119 scope).
- Remaining debt is month-level summary, not exact per-day balance after each payment.
- Print CSS (C120) and CSV export (C121) not included.

## Exact next recommended small task

**CASHFLOW-CURSOR-120** — Printable calendar/report view with print CSS.

## Ready to commit

Yes — validation and browser smoke pass; scope matches C119; no credentials or schema changes.
