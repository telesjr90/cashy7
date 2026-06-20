import { describe, expect, it } from "vitest";
import {
  buildManualExpenseDescriptionLookup,
  getCreditedManualExpenseAdjustmentSourceIds,
  getLinkedAdjustmentDescription,
  getManualExpenseAdjustmentCashCreditAmount,
  isDecreaseManualExpenseAdjustment,
  isDuplicateCashAdjustmentCreditError,
  isManualExpenseAdjustmentEligibleForCashCredit,
  MANUAL_EXPENSE_ADJUSTMENT_CREDIT_FALLBACK_LABEL,
  mapCashAdjustmentCreditsForDisplay,
  validateCashCreditAmount,
} from "@/lib/cash-adjustments";
import type { CashAdjustmentTransaction } from "@/lib/types";

describe("isDecreaseManualExpenseAdjustment", () => {
  it("returns true for decrease adjustments", () => {
    expect(
      isDecreaseManualExpenseAdjustment({
        adjusts_manual_expense_id: "orig-1",
        adjustment_direction: "decrease",
      })
    ).toBe(true);
  });

  it("returns false for increase adjustments", () => {
    expect(
      isDecreaseManualExpenseAdjustment({
        adjusts_manual_expense_id: "orig-1",
        adjustment_direction: "increase",
      })
    ).toBe(false);
  });

  it("returns false for normal expenses", () => {
    expect(
      isDecreaseManualExpenseAdjustment({
        adjusts_manual_expense_id: null,
        adjustment_direction: null,
      })
    ).toBe(false);
  });
});

describe("isManualExpenseAdjustmentEligibleForCashCredit", () => {
  it("allows decrease adjustments", () => {
    expect(
      isManualExpenseAdjustmentEligibleForCashCredit({
        adjusts_manual_expense_id: "orig-1",
        adjustment_direction: "decrease",
      })
    ).toBe(true);
  });

  it("rejects increase adjustments", () => {
    expect(
      isManualExpenseAdjustmentEligibleForCashCredit({
        adjusts_manual_expense_id: "orig-1",
        adjustment_direction: "increase",
      })
    ).toBe(false);
  });

  it("rejects normal expenses", () => {
    expect(
      isManualExpenseAdjustmentEligibleForCashCredit({
        adjusts_manual_expense_id: null,
        adjustment_direction: null,
      })
    ).toBe(false);
  });
});

describe("getManualExpenseAdjustmentCashCreditAmount", () => {
  const expense = { teles_amount: 5, nicole_amount: 5 };

  it("uses signed-in user Teles share", () => {
    expect(getManualExpenseAdjustmentCashCreditAmount(expense, "teles_amount")).toBe(
      5
    );
  });

  it("uses signed-in user Nicole share", () => {
    expect(getManualExpenseAdjustmentCashCreditAmount(expense, "nicole_amount")).toBe(
      5
    );
  });

  it("returns null when share key is missing", () => {
    expect(getManualExpenseAdjustmentCashCreditAmount(expense, null)).toBeNull();
  });

  it("returns null when user share is zero", () => {
    expect(
      getManualExpenseAdjustmentCashCreditAmount(
        { teles_amount: 10, nicole_amount: 0 },
        "nicole_amount"
      )
    ).toBeNull();
  });
});

describe("getCreditedManualExpenseAdjustmentSourceIds", () => {
  it("extracts only manual_expense_adjustment source IDs", () => {
    const ids = getCreditedManualExpenseAdjustmentSourceIds([
      {
        source_type: "manual_expense_adjustment",
        source_id: "adj-1",
      },
      {
        source_type: "manual_expense_adjustment",
        source_id: "adj-2",
      },
    ]);

    expect(ids).toEqual(new Set(["adj-1", "adj-2"]));
  });

  it("returns an empty set when no credits exist", () => {
    expect(getCreditedManualExpenseAdjustmentSourceIds([])).toEqual(new Set());
  });
});

describe("isDuplicateCashAdjustmentCreditError", () => {
  it("detects duplicate cash adjustment errors", () => {
    expect(
      isDuplicateCashAdjustmentCreditError(new Error("DUPLICATE_CASH_ADJUSTMENT"))
    ).toBe(true);
    expect(
      isDuplicateCashAdjustmentCreditError({ message: "DUPLICATE_CASH_ADJUSTMENT" })
    ).toBe(true);
    expect(isDuplicateCashAdjustmentCreditError(new Error("other"))).toBe(false);
  });
});

