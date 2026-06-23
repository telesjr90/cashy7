import { supabase } from "@/lib/supabase";
import type {
  BillInstance,
  CashSnapshot,
  DebtPayment,
  HouseholdSettings,
  ManualExpense,
  SavingsContribution,
} from "@/lib/types";
import { getManualExpenses } from "@/lib/expenses";
import { getMySavingsContributions } from "@/lib/savings";

export async function getHouseholdSettings(householdId: string): Promise<{
  settings: HouseholdSettings | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("household_settings")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    return { settings: null, error: error.message };
  }

  return { settings: (data as HouseholdSettings | null) ?? null, error: null };
}

export async function upsertHouseholdCashflowStartDate(
  householdId: string,
  cashflowStartDate: string
): Promise<{ settings: HouseholdSettings | null; error: string | null }> {
  const { data, error } = await supabase
    .from("household_settings")
    .upsert(
      {
        household_id: householdId,
        cashflow_start_date: cashflowStartDate,
      },
      { onConflict: "household_id" }
    )
    .select()
    .single();

  if (error) {
    return { settings: null, error: error.message };
  }

  return { settings: data as HouseholdSettings, error: null };
}

export async function loadCashflowStartImpactPreviewData(
  householdId: string,
  userId: string
): Promise<{
  data: {
    billInstances: BillInstance[];
    manualExpenses: ManualExpense[];
    debtPayments: DebtPayment[];
    savingsContributions: SavingsContribution[];
  } | null;
  error: string | null;
}> {
  const [
    billInstancesResult,
    expensesResult,
    debtPaymentsResult,
    contributionsResult,
  ] = await Promise.all([
    supabase
      .from("bill_instances")
      .select("*")
      .eq("household_id", householdId),
    getManualExpenses(householdId),
    supabase.from("debt_payments").select("*").eq("household_id", householdId),
    getMySavingsContributions(householdId, userId),
  ]);

  const errors = [
    billInstancesResult.error?.message,
    expensesResult.error,
    debtPaymentsResult.error?.message,
    contributionsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return { data: null, error: errors[0] ?? "Failed to load impact preview data." };
  }

  return {
    data: {
      billInstances: (billInstancesResult.data as BillInstance[]) ?? [],
      manualExpenses: expensesResult.expenses,
      debtPayments: (debtPaymentsResult.data as DebtPayment[]) ?? [],
      savingsContributions: contributionsResult.contributions,
    },
    error: null,
  };
}

export async function getMyLatestCashSnapshot(
  householdId: string,
  userId: string
): Promise<{ snapshot: CashSnapshot | null; error: string | null }> {
  const { data, error } = await supabase
    .from("cash_snapshots")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { snapshot: null, error: error.message };
  }

  return { snapshot: (data as CashSnapshot | null) ?? null, error: null };
}

export async function addMyCashSnapshot(
  householdId: string,
  userId: string,
  amount: number,
  snapshotDate: string,
  notes?: string
): Promise<{ snapshot: CashSnapshot | null; error: string | null }> {
  const { data, error } = await supabase
    .from("cash_snapshots")
    .insert({
      household_id: householdId,
      user_id: userId,
      amount,
      snapshot_date: snapshotDate,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return { snapshot: null, error: error.message };
  }

  return { snapshot: data as CashSnapshot, error: null };
}
