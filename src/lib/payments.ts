import { formatDeductionAmount } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type {
  BillInstance,
  CashPaymentTransaction,
  CashSnapshot,
  DebtAccount,
  DebtPayment,
  ManualExpense,
  PaymentSourceType,
} from "@/lib/types";

export type DebtPaymentWithAccountName = Pick<DebtPayment, "id"> & {
  debt_accounts: Pick<DebtAccount, "name"> | null;
};

function normalizeDebtPaymentWithAccountName(row: {
  id: string;
  debt_accounts: Pick<DebtAccount, "name"> | Pick<DebtAccount, "name">[] | null;
}): DebtPaymentWithAccountName {
  const debtAccount = Array.isArray(row.debt_accounts)
    ? (row.debt_accounts[0] ?? null)
    : row.debt_accounts;

  return {
    id: row.id,
    debt_accounts: debtAccount,
  };
}

export const DUPLICATE_PAYMENT_MESSAGE =
  "This item has already been deducted from your current amount.";

export const PAYMENT_UX_EXPLANATION =
  "Mark paid only updates status. Pay & deduct cash also subtracts your share from your current amount.";

export type CashDeductionStatus =
  | "unpaid"
  | "marked_paid_only"
  | "deducted_from_cash";

export function getCashDeductionStatus({
  isMarkedPaid,
  hasPaymentTransaction,
}: {
  isMarkedPaid: boolean;
  hasPaymentTransaction: boolean;
}): CashDeductionStatus {
  if (hasPaymentTransaction) {
    return "deducted_from_cash";
  }

  if (isMarkedPaid) {
    return "marked_paid_only";
  }

  return "unpaid";
}

export function cashDeductionStatusLabel(status: CashDeductionStatus): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "marked_paid_only":
      return "Marked paid — cash not deducted";
    case "deducted_from_cash":
      return "Deducted from cash";
  }
}

/** Whether the signed-in user has a cash deduction for this bill (direct or via linked debt payment). */
export function hasCashDeductionForBill(
  billId: string,
  {
    billPaymentSourceIds,
    debtPaymentIdByBillId,
    debtPaymentTransactionSourceIds,
  }: {
    billPaymentSourceIds: ReadonlySet<string> | ReadonlyMap<string, unknown>;
    debtPaymentIdByBillId: ReadonlyMap<string, string>;
    debtPaymentTransactionSourceIds: ReadonlySet<string> | ReadonlyMap<string, unknown>;
  }
): boolean {
  if (billPaymentSourceIds.has(billId)) {
    return true;
  }

  const linkedDebtPaymentId = debtPaymentIdByBillId.get(billId);
  return (
    linkedDebtPaymentId !== undefined &&
    debtPaymentTransactionSourceIds.has(linkedDebtPaymentId)
  );
}

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

export const DEFAULT_CASH_PAYMENT_DEDUCTION_HISTORY_LIMIT = 10;

export const BILL_PAYMENT_DEDUCTION_FALLBACK_LABEL = "Bill payment";
export const DEBT_PAYMENT_DEDUCTION_FALLBACK_LABEL = "Debt payment";
export const MANUAL_EXPENSE_PAYMENT_DEDUCTION_FALLBACK_LABEL = "Manual expense";
export const PAYMENT_DEDUCTION_FALLBACK_LABEL = "Payment deduction";

export function cashPaymentSourceTypeLabel(sourceType: PaymentSourceType): string {
  switch (sourceType) {
    case "bill_instance":
      return "Bill";
    case "debt_payment":
      return "Debt payment";
    case "manual_expense":
      return "Manual expense";
  }
}

export function getPaymentDeductionFallbackLabel(
  sourceType: PaymentSourceType
): string {
  switch (sourceType) {
    case "bill_instance":
      return BILL_PAYMENT_DEDUCTION_FALLBACK_LABEL;
    case "debt_payment":
      return DEBT_PAYMENT_DEDUCTION_FALLBACK_LABEL;
    case "manual_expense":
      return MANUAL_EXPENSE_PAYMENT_DEDUCTION_FALLBACK_LABEL;
  }
}

export function buildBillInstanceNameLookup(
  billInstances: ReadonlyArray<Pick<BillInstance, "id" | "name">>
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const instance of billInstances) {
    const name = instance.name.trim();
    if (name) {
      map.set(instance.id, name);
    }
  }
  return map;
}

