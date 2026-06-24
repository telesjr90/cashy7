/**
 * CASHFLOW-CURSOR-131D — Report chart UI data helper tests.
 *
 * Tests the data pipeline that feeds the chart UI:
 *   - helpers consume only caller-supplied expenses (privacy preserved)
 *   - empty state: no rows returned for empty input
 *   - category labels fall back to "Uncategorized"
 *   - no raw UUIDs appear in chart-facing labels
 *   - pay-period ordering: 1_14 before 15_eom within same month
 *   - stacked helpers emit sanitizable series keys
 *   - chart config values are stable and serializable
 *   - formula results are unchanged (amounts pass through unmodified)
 */
import { describe, it, expect } from "vitest";
import {
  buildExpensesByCategoryChartData,
  buildExpensesByMonthChartData,
  buildExpensesByPayPeriodChartData,
  buildExpenseCategoryByMonthChartData,
  buildExpenseCategoryByPayPeriodChartData,
} from "@/lib/report-chart-data";
import type { ManualExpense } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeExpense(overrides: Partial<ManualExpense> = {}): ManualExpense {
  return {
    id: "expense-id-1",
    household_id: "hh-id-1",
    created_by_user_id: "user-id-1",
    person_id: null,
    expense_scope: "shared",
    description: "Test expense",
    amount: 50,
    expense_date: "2024-03-10",
    category: "Groceries",
    period_bucket: "1_14",
    adjustment_direction: null,
    split_type: "equal",
    receipt_upload_id: null,
    import_batch_id: null,
    created_at: "2024-03-10T00:00:00Z",
    updated_at: "2024-03-10T00:00:00Z",
    ...overrides,
  } as ManualExpense;
}

