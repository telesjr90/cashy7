import {
  getExpensePeriodBucket,
  isManualExpenseAdjustment,
  type ExpensePeriodBucket,
} from "@/lib/expenses";
import { getCashDeductionStatus } from "@/lib/payments";
import type {
  ManualExpense,
  ManualExpenseScope,
} from "@/lib/types";

export type ManualExpenseAdjustmentTypeFilter =
  | "all"
  | "originals"
  | "adjustments"
  | "increase"
  | "decrease";

export type ManualExpensePaidStatusFilter =
  | "all"
  | "unpaid"
  | "marked_paid_only"
  | "deducted_from_cash";

export type ManualExpensePeriodBucketFilter = ExpensePeriodBucket | "all";

export type ManualExpenseScopeFilter = ManualExpenseScope | "all";

export interface ManualExpenseFilters {
  searchText: string;
  filterMonth: string;
  dateFrom: string;
  dateTo: string;
  periodBucket: ManualExpensePeriodBucketFilter;
  paidStatus: ManualExpensePaidStatusFilter;
  scope: ManualExpenseScopeFilter;
  category: string;
  adjustmentType: ManualExpenseAdjustmentTypeFilter;
}

export const DEFAULT_MANUAL_EXPENSE_FILTERS: ManualExpenseFilters = {
  searchText: "",
  filterMonth: "",
  dateFrom: "",
  dateTo: "",
  periodBucket: "all",
  paidStatus: "all",
  scope: "all",
  category: "",
  adjustmentType: "all",
};

export interface ManualExpenseFilterContext {
  paidManualExpenseIds: ReadonlySet<string>;
}

function parseDateOnly(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function expenseSearchHaystack(expense: ManualExpense): string {
  const parts = [
    expense.description,
    expense.category,
    expense.notes,
    expense.adjustment_reason,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");

  return normalizeSearchText(parts);
}

export function matchesManualExpenseSearchText(
  expense: ManualExpense,
  searchText: string
): boolean {
  const query = normalizeSearchText(searchText);
  if (!query) {
    return true;
  }

  return expenseSearchHaystack(expense).includes(query);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function matchesManualExpenseDateFilter(
  expense: ManualExpense,
  filters: Pick<ManualExpenseFilters, "filterMonth" | "dateFrom" | "dateTo">
): boolean {
  const expenseDate = parseDateOnly(expense.expense_date);
  if (!expenseDate) {
    return false;
  }

  if (filters.filterMonth) {
    const monthMatch = filters.filterMonth.match(/^(\d{4})-(\d{2})$/);
    if (!monthMatch) {
      return true;
    }

    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    const monthStart = `${monthMatch[1]}-${monthMatch[2]}-01`;
    const monthEnd = `${monthMatch[1]}-${monthMatch[2]}-${String(
      lastDayOfMonth(year, month)
    ).padStart(2, "0")}`;

    return expenseDate >= monthStart && expenseDate <= monthEnd;
  }

  const fromDate = parseDateOnly(filters.dateFrom);
  const toDate = parseDateOnly(filters.dateTo);

  if (!fromDate && !toDate) {
    return true;
  }

  if (fromDate && expenseDate < fromDate) {
    return false;
  }

  if (toDate && expenseDate > toDate) {
    return false;
  }

  return true;
}

export function matchesManualExpensePeriodBucket(
  expense: ManualExpense,
  periodBucket: ManualExpensePeriodBucketFilter
): boolean {
  if (periodBucket === "all") {
    return true;
  }

  const bucket =
    expense.period_bucket ?? getExpensePeriodBucket(expense.expense_date);
  return bucket === periodBucket;
}

export function matchesManualExpensePaidStatus(
  expense: ManualExpense,
  paidStatus: ManualExpensePaidStatusFilter,
  context: ManualExpenseFilterContext
): boolean {
  if (paidStatus === "all") {
    return true;
  }

  if (isManualExpenseAdjustment(expense)) {
    return true;
  }

  const status = getCashDeductionStatus({
    isMarkedPaid: expense.is_paid,
    hasPaymentTransaction: context.paidManualExpenseIds.has(expense.id),
  });

  return status === paidStatus;
}

export function matchesManualExpenseScope(
  expense: ManualExpense,
  scope: ManualExpenseScopeFilter
): boolean {
  if (scope === "all") {
    return true;
  }

  return expense.expense_scope === scope;
}

export function matchesManualExpenseCategory(
  expense: ManualExpense,
  category: string
): boolean {
  const query = normalizeSearchText(category);
  if (!query) {
    return true;
  }

  const expenseCategory = normalizeSearchText(expense.category ?? "");
  return expenseCategory.includes(query);
}

export function matchesManualExpenseAdjustmentType(
  expense: ManualExpense,
  adjustmentType: ManualExpenseAdjustmentTypeFilter
): boolean {
  if (adjustmentType === "all") {
    return true;
  }

  const isAdjustment = isManualExpenseAdjustment(expense);

  if (adjustmentType === "originals") {
    return !isAdjustment;
  }

  if (adjustmentType === "adjustments") {
    return isAdjustment;
  }

  if (adjustmentType === "increase") {
    return isAdjustment && expense.adjustment_direction === "increase";
  }

  return isAdjustment && expense.adjustment_direction === "decrease";
}

export function isManualExpenseFiltersActive(
  filters: ManualExpenseFilters
): boolean {
  return (
    filters.searchText.trim() !== "" ||
    filters.filterMonth !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.periodBucket !== "all" ||
    filters.paidStatus !== "all" ||
    filters.scope !== "all" ||
    filters.category.trim() !== "" ||
    filters.adjustmentType !== "all"
  );
}

export function filterManualExpenses(
  expenses: ManualExpense[],
  filters: ManualExpenseFilters,
  context: ManualExpenseFilterContext
): ManualExpense[] {
  return expenses.filter(
    (expense) =>
      matchesManualExpenseSearchText(expense, filters.searchText) &&
      matchesManualExpenseDateFilter(expense, filters) &&
      matchesManualExpensePeriodBucket(expense, filters.periodBucket) &&
      matchesManualExpensePaidStatus(expense, filters.paidStatus, context) &&
      matchesManualExpenseScope(expense, filters.scope) &&
      matchesManualExpenseCategory(expense, filters.category) &&
      matchesManualExpenseAdjustmentType(expense, filters.adjustmentType)
  );
}
