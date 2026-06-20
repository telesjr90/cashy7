import type { BillShareKey } from "@/lib/bill-share";
import { resolveBillShareKeyForPerson } from "@/lib/bill-share";
import { split5149 } from "@/lib/format";
import type { PeriodView } from "@/lib/periods";
import { getDashboardViewDateRange } from "@/lib/savings";
import { supabase } from "@/lib/supabase";
import type {
  InsertManualExpense,
  ManualExpense,
  ManualExpenseScope,
  ManualExpenseSplitType,
  UpdateManualExpense,
} from "@/lib/types";

export type ExpensePeriodBucket = "1_14" | "15_eom";

export interface ExpenseSplitAmounts {
  telesAmount: number;
  nicoleAmount: number;
}

export interface ExpenseSplitResult {
  amounts: ExpenseSplitAmounts;
  error: string | null;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDateOnly(expenseDate: string): string | null {
  const match = expenseDate.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function toSafeNumber(value: number | string): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function getMyExpenseShareAmount(
  expense: { teles_amount: number | string; nicole_amount: number | string },
  shareKey: BillShareKey | null
): number | null {
  if (!shareKey) {
    return null;
  }

  return toSafeNumber(expense[shareKey]);
}

function expenseDateInViewRange(
  expenseDate: string,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): boolean {
  const dateOnly = parseDateOnly(expenseDate);
  if (!dateOnly) {
    return false;
  }

  const { start, end } = getDashboardViewDateRange(
    periodView,
    selectedYear,
    selectedMonth
  );
  return dateOnly >= start && dateOnly <= end;
}

/** Sum the signed-in user's manual expense share for the selected dashboard view. */
export function sumMyManualExpenseShareForView(
  expenses: {
    id?: string;
    expense_date: string;
    teles_amount: number | string;
    nicole_amount: number | string;
  }[],
  shareKey: BillShareKey | null,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number,
  snapshotDate: string | null | undefined,
  deductedManualExpenseIds?: ReadonlySet<string>
): number | null {
  if (!shareKey) {
    return null;
  }

  const snapshotDateOnly = parseDateOnly(snapshotDate ?? "");
  if (!snapshotDateOnly) {
    return null;
  }

  return expenses.reduce((sum, expense) => {
    if (
      !expenseDateInViewRange(
        expense.expense_date,
        periodView,
        selectedYear,
        selectedMonth
      )
    ) {
      return sum;
    }

    const expenseDateOnly = parseDateOnly(expense.expense_date);
    if (!expenseDateOnly || expenseDateOnly <= snapshotDateOnly) {
      return sum;
    }

    if (
      expense.id &&
      deductedManualExpenseIds?.has(expense.id)
    ) {
      return sum;
    }

    const amount = getMyExpenseShareAmount(expense, shareKey);
    return amount === null ? sum : sum + amount;
  }, 0);
}

/** Day 1–14 → 1_14; day 15+ → 15_eom. */
export function getExpensePeriodBucket(expenseDate: string): ExpensePeriodBucket {
  const dateOnly = parseDateOnly(expenseDate);
  if (!dateOnly) {
    const today = new Date();
    const day = today.getDate();
    return day <= 14 ? "1_14" : "15_eom";
  }

  const day = Number(dateOnly.slice(8, 10));
  return day <= 14 ? "1_14" : "15_eom";
}

export function formatExpensePeriodBucket(bucket: ExpensePeriodBucket): string {
  return bucket === "1_14" ? "1st–14th" : "15th–end of month";
}

function splitEqual(total: number): ExpenseSplitAmounts {
  const telesAmount = roundCents(total * 0.5);
  const nicoleAmount = roundCents(total - telesAmount);
  return { telesAmount, nicoleAmount };
}

function split5149Amounts(total: number): ExpenseSplitAmounts {
  const { teles, nicole } = split5149(total);
  return { telesAmount: teles, nicoleAmount: nicole };
}

export function validateCustomExpenseSplit(
  totalAmount: number,
  telesAmount: number,
  nicoleAmount: number
): string | null {
  if (telesAmount < 0 || nicoleAmount < 0) {
    return "Split amounts cannot be negative.";
  }

  const sum = roundCents(telesAmount + nicoleAmount);
  const total = roundCents(totalAmount);
  if (sum !== total) {
    return `Teles and Nicole amounts must sum to ${total.toFixed(2)}.`;
  }

  return null;
}

export function calculateExpenseSplit(
  amount: number,
  splitType: ManualExpenseSplitType,
  options?: {
    person?: { name: string } | null;
    customTelesAmount?: number;
    customNicoleAmount?: number;
  }
): ExpenseSplitResult {
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      amounts: { telesAmount: 0, nicoleAmount: 0 },
      error: "Amount must be a non-negative number.",
    };
  }