const UUID_LIKE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function containsRawUuid(value: string): boolean {
  return UUID_LIKE.test(value);
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("empty input returns no rows", () => {
  it("buildExpensesByCategoryChartData: empty array yields []", () => {
    expect(buildExpensesByCategoryChartData([])).toEqual([]);
  });

  it("buildExpensesByMonthChartData: empty array yields []", () => {
    expect(buildExpensesByMonthChartData([])).toEqual([]);
  });

  it("buildExpensesByPayPeriodChartData: empty array yields []", () => {
    expect(buildExpensesByPayPeriodChartData([])).toEqual([]);
  });

  it("buildExpenseCategoryByMonthChartData: empty array yields []", () => {
    expect(buildExpenseCategoryByMonthChartData([])).toEqual([]);
  });

  it("buildExpenseCategoryByPayPeriodChartData: empty array yields []", () => {
    expect(buildExpenseCategoryByPayPeriodChartData([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Category chart
// ---------------------------------------------------------------------------

describe("buildExpensesByCategoryChartData", () => {
  it("groups by category name and sorts descending by amount", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "Dining", amount: 30, expense_date: "2024-03-05" }),
      makeExpense({ id: "e2", category: "Groceries", amount: 80, expense_date: "2024-03-10" }),
      makeExpense({ id: "e3", category: "Dining", amount: 20, expense_date: "2024-03-15" }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    expect(rows[0].categoryName).toBe("Groceries");
    expect(rows[0].amount).toBe(80);
    expect(rows[1].categoryName).toBe("Dining");
    expect(rows[1].amount).toBe(50);
  });

  it("falls back to 'Uncategorized' when category is null or empty", () => {
    const expenses = [
      makeExpense({ id: "e1", category: null as unknown as string, amount: 40 }),
      makeExpense({ id: "e2", category: "", amount: 25 }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryName).toBe("Uncategorized");
    expect(rows[0].amount).toBe(65);
  });

  it("emits no raw UUIDs in categoryName", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "Utilities", amount: 100 }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    for (const row of rows) {
      expect(containsRawUuid(row.categoryName)).toBe(false);
    }
  });

  it("categoryId field is always null (no UUID leakage)", () => {
    const expenses = [makeExpense({ id: "e1", amount: 50 })];
    const rows = buildExpensesByCategoryChartData(expenses);
    for (const row of rows) {
      expect(row.categoryId).toBeNull();
    }
  });

  it("percentages sum to ~100 for non-zero totals", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "A", amount: 75 }),
      makeExpense({ id: "e2", category: "B", amount: 25 }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    const sum = rows.reduce((acc, r) => acc + r.percentage, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it("collapses beyond topCategoryCount into 'Other'", () => {
    const expenses = Array.from({ length: 12 }, (_, i) =>
      makeExpense({ id: `e${i}`, category: `Cat${i}`, amount: 10 + i })
    );
    const rows = buildExpensesByCategoryChartData(expenses, {
      topCategoryCount: 5,
      includeOtherCategory: true,
    });
    expect(rows).toHaveLength(6);
    const other = rows.find((r) => r.categoryName === "Other");
    expect(other).toBeDefined();
  });

  it("decrease-adjustment reduces category total", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "Gas", amount: 100, adjustment_direction: null }),
      makeExpense({
        id: "e2",
        category: "Gas",
        amount: 30,
        adjustment_direction: "decrease",
      }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    expect(rows[0].amount).toBe(70);
  });

  it("transactionCount reflects the number of source rows", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "Food", amount: 20 }),
      makeExpense({ id: "e2", category: "Food", amount: 30 }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    expect(rows[0].transactionCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Month chart
// ---------------------------------------------------------------------------

describe("buildExpensesByMonthChartData", () => {
  it("groups by YYYY-MM and returns rows in ascending chronological order", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-03-05", amount: 50 }),
      makeExpense({ id: "e2", expense_date: "2024-01-15", amount: 30 }),
      makeExpense({ id: "e3", expense_date: "2024-03-20", amount: 40 }),
    ];
    const rows = buildExpensesByMonthChartData(expenses);
    expect(rows).toHaveLength(2);
    expect(rows[0].monthKey).toBe("2024-01");
    expect(rows[0].amount).toBe(30);
    expect(rows[1].monthKey).toBe("2024-03");
    expect(rows[1].amount).toBe(90);
  });

  it("monthLabel contains the short month name without raw UUIDs", () => {
    const expenses = [makeExpense({ id: "e1", expense_date: "2024-06-10", amount: 60 })];
    const rows = buildExpensesByMonthChartData(expenses);
    expect(rows[0].monthLabel).toMatch(/Jun/);
    expect(containsRawUuid(rows[0].monthLabel)).toBe(false);
  });

  it("transactionCount is correct", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-03-01", amount: 10 }),
      makeExpense({ id: "e2", expense_date: "2024-03-15", amount: 20 }),
    ];
    const rows = buildExpensesByMonthChartData(expenses);
    expect(rows[0].transactionCount).toBe(2);
  });

  it("respects cashflowStartDate filter", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2023-12-01", amount: 100 }),
      makeExpense({ id: "e2", expense_date: "2024-01-15", amount: 50 }),
    ];
    const rows = buildExpensesByMonthChartData(expenses, {
      cashflowStartDate: "2024-01-01",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].monthKey).toBe("2024-01");
  });
});

// ---------------------------------------------------------------------------
// Pay period chart
// ---------------------------------------------------------------------------

describe("buildExpensesByPayPeriodChartData", () => {
  it("1_14 appears before 15_eom within the same month", () => {
    const expenses = [
      makeExpense({
        id: "e1",
        expense_date: "2024-03-20",
        amount: 60,
        period_bucket: "15_eom",
      }),
      makeExpense({
        id: "e2",
        expense_date: "2024-03-05",
        amount: 40,
        period_bucket: "1_14",
      }),
    ];
    const rows = buildExpensesByPayPeriodChartData(expenses);
    expect(rows).toHaveLength(2);
    expect(rows[0].periodBucket).toBe("1_14");
    expect(rows[1].periodBucket).toBe("15_eom");
  });

  it("periodLabel contains no raw UUIDs", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-06-10", period_bucket: "1_14", amount: 30 }),
    ];
    const rows = buildExpensesByPayPeriodChartData(expenses);
    expect(containsRawUuid(rows[0].periodLabel)).toBe(false);
  });

  it("periodLabel looks like 'Mon 1–14' or 'Mon 15–N'", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-06-10", period_bucket: "1_14", amount: 10 }),
      makeExpense({ id: "e2", expense_date: "2024-06-20", period_bucket: "15_eom", amount: 20 }),
    ];
    const rows = buildExpensesByPayPeriodChartData(expenses);
    expect(rows[0].periodLabel).toMatch(/Jun.*1/);
    expect(rows[1].periodLabel).toMatch(/Jun.*15/);
  });

  it("transactionCount is correct", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-03-02", period_bucket: "1_14", amount: 10 }),
      makeExpense({ id: "e2", expense_date: "2024-03-08", period_bucket: "1_14", amount: 20 }),
    ];
    const rows = buildExpensesByPayPeriodChartData(expenses);
    expect(rows[0].transactionCount).toBe(2);
  });

  it("months from different periods appear in ascending chronological order", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-04-10", period_bucket: "1_14", amount: 10 }),
      makeExpense({ id: "e2", expense_date: "2024-02-20", period_bucket: "15_eom", amount: 20 }),
      makeExpense({ id: "e3", expense_date: "2024-03-05", period_bucket: "1_14", amount: 30 }),
    ];
    const rows = buildExpensesByPayPeriodChartData(expenses);
    const monthKeys = rows.map((r) => r.monthKey);
    expect(monthKeys).toEqual(["2024-02", "2024-03", "2024-04"]);
  });
});

