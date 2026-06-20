import { getMyExpenseShareAmount } from "@/lib/expenses";
import type { BillShareKey } from "@/lib/bill-share";
import { supabase } from "@/lib/supabase";
import type {
  CashAdjustmentTransaction,
  CashSnapshot,
  ManualExpense,
  ManualExpenseAdjustmentDirection,
} from "@/lib/types";

export const DUPLICATE_CASH_ADJUSTMENT_MESSAGE =
  "This adjustment has already been credited to your current amount.";

export const NO_CASH_SNAPSHOT_CREDIT_MESSAGE =
  "Add a current available amount in Settings before crediting cash.";

export const CASH_CREDIT_UX_NOTE =
  "Planning adjustment already affects safe-to-spend. Cash credit also updates your current amount.";

export function isDecreaseManualExpenseAdjustment(
  expense: {
    adjusts_manual_expense_id?: string | null;
    adjustment_direction?: ManualExpenseAdjustmentDirection | null;
  }
): boolean {
  return (
    expense.adjusts_manual_expense_id != null &&
    expense.adjustment_direction === "decrease"
  );
}

export function isManualExpenseAdjustmentEligibleForCashCredit(
  expense: {
    adjusts_manual_expense_id?: string | null;
    adjustment_direction?: ManualExpenseAdjustmentDirection | null;
  }
): boolean {
  return isDecreaseManualExpenseAdjustment(expense);
}

export function getManualExpenseAdjustmentCashCreditAmount(
  expense: { teles_amount: number | string; nicole_amount: number | string },
  shareKey: BillShareKey | null
): number | null {
  const shareAmount = getMyExpenseShareAmount(expense, shareKey);
  if (shareAmount === null) {
    return null;
  }

  if (shareAmount <= 0) {
    return null;
  }

  return shareAmount;
}

export function validateCashCreditAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Enter a valid credit amount greater than zero.";
  }

  return null;
}

export function getCreditedManualExpenseAdjustmentSourceIds(
  transactions: Pick<CashAdjustmentTransaction, "source_type" | "source_id">[]
): Set<string> {
  const ids = new Set<string>();
  for (const tx of transactions) {
    if (tx.source_type === "manual_expense_adjustment") {
      ids.add(tx.source_id);
    }
  }
  return ids;
}

export function isDuplicateCashAdjustmentCreditError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof (error as { message: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";

  return message.includes("DUPLICATE_CASH_ADJUSTMENT");
}

function mapRpcError(message: string): string {
  if (message.includes("DUPLICATE_CASH_ADJUSTMENT")) {
    return DUPLICATE_CASH_ADJUSTMENT_MESSAGE;
  }

  if (message.includes("NO_CASH_SNAPSHOT")) {
    return NO_CASH_SNAPSHOT_CREDIT_MESSAGE;
  }

  if (message.includes("Invalid credit amount")) {
    return "Enter a valid credit amount greater than zero.";
  }

  if (message.includes("NOT_DECREASE_ADJUSTMENT")) {
    return "Only decrease adjustments can be credited to your current amount.";
  }

  if (message.includes("NOT_ADJUSTMENT")) {
    return "Only manual expense adjustments can be credited to cash.";
  }

  return message;
}

export async function getMyCashAdjustmentTransactions(
  householdId: string,
  userId: string
): Promise<{ transactions: CashAdjustmentTransaction[]; error: string | null }> {
  const { data, error } = await supabase
    .from("cash_adjustment_transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .order("credited_at", { ascending: false });

  if (error) {
    return { transactions: [], error: error.message };
  }

  return {
    transactions: (data as CashAdjustmentTransaction[]) ?? [],
    error: null,
  };
}

export interface CreditManualExpenseAdjustmentInput {
  householdId: string;
  userId: string;
  adjustmentManualExpenseId: string;
  amount: number;
  notes?: string;
}

export interface CreditManualExpenseAdjustmentResult {
  cashAdjustmentTransactionId: string;
  newCashSnapshotId: string;
  newAmount: number;
  previousAmount: number;
  snapshot: CashSnapshot | null;
  transaction: CashAdjustmentTransaction | null;
}

export async function creditManualExpenseAdjustmentToCurrentCash(
  input: CreditManualExpenseAdjustmentInput
): Promise<{
  result: CreditManualExpenseAdjustmentResult | null;
  error: string | null;
}> {
  const validationError = validateCashCreditAmount(input.amount);
  if (validationError) {
    return { result: null, error: validationError };
  }

  const parsedAmount = Math.round(input.amount * 100) / 100;

  const { data, error } = await supabase.rpc(
    "credit_manual_expense_adjustment_to_current_cash",
    {
      p_adjustment_manual_expense_id: input.adjustmentManualExpenseId,
      p_amount: parsedAmount,
      p_notes: input.notes ?? null,
    }
  );

  if (error) {
    if (isDuplicateCashAdjustmentCreditError(error)) {
      return { result: null, error: DUPLICATE_CASH_ADJUSTMENT_MESSAGE };
    }

    return { result: null, error: mapRpcError(error.message) };
  }

  const payload = data as {
    cash_adjustment_transaction_id: string;
    new_cash_snapshot_id: string;
    new_amount: number;
    previous_amount: number;
  };

  const [snapshotRes, transactionRes] = await Promise.all([
    supabase
      .from("cash_snapshots")
      .select("*")
      .eq("id", payload.new_cash_snapshot_id)
      .maybeSingle(),
    supabase
      .from("cash_adjustment_transactions")
      .select("*")
      .eq("id", payload.cash_adjustment_transaction_id)
      .maybeSingle(),
  ]);

  return {
    result: {
      cashAdjustmentTransactionId: payload.cash_adjustment_transaction_id,
      newCashSnapshotId: payload.new_cash_snapshot_id,
      newAmount: Number(payload.new_amount),
      previousAmount: Number(payload.previous_amount),
      snapshot: (snapshotRes.data as CashSnapshot | null) ?? null,
      transaction:
        (transactionRes.data as CashAdjustmentTransaction | null) ?? null,
    },
    error: null,
  };
}

export function canShowCashCreditActionForAdjustment(
  expense: ManualExpense,
  creditedAdjustmentIds: ReadonlySet<string>
): boolean {
  if (!isManualExpenseAdjustmentEligibleForCashCredit(expense)) {
    return false;
  }

  return !creditedAdjustmentIds.has(expense.id);
}

export function isAdjustmentAlreadyCredited(
  adjustmentId: string,
  creditedAdjustmentIds: ReadonlySet<string>
): boolean {
  return creditedAdjustmentIds.has(adjustmentId);
}
