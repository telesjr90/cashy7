import type { BillShareKey } from "@/lib/bill-share";
import { filterManualExpensesCountedInDashboardView } from "@/lib/dashboard-drilldowns";
import { ORIGINAL_EXPENSE_UNAVAILABLE_LABEL } from "@/lib/expense-detail";
import {
  adjustmentDirectionLabel,
  expenseScopeLabel,
  expenseSplitTypeLabel,
  getManualExpenseSignedShareAmount,
  isManualExpenseAdjustment,
} from "@/lib/expenses";
import type { PeriodView } from "@/lib/periods";
import type { ManualExpense, Person } from "@/lib/types";

export type DashboardExpenseDrilldownRowKind = "expense" | "adjustment";

export type DashboardExpenseDrilldownRowKindFilter =
  | "all"
  | DashboardExpenseDrilldownRowKind;

export interface DashboardExpenseDrilldownRow {
  id: string;
  kind: DashboardExpenseDrilldownRowKind;
  date: string;
  description: string;
  category: string | null;
  amount: number;
  myShareAmount: number | null;
  splitLabel: string;
  telesAmount: number;
  nicoleAmount: number;
  paidByLabel: string | null;
  sourceLabel: string;
  rowTypeLabel: string;
  adjustmentDirectionLabel: string | null;
  adjustmentReason: string | null;
  linkedOriginalDescription: string | null;
  notes: string | null;
  scopeLabel: string;
}

export interface DashboardExpenseDrilldownFilters {
  searchText: string;
  category: string;
  rowKind: DashboardExpenseDrilldownRowKindFilter;
}

export const DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS: DashboardExpenseDrilldownFilters =
  {
    searchText: "",
    category: "",
    rowKind: "all",
  };

export interface DashboardExpenseDrilldownReconciliation {
  cardTotal: number;
  displayedRowTotal: number;
  totalsMatch: boolean;
  cardTotalLabel: string;
  rowTotalLabel: string;
  matchLabel: string | null;
  mismatchExplanation: string | null;
}

export interface BuildManualExpenseDrilldownInput {
  expenses: ManualExpense[];
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  snapshotDate: string | null | undefined;
  shareKey: BillShareKey;
  cardTotal: number;
  deductedManualExpenseIds?: ReadonlySet<string>;
  people?: Person[];
}

