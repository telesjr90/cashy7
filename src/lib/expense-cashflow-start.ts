import type { ManualExpense } from "@/lib/types";

export const EXPENSE_PRE_START_LABEL = "Before cashflow start";

export const EXPENSES_PRE_START_HIDDEN_NOTICE =
  "Expenses before the cashflow start date are hidden from the active list.";

export const SHOW_PRE_START_EXPENSES_LABEL = "Show pre-start expenses";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function parseExpenseDateOnly(
  expenseDate: string | null | undefined
): string | null {
  if (!expenseDate) {
    return null;
  }

  const match = expenseDate.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function isManualExpenseOnOrAfterCashflowStart(
  expense: Pick<ManualExpense, "expense_date">,
  cashflowStartDate: string
): boolean {
  const expenseDate = parseExpenseDateOnly(expense.expense_date);
  if (!expenseDate) {
    return true;
  }

  return expenseDate >= cashflowStartDate;
}

export function isManualExpensePreStart(
  expense: ManualExpense,
  cashflowStartDate: string | null | undefined
): boolean {
  if (!cashflowStartDate) {
    return false;
  }

  return !isManualExpenseOnOrAfterCashflowStart(expense, cashflowStartDate);
}

export function getManualExpensePreStartLabel(
  expense: ManualExpense,
  cashflowStartDate: string | null | undefined
): string | null {
  return isManualExpensePreStart(expense, cashflowStartDate)
    ? EXPENSE_PRE_START_LABEL
    : null;
}

export function filterManualExpensesByCashflowStart(
  expenses: ManualExpense[],
  cashflowStartDate: string | null | undefined
): ManualExpense[] {
  if (!cashflowStartDate) {
    return expenses;
  }

  return expenses.filter((expense) =>
    isManualExpenseOnOrAfterCashflowStart(expense, cashflowStartDate)
  );
}

export function splitManualExpensesByCashflowStart(
  expenses: ManualExpense[],
  cashflowStartDate: string | null | undefined
): { activeExpenses: ManualExpense[]; preStartExpenses: ManualExpense[] } {
  if (!cashflowStartDate) {
    return { activeExpenses: expenses, preStartExpenses: [] };
  }

  const activeExpenses: ManualExpense[] = [];
  const preStartExpenses: ManualExpense[] = [];

  for (const expense of expenses) {
    if (isManualExpenseOnOrAfterCashflowStart(expense, cashflowStartDate)) {
      activeExpenses.push(expense);
    } else {
      preStartExpenses.push(expense);
    }
  }

  return { activeExpenses, preStartExpenses };
}

/** Expenses eligible for C062 filters and the default active list. */
export function getExpensesPageVisibleInstances(
  expenses: ManualExpense[],
  cashflowStartDate: string | null | undefined,
  showPreStartExpenses: boolean
): ManualExpense[] {
  if (!cashflowStartDate || showPreStartExpenses) {
    return expenses;
  }

  return filterManualExpensesByCashflowStart(expenses, cashflowStartDate);
}

export function expenseCashflowStartLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}
