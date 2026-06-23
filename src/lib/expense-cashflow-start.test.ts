import { describe, expect, it } from "vitest";
import type { ManualExpense } from "@/lib/types";
import {
  DEFAULT_MANUAL_EXPENSE_FILTERS,
  filterManualExpenses,
  type ManualExpenseFilterContext,
} from "@/lib/expense-filters";
import {
  EXPENSE_PRE_START_LABEL,
  EXPENSES_PRE_START_HIDDEN_NOTICE,
  expenseCashflowStartLabelContainsRawUuid,
  getExpensesPageVisibleInstances,
  getManualExpensePreStartLabel,
  isManualExpensePreStart,
  SHOW_PRE_START_EXPENSES_LABEL,
  splitManualExpensesByCashflowStart,
} from "./expense-cashflow-start";

function makeExpense(
  overrides: Partial<ManualExpense> & Pick<ManualExpense, "id" | "expense_date">
): ManualExpense {
  return {
    household_id: "household-1",
    created_by_user_id: "user-1",
    person_id: null,
    expense_scope: "private",
    description: "Test expense",
    category: null,
    amount: 100,
    period_bucket: "15_eom",
    split_type: "personal",
    teles_amount: 100,
    nicole_amount: 0,
    is_paid: false,
    paid_at: null,
    notes: null,
    adjusts_manual_expense_id: null,
    adjustment_direction: null,
    adjustment_reason: null,
    created_at: "2026-06-15T10:00:00.000Z",
    updated_at: "2026-06-15T10:00:00.000Z",
    ...overrides,
  };
}

const START_DATE = "2026-06-15";

const beforeStart = makeExpense({
  id: "before",
  expense_date: "2026-06-14",
});
const onStart = makeExpense({
  id: "on-start",
  expense_date: "2026-06-15",
});
const afterStart = makeExpense({
  id: "after",
  expense_date: "2026-06-20",
});
const adjustmentBeforeStart = makeExpense({
  id: "adj-before",
  expense_date: "2026-06-10",
  adjusts_manual_expense_id: "orig-1",
  adjustment_direction: "increase",
  description: "Adjustment before start",
});

const emptyFilterContext: ManualExpenseFilterContext = {
  paidManualExpenseIds: new Set(),
};

describe("isManualExpensePreStart", () => {
  it("classifies expenses before the start date as pre-start", () => {
    expect(isManualExpensePreStart(beforeStart, START_DATE)).toBe(true);
  });

  it("classifies adjustments before the start date as pre-start", () => {
    expect(isManualExpensePreStart(adjustmentBeforeStart, START_DATE)).toBe(true);
  });

  it("does not classify expenses on the start date as pre-start", () => {
    expect(isManualExpensePreStart(onStart, START_DATE)).toBe(false);
  });

  it("does not classify expenses after the start date as pre-start", () => {
    expect(isManualExpensePreStart(afterStart, START_DATE)).toBe(false);
  });

  it("keeps all expenses visible when no start date is configured", () => {
    expect(isManualExpensePreStart(beforeStart, null)).toBe(false);
    expect(isManualExpensePreStart(beforeStart, undefined)).toBe(false);
  });
});

describe("splitManualExpensesByCashflowStart", () => {
  it("splits active and pre-start expenses when a start date is set", () => {
    const { activeExpenses, preStartExpenses } = splitManualExpensesByCashflowStart(
      [beforeStart, onStart, afterStart, adjustmentBeforeStart],
      START_DATE
    );

    expect(activeExpenses.map((expense) => expense.id)).toEqual(["on-start", "after"]);
    expect(preStartExpenses.map((expense) => expense.id)).toEqual([
      "before",
      "adj-before",
    ]);
  });

  it("returns all expenses as active when no start date is set", () => {
    const { activeExpenses, preStartExpenses } = splitManualExpensesByCashflowStart(
      [beforeStart, onStart, afterStart],
      null
    );

    expect(activeExpenses).toHaveLength(3);
    expect(preStartExpenses).toHaveLength(0);
  });
});

