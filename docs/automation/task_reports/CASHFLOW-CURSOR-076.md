# CASHFLOW-CURSOR-076 — Debt edge-case validation

## Result

**PASS**

## Summary

Added focused regression tests for debt payment delete/edit/sync/archive/audit edge cases across existing pure helpers. No product behavior changes were required — all new tests pass against current helpers.

## Scope

Tests-only task. No migrations, RLS changes, RPCs, or product logic changes.

## Files changed

- `src/lib/debt-edge-cases.test.ts` — new centralized C076 regression suite (24 tests)
- `src/lib/debt-accounts.test.ts` — `isDebtScheduleActionAllowed` archive guard test

## Edge cases covered

| Area | Coverage |
|------|----------|
| Delete paid payment protection | Schedule replacement mutation excludes paid, cash-deducted, and historical rows; paid protection priority |
| Delete unpaid payment behavior | Replaceable unpaid rows and linked bill delete candidates |
| Edit scheduled unpaid payment | 51/49 split sync consistency; unpaid balance edit does not mutate account balance |
| Edit paid-through-app payment | `applyPaidDebtPaymentAmountEdit` boundaries; paid history guard messaging |
| Linked bill sync | Pay/unpay balance direction; debt-linked bill edit/delete blocks on Bills detail; debt payment detail linked bill context |
| Duplicate payment prevention | Preserved months skip proposed duplicate rows; create mutation excludes skipped months |
| Archive/closed account behavior | Schedule replacement blocked; archived accounts excluded from active progress totals; archived labels on debt payment and bill detail |
| Detail/audit fallback behavior | No raw UUIDs; missing linked bill fallback; privacy-safe cash record fallback |

## Bug fixes

None. All edge cases validated against existing helper behavior.

## Privacy guarantees preserved

- Tests assert privacy-safe cash fallback labels when no visible transaction
- Tests assert no raw UUIDs in debt payment detail user-facing strings
- No changes to RLS, cash exposure, or payment visibility rules

## Product rules preserved

- Mark paid, Pay & deduct cash, schedule replacement (C072), archive/reopen (C073), progress dashboard (C074), debt payment detail (C075), Bills filters/detail unchanged
- No migrations or RPC changes

## Validation

| Command | Result |
|---------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:run` | PASS (523 tests) |

## Browser smoke

| Check | Result |
|-------|--------|
| Dashboard loads | PASS |
| Bills page loads | PASS |
| Debt page loads | PASS |
| Expenses page loads | PASS |
| Settings page loads | PASS |
| No console errors | PASS |

## Remaining known limitations

- Unpaid payment edit linked-bill sync payload logic remains inline in `debt.tsx` (not extracted to a pure helper); tests validate split/balance boundaries via existing format helpers
- Row-level delete of paid payments (with balance restore) is existing product behavior outside schedule-replacement scope — not changed by this task

## Next recommended task

**CASHFLOW-CURSOR-077**
