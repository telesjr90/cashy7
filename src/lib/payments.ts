import { supabase } from "@/lib/supabase";
import type {
  CashPaymentTransaction,
  CashSnapshot,
  PaymentSourceType,
} from "@/lib/types";

export const DUPLICATE_PAYMENT_MESSAGE =
  "This item has already been deducted from your current amount.";

export const NO_CASH_SNAPSHOT_MESSAGE =
  "Add a current available amount in Settings before paying from cash.";

export function calculateCashAfterPayment(
  currentAmount: number,
  paymentAmount: number
): number | null {
  if (!Number.isFinite(currentAmount) || !Number.isFinite(paymentAmount)) {
    return null;
  }

  if (paymentAmount < 0) {
    return null;
  }

  return Math.round((currentAmount - paymentAmount) * 100) / 100;
}

export function parsePaymentAmount(value: number | string): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }

  return Math.round(num * 100) / 100;
}

export function paymentSourceLabel(sourceType: PaymentSourceType): string {
  switch (sourceType) {
    case "bill_instance":
      return "bill";
    case "debt_payment":
      return "debt payment";
    case "manual_expense":
      return "expense";
  }
}

/** Manual expense IDs already deducted from the signed-in user's current cash. */
export function getPaidManualExpenseSourceIds(
  paymentTransactions: Pick<CashPaymentTransaction, "source_type" | "source_id">[]
): Set<string> {
  const ids = new Set<string>();
  for (const tx of paymentTransactions) {
    if (tx.source_type === "manual_expense") {
      ids.add(tx.source_id);
    }
  }
  return ids;
}

export function isDuplicatePaymentError(error: unknown): boolean {
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

  return message.includes("DUPLICATE_PAYMENT");
}

function mapRpcError(message: string): string {
  if (message.includes("DUPLICATE_PAYMENT")) {
    return DUPLICATE_PAYMENT_MESSAGE;
  }

  if (message.includes("NO_CASH_SNAPSHOT")) {
    return NO_CASH_SNAPSHOT_MESSAGE;
  }

  if (message.includes("Invalid payment amount")) {
    return "Enter a valid non-negative payment amount.";
  }

  return message;
}

export async function getMyCashPaymentTransactions(
  householdId: string,
  userId: string
): Promise<{ transactions: CashPaymentTransaction[]; error: string | null }> {
  const { data, error } = await supabase
    .from("cash_payment_transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .order("paid_at", { ascending: false });

  if (error) {
    return { transactions: [], error: error.message };
  }

  return { transactions: (data as CashPaymentTransaction[]) ?? [], error: null };
}

export async function getMyCashPaymentTransactionForSource(
  householdId: string,
  userId: string,
  sourceType: PaymentSourceType,
  sourceId: string
): Promise<{ transaction: CashPaymentTransaction | null; error: string | null }> {
  const { data, error } = await supabase
    .from("cash_payment_transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    return { transaction: null, error: error.message };
  }

  return {
    transaction: (data as CashPaymentTransaction | null) ?? null,
    error: null,
  };
}

export interface PaySourceFromCurrentCashInput {
  householdId: string;
  userId: string;
  personId: string | null;
  sourceType: PaymentSourceType;
  sourceId: string;
  amount: number;
  notes?: string;
}

export interface PaySourceFromCurrentCashResult {
  paymentTransactionId: string;
  newCashSnapshotId: string;
  newAmount: number;
  previousAmount: number;
  snapshot: CashSnapshot | null;
  transaction: CashPaymentTransaction | null;
}

export async function paySourceFromCurrentCash(
  input: PaySourceFromCurrentCashInput
): Promise<{
  result: PaySourceFromCurrentCashResult | null;
  error: string | null;
}> {
  const parsedAmount = parsePaymentAmount(input.amount);
  if (parsedAmount === null) {
    return { result: null, error: "Enter a valid non-negative payment amount." };
  }

  const existing = await getMyCashPaymentTransactionForSource(
    input.householdId,
    input.userId,
    input.sourceType,
    input.sourceId
  );

  if (existing.error) {
    return { result: null, error: existing.error };
  }

  if (existing.transaction) {
    return { result: null, error: DUPLICATE_PAYMENT_MESSAGE };
  }

  const { data, error } = await supabase.rpc("pay_source_from_current_cash", {
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_amount: parsedAmount,
    p_notes: input.notes ?? null,
  });

  if (error) {
    if (isDuplicatePaymentError(error)) {
      return { result: null, error: DUPLICATE_PAYMENT_MESSAGE };
    }

    return { result: null, error: mapRpcError(error.message) };
  }

  const payload = data as {
    payment_transaction_id: string;
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
      .from("cash_payment_transactions")
      .select("*")
      .eq("id", payload.payment_transaction_id)
      .maybeSingle(),
  ]);

  return {
    result: {
      paymentTransactionId: payload.payment_transaction_id,
      newCashSnapshotId: payload.new_cash_snapshot_id,
      newAmount: Number(payload.new_amount),
      previousAmount: Number(payload.previous_amount),
      snapshot: (snapshotRes.data as CashSnapshot | null) ?? null,
      transaction: (transactionRes.data as CashPaymentTransaction | null) ?? null,
    },
    error: null,
  };
}
