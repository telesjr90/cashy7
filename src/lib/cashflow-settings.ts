import { supabase } from "@/lib/supabase";
import type { CashSnapshot, HouseholdSettings } from "@/lib/types";

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
