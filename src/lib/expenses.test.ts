import { describe, expect, it } from "vitest";
import {
  adjustmentDirectionLabel,
  calculateExpenseSplit,
  calculateSignedExpenseAmount,
  canDeleteManualExpense,
  canEditManualExpenseFinancialFields,
  getExpensePeriodBucket,
  getManualExpenseSignedShareAmount,
  getMyExpenseShareAmount,
  isManualExpenseAdjustment,
  isManualExpensePaidThroughApp,
  isPaidExpenseDeleteBlockedError,
  sumMyManualExpenseShareForView,
  validateCustomExpenseSplit,
  validateManualExpenseAdjustmentInput,
  validateManualExpenseUpdate,
} from "@/lib/expenses";
import { calculateSafeToSpendAfterSavings } from "@/lib/savings";
import { calculateSafeToSpendBeforeSavings } from "@/lib/bill-share";

describe("getExpensePeriodBucket", () => {
  it("returns 1_14 for the 1st of the month", () => {
    expect(getExpensePeriodBucket("2026-06-01")).toBe("1_14");
  });

  it("returns 1_14 for the 14th of the month", () => {
    expect(getExpensePeriodBucket("2026-06-14")).toBe("1_14");
  });

  it("returns 15_eom for the 15th of the month", () => {
    expect(getExpensePeriodBucket("2026-06-15")).toBe("15_eom");
  });

  it("returns 15_eom for the last day of the month", () => {
    expect(getExpensePeriodBucket("2026-02-28")).toBe("15_eom");
    expect(getExpensePeriodBucket("2026-01-31")).toBe("15_eom");
  });
});

describe("calculateExpenseSplit equal", () => {
  it("splits evenly with cents preserved", () => {
    expect(calculateExpenseSplit(100, "equal")).toEqual({
      amounts: { telesAmount: 50, nicoleAmount: 50 },
      error: null,
    });
  });

  it("assigns odd-cent remainder to Nicole", () => {
    expect(calculateExpenseSplit(10.01, "equal")).toEqual({
      amounts: { telesAmount: 5.01, nicoleAmount: 5 },
      error: null,
    });
  });
});

describe("calculateExpenseSplit 51_49", () => {
  it("splits Teles 51% and Nicole 49% with rounding", () => {
    expect(calculateExpenseSplit(100, "51_49")).toEqual({
      amounts: { telesAmount: 51, nicoleAmount: 49 },
      error: null,
    });
  });

  it("keeps split amounts summing to the total", () => {
    const result = calculateExpenseSplit(33.33, "51_49");
    expect(result.error).toBeNull();
    expect(result.amounts.telesAmount + result.amounts.nicoleAmount).toBe(33.33);
    expect(result.amounts.telesAmount).toBe(17);
    expect(result.amounts.nicoleAmount).toBe(16.33);
  });
});

describe("calculateExpenseSplit personal", () => {
  it("assigns the full amount to Teles for a Teles profile", () => {
    expect(
      calculateExpenseSplit(42.5, "personal", { person: { name: "Teles" } })
    ).toEqual({
      amounts: { telesAmount: 42.5, nicoleAmount: 0 },
      error: null,
    });
  });

  it("assigns the full amount to Nicole for a Nicole profile", () => {
    expect(
      calculateExpenseSplit(42.5, "personal", { person: { name: "Nicole" } })
    ).toEqual({
      amounts: { telesAmount: 0, nicoleAmount: 42.5 },
      error: null,
    });
  });

  it("blocks personal split when no mapped profile is recognized", () => {
    expect(calculateExpenseSplit(25, "personal")).toEqual({
      amounts: { telesAmount: 0, nicoleAmount: 0 },
      error:
        "Choose a budget profile in Settings before recording a personal expense.",
    });
  });
});

describe("calculateExpenseSplit custom", () => {
  it("accepts custom amounts that sum to the total", () => {
    expect(
      calculateExpenseSplit(100, "custom", {
        customTelesAmount: 60,
        customNicoleAmount: 40,
      })
    ).toEqual({
      amounts: { telesAmount: 60, nicoleAmount: 40 },
      error: null,
    });
  });

  it("rejects custom amounts that do not sum to the total", () => {
    expect(
      calculateExpenseSplit(100, "custom", {
        customTelesAmount: 60,
        customNicoleAmount: 30,
      })
    ).toEqual({
      amounts: { telesAmount: 0, nicoleAmount: 0 },
      error: "Teles and Nicole amounts must sum to 100.00.",
    });
  });
});

