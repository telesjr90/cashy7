import { describe, expect, it } from "vitest";
import {
  getCreditedManualExpenseAdjustmentSourceIds,
  getManualExpenseAdjustmentCashCreditAmount,
  isDecreaseManualExpenseAdjustment,
  isDuplicateCashAdjustmentCreditError,
  isManualExpenseAdjustmentEligibleForCashCredit,
  validateCashCreditAmount,
} from "@/lib/cash-adjustments";

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