// ---------------------------------------------------------------------------
// Stacked category by month
// ---------------------------------------------------------------------------

describe("buildExpenseCategoryByMonthChartData", () => {
  it("returns one row per month with category keys", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-03-05", category: "Food", amount: 50 }),
      makeExpense({ id: "e2", expense_date: "2024-03-15", category: "Gas", amount: 40 }),
      makeExpense({ id: "e3", expense_date: "2024-04-10", category: "Food", amount: 60 }),
    ];
    const rows = buildExpenseCategoryByMonthChartData(expenses);
    expect(rows).toHaveLength(2);
    expect(rows[0].periodKey).toBe("2024-03");
    expect(rows[0]["Food"]).toBe(50);
    expect(rows[0]["Gas"]).toBe(40);
    expect(rows[1]["Food"]).toBe(60);
  });

  it("no raw UUIDs in periodLabel", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-06-10", category: "Food", amount: 20 }),
    ];
    const rows = buildExpenseCategoryByMonthChartData(expenses);
    for (const row of rows) {
      expect(containsRawUuid(row.periodLabel)).toBe(false);
    }
  });

  it("'Other' key appears when topCategoryCount is set and exceeded", () => {
    const expenses = Array.from({ length: 6 }, (_, i) =>
      makeExpense({
        id: `e${i}`,
        category: `Cat${i}`,
        amount: 10 + i,
        expense_date: "2024-03-10",
      })
    );
    const rows = buildExpenseCategoryByMonthChartData(expenses, {
      topCategoryCount: 3,
      includeOtherCategory: true,
    });
    expect(rows[0]["Other"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Stacked category by pay period
// ---------------------------------------------------------------------------

describe("buildExpenseCategoryByPayPeriodChartData", () => {
  it("returns one row per pay period with category keys", () => {
    const expenses = [
      makeExpense({
        id: "e1",
        expense_date: "2024-03-05",
        period_bucket: "1_14",
        category: "Dining",
        amount: 30,
      }),
      makeExpense({
        id: "e2",
        expense_date: "2024-03-20",
        period_bucket: "15_eom",
        category: "Dining",
        amount: 45,
      }),
    ];
    const rows = buildExpenseCategoryByPayPeriodChartData(expenses);
    expect(rows).toHaveLength(2);
    expect(rows[0]["Dining"]).toBe(30);
    expect(rows[1]["Dining"]).toBe(45);
  });

  it("1_14 period row precedes 15_eom in the same month", () => {
    const expenses = [
      makeExpense({
        id: "e1",
        expense_date: "2024-05-18",
        period_bucket: "15_eom",
        category: "Bills",
        amount: 100,
      }),
      makeExpense({
        id: "e2",
        expense_date: "2024-05-03",
        period_bucket: "1_14",
        category: "Bills",
        amount: 80,
      }),
    ];
    const rows = buildExpenseCategoryByPayPeriodChartData(expenses);
    expect(rows[0].periodKey).toContain("1_14");
    expect(rows[1].periodKey).toContain("15_eom");
  });

  it("no raw UUIDs in periodLabel", () => {
    const expenses = [
      makeExpense({
        id: "e1",
        expense_date: "2024-06-10",
        period_bucket: "1_14",
        category: "Food",
        amount: 50,
      }),
    ];
    const rows = buildExpenseCategoryByPayPeriodChartData(expenses);
    for (const row of rows) {
      expect(containsRawUuid(row.periodLabel)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Privacy: helpers do not receive or emit user/household identifiers
// ---------------------------------------------------------------------------

describe("privacy — no user/household identifiers in chart output", () => {
  it("category chart rows carry no created_by_user_id or household_id fields", () => {
    const expense = makeExpense({ created_by_user_id: "user-aaa", household_id: "hh-bbb" });
    const rows = buildExpensesByCategoryChartData([expense]);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("user-aaa");
    expect(json).not.toContain("hh-bbb");
  });

  it("month chart rows carry no created_by_user_id or household_id fields", () => {
    const expense = makeExpense({ created_by_user_id: "user-aaa", household_id: "hh-bbb" });
    const rows = buildExpensesByMonthChartData([expense]);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("user-aaa");
    expect(json).not.toContain("hh-bbb");
  });

  it("pay period chart rows carry no created_by_user_id or household_id fields", () => {
    const expense = makeExpense({ created_by_user_id: "user-aaa", household_id: "hh-bbb" });
    const rows = buildExpensesByPayPeriodChartData([expense]);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("user-aaa");
    expect(json).not.toContain("hh-bbb");
  });

  it("stacked month chart rows carry no created_by_user_id or household_id fields", () => {
    const expense = makeExpense({
      created_by_user_id: "user-aaa",
      household_id: "hh-bbb",
      category: "Food",
    });
    const rows = buildExpenseCategoryByMonthChartData([expense]);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("user-aaa");
    expect(json).not.toContain("hh-bbb");
  });

  it("helpers are pure — same input always yields same output", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "A", amount: 100 }),
      makeExpense({ id: "e2", category: "B", amount: 50 }),
    ];
    const r1 = buildExpensesByCategoryChartData(expenses);
    const r2 = buildExpensesByCategoryChartData(expenses);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ---------------------------------------------------------------------------
// Chart config stability
// ---------------------------------------------------------------------------

describe("chart config values are stable and serializable", () => {
  it("building the same expenses produces JSON-stable output", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "Rent", amount: 1200 }),
      makeExpense({ id: "e2", category: "Groceries", amount: 300 }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    // Output must be serializable (no circular refs, functions, etc.)
    expect(() => JSON.stringify(rows)).not.toThrow();
  });

  it("stacked month output is serializable", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-03-10", category: "Food", amount: 50 }),
    ];
    const rows = buildExpenseCategoryByMonthChartData(expenses);
    expect(() => JSON.stringify(rows)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Formula preservation
// ---------------------------------------------------------------------------

describe("formulas are not changed", () => {
  it("amount sums are arithmetically correct for category aggregation", () => {
    const expenses = [
      makeExpense({ id: "e1", category: "Fuel", amount: 45.5 }),
      makeExpense({ id: "e2", category: "Fuel", amount: 32.25 }),
    ];
    const rows = buildExpensesByCategoryChartData(expenses);
    expect(rows[0].amount).toBeCloseTo(77.75, 2);
  });

  it("month totals match manual sum of filtered rows", () => {
    const expenses = [
      makeExpense({ id: "e1", expense_date: "2024-04-01", amount: 100 }),
      makeExpense({ id: "e2", expense_date: "2024-04-15", amount: 200 }),
      makeExpense({ id: "e3", expense_date: "2024-05-10", amount: 50 }),
    ];
    const rows = buildExpensesByMonthChartData(expenses);
    expect(rows.find((r) => r.monthKey === "2024-04")?.amount).toBe(300);
    expect(rows.find((r) => r.monthKey === "2024-05")?.amount).toBe(50);
  });
});