describe("validateCustomExpenseSplit", () => {
  it("returns null when amounts sum to the total", () => {
    expect(validateCustomExpenseSplit(50, 30, 20)).toBeNull();
  });

  it("returns an error when amounts do not sum to the total", () => {
    expect(validateCustomExpenseSplit(50, 30, 19)).toBe(
      "Teles and Nicole amounts must sum to 50.00."
    );
  });
});

describe("getMyExpenseShareAmount", () => {
  const expense = { teles_amount: 60, nicole_amount: 40 };

  it("returns Teles amount", () => {
    expect(getMyExpenseShareAmount(expense, "teles_amount")).toBe(60);
  });

  it("returns Nicole amount", () => {
    expect(getMyExpenseShareAmount(expense, "nicole_amount")).toBe(40);
  });

  it("returns null when share key is null", () => {
    expect(getMyExpenseShareAmount(expense, null)).toBeNull();
  });

  it("returns null for invalid amount", () => {
    expect(
      getMyExpenseShareAmount({ teles_amount: "bad", nicole_amount: 40 }, "teles_amount")
    ).toBeNull();
  });
});

describe("sumMyManualExpenseShareForView", () => {
  const expenses = [
    {
      expense_date: "2026-06-05",
      teles_amount: 30,
      nicole_amount: 30,
    },
    {
      expense_date: "2026-06-12",
      teles_amount: 20,
      nicole_amount: 10,
    },
    {
      expense_date: "2026-06-18",
      teles_amount: 50,
      nicole_amount: 25,
    },
    {
      expense_date: "2026-06-25",
      teles_amount: 15,
      nicole_amount: 15,
    },
    {
      expense_date: "2026-05-30",
      teles_amount: 100,
      nicole_amount: 0,
    },
    {
      expense_date: "2026-07-01",
      teles_amount: 80,
      nicole_amount: 0,
    },
    {
      expense_date: "2026-06-10",
      teles_amount: "invalid",
      nicole_amount: 5,
    },
  ];

  const snapshotDate = "2026-06-08";

  it("returns null when share key is null", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, null, "full", 2026, 6, snapshotDate)
    ).toBeNull();
  });

  it("returns null when snapshot date is null", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "full", 2026, 6, null)
    ).toBeNull();
  });

  it("counts only 1_14 view expenses dated day 1–14 in selected month", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "1_14", 2026, 6, snapshotDate)
    ).toBe(20);
    expect(
      sumMyManualExpenseShareForView(expenses, "nicole_amount", "1_14", 2026, 6, snapshotDate)
    ).toBe(15);
  });

  it("counts only 15_eom view expenses dated day 15–end of selected month", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "15_eom", 2026, 6, snapshotDate)
    ).toBe(65);
    expect(
      sumMyManualExpenseShareForView(expenses, "nicole_amount", "15_eom", 2026, 6, snapshotDate)
    ).toBe(40);
  });

  it("counts all selected-month expenses for full view", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "full", 2026, 6, snapshotDate)
    ).toBe(85);
    expect(
      sumMyManualExpenseShareForView(expenses, "nicole_amount", "full", 2026, 6, snapshotDate)
    ).toBe(55);
  });

  it("ignores previous-month expenses", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "full", 2026, 6, "2026-05-01")
    ).toBe(115);
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "full", 2026, 5, "2026-04-01")
    ).toBe(100);
  });

  it("ignores next-month expenses", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "full", 2026, 6, snapshotDate)
    ).toBe(85);
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "full", 2026, 7, "2026-06-30")
    ).toBe(80);
  });

  it("ignores expenses on snapshot date", () => {
    const onSnapshot = [
      { expense_date: "2026-06-08", teles_amount: 99, nicole_amount: 0 },
      { expense_date: "2026-06-09", teles_amount: 11, nicole_amount: 0 },
    ];
    expect(
      sumMyManualExpenseShareForView(onSnapshot, "teles_amount", "full", 2026, 6, snapshotDate)
    ).toBe(11);
  });

  it("ignores expenses before snapshot date", () => {
    const beforeSnapshot = [
      { expense_date: "2026-06-01", teles_amount: 40, nicole_amount: 0 },
      { expense_date: "2026-06-08", teles_amount: 30, nicole_amount: 0 },
      { expense_date: "2026-06-15", teles_amount: 25, nicole_amount: 0 },
    ];
    expect(
      sumMyManualExpenseShareForView(
        beforeSnapshot,
        "teles_amount",
        "full",
        2026,
        6,
        "2026-06-10"
      )
    ).toBe(25);
  });

  it("counts expenses after snapshot date", () => {
    const afterSnapshot = [
      { expense_date: "2026-06-11", teles_amount: 12, nicole_amount: 0 },
      { expense_date: "2026-06-20", teles_amount: 8, nicole_amount: 0 },
    ];
    expect(
      sumMyManualExpenseShareForView(
        afterSnapshot,
        "teles_amount",
        "full",
        2026,
        6,
        "2026-06-10"
      )
    ).toBe(20);
  });

  it("returns 0 when no matching expenses", () => {
    expect(
      sumMyManualExpenseShareForView([], "teles_amount", "full", 2026, 6, snapshotDate)
    ).toBe(0);
  });

  it("skips invalid share amounts", () => {
    expect(
      sumMyManualExpenseShareForView(expenses, "teles_amount", "1_14", 2026, 6, "2026-06-01")
    ).toBe(50);
  });

  it("counts unpaid manual expense after snapshot", () => {
    const unpaid = [
      { id: "exp-unpaid", expense_date: "2026-06-15", teles_amount: 40, nicole_amount: 0 },
    ];
    expect(
      sumMyManualExpenseShareForView(
        unpaid,
        "teles_amount",
        "full",
        2026,
        6,
        "2026-06-10"
      )
    ).toBe(40);
  });

  it("counts marked-paid manual expense after snapshot with no payment transaction", () => {
    const markedPaid = [
      {
        id: "exp-marked",
        expense_date: "2026-06-15",
        teles_amount: 35,
        nicole_amount: 0,
      },
    ];
    const deducted = new Set<string>();
    expect(
      sumMyManualExpenseShareForView(
        markedPaid,
        "teles_amount",
        "full",
        2026,
        6,
        "2026-06-10",
        deducted
      )
    ).toBe(35);
  });

  it("excludes manual expense with matching cash payment transaction", () => {
    const paidThroughApp = [
      {
        id: "exp-paid-app",
        expense_date: "2026-06-15",
        teles_amount: 60,
        nicole_amount: 0,
      },
      {
        id: "exp-still-counts",
        expense_date: "2026-06-16",
        teles_amount: 25,
        nicole_amount: 0,
      },
    ];
    const deducted = new Set(["exp-paid-app"]);
    expect(
      sumMyManualExpenseShareForView(
        paidThroughApp,
        "teles_amount",
        "full",
        2026,
        6,
        "2026-06-10",
        deducted
      )
    ).toBe(25);
  });

  it("preserves current behavior when no deducted IDs are provided", () => {
    const paidThroughApp = [
      {
        id: "exp-paid-app",
        expense_date: "2026-06-15",
        teles_amount: 60,
        nicole_amount: 0,
      },
    ];
    expect(
      sumMyManualExpenseShareForView(
        paidThroughApp,
        "teles_amount",
        "full",
        2026,
        6,
        "2026-06-10"
      )
    ).toBe(60);
  });

  it("does not change totals based on expense scope; RLS handles visibility", () => {
    const mixedScope = [
      {
        id: "exp-private",
        expense_date: "2026-06-15",
        teles_amount: 20,
        nicole_amount: 0,
      },
      {
        id: "exp-shared",
        expense_date: "2026-06-16",
        teles_amount: 30,
        nicole_amount: 0,
      },
    ];
    expect(
      sumMyManualExpenseShareForView(
        mixedScope,
        "teles_amount",
        "full",
        2026,
        6,
        "2026-06-10",
        new Set()
      )
    ).toBe(50);
  });
});