  const total = roundCents(amount);

  if (splitType === "equal") {
    return { amounts: splitEqual(total), error: null };
  }

  if (splitType === "51_49") {
    return { amounts: split5149Amounts(total), error: null };
  }

  if (splitType === "custom") {
    const telesAmount = options?.customTelesAmount;
    const nicoleAmount = options?.customNicoleAmount;

    if (telesAmount === undefined || nicoleAmount === undefined) {
      return {
        amounts: { telesAmount: 0, nicoleAmount: 0 },
        error: "Enter Teles and Nicole amounts for a custom split.",
      };
    }

    const validationError = validateCustomExpenseSplit(
      total,
      telesAmount,
      nicoleAmount
    );
    if (validationError) {
      return {
        amounts: { telesAmount: 0, nicoleAmount: 0 },
        error: validationError,
      };
    }

    return {
      amounts: {
        telesAmount: roundCents(telesAmount),
        nicoleAmount: roundCents(nicoleAmount),
      },
      error: null,
    };
  }

  const shareKey = resolveBillShareKeyForPerson(options?.person ?? null);
  if (!shareKey) {
    return {
      amounts: { telesAmount: 0, nicoleAmount: 0 },
      error: "Choose a budget profile in Settings before recording a personal expense.",
    };
  }

  if (shareKey === "teles_amount") {
    return {
      amounts: { telesAmount: total, nicoleAmount: 0 },
      error: null,
    };
  }

  return {
    amounts: { telesAmount: 0, nicoleAmount: total },
    error: null,
  };
}

export async function getManualExpenses(householdId: string): Promise<{
  expenses: ManualExpense[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("manual_expenses")
    .select("*")
    .eq("household_id", householdId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { expenses: [], error: error.message };
  }

  return { expenses: (data as ManualExpense[]) ?? [], error: null };
}

export async function createManualExpense(input: InsertManualExpense): Promise<{
  expense: ManualExpense | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("manual_expenses")
    .insert(input)
    .select()
    .single();

  if (error) {
    return { expense: null, error: error.message };
  }

  return { expense: data as ManualExpense, error: null };
}

export async function updateManualExpense(
  id: string,
  input: UpdateManualExpense
): Promise<{ expense: ManualExpense | null; error: string | null }> {
  const { data, error } = await supabase
    .from("manual_expenses")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { expense: null, error: error.message };
  }

  return { expense: data as ManualExpense, error: null };
}

export async function deleteManualExpense(id: string): Promise<{
  error: string | null;
}> {
  const { error } = await supabase.from("manual_expenses").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function markManualExpensePaid(id: string): Promise<{
  expense: ManualExpense | null;
  error: string | null;
}> {
  return updateManualExpense(id, {
    is_paid: true,
    paid_at: new Date().toISOString(),
  });
}

export function expenseScopeLabel(scope: ManualExpenseScope): string {
  return scope === "private" ? "Private" : "Shared";
}

export function expenseSplitTypeLabel(splitType: ManualExpenseSplitType): string {
  switch (splitType) {
    case "personal":
      return "Personal";
    case "equal":
      return "Equal (50/50)";
    case "51_49":
      return "51/49";
    case "custom":
      return "Custom";
  }
}