describe("validateCashCreditAmount", () => {
  it("accepts positive amounts", () => {
    expect(validateCashCreditAmount(10)).toBeNull();
    expect(validateCashCreditAmount(0.01)).toBeNull();
  });

  it("rejects zero amount", () => {
    expect(validateCashCreditAmount(0)).toBe(
      "Enter a valid credit amount greater than zero."
    );
  });

  it("rejects negative amount", () => {
    expect(validateCashCreditAmount(-5)).toBe(
      "Enter a valid credit amount greater than zero."
    );
  });

  it("rejects invalid amounts", () => {
    expect(validateCashCreditAmount(Number.NaN)).toBe(
      "Enter a valid credit amount greater than zero."
    );
  });
});

describe("buildManualExpenseDescriptionLookup", () => {
  it("maps expense ids to trimmed descriptions", () => {
    const lookup = buildManualExpenseDescriptionLookup([
      { id: "adj-1", description: "  Groceries correction  " },
      { id: "adj-2", description: "Fuel decrease" },
    ]);

    expect(lookup.get("adj-1")).toBe("Groceries correction");
    expect(lookup.get("adj-2")).toBe("Fuel decrease");
  });

  it("skips blank descriptions", () => {
    const lookup = buildManualExpenseDescriptionLookup([
      { id: "adj-1", description: "   " },
    ]);

    expect(lookup.has("adj-1")).toBe(false);
  });
});

describe("getLinkedAdjustmentDescription", () => {
  it("returns the linked description when available", () => {
    const lookup = buildManualExpenseDescriptionLookup([
      { id: "adj-1", description: "Coffee refund" },
    ]);

    expect(getLinkedAdjustmentDescription("adj-1", lookup)).toBe("Coffee refund");
  });

  it("returns the fallback label when the adjustment is missing", () => {
    expect(
      getLinkedAdjustmentDescription("missing", new Map())
    ).toBe(MANUAL_EXPENSE_ADJUSTMENT_CREDIT_FALLBACK_LABEL);
  });
});

describe("mapCashAdjustmentCreditsForDisplay", () => {
  const transactions = [
    {
      id: "tx-1",
      household_id: "household-1",
      user_id: "user-1",
      person_id: null,
      source_type: "manual_expense_adjustment",
      source_id: "adj-1",
      amount: 25,
      previous_cash_snapshot_id: null,
      new_cash_snapshot_id: null,
      credited_at: "2026-06-20T12:00:00.000Z",
      notes: "Returned overcharge",
      created_at: "2026-06-20T12:00:00.000Z",
    },
    {
      id: "tx-2",
      household_id: "household-1",
      user_id: "user-1",
      person_id: null,
      source_type: "manual_expense_adjustment",
      source_id: "adj-2",
      amount: 10,
      previous_cash_snapshot_id: null,
      new_cash_snapshot_id: null,
      credited_at: "2026-06-19T12:00:00.000Z",
      notes: null,
      created_at: "2026-06-19T12:00:00.000Z",
    },
  ] satisfies CashAdjustmentTransaction[];

  it("maps linked adjustment descriptions and notes", () => {
    const lookup = buildManualExpenseDescriptionLookup([
      { id: "adj-1", description: "Groceries correction" },
    ]);

    expect(
      mapCashAdjustmentCreditsForDisplay(transactions, lookup, { limit: 10 })
    ).toEqual([
      {
        id: "tx-1",
        creditedAt: "2026-06-20T12:00:00.000Z",
        amount: 25,
        adjustmentDescription: "Groceries correction",
        notes: "Returned overcharge",
      },
      {
        id: "tx-2",
        creditedAt: "2026-06-19T12:00:00.000Z",
        amount: 10,
        adjustmentDescription: MANUAL_EXPENSE_ADJUSTMENT_CREDIT_FALLBACK_LABEL,
        notes: null,
      },
    ]);
  });

  it("limits to the requested count", () => {
    const lookup = buildManualExpenseDescriptionLookup([
      { id: "adj-1", description: "Groceries correction" },
      { id: "adj-2", description: "Fuel decrease" },
    ]);

    const rows = mapCashAdjustmentCreditsForDisplay(transactions, lookup, {
      limit: 1,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("tx-1");
  });

  it("returns an empty array when there are no credits", () => {
    expect(mapCashAdjustmentCreditsForDisplay([], new Map())).toEqual([]);
  });
});
