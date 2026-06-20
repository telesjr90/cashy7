import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANUAL_EXPENSE_FILTERS,
  filterManualExpenses,
  isManualExpenseFiltersActive,
  matchesManualExpenseAdjustmentType,
  matchesManualExpenseCategory,
  matchesManualExpenseDateFilter,
  matchesManualExpensePaidStatus,
  matchesManualExpensePeriodBucket,
  matchesManualExpenseScope,
  matchesManualExpenseSearchText,
  type ManualExpenseFilters,
} from "@/lib/expense-filters";
import type { ManualExpense } from "@/lib/types";

function makeExpense(
  overrides: Partial<ManualExpense> & Pick<ManualExpense, "id" | "description">
): ManualExpense {
  return {
    id: overrides.id,
    household_id: "household-1",
    created_by_user_id: overrides.created_by_user_id ?? "user-1",
    person_id: null,
    expense_scope: overrides.expense_scope ?? "private",
    description: overrides.description,
    category: overrides.category ?? null,
    amount: overrides.amount ?? 100,
    expense_date: overrides.expense_date ?? "2026-06-15",
    period_bucket: overrides.period_bucket ?? "15_eom",
    split_type: overrides.split_type ?? "personal",
    teles_amount: overrides.teles_amount ?? 100,
    nicole_amount: overrides.nicole_amount ?? 0,
    is_paid: overrides.is_paid ?? false,
    paid_at: overrides.paid_at ?? null,
    notes: overrides.notes ?? null,
    adjusts_manual_expense_id: overrides.adjusts_manual_expense_id ?? null,
    adjustment_direction: overrides.adjustment_direction ?? null,
    adjustment_reason: overrides.adjustment_reason ?? null,
    created_at: overrides.created_at ?? "2026-06-15T10:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-15T10:00:00.000Z",
  };
}

const originalJune = makeExpense({
  id: "exp-1",
  description: "Groceries",
  category: "Food",
  notes: "Weekly shop",
  expense_date: "2026-06-05",
  period_bucket: "1_14",
  expense_scope: "shared",
});

const originalJuly = makeExpense({
  id: "exp-2",
  description: "Gas",
  category: "Transport",
  expense_date: "2026-07-20",
  period_bucket: "15_eom",
  expense_scope: "private",
  is_paid: true,
});

const increaseAdjustment = makeExpense({
  id: "adj-1",
  description: "Adjustment for groceries",
  expense_date: "2026-06-10",
  period_bucket: "1_14",
  expense_scope: "shared",
  adjusts_manual_expense_id: "exp-1",
  adjustment_direction: "increase",
  adjustment_reason: "Forgot items",
  notes: "Extra produce",
});

const decreaseAdjustment = makeExpense({
  id: "adj-2",
  description: "Adjustment for gas",
  expense_date: "2026-07-22",
  period_bucket: "15_eom",
  expense_scope: "private",
  adjusts_manual_expense_id: "exp-2",
  adjustment_direction: "decrease",
  adjustment_reason: "Refund received",
});

const allExpenses = [
  originalJune,
  originalJuly,
  increaseAdjustment,
  decreaseAdjustment,
];

const emptyContext = { paidManualExpenseIds: new Set<string>() };

describe("matchesManualExpenseSearchText", () => {
  it("matches description case-insensitively", () => {
    expect(matchesManualExpenseSearchText(originalJune, "GROC")).toBe(true);
    expect(matchesManualExpenseSearchText(originalJune, "gas")).toBe(false);
  });

  it("matches category, notes, and adjustment reason", () => {
    expect(matchesManualExpenseSearchText(originalJune, "food")).toBe(true);
    expect(matchesManualExpenseSearchText(originalJune, "weekly")).toBe(true);
    expect(matchesManualExpenseSearchText(increaseAdjustment, "forgot")).toBe(true);
    expect(matchesManualExpenseSearchText(increaseAdjustment, "produce")).toBe(true);
  });

  it("passes when search text is empty", () => {
    expect(matchesManualExpenseSearchText(originalJune, "")).toBe(true);
    expect(matchesManualExpenseSearchText(originalJune, "   ")).toBe(true);
  });
});

describe("matchesManualExpenseDateFilter", () => {
  it("filters by month when filterMonth is set", () => {
    expect(
      matchesManualExpenseDateFilter(originalJune, {
        filterMonth: "2026-06",
        dateFrom: "",
        dateTo: "",
      })
    ).toBe(true);
    expect(
      matchesManualExpenseDateFilter(originalJuly, {
        filterMonth: "2026-06",
        dateFrom: "",
        dateTo: "",
      })
    ).toBe(false);
  });

  it("filters by inclusive date range when month is not set", () => {
    expect(
      matchesManualExpenseDateFilter(originalJune, {
        filterMonth: "",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-30",
      })
    ).toBe(true);
    expect(
      matchesManualExpenseDateFilter(originalJuly, {
        filterMonth: "",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-30",
      })
    ).toBe(false);
  });

  it("supports open-ended from and to bounds", () => {
    expect(
      matchesManualExpenseDateFilter(originalJuly, {
        filterMonth: "",
        dateFrom: "2026-07-01",
        dateTo: "",
      })
    ).toBe(true);
    expect(
      matchesManualExpenseDateFilter(originalJune, {
        filterMonth: "",
        dateFrom: "",
        dateTo: "2026-06-30",
      })
    ).toBe(true);
  });

  it("prefers month over custom range", () => {
    expect(
      matchesManualExpenseDateFilter(originalJuly, {
        filterMonth: "2026-06",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
      })
    ).toBe(false);
  });
});

