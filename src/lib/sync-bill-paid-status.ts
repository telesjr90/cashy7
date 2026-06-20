import { applyDebtPaymentBalanceChange } from "@/lib/format";
import { supabase } from "@/lib/supabase";

export const DEBT_LINKED_BILL_EDIT_MESSAGE =
  "This bill is linked to a debt payment. Edit the amount from the Debt page to keep the debt balance in sync.";

export const DEBT_LINKED_BILL_DELETE_MESSAGE =
  "This bill is linked to a debt payment. Manage or delete it from the Debt page to keep balances in sync.";

export async function fetchDebtLinkedBillInstanceIds(
  billInstanceIds: string[]
): Promise<{ linkedIds: Set<string>; error: string | null }> {
  const { linkedIds, error } = await fetchDebtLinkedBillContext(billInstanceIds);
  return { linkedIds, error };
}

export async function fetchDebtLinkedBillContext(
  billInstanceIds: string[]
): Promise<{
  linkedIds: Set<string>;
  debtPaymentIdByBillId: Map<string, string>;
  error: string | null;
}> {
  if (billInstanceIds.length === 0) {
    return { linkedIds: new Set(), debtPaymentIdByBillId: new Map(), error: null };
  }

  const { data, error } = await supabase
    .from("debt_payments")
    .select("id, linked_bill_instance_id")
    .in("linked_bill_instance_id", billInstanceIds);

  if (error) {
    return {
      linkedIds: new Set(),
      debtPaymentIdByBillId: new Map(),
      error: error.message,
    };
  }

  const linkedIds = new Set<string>();
  const debtPaymentIdByBillId = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.linked_bill_instance_id) {
      linkedIds.add(row.linked_bill_instance_id);
      debtPaymentIdByBillId.set(row.linked_bill_instance_id, row.id);
    }
  }

  return { linkedIds, debtPaymentIdByBillId, error: null };
}

export async function syncBillPaidStatusWithDebt(
  billInstanceId: string,
  oldPaidStatus: boolean,
  newPaidStatus: boolean
): Promise<{ error: string | null }> {
  if (oldPaidStatus === newPaidStatus) {
    return { error: null };
  }

  const { error: billError } = await supabase
    .from("bill_instances")
    .update({ is_paid: newPaidStatus })
    .eq("id", billInstanceId);

  if (billError) {
    return { error: billError.message };
  }

  const { data: payment, error: paymentFetchError } = await supabase
    .from("debt_payments")
    .select("id, debt_account_id, total_payment, paid_status")
    .eq("linked_bill_instance_id", billInstanceId)
    .maybeSingle();

  if (paymentFetchError) {
    return { error: paymentFetchError.message };
  }

  if (!payment) {
    return { error: null };
  }

  if (payment.paid_status === newPaidStatus) {
    return { error: null };
  }

  const { error: paymentUpdateError } = await supabase
    .from("debt_payments")
    .update({ paid_status: newPaidStatus })
    .eq("id", payment.id);

  if (paymentUpdateError) {
    return { error: paymentUpdateError.message };
  }

  const { data: account, error: accountFetchError } = await supabase
    .from("debt_accounts")
    .select("current_balance")
    .eq("id", payment.debt_account_id)
    .single();

  if (accountFetchError) {
    return { error: accountFetchError.message };
  }

  const direction = newPaidStatus ? "pay" : "unpay";
  const newBalance = applyDebtPaymentBalanceChange(
    Number(account.current_balance),
    Number(payment.total_payment),
    direction
  );

  const { error: balanceError } = await supabase
    .from("debt_accounts")
    .update({ current_balance: newBalance })
    .eq("id", payment.debt_account_id);

  if (balanceError) {
    return { error: balanceError.message };
  }

  return { error: null };
}