describe("getExpensesPageVisibleInstances", () => {
  const expenses = [beforeStart, onStart, afterStart, adjustmentBeforeStart];

  it("excludes pre-start expenses from the default visible list", () => {
    const visible = getExpensesPageVisibleInstances(expenses, START_DATE, false);
    expect(visible.map((expense) => expense.id)).toEqual(["on-start", "after"]);
  });

  it("includes pre-start expenses when show-pre-start mode is on", () => {
    const visible = getExpensesPageVisibleInstances(expenses, START_DATE, true);
    expect(visible.map((expense) => expense.id)).toEqual([
      "before",
      "on-start",
      "after",
      "adj-before",
    ]);
  });

  it("includes all expenses when no start date is configured", () => {
    expect(getExpensesPageVisibleInstances(expenses, null, false)).toEqual(expenses);
  });
});

describe("expense cashflow start labels", () => {
  it("returns a readable pre-start label", () => {
    expect(getManualExpensePreStartLabel(beforeStart, START_DATE)).toBe(
      EXPENSE_PRE_START_LABEL
    );
    expect(getManualExpensePreStartLabel(onStart, START_DATE)).toBeNull();
  });

  it("does not expose raw UUIDs in user-facing labels", () => {
    for (const label of [
      EXPENSE_PRE_START_LABEL,
      EXPENSES_PRE_START_HIDDEN_NOTICE,
      SHOW_PRE_START_EXPENSES_LABEL,
    ]) {
      expect(expenseCashflowStartLabelContainsRawUuid(label)).toBe(false);
    }
  });
});

describe("filters with cashflow start boundary", () => {
  const expenses = [beforeStart, onStart, afterStart];

  it("does not reveal pre-start expenses through filters when the toggle is off", () => {
    const visible = getExpensesPageVisibleInstances(expenses, START_DATE, false);
    const filtered = filterManualExpenses(
      visible,
      { ...DEFAULT_MANUAL_EXPENSE_FILTERS, searchText: "Test" },
      emptyFilterContext
    );

    expect(filtered.map((expense) => expense.id)).toEqual(["on-start", "after"]);
  });

  it("allows filters to match pre-start expenses when the toggle is on", () => {
    const visible = getExpensesPageVisibleInstances(expenses, START_DATE, true);
    const filtered = filterManualExpenses(
      visible,
      { ...DEFAULT_MANUAL_EXPENSE_FILTERS, dateFrom: "2026-06-01", dateTo: "2026-06-14" },
      emptyFilterContext
    );

    expect(filtered.map((expense) => expense.id)).toEqual(["before"]);
  });

  it("keeps pre-start expenses hidden after clearing filters when the toggle is off", () => {
    const visible = getExpensesPageVisibleInstances(expenses, START_DATE, false);
    const filtered = filterManualExpenses(
      visible,
      DEFAULT_MANUAL_EXPENSE_FILTERS,
      emptyFilterContext
    );

    expect(filtered.map((expense) => expense.id)).toEqual(["on-start", "after"]);
  });
});

describe("category derivation boundary", () => {
  it("excludes pre-start-only categories from the default visible set", () => {
    const preStartOnly = makeExpense({
      id: "pre-start-only",
      expense_date: "2026-01-01",
      category: "Legacy Groceries",
    });
    const active = makeExpense({
      id: "active",
      expense_date: "2026-07-01",
      category: "Current Dining",
    });

    const defaultVisible = getExpensesPageVisibleInstances(
      [preStartOnly, active],
      START_DATE,
      false
    );
    const categories = defaultVisible
      .map((expense) => expense.category)
      .filter((value): value is string => Boolean(value));

    expect(categories).toEqual(["Current Dining"]);
    expect(categories).not.toContain("Legacy Groceries");
  });

  it("includes pre-start-only categories when show-pre-start mode is on", () => {
    const preStartOnly = makeExpense({
      id: "pre-start-only",
      expense_date: "2026-01-01",
      category: "Legacy Groceries",
    });
    const active = makeExpense({
      id: "active",
      expense_date: "2026-07-01",
      category: "Current Dining",
    });

    const visible = getExpensesPageVisibleInstances(
      [preStartOnly, active],
      START_DATE,
      true
    );
    const categories = visible
      .map((expense) => expense.category)
      .filter((value): value is string => Boolean(value));

    expect(categories).toContain("Legacy Groceries");
    expect(categories).toContain("Current Dining");
  });
});