describe("matchesManualExpensePeriodBucket", () => {
  it("matches period bucket values", () => {
    expect(matchesManualExpensePeriodBucket(originalJune, "1_14")).toBe(true);
    expect(matchesManualExpensePeriodBucket(originalJune, "15_eom")).toBe(false);
    expect(matchesManualExpensePeriodBucket(originalJune, "all")).toBe(true);
  });
});

describe("matchesManualExpensePaidStatus", () => {
  it("filters unpaid originals", () => {
    expect(
      matchesManualExpensePaidStatus(originalJune, "unpaid", emptyContext)
    ).toBe(true);
    expect(
      matchesManualExpensePaidStatus(originalJuly, "unpaid", emptyContext)
    ).toBe(false);
  });

  it("filters marked paid only originals", () => {
    expect(
      matchesManualExpensePaidStatus(originalJuly, "marked_paid_only", emptyContext)
    ).toBe(true);
    expect(
      matchesManualExpensePaidStatus(originalJune, "marked_paid_only", emptyContext)
    ).toBe(false);
  });

  it("filters deducted from cash originals", () => {
    const context = { paidManualExpenseIds: new Set(["exp-1"]) };
    expect(
      matchesManualExpensePaidStatus(originalJune, "deducted_from_cash", context)
    ).toBe(true);
    expect(
      matchesManualExpensePaidStatus(originalJuly, "deducted_from_cash", context)
    ).toBe(false);
  });

  it("does not exclude adjustments when paid status is filtered", () => {
    expect(
      matchesManualExpensePaidStatus(increaseAdjustment, "unpaid", emptyContext)
    ).toBe(true);
  });
});

describe("matchesManualExpenseScope", () => {
  it("matches private and shared scope", () => {
    expect(matchesManualExpenseScope(originalJune, "shared")).toBe(true);
    expect(matchesManualExpenseScope(originalJuly, "shared")).toBe(false);
    expect(matchesManualExpenseScope(originalJuly, "all")).toBe(true);
  });
});

describe("matchesManualExpenseCategory", () => {
  it("matches category text case-insensitively", () => {
    expect(matchesManualExpenseCategory(originalJune, "food")).toBe(true);
    expect(matchesManualExpenseCategory(originalJune, "Transport")).toBe(false);
  });

  it("passes when category filter is empty", () => {
    expect(matchesManualExpenseCategory(originalJune, "")).toBe(true);
  });
});

describe("matchesManualExpenseAdjustmentType", () => {
  it("filters originals and adjustments", () => {
    expect(matchesManualExpenseAdjustmentType(originalJune, "originals")).toBe(
      true
    );
    expect(matchesManualExpenseAdjustmentType(increaseAdjustment, "originals")).toBe(
      false
    );
    expect(
      matchesManualExpenseAdjustmentType(increaseAdjustment, "adjustments")
    ).toBe(true);
  });

  it("filters increase and decrease adjustments", () => {
    expect(matchesManualExpenseAdjustmentType(increaseAdjustment, "increase")).toBe(
      true
    );
    expect(matchesManualExpenseAdjustmentType(decreaseAdjustment, "increase")).toBe(
      false
    );
    expect(matchesManualExpenseAdjustmentType(decreaseAdjustment, "decrease")).toBe(
      true
    );
  });
});

describe("filterManualExpenses", () => {
  it("returns all rows with default filters", () => {
    expect(
      filterManualExpenses(allExpenses, DEFAULT_MANUAL_EXPENSE_FILTERS, emptyContext)
    ).toEqual(allExpenses);
  });

  it("applies combined filters", () => {
    const filters: ManualExpenseFilters = {
      ...DEFAULT_MANUAL_EXPENSE_FILTERS,
      scope: "shared",
      adjustmentType: "adjustments",
    };

    expect(filterManualExpenses(allExpenses, filters, emptyContext)).toEqual([
      increaseAdjustment,
    ]);
  });

  it("returns empty when no rows match", () => {
    const filters: ManualExpenseFilters = {
      ...DEFAULT_MANUAL_EXPENSE_FILTERS,
      searchText: "nonexistent",
    };

    expect(filterManualExpenses(allExpenses, filters, emptyContext)).toEqual([]);
  });
});

describe("isManualExpenseFiltersActive", () => {
  it("returns false for default filters", () => {
    expect(isManualExpenseFiltersActive(DEFAULT_MANUAL_EXPENSE_FILTERS)).toBe(
      false
    );
  });

  it("returns true when any filter is set", () => {
    expect(
      isManualExpenseFiltersActive({
        ...DEFAULT_MANUAL_EXPENSE_FILTERS,
        searchText: "groceries",
      })
    ).toBe(true);
    expect(
      isManualExpenseFiltersActive({
        ...DEFAULT_MANUAL_EXPENSE_FILTERS,
        filterMonth: "2026-06",
      })
    ).toBe(true);
    expect(
      isManualExpenseFiltersActive({
        ...DEFAULT_MANUAL_EXPENSE_FILTERS,
        paidStatus: "unpaid",
      })
    ).toBe(true);
  });
});
