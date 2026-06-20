import { applyDebtPaymentBalanceChange } from "@/lib/format";
import { supabase } from "@/lib/supabase";

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