describe("manual expense adjustment helpers", () => {
  const baseExpense = {
    teles_amount: 40,
    nicole_amount: 10,
    adjusts_manual_expense_id: null,
    adjustment_direction: null,
  };

  it("detects adjustment expenses", () => {
    expect(isManualExpenseAdjustment({ adjusts_manual_expense_id: null })).toBe(false);
    expect(
      isManualExpenseAdjustment({ adjusts_manual_expense_id: "orig-1" })
    ).toBe(true);
  });

  it("returns positive signed share for normal expenses", () => {
    expect(getManualExpenseSignedShareAmount(baseExpense, "teles_amount")).toBe(40);
  });

  it("returns positive signed share for increase adjustments", () => {
    expect(
      getManualExpenseSignedShareAmount(
        {
          teles_amount: 40,
          nicole_amount: 10,
          adjustment_direction: "increase",
        },
        "teles_amount"
      )
    ).toBe(40);
  });

  it("returns negative signed share for decrease adjustments", () => {
    expect(
      getManualExpenseSignedShareAmount(
        {
          teles_amount: 40,
          nicole_amount: 10,
          adjustment_direction: "decrease",
        },
        "teles_amount"
      )
    ).toBe(-40);
  });

  it("calculates signed amounts by direction", () => {
    expect(calculateSignedExpenseAmount(25, null)).toBe(25);
    expect(calculateSignedExpenseAmount(25, "increase")).toBe(25);
    expect(calculateSignedExpenseAmount(25, "decrease")).toBe(-25);
  });

  it("labels adjustment directions", () => {
    expect(adjustmentDirectionLabel("increase")).toBe("Increase");
    expect(adjustmentDirectionLabel("decrease")).toBe("Decrease");
  });
});

