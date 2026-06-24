import { describe, expect, it } from "vitest";
import {
  buildExpensesByCategoryChartData,
  buildExpensesByMonthChartData,
  buildExpensesByPayPeriodChartData,
  buildExpenseCategoryByMonthChartData,
  buildExpenseCategoryByPayPeriodChartData,
} from "@/lib/report-chart-data";
import type { ManualExpense } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _seq = 1;
function makeExpense(
  overrides: Partial<ManualExpense> & {
    expense_date: string;
    amount: number;
  }
): ManualExpense {
  const id = `expense-${String(_seq++).padStart(3, "0")}`;
  const date = overrides.expense_date;
  const day = Number(date.slice(8, 10));
  const base: ManualExpense = {
    id,
    household_id: "household-uuid",
    created_by_user_id: "user-uuid",
    person_id: null,
    expense_scope: "shared",
    description: "Test expense",
    category: null,
    amount: overrides.amount,
    expense_date: date,
    period_bucket: day <= 14 ? "1_14" : "15_eom",
    split_type: "equal",
    teles_amount: overrides.amount / 2,
    nicole_amount: overrides.amount / 2,
    is_paid: false,
    paid_at: null,
    notes: null,
    adjusts_manual_expense_id: null,
    adjustment_direction: null,
    adjustment_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

/** Helper that asserts no raw UUIDs appear in chart-facing string labels. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function assertNoRawUuids(labels: string[]): void {
  for (const label of labels) {
    expect(UUID_RE.test(label), `UUID found in label: "${label}"`).toBe(false);
  }
}

// Fixture data used across multiple tests
const EXPENSES = [
  makeExpense({ expense_date: "2026-06-01", amount: 1200, category: "Rent" }),
  makeExpense({ expense_date: "2026-06-05", amount: 200, category: "Groceries" }),
  makeExpense({ expense_date: "2026-06-10", amount: 80, category: "Transportation" }),
  makeExpense({ expense_date: "2026-06-14", amount: 50, category: "Dining" }),
  makeExpense({ expense_date: "2026-06-15", amount: 150, category: "Groceries" }),
  makeExpense({ expense_date: "2026-06-20", amount: 60, category: "Utilities" }),
  makeExpense({ expense_date: "2026-06-30", amount: 90, category: "Dining" }),
  makeExpense({ expense_date: "2026-07-01", amount: 1200, category: "Rent" }),
  makeExpense({ expense_date: "2026-07-08", amount: 120, category: "Groceries" }),
  makeExpense({ expense_date: "2026-07-31", amount: 100, category: "Utilities" }),
];

// ===========================================================================
// buildExpensesByCategoryChartData
// ===========================================================================

describe("buildExpensesByCategoryChartData", () => {
  it("returns empty array for empty input", () => {
    const result = buildExpensesByCategoryChartData([]);
    expect(result).toEqual([]);
  });

  it("groups by category and sums amounts correctly", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES);
    const rent = result.find((r) => r.categoryName === "Rent");
    const groceries = result.find((r) => r.categoryName === "Groceries");
    const dining = result.find((r) => r.categoryName === "Dining");

    expect(rent?.amount).toBe(2400); // 1200 + 1200
    expect(groceries?.amount).toBe(470); // 200 + 150 + 120
    expect(dining?.amount).toBe(140); // 50 + 90
  });

  it("sorts rows descending by amount", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].amount).toBeGreaterThanOrEqual(result[i].amount);
    }
  });

  it("percentages sum to approximately 100", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES);
    const total = result.reduce((sum, r) => sum + r.percentage, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it("uses Uncategorized fallback for null category", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: null }),
      makeExpense({ expense_date: "2026-06-02", amount: 50, category: "" }),
    ];
    const result = buildExpensesByCategoryChartData(expenses);
    expect(result).toHaveLength(1);
    expect(result[0].categoryName).toBe("Uncategorized");
    expect(result[0].amount).toBe(150);
  });

  it("transactionCount is correct per category", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES);
    const groceries = result.find((r) => r.categoryName === "Groceries");
    expect(groceries?.transactionCount).toBe(3);
  });

  it("applies top-N grouping and adds Other row", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES, {
      topCategoryCount: 2,
      includeOtherCategory: true,
    });
    expect(result).toHaveLength(3);
    expect(result[0].categoryName).toBe("Rent");
    expect(result[1].categoryName).toBe("Groceries");
    expect(result[2].categoryName).toBe("Other");
  });

  it("top-N without Other does not add Other row", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES, {
      topCategoryCount: 2,
      includeOtherCategory: false,
    });
    expect(result).toHaveLength(2);
    expect(result.some((r) => r.categoryName === "Other")).toBe(false);
  });

  it("Other amount is sum of non-top categories", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES, {
      topCategoryCount: 2,
      includeOtherCategory: true,
    });
    const other = result.find((r) => r.categoryName === "Other")!;
    // All amounts minus top 2 (Rent=2400, Groceries=470)
    const expectedOther = EXPENSES.reduce((sum, e) => sum + e.amount, 0) - 2400 - 470;
    expect(other.amount).toBeCloseTo(expectedOther, 2);
  });

  it("handles decrease-adjustment rows (reduces category total)", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 500, category: "Rent" }),
      makeExpense({
        expense_date: "2026-06-05",
        amount: 100,
        category: "Rent",
        adjusts_manual_expense_id: "original-uuid",
        adjustment_direction: "decrease",
      }),
    ];
    const result = buildExpensesByCategoryChartData(expenses);
    expect(result[0].categoryName).toBe("Rent");
    expect(result[0].amount).toBe(400); // 500 - 100
    expect(result[0].transactionCount).toBe(2);
  });

  it("handles increase-adjustment rows (adds to category total)", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 500, category: "Rent" }),
      makeExpense({
        expense_date: "2026-06-05",
        amount: 50,
        category: "Rent",
        adjusts_manual_expense_id: "original-uuid",
        adjustment_direction: "increase",
      }),
    ];
    const result = buildExpensesByCategoryChartData(expenses);
    expect(result[0].amount).toBe(550);
  });

  it("filters by startDate", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES, {
      startDate: "2026-07-01",
    });
    // Only July expenses
    const totalAmount = result.reduce((sum, r) => sum + r.amount, 0);
    expect(totalAmount).toBe(1420); // 1200 + 120 + 100
  });

  it("filters by endDate", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES, {
      endDate: "2026-06-30",
    });
    const totalAmount = result.reduce((sum, r) => sum + r.amount, 0);
    expect(totalAmount).toBe(1830); // sum of June expenses only
  });

  it("cashflowStartDate excludes earlier expenses", () => {
    const expenses = [
      makeExpense({ expense_date: "2025-12-01", amount: 999, category: "Pre-start" }),
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" }),
    ];
    const result = buildExpensesByCategoryChartData(expenses, {
      cashflowStartDate: "2026-01-01",
    });
    expect(result.some((r) => r.categoryName === "Pre-start")).toBe(false);
    expect(result.find((r) => r.categoryName === "Rent")?.amount).toBe(100);
  });

  it("does not mutate the input array", () => {
    const input = [...EXPENSES];
    const snapshot = input.map((e) => e.id);
    buildExpensesByCategoryChartData(input);
    expect(input.map((e) => e.id)).toEqual(snapshot);
  });

  it("categoryId is always null (no UUID labels)", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES);
    for (const row of result) {
      expect(row.categoryId).toBeNull();
    }
  });

  it("no raw UUIDs appear in categoryName labels", () => {
    assertNoRawUuids(EXPENSES.map((e) => e.id));
    const result = buildExpensesByCategoryChartData(EXPENSES);
    assertNoRawUuids(result.map((r) => r.categoryName));
  });

  it("single expense produces 100% percentage", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-01", amount: 500, category: "Rent" })];
    const result = buildExpensesByCategoryChartData(expenses);
    expect(result[0].percentage).toBe(100);
  });

  it("returns empty array when all expenses filtered by date range", () => {
    const result = buildExpensesByCategoryChartData(EXPENSES, {
      startDate: "2030-01-01",
    });
    expect(result).toEqual([]);
  });

  it("exact snapshot for representative data", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 1000, category: "Rent" }),
      makeExpense({ expense_date: "2026-06-05", amount: 200, category: "Groceries" }),
      makeExpense({ expense_date: "2026-06-10", amount: 300, category: "Groceries" }),
    ];
    const result = buildExpensesByCategoryChartData(expenses);
    // Sorted descending by amount: Rent (1000) then Groceries (500)
    expect(result).toEqual([
      {
        categoryId: null,
        categoryName: "Rent",
        amount: 1000,
        transactionCount: 1,
        percentage: expect.closeTo(66.67, 1),
      },
      {
        categoryId: null,
        categoryName: "Groceries",
        amount: 500,
        transactionCount: 2,
        percentage: expect.closeTo(33.33, 1),
      },
    ]);
  });
});

// ===========================================================================
// buildExpensesByMonthChartData
// ===========================================================================

describe("buildExpensesByMonthChartData", () => {
  it("returns empty array for empty input", () => {
    expect(buildExpensesByMonthChartData([])).toEqual([]);
  });

  it("groups by month and sorts ascending", () => {
    const result = buildExpensesByMonthChartData(EXPENSES);
    expect(result[0].monthKey).toBe("2026-06");
    expect(result[1].monthKey).toBe("2026-07");
    expect(result).toHaveLength(2);
  });

  it("monthKey is YYYY-MM format", () => {
    const result = buildExpensesByMonthChartData(EXPENSES);
    for (const row of result) {
      expect(row.monthKey).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("monthLabel is human-readable (e.g. Jun 2026)", () => {
    const result = buildExpensesByMonthChartData(EXPENSES);
    expect(result[0].monthLabel).toBe("Jun 2026");
    expect(result[1].monthLabel).toBe("Jul 2026");
  });

  it("amounts sum correctly per month", () => {
    const result = buildExpensesByMonthChartData(EXPENSES);
    const june = result.find((r) => r.monthKey === "2026-06");
    const july = result.find((r) => r.monthKey === "2026-07");
    expect(june?.amount).toBe(1830); // 1200+200+80+50+150+60+90
    expect(july?.amount).toBe(1420); // 1200+120+100
  });

  it("transactionCount is correct per month", () => {
    const result = buildExpensesByMonthChartData(EXPENSES);
    expect(result.find((r) => r.monthKey === "2026-06")?.transactionCount).toBe(7);
    expect(result.find((r) => r.monthKey === "2026-07")?.transactionCount).toBe(3);
  });

  it("includes empty months when includeEmptyPeriods is true", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-05-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-08-01", amount: 200, category: "Rent" }),
    ];
    const result = buildExpensesByMonthChartData(expenses, {
      includeEmptyPeriods: true,
    });
    const keys = result.map((r) => r.monthKey);
    expect(keys).toContain("2026-06");
    expect(keys).toContain("2026-07");
    expect(result.find((r) => r.monthKey === "2026-06")?.amount).toBe(0);
    expect(result.find((r) => r.monthKey === "2026-07")?.amount).toBe(0);
  });

  it("does not include empty months when includeEmptyPeriods is false", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-05-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-08-01", amount: 200, category: "Rent" }),
    ];
    const result = buildExpensesByMonthChartData(expenses, {
      includeEmptyPeriods: false,
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.monthKey)).toEqual(["2026-05", "2026-08"]);
  });

  it("filters by date range", () => {
    const result = buildExpensesByMonthChartData(EXPENSES, {
      startDate: "2026-07-01",
    });
    expect(result.every((r) => r.monthKey >= "2026-07")).toBe(true);
  });

  it("cashflowStartDate excludes earlier months", () => {
    const expenses = [
      makeExpense({ expense_date: "2025-12-01", amount: 500, category: "Old" }),
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "New" }),
    ];
    const result = buildExpensesByMonthChartData(expenses, {
      cashflowStartDate: "2026-01-01",
    });
    expect(result.some((r) => r.monthKey === "2025-12")).toBe(false);
    expect(result.some((r) => r.monthKey === "2026-06")).toBe(true);
  });

  it("includeEmptyPeriods respects startDate boundary", () => {
    const expenses = [makeExpense({ expense_date: "2026-09-01", amount: 100, category: "Rent" })];
    const result = buildExpensesByMonthChartData(expenses, {
      startDate: "2026-07-01",
      includeEmptyPeriods: true,
    });
    const keys = result.map((r) => r.monthKey);
    expect(keys).toContain("2026-07");
    expect(keys).toContain("2026-08");
    expect(keys).toContain("2026-09");
  });

  it("does not mutate the input array", () => {
    const input = [...EXPENSES];
    const snapshot = input.map((e) => e.expense_date);
    buildExpensesByMonthChartData(input);
    expect(input.map((e) => e.expense_date)).toEqual(snapshot);
  });

  it("no raw UUIDs in monthKey or monthLabel", () => {
    const result = buildExpensesByMonthChartData(EXPENSES);
    assertNoRawUuids(result.map((r) => r.monthKey));
    assertNoRawUuids(result.map((r) => r.monthLabel));
  });

  it("exact snapshot for two months", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-07-15", amount: 200, category: "Rent" }),
    ];
    const result = buildExpensesByMonthChartData(expenses);
    expect(result).toEqual([
      { monthKey: "2026-06", monthLabel: "Jun 2026", amount: 100, transactionCount: 1 },
      { monthKey: "2026-07", monthLabel: "Jul 2026", amount: 200, transactionCount: 1 },
    ]);
  });
});

// ===========================================================================
// buildExpensesByPayPeriodChartData
// ===========================================================================

describe("buildExpensesByPayPeriodChartData", () => {
  it("returns empty array for empty input", () => {
    expect(buildExpensesByPayPeriodChartData([])).toEqual([]);
  });

  it("assigns day 1 to 1_14 bucket", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodBucket).toBe("1_14");
  });

  it("assigns day 14 to 1_14 bucket", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-14", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodBucket).toBe("1_14");
  });

  it("assigns day 15 to 15_eom bucket", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-15", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodBucket).toBe("15_eom");
  });

  it("assigns day 30 (last day of June) to 15_eom bucket", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-30", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodBucket).toBe("15_eom");
  });

  it("assigns day 28 of February (non-leap) to 15_eom", () => {
    const expenses = [makeExpense({ expense_date: "2026-02-28", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodBucket).toBe("15_eom");
  });

  it("assigns day 29 of February (leap year) to 15_eom", () => {
    const expenses = [makeExpense({ expense_date: "2028-02-29", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodBucket).toBe("15_eom");
  });

  it("period key is YYYY-MM-bucket format", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodKey).toBe("2026-06-1_14");
  });

  it("period label for 1_14 is 'Mon 1–14'", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodLabel).toBe("Jun 1\u201314");
  });

  it("period label for 15_eom includes correct last day of June", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-15", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodLabel).toBe("Jun 15\u201330");
  });

  it("period label for February non-leap uses day 28", () => {
    const expenses = [makeExpense({ expense_date: "2026-02-15", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodLabel).toBe("Feb 15\u201328");
  });

  it("period label for February leap year uses day 29", () => {
    const expenses = [makeExpense({ expense_date: "2028-02-15", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].periodLabel).toBe("Feb 15\u201329");
  });

  it("monthKey in pay period row matches YYYY-MM", () => {
    const expenses = [makeExpense({ expense_date: "2026-06-07", amount: 100, category: "Rent" })];
    const result = buildExpensesByPayPeriodChartData(expenses);
    expect(result[0].monthKey).toBe("2026-06");
  });

  it("sorts ascending chronologically (month then 1_14 before 15_eom)", () => {
    const result = buildExpensesByPayPeriodChartData(EXPENSES);
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      if (prev.monthKey !== curr.monthKey) {
        expect(prev.monthKey < curr.monthKey).toBe(true);
      } else {
        // Within the same month 1_14 must come before 15_eom
        expect(prev.periodBucket === "1_14" && curr.periodBucket === "15_eom").toBe(true);
      }
    }
  });

  it("EXPENSES splits correctly into 4 pay periods", () => {
    const result = buildExpensesByPayPeriodChartData(EXPENSES);
    const keys = result.map((r) => r.periodKey);
    expect(keys).toContain("2026-06-1_14");
    expect(keys).toContain("2026-06-15_eom");
    expect(keys).toContain("2026-07-1_14");
    expect(keys).toContain("2026-07-15_eom");
  });

  it("amounts sum correctly per pay period", () => {
    const result = buildExpensesByPayPeriodChartData(EXPENSES);
    const jun114 = result.find((r) => r.periodKey === "2026-06-1_14");
    const jun15eom = result.find((r) => r.periodKey === "2026-06-15_eom");
    expect(jun114?.amount).toBe(1530); // 1200 + 200 + 80 + 50
    expect(jun15eom?.amount).toBe(300); // 150 + 60 + 90
  });

  it("includes empty pay periods when includeEmptyPeriods is true", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-07-20", amount: 200, category: "Rent" }),
    ];
    const result = buildExpensesByPayPeriodChartData(expenses, {
      includeEmptyPeriods: true,
    });
    const keys = result.map((r) => r.periodKey);
    expect(keys).toContain("2026-06-15_eom");
    expect(keys).toContain("2026-07-1_14");
  });

  it("empty pay periods have zero amount", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-07-20", amount: 200, category: "Rent" }),
    ];
    const result = buildExpensesByPayPeriodChartData(expenses, {
      includeEmptyPeriods: true,
    });
    const emptyPeriod = result.find((r) => r.periodKey === "2026-06-15_eom");
    expect(emptyPeriod?.amount).toBe(0);
    expect(emptyPeriod?.transactionCount).toBe(0);
  });

  it("does not mutate the input array", () => {
    const input = [...EXPENSES];
    const snapshot = input.map((e) => e.id);
    buildExpensesByPayPeriodChartData(input);
    expect(input.map((e) => e.id)).toEqual(snapshot);
  });

  it("no raw UUIDs in periodKey or periodLabel", () => {
    const result = buildExpensesByPayPeriodChartData(EXPENSES);
    assertNoRawUuids(result.map((r) => r.periodKey));
    assertNoRawUuids(result.map((r) => r.periodLabel));
  });

  it("cashflowStartDate excludes earlier pay periods", () => {
    const expenses = [
      makeExpense({ expense_date: "2025-12-10", amount: 500, category: "Old" }),
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "New" }),
    ];
    const result = buildExpensesByPayPeriodChartData(expenses, {
      cashflowStartDate: "2026-01-01",
    });
    expect(result.some((r) => r.monthKey === "2025-12")).toBe(false);
    expect(result.some((r) => r.monthKey === "2026-06")).toBe(true);
  });

  it("exact snapshot for representative data", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-06-15", amount: 200, category: "Rent" }),
    ];
    const result = buildExpensesByPayPeriodChartData(expenses);
    // 1_14 sorts before 15_eom (chronological within month)
    expect(result[0]).toEqual({
      periodKey: "2026-06-1_14",
      periodLabel: "Jun 1\u201314",
      monthKey: "2026-06",
      periodBucket: "1_14",
      amount: 100,
      transactionCount: 1,
    });
    expect(result[1]).toEqual({
      periodKey: "2026-06-15_eom",
      periodLabel: "Jun 15\u201330",
      monthKey: "2026-06",
      periodBucket: "15_eom",
      amount: 200,
      transactionCount: 1,
    });
  });
});

// ===========================================================================
// buildExpenseCategoryByMonthChartData
// ===========================================================================

describe("buildExpenseCategoryByMonthChartData", () => {
  it("returns empty array for empty input", () => {
    expect(buildExpenseCategoryByMonthChartData([])).toEqual([]);
  });

  it("each row has periodKey and periodLabel", () => {
    const result = buildExpenseCategoryByMonthChartData(EXPENSES);
    for (const row of result) {
      expect(typeof row.periodKey).toBe("string");
      expect(typeof row.periodLabel).toBe("string");
    }
  });

  it("category amounts appear as keys on each row", () => {
    const result = buildExpenseCategoryByMonthChartData(EXPENSES);
    const juneRow = result.find((r) => r.periodKey === "2026-06");
    expect(juneRow?.["Rent"]).toBe(1200);
    expect(juneRow?.["Groceries"]).toBe(350); // 200 + 150
  });

  it("missing category in a month defaults to 0", () => {
    const result = buildExpenseCategoryByMonthChartData(EXPENSES);
    const juneRow = result.find((r) => r.periodKey === "2026-06");
    const julyRow = result.find((r) => r.periodKey === "2026-07");
    expect(juneRow?.["Utilities"]).toBe(60);
    // Dining is only in June
    expect(julyRow?.["Dining"]).toBe(0);
  });

  it("respects topCategoryCount and collapses extras into Other", () => {
    const result = buildExpenseCategoryByMonthChartData(EXPENSES, {
      topCategoryCount: 2,
      includeOtherCategory: true,
    });
    const juneRow = result.find((r) => r.periodKey === "2026-06");
    expect(typeof juneRow?.["Rent"]).toBe("number");
    expect(typeof juneRow?.["Groceries"]).toBe("number");
    expect(typeof juneRow?.["Other"]).toBe("number");
    // Transportation, Dining, Utilities should NOT be direct keys
    expect(juneRow?.["Transportation"]).toBeUndefined();
  });

  it("includes empty months when includeEmptyPeriods is true", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-05-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-08-01", amount: 200, category: "Rent" }),
    ];
    const result = buildExpenseCategoryByMonthChartData(expenses, {
      includeEmptyPeriods: true,
    });
    const keys = result.map((r) => r.periodKey);
    expect(keys).toContain("2026-06");
    expect(keys).toContain("2026-07");
  });

  it("is stable: same input produces same output", () => {
    const a = buildExpenseCategoryByMonthChartData(EXPENSES, { topCategoryCount: 3, includeOtherCategory: true });
    const b = buildExpenseCategoryByMonthChartData(EXPENSES, { topCategoryCount: 3, includeOtherCategory: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not mutate the input array", () => {
    const input = [...EXPENSES];
    const snapshot = input.map((e) => e.id);
    buildExpenseCategoryByMonthChartData(input);
    expect(input.map((e) => e.id)).toEqual(snapshot);
  });

  it("no raw UUIDs in periodKey or periodLabel", () => {
    const result = buildExpenseCategoryByMonthChartData(EXPENSES);
    assertNoRawUuids(result.map((r) => r.periodKey));
    assertNoRawUuids(result.map((r) => r.periodLabel));
  });
});

// ===========================================================================
// buildExpenseCategoryByPayPeriodChartData
// ===========================================================================

describe("buildExpenseCategoryByPayPeriodChartData", () => {
  it("returns empty array for empty input", () => {
    expect(buildExpenseCategoryByPayPeriodChartData([])).toEqual([]);
  });

  it("each row has periodKey and periodLabel", () => {
    const result = buildExpenseCategoryByPayPeriodChartData(EXPENSES);
    for (const row of result) {
      expect(typeof row.periodKey).toBe("string");
      expect(typeof row.periodLabel).toBe("string");
    }
  });

  it("assigns category amounts to the correct pay period row", () => {
    const result = buildExpenseCategoryByPayPeriodChartData(EXPENSES);
    const jun114 = result.find((r) => r.periodKey === "2026-06-1_14");
    expect(jun114?.["Rent"]).toBe(1200);
    expect(jun114?.["Groceries"]).toBe(200);
  });

  it("category absent in a pay period defaults to 0", () => {
    const result = buildExpenseCategoryByPayPeriodChartData(EXPENSES);
    const jun114 = result.find((r) => r.periodKey === "2026-06-1_14");
    expect(jun114?.["Utilities"]).toBe(0);
  });

  it("respects topCategoryCount with Other grouping", () => {
    const result = buildExpenseCategoryByPayPeriodChartData(EXPENSES, {
      topCategoryCount: 2,
      includeOtherCategory: true,
    });
    const jun114 = result.find((r) => r.periodKey === "2026-06-1_14");
    expect(typeof jun114?.["Rent"]).toBe("number");
    expect(typeof jun114?.["Groceries"]).toBe("number");
    expect(typeof jun114?.["Other"]).toBe("number");
  });

  it("includes empty pay periods when includeEmptyPeriods is true", () => {
    const expenses = [
      makeExpense({ expense_date: "2026-06-01", amount: 100, category: "Rent" }),
      makeExpense({ expense_date: "2026-07-20", amount: 200, category: "Rent" }),
    ];
    const result = buildExpenseCategoryByPayPeriodChartData(expenses, {
      includeEmptyPeriods: true,
    });
    const keys = result.map((r) => r.periodKey);
    expect(keys).toContain("2026-06-15_eom");
    expect(keys).toContain("2026-07-1_14");
  });

  it("is stable: same input produces same output", () => {
    const a = buildExpenseCategoryByPayPeriodChartData(EXPENSES, { topCategoryCount: 3 });
    const b = buildExpenseCategoryByPayPeriodChartData(EXPENSES, { topCategoryCount: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not mutate the input array", () => {
    const input = [...EXPENSES];
    const snapshot = input.map((e) => e.id);
    buildExpenseCategoryByPayPeriodChartData(input);
    expect(input.map((e) => e.id)).toEqual(snapshot);
  });

  it("no raw UUIDs in periodKey or periodLabel", () => {
    const result = buildExpenseCategoryByPayPeriodChartData(EXPENSES);
    assertNoRawUuids(result.map((r) => r.periodKey));
    assertNoRawUuids(result.map((r) => r.periodLabel));
  });

  it("handles February leap year (2028-02-29) correctly", () => {
    const expenses = [
      makeExpense({ expense_date: "2028-02-29", amount: 100, category: "Rent" }),
    ];
    const result = buildExpenseCategoryByPayPeriodChartData(expenses);
    expect(result[0].periodKey).toBe("2028-02-15_eom");
    expect(result[0].periodLabel).toBe("Feb 15\u201329");
  });
});

// ===========================================================================
// Privacy: helpers are pure and do not infer hidden data
// ===========================================================================

describe("privacy: helpers are pure and caller-controlled", () => {
  it("buildExpensesByCategoryChartData only uses rows passed in", () => {
    // If caller passes only their own RLS-visible rows, the helper cannot
    // infer other users' data. Simulate two independent callers receiving
    // different expense sets.
    const userAExpenses = [
      makeExpense({
        expense_date: "2026-06-01",
        amount: 500,
        category: "Rent",
        created_by_user_id: "user-a",
      }),
    ];
    const userBExpenses = [
      makeExpense({
        expense_date: "2026-06-01",
        amount: 800,
        category: "Rent",
        created_by_user_id: "user-b",
      }),
    ];

    const resultA = buildExpensesByCategoryChartData(userAExpenses);
    const resultB = buildExpensesByCategoryChartData(userBExpenses);

    expect(resultA[0].amount).toBe(500);
    expect(resultB[0].amount).toBe(800);

    // Results are fully isolated – no data from the other user bleeds in
    const combinedIds = [
      ...resultA.map((r) => r.categoryId),
      ...resultB.map((r) => r.categoryId),
    ];
    expect(combinedIds.every((id) => id === null)).toBe(true);
  });

  it("no raw user_id or household_id UUIDs appear in any chart label", () => {
    const expenses = EXPENSES.map((e) => ({
      ...e,
      created_by_user_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      household_id: "ffffffff-0000-1111-2222-333333333333",
    }));

    const catRows = buildExpensesByCategoryChartData(expenses);
    const monthRows = buildExpensesByMonthChartData(expenses);
    const ppRows = buildExpensesByPayPeriodChartData(expenses);

    const allLabels = [
      ...catRows.map((r) => r.categoryName),
      ...monthRows.flatMap((r) => [r.monthKey, r.monthLabel]),
      ...ppRows.flatMap((r) => [r.periodKey, r.periodLabel]),
    ];

    assertNoRawUuids(allLabels);
  });
});