export interface ManualExpenseDrilldownResult {
  rows: DashboardExpenseDrilldownRow[];
  reconciliation: DashboardExpenseDrilldownReconciliation;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function resolvePaidByLabel(
  expense: ManualExpense,
  people: ReadonlyArray<Person>
): string | null {
  if (!expense.person_id) {
    return null;
  }

  const person = people.find((row) => row.id === expense.person_id);
  if (!person?.name?.trim()) {
    return "Household member";
  }

  return person.name;
}

function resolveLinkedOriginalDescription(
  expense: ManualExpense,
  visibleExpenses: ReadonlyArray<ManualExpense>
): string | null {
  if (!expense.adjusts_manual_expense_id) {
    return null;
  }

  const original = visibleExpenses.find(
    (row) => row.id === expense.adjusts_manual_expense_id
  );

  if (!original) {
    return ORIGINAL_EXPENSE_UNAVAILABLE_LABEL;
  }

  return original.description;
}

function buildRowSourceLabel(
  expense: ManualExpense,
  isAdjustment: boolean
): string {
  if (isAdjustment) {
    return "Expense adjustment";
  }

  return expenseScopeLabel(expense.expense_scope);
}

function buildRowTypeLabel(isAdjustment: boolean): string {
  return isAdjustment ? "Adjustment" : "Manual expense";
}

export function buildExpenseDrilldownRows(
  expenses: ManualExpense[],
  shareKey: BillShareKey | null,
  people: ReadonlyArray<Person> = [],
  allVisibleExpenses: ReadonlyArray<ManualExpense> = expenses
): DashboardExpenseDrilldownRow[] {
  return expenses.map((expense) => {
    const isAdjustment = isManualExpenseAdjustment(expense);

    return {
      id: expense.id,
      kind: isAdjustment ? "adjustment" : "expense",
      date: expense.expense_date,
      description: expense.description,
      category: expense.category,
      amount: Number(expense.amount),
      myShareAmount: getManualExpenseSignedShareAmount(expense, shareKey),
      splitLabel: expenseSplitTypeLabel(expense.split_type),
      telesAmount: Number(expense.teles_amount),
      nicoleAmount: Number(expense.nicole_amount),
      paidByLabel: resolvePaidByLabel(expense, people),
      sourceLabel: buildRowSourceLabel(expense, isAdjustment),
      rowTypeLabel: buildRowTypeLabel(isAdjustment),
      adjustmentDirectionLabel: expense.adjustment_direction
        ? adjustmentDirectionLabel(expense.adjustment_direction)
        : null,
      adjustmentReason: expense.adjustment_reason,
      linkedOriginalDescription: resolveLinkedOriginalDescription(
        expense,
        allVisibleExpenses
      ),
      notes: expense.notes,
      scopeLabel: expenseScopeLabel(expense.expense_scope),
    };
  });
}

export function sumExpenseDrilldownRowShares(
  rows: ReadonlyArray<Pick<DashboardExpenseDrilldownRow, "myShareAmount">>
): number {
  return rows.reduce((sum, row) => sum + (row.myShareAmount ?? 0), 0);
}

export function buildExpenseDrilldownReconciliation(
  cardTotal: number,
  displayedRowTotal: number
): DashboardExpenseDrilldownReconciliation {
  const totalsMatch = Math.abs(cardTotal - displayedRowTotal) < 0.005;

  return {
    cardTotal,
    displayedRowTotal,
    totalsMatch,
    cardTotalLabel: "Dashboard card total (your manual expense share)",
    rowTotalLabel: "Sum of your shares in listed rows",
    matchLabel: totalsMatch ? "Totals match" : null,
    mismatchExplanation: totalsMatch
      ? null
      : "These totals use your budget profile share only. Other household members' private expenses are not shown. Refresh the dashboard or confirm your budget profile in Settings if something looks off.",
  };
}

export function buildManualExpenseDrilldown(
  input: BuildManualExpenseDrilldownInput
): ManualExpenseDrilldownResult {
  const filteredExpenses = filterManualExpensesCountedInDashboardView(
    input.expenses,
    input.periodView,
    input.selectedYear,
    input.selectedMonth,
    input.snapshotDate,
    input.deductedManualExpenseIds
  );

  const rows = buildExpenseDrilldownRows(
    filteredExpenses,
    input.shareKey,
    input.people ?? [],
    input.expenses
  );

  const displayedRowTotal = sumExpenseDrilldownRowShares(rows);

  return {
    rows,
    reconciliation: buildExpenseDrilldownReconciliation(
      input.cardTotal,
      displayedRowTotal
    ),
  };
}

export function getExpenseDrilldownCategoryOptions(
  rows: ReadonlyArray<Pick<DashboardExpenseDrilldownRow, "category">>
): string[] {
  const categories = new Set<string>();

  for (const row of rows) {
    if (row.category?.trim()) {
      categories.add(row.category.trim());
    }
  }

  return [...categories].sort((left, right) => left.localeCompare(right));
}

function rowSearchHaystack(row: DashboardExpenseDrilldownRow): string {
  return normalizeSearchText(
    [
      row.description,
      row.category,
      row.notes,
      row.adjustmentReason,
      row.sourceLabel,
      row.rowTypeLabel,
      row.paidByLabel,
      row.linkedOriginalDescription,
      row.scopeLabel,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
  );
}

export function filterExpenseDrilldownRowsLocally(
  rows: DashboardExpenseDrilldownRow[],
  filters: DashboardExpenseDrilldownFilters
): DashboardExpenseDrilldownRow[] {
  const searchText = normalizeSearchText(filters.searchText);
  const category = filters.category.trim();

  return rows.filter((row) => {
    if (filters.rowKind !== "all" && row.kind !== filters.rowKind) {
      return false;
    }

    if (category && row.category?.trim() !== category) {
      return false;
    }

    if (searchText && !rowSearchHaystack(row).includes(searchText)) {
      return false;
    }

    return true;
  });
}

export function hasActiveExpenseDrilldownFilters(
  filters: DashboardExpenseDrilldownFilters
): boolean {
  return (
    filters.searchText.trim().length > 0 ||
    filters.category.trim().length > 0 ||
    filters.rowKind !== "all"
  );
}

export function expenseDrilldownRowLabelsArePrivacySafe(
  row: DashboardExpenseDrilldownRow
): boolean {
  const labels = [
    row.description,
    row.category,
    row.notes,
    row.adjustmentReason,
    row.sourceLabel,
    row.rowTypeLabel,
    row.paidByLabel,
    row.linkedOriginalDescription,
    row.scopeLabel,
    row.splitLabel,
    row.adjustmentDirectionLabel,
  ];

  return labels.every((label) => !label || !UUID_PATTERN.test(label));
}

export const EXPENSE_DRILLDOWN_EMPTY_MESSAGE =
  "No manual expenses or adjustments are included in this view.";