describe("sumMyManualExpenseShareForView adjustments", () => {
  const snapshotDate = "2026-06-10";

  it("includes increase adjustments in totals", () => {
    const expenses = [
      {
        id: "exp-base",
        expense_date: "2026-06-15",
        teles_amount: 50,
        nicole_amount: 0,
      },
      {
        id: "adj-increase",
        expense_date: "2026-06-16",
        teles_amount: 20,
        nicole_amount: 0,
        adjusts_manual_expense_id: "exp-base",
        adjustment_direction: "increase" as const,
      },
    ];
    expect(
      sumMyManualExpenseShareForView(
        expenses,
        "teles_amount",
        "full",
        2026,
        6,
        snapshotDate,
        new Set()
      )
    ).toBe(70);
  });

  it("subtracts decrease adjustments from totals", () => {
    const expenses = [
      {
        id: "exp-base",
        expense_date: "2026-06-15",
        teles_amount: 50,
        nicole_amount: 0,
      },
      {
        id: "adj-decrease",
        expense_date: "2026-06-16",
        teles_amount: 15,
        nicole_amount: 0,
        adjusts_manual_expense_id: "exp-base",
        adjustment_direction: "decrease" as const,
      },
    ];
    expect(
      sumMyManualExpenseShareForView(
        expenses,
        "teles_amount",
        "full",
        2026,
        6,
        snapshotDate,
        new Set()
      )
    ).toBe(35);
  });

  it("applies snapshot cutoff to adjustments", () => {
    const expenses = [
      {
        id: "adj-after",
        expense_date: "2026-06-15",
        teles_amount: 30,
        nicole_amount: 0,
        adjusts_manual_expense_id: "orig",
        adjustment_direction: "increase" as const,
      },
      {
        id: "adj-before",
        expense_date: "2026-06-08",
        teles_amount: 40,
        nicole_amount: 0,
        adjusts_manual_expense_id: "orig",
        adjustment_direction: "increase" as const,
      },
    ];
    expect(
      sumMyManualExpenseShareForView(
        expenses,
        "teles_amount",
        "full",
        2026,
        6,
        snapshotDate,
        new Set()
      )
    ).toBe(30);
  });

  it("applies period filtering to adjustments", () => {
    const expenses = [
      {
        id: "adj-1-14",
        expense_date: "2026-06-12",
        teles_amount: 10,
        nicole_amount: 0,
        adjusts_manual_expense_id: "orig",
        adjustment_direction: "increase" as const,
      },
      {
        id: "adj-15-eom",
        expense_date: "2026-06-20",
        teles_amount: 25,
        nicole_amount: 0,
        adjusts_manual_expense_id: "orig",
        adjustment_direction: "increase" as const,
      },
    ];
    expect(
      sumMyManualExpenseShareForView(
        expenses,
        "teles_amount",
        "1_14",
        2026,
        6,
        "2026-06-01",
        new Set()
      )
    ).toBe(10);
    expect(
      sumMyManualExpenseShareForView(
        expenses,
        "teles_amount",
        "15_eom",
        2026,
        6,
        "2026-06-01",
        new Set()
      )
    ).toBe(25);
  });

  it("still excludes paid-through-app expenses but counts their adjustments", () => {
    const expenses = [
      {
        id: "exp-paid-app",
        expense_date: "2026-06-15",
        teles_amount: 60,
        nicole_amount: 0,
      },
      {
        id: "adj-for-paid",
        expense_date: "2026-06-16",
        teles_amount: 20,
        nicole_amount: 0,
        adjusts_manual_expense_id: "exp-paid-app",
        adjustment_direction: "decrease" as const,
      },
    ];
    expect(
      sumMyManualExpenseShareForView(
        expenses,
        "teles_amount",
        "full",
        2026,
        6,
        snapshotDate,
        new Set(["exp-paid-app"])
      )
    ).toBe(-20);
  });
});

