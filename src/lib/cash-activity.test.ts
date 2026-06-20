import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import {
  DEBT_PAYMENT_DEDUCTION_FALLBACK_LABEL,
  buildBillInstanceNameLookup,
  buildDebtPaymentDescriptionLookup,
  buildManualExpenseDescriptionLookup,
} from "@/lib/payments";
import type {
  CashAdjustmentTransaction,
  CashPaymentTransaction,
} from "@/lib/types";
import {
  RECENT_CASH_ACTIVITY_DISPLAY_LIMIT,
  mapRecentCashActivityForDisplay,
} from "@/lib/cash-activity";
import { buildManualExpenseDescriptionLookup as buildAdjustmentManualExpenseDescriptionLookup } from "@/lib/cash-adjustments";

describe("mapRecentCashActivityForDisplay", () => {
  const deductions = [
    {
      id: "ded-1",
      household_id: "household-1",
      user_id: "user-1",
      person_id: null,
      source_type: "debt_payment",
      source_id: "debt-pay-1",
      amount: 50,
      previous_cash_snapshot_id: null,
      new_cash_snapshot_id: null,
      paid_at: "2026-06-18T12:00:00.000Z",
      notes: null,
      created_at: "2026-06-18T12:00:00.000Z",
    },
    {
      id: "ded-2",
      household_id: "household-1",
      user_id: "user-1",
      person_id: null,
      source_type: "manual_expense",
      source_id: "exp-1",
      amount: 5,
      previous_cash_snapshot_id: null,
      new_cash_snapshot_id: null,
      paid_at: "2026-06-20T10:00:00.000Z",
      notes: "Coffee",
      created_at: "2026-06-20T10:00:00.000Z",
    },
  ] satisfies CashPaymentTransaction[];

  const credits = [
    {
      id: "cred-1",
      household_id: "household-1",
      user_id: "user-1",
      person_id: null,
      source_type: "manual_expense_adjustment",
      source_id: "adj-1",
      amount: 3,
      previous_cash_snapshot_id: null,
      new_cash_snapshot_id: null,
      credited_at: "2026-06-20T12:00:00.000Z",
      notes: "Refund",
      created_at: "2026-06-20T12:00:00.000Z",
    },
  ] satisfies CashAdjustmentTransaction[];

  const lookups = {
    billInstanceNameById: buildBillInstanceNameLookup([]),
    debtPaymentDescriptionById: buildDebtPaymentDescriptionLookup([
      { id: "debt-pay-1", debt_accounts: { name: "Visa card" } },
    ]),
    manualExpenseDescriptionById: buildManualExpenseDescriptionLookup([
      { id: "exp-1", description: "Coffee shop" },
    ]),
    adjustmentManualExpenseDescriptionById: buildAdjustmentManualExpenseDescriptionLookup([
      { id: "adj-1", description: "Groceries correction" },
    ]),
  };

  it("merges deductions and credits newest first", () => {
    const rows = mapRecentCashActivityForDisplay({
      deductions,
      credits,
      lookups,
      limit: 10,
    });

    expect(rows.map((row) => row.id)).toEqual(["cred-1", "ded-2", "ded-1"]);
  });

  it("caps output to requested limit", () => {
    const rows = mapRecentCashActivityForDisplay({
      deductions,
      credits,
      lookups,
      limit: 2,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("cred-1");
    expect(rows[1]?.id).toBe("ded-2");
  });

  it("uses default display limit", () => {
    const manyDeductions = Array.from({ length: 6 }, (_, index) => ({
      ...deductions[0],
      id: `ded-extra-${index}`,
      paid_at: `2026-06-${10 + index}T12:00:00.000Z`,
    }));

    const rows = mapRecentCashActivityForDisplay({
      deductions: manyDeductions,
      credits,
      lookups,
    });

    expect(rows).toHaveLength(RECENT_CASH_ACTIVITY_DISPLAY_LIMIT);
  });

  it("uses minus-prefixed labels for deductions and positive currency for credits", () => {
    const rows = mapRecentCashActivityForDisplay({
      deductions,
      credits,
      lookups,
      limit: 10,
    });

    const deduction = rows.find((row) => row.kind === "deduction");
    const credit = rows.find((row) => row.kind === "credit");

    expect(deduction?.amountLabel).toBe("− CA$5.00");
    expect(credit?.amountLabel).toBe(formatCurrency(3));
    expect(credit?.amountLabel).not.toContain("−");
  });

  it("preserves debt payment descriptions from lookup", () => {
    const rows = mapRecentCashActivityForDisplay({
      deductions,
      credits: [],
      lookups,
      limit: 10,
    });

    const debtRow = rows.find((row) => row.id === "ded-1");
    expect(debtRow?.description).toBe("Visa card");
    expect(debtRow?.description).not.toBe(DEBT_PAYMENT_DEDUCTION_FALLBACK_LABEL);
  });

  it("uses human-readable fallbacks when descriptions are missing", () => {
    const rows = mapRecentCashActivityForDisplay({
      deductions: [
        {
          ...deductions[0],
          id: "ded-unknown",
          source_id: "missing-debt-pay",
        },
      ],
      credits: [
        {
          ...credits[0],
          id: "cred-unknown",
          source_id: "missing-adj",
        },
      ],
      lookups,
      limit: 10,
    });

    expect(rows[0]?.description).toBe("Manual expense adjustment");
    expect(rows[1]?.description).toBe(DEBT_PAYMENT_DEDUCTION_FALLBACK_LABEL);
    expect(rows.some((row) => row.description.includes("missing"))).toBe(false);
    expect(rows.some((row) => row.description.includes("debt-pay"))).toBe(false);
  });

  it("returns empty rows for empty input", () => {
    expect(
      mapRecentCashActivityForDisplay({
        deductions: [],
        credits: [],
        lookups,
      })
    ).toEqual([]);
  });
});