export function buildManualExpenseDescriptionLookup(
  expenses: ReadonlyArray<Pick<ManualExpense, "id" | "description">>
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const expense of expenses) {
    const description = expense.description.trim();
    if (description) {
      map.set(expense.id, description);
    }
  }
  return map;
}

export function buildDebtPaymentDescriptionLookup(
  debtPayments: ReadonlyArray<DebtPaymentWithAccountName>
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const payment of debtPayments) {
    const name = payment.debt_accounts?.name.trim();
    if (name) {
      map.set(payment.id, name);
    }
  }
  return map;
}

export function getLinkedPaymentSourceDescription(
  sourceType: PaymentSourceType,
  sourceId: string,
  lookups: {
    billInstanceNameById: ReadonlyMap<string, string>;
    debtPaymentDescriptionById: ReadonlyMap<string, string>;
    manualExpenseDescriptionById: ReadonlyMap<string, string>;
  }
): string {
  switch (sourceType) {
    case "bill_instance":
      return (
        lookups.billInstanceNameById.get(sourceId) ??
        BILL_PAYMENT_DEDUCTION_FALLBACK_LABEL
      );
    case "debt_payment":
      return (
        lookups.debtPaymentDescriptionById.get(sourceId) ??
        DEBT_PAYMENT_DEDUCTION_FALLBACK_LABEL
      );
    case "manual_expense":
      return (
        lookups.manualExpenseDescriptionById.get(sourceId) ??
        MANUAL_EXPENSE_PAYMENT_DEDUCTION_FALLBACK_LABEL
      );
  }
}

export interface CashPaymentDeductionDisplayRow {
  id: string;
  paidAt: string;
  formattedAmount: string;
  sourceTypeLabel: string;
  sourceDescription: string;
  notes: string | null;
}

export function mapCashPaymentDeductionsForDisplay(
  transactions: CashPaymentTransaction[],
  lookups: {
    billInstanceNameById: ReadonlyMap<string, string>;
    debtPaymentDescriptionById: ReadonlyMap<string, string>;
    manualExpenseDescriptionById: ReadonlyMap<string, string>;
  },
  options?: { limit?: number }
): CashPaymentDeductionDisplayRow[] {
  const limit = options?.limit ?? transactions.length;
  const rows: CashPaymentDeductionDisplayRow[] = [];

  for (const transaction of transactions) {
    if (rows.length >= limit) {
      break;
    }

    rows.push({
      id: transaction.id,
      paidAt: transaction.paid_at,
      formattedAmount: formatDeductionAmount(Number(transaction.amount)),
      sourceTypeLabel: cashPaymentSourceTypeLabel(transaction.source_type),
      sourceDescription: getLinkedPaymentSourceDescription(
        transaction.source_type,
        transaction.source_id,
        lookups
      ),
      notes: transaction.notes,
    });
  }

  return rows;
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
  userId: string,
  limit?: number
): Promise<{ transactions: CashPaymentTransaction[]; error: string | null }> {
  let query = supabase
    .from("cash_payment_transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .order("paid_at", { ascending: false });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    return { transactions: [], error: error.message };
  }

  return { transactions: (data as CashPaymentTransaction[]) ?? [], error: null };
}

export async function getBillInstancesByIds(
  householdId: string,
  ids: string[]
): Promise<{ billInstances: BillInstance[]; error: string | null }> {
  if (ids.length === 0) {
    return { billInstances: [], error: null };
  }

  const { data, error } = await supabase
    .from("bill_instances")
    .select("*")
    .eq("household_id", householdId)
    .in("id", ids);

  if (error) {
    return { billInstances: [], error: error.message };
  }

  return { billInstances: (data as BillInstance[]) ?? [], error: null };
}

export async function getDebtPaymentsByIds(
  householdId: string,
  ids: string[]
): Promise<{ debtPayments: DebtPaymentWithAccountName[]; error: string | null }> {
  if (ids.length === 0) {
    return { debtPayments: [], error: null };
  }

  const { data, error } = await supabase
    .from("debt_payments")
    .select("id, debt_accounts(name)")
    .eq("household_id", householdId)
    .in("id", ids);

  if (error) {
    return { debtPayments: [], error: error.message };
  }

  const debtPayments = (data ?? []).map((row) =>
    normalizeDebtPaymentWithAccountName(
      row as {
        id: string;
        debt_accounts: Pick<DebtAccount, "name"> | Pick<DebtAccount, "name">[] | null;
      }
    )
  );

  return { debtPayments, error: null };
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