describe("validateManualExpenseAdjustmentInput", () => {
  const validBase = {
    originalExpenseId: "orig-1",
    originalDescription: "Groceries",
    adjustmentDirection: "increase" as const,
    amount: 25,
    expenseDate: "2026-06-15",
    splitType: "equal" as const,
    adjustmentReason: "Forgot part of the bill",
    expenseScope: "private" as const,
  };

  it("returns a valid adjustment payload", () => {
    const result = validateManualExpenseAdjustmentInput(validBase);
    expect(result.error).toBeNull();
    expect(result.payload).toMatchObject({
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "increase",
      adjustment_reason: "Forgot part of the bill",
      amount: 25,
      expense_date: "2026-06-15",
      teles_amount: 12.5,
      nicole_amount: 12.5,
    });
  });

  it("rejects invalid adjustment direction", () => {
    expect(
      validateManualExpenseAdjustmentInput({
        ...validBase,
        adjustmentDirection: "invalid",
      })
    ).toEqual({
      payload: null,
      error: "Adjustment direction must be increase or decrease.",
    });
  });

  it("rejects zero adjustment amount", () => {
    expect(
      validateManualExpenseAdjustmentInput({
        ...validBase,
        amount: 0,
      })
    ).toEqual({
      payload: null,
      error: "Enter a valid adjustment amount greater than zero.",
    });
  });

  it("rejects negative adjustment amount", () => {
    expect(
      validateManualExpenseAdjustmentInput({
        ...validBase,
        amount: -5,
      })
    ).toEqual({
      payload: null,
      error: "Enter a valid adjustment amount greater than zero.",
    });
  });

  it("rejects invalid custom split for adjustments", () => {
    expect(
      validateManualExpenseAdjustmentInput({
        ...validBase,
        amount: 100,
        splitType: "custom",
        customTelesAmount: 60,
        customNicoleAmount: 30,
      })
    ).toEqual({
      payload: null,
      error: "Teles and Nicole amounts must sum to 100.00.",
    });
  });

  it("accepts valid custom split for adjustments", () => {
    const result = validateManualExpenseAdjustmentInput({
      ...validBase,
      amount: 80,
      splitType: "custom",
      customTelesAmount: 48,
      customNicoleAmount: 32,
    });
    expect(result.error).toBeNull();
    expect(result.payload?.teles_amount).toBe(48);
    expect(result.payload?.nicole_amount).toBe(32);
  });
});

describe("validateManualExpenseUpdate", () => {
  it("returns a valid update payload", () => {
    const result = validateManualExpenseUpdate({
      description: "Groceries",
      amount: 100,
      expenseDate: "2026-06-10",
      splitType: "equal",
      category: "Food",
      notes: "Weekly shop",
      expenseScope: "private",
    });

    expect(result.error).toBeNull();
    expect(result.payload).toEqual({
      description: "Groceries",
      amount: 100,
      expense_date: "2026-06-10",
      period_bucket: "1_14",
      split_type: "equal",
      teles_amount: 50,
      nicole_amount: 50,
      category: "Food",
      notes: "Weekly shop",
      expense_scope: "private",
    });
  });

  it("rejects missing description", () => {
    expect(
      validateManualExpenseUpdate({
        description: "   ",
        amount: 50,
        expenseDate: "2026-06-10",
        splitType: "equal",
      })
    ).toEqual({ payload: null, error: "Description is required." });
  });

  it("rejects invalid amount", () => {
    expect(
      validateManualExpenseUpdate({
        description: "Test",
        amount: "bad",
        expenseDate: "2026-06-10",
        splitType: "equal",
      })
    ).toEqual({ payload: null, error: "Enter a valid non-negative amount." });
  });

  it("rejects missing expense date", () => {
    expect(
      validateManualExpenseUpdate({
        description: "Test",
        amount: 50,
        expenseDate: "not-a-date",
        splitType: "equal",
      })
    ).toEqual({ payload: null, error: "Expense date is required." });
  });

  it("rejects invalid custom split", () => {
    expect(
      validateManualExpenseUpdate({
        description: "Test",
        amount: 100,
        expenseDate: "2026-06-20",
        splitType: "custom",
        customTelesAmount: 60,
        customNicoleAmount: 30,
      })
    ).toEqual({
      payload: null,
      error: "Teles and Nicole amounts must sum to 100.00.",
    });
  });

  it("accepts valid custom split", () => {
    const result = validateManualExpenseUpdate({
      description: "Custom split",
      amount: 80,
      expenseDate: "2026-06-20",
      splitType: "custom",
      customTelesAmount: 48,
      customNicoleAmount: 32,
    });

    expect(result.error).toBeNull();
    expect(result.payload?.split_type).toBe("custom");
    expect(result.payload?.teles_amount).toBe(48);
    expect(result.payload?.nicole_amount).toBe(32);
    expect(result.payload?.period_bucket).toBe("15_eom");
  });
});

describe("paid-through-app edit guard", () => {
  const paidIds = new Set(["exp-paid"]);

  it("detects paid-through-app expenses", () => {
    expect(isManualExpensePaidThroughApp("exp-paid", paidIds)).toBe(true);
    expect(isManualExpensePaidThroughApp("exp-unpaid", paidIds)).toBe(false);
  });

  it("blocks financial edits for paid-through-app expenses", () => {
    expect(canEditManualExpenseFinancialFields("exp-paid", paidIds)).toBe(false);
    expect(canEditManualExpenseFinancialFields("exp-unpaid", paidIds)).toBe(true);
  });
});

describe("canDeleteManualExpense", () => {
  const creatorId = "user-creator";
  const otherUserId = "user-other";

  it("allows creator to delete when there is no payment transaction", () => {
    expect(
      canDeleteManualExpense({
        createdByUserId: creatorId,
        userId: creatorId,
        hasPaymentTransaction: false,
      })
    ).toBe(true);
  });

  it("blocks creator delete when there is a payment transaction", () => {
    expect(
      canDeleteManualExpense({
        createdByUserId: creatorId,
        userId: creatorId,
        hasPaymentTransaction: true,
      })
    ).toBe(false);
  });

  it("blocks non-creator delete even without a payment transaction", () => {
    expect(
      canDeleteManualExpense({
        createdByUserId: creatorId,
        userId: otherUserId,
        hasPaymentTransaction: false,
      })
    ).toBe(false);
  });

  it("allows marked-paid-only creator delete when there is no payment transaction", () => {
    expect(
      canDeleteManualExpense({
        createdByUserId: creatorId,
        userId: creatorId,
        hasPaymentTransaction: false,
      })
    ).toBe(true);
  });

  it("blocks paid-through-app delete for creator", () => {
    expect(
      canDeleteManualExpense({
        createdByUserId: creatorId,
        userId: creatorId,
        hasPaymentTransaction: true,
      })
    ).toBe(false);
  });
});

describe("isPaidExpenseDeleteBlockedError", () => {
  it("detects PAID_EXPENSE_DELETE_BLOCKED errors", () => {
    expect(
      isPaidExpenseDeleteBlockedError(
        new Error("PAID_EXPENSE_DELETE_BLOCKED: Manual expense has already been deducted")
      )
    ).toBe(true);
    expect(isPaidExpenseDeleteBlockedError(new Error("Some other error"))).toBe(false);
  });
});

describe("safe-to-spend with manual expenses", () => {
  it("reduces before-savings by manual expenses", () => {
    expect(calculateSafeToSpendBeforeSavings(1000, 300, 75)).toBe(625);
  });

  it("subtracts remaining savings from expense-adjusted before-savings", () => {
    const beforeSavings = calculateSafeToSpendBeforeSavings(1000, 300, 75);
    expect(calculateSafeToSpendAfterSavings(beforeSavings, 200)).toBe(425);
  });

  it("allows negative before-savings with expenses", () => {
    expect(calculateSafeToSpendBeforeSavings(200, 150, 100)).toBe(-50);
  });
});
