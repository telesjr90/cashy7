import type { PeriodView } from "@/lib/periods";
import { supabase } from "@/lib/supabase";
import type {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
  SavingsGoalType,
} from "@/lib/types";

function toSafeNumber(value: number | string): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function participantMatchesView(
  contributionPeriod: SavingsGoalParticipant["contribution_period"],
  periodView: PeriodView
): boolean {
  if (periodView === "full") {
    return (
      contributionPeriod === "1_14" ||
      contributionPeriod === "15_eom" ||
      contributionPeriod === "monthly"
    );
  }

  return contributionPeriod === periodView;
}

/** Sum the signed-in user's savings target for the selected dashboard period view. */
export function sumMySavingsTargetForView(
  participants: SavingsGoalParticipant[],
  periodView: PeriodView
): number {
  return participants.reduce((sum, participant) => {
    if (!participantMatchesView(participant.contribution_period, periodView)) {
      return sum;
    }

    const amount = toSafeNumber(participant.target_contribution_amount);
    return amount === null ? sum : sum + amount;
  }, 0);
}

/** Sum the signed-in user's savings contributions for the selected dashboard period view. */
export function sumMySavingsContributionsForView(
  contributions: SavingsContribution[],
  participants: SavingsGoalParticipant[],
  periodView: PeriodView
): number {
  const matchingGoalIds = new Set(
    participants
      .filter((participant) =>
        participantMatchesView(participant.contribution_period, periodView)
      )
      .map((participant) => participant.savings_goal_id)
  );

  return contributions.reduce((sum, contribution) => {
    if (!matchingGoalIds.has(contribution.savings_goal_id)) {
      return sum;
    }

    const amount = toSafeNumber(contribution.amount);
    return amount === null ? sum : sum + amount;
  }, 0);
}

export function calculateRemainingSavingsObligation(
  targetAmount: number | string,
  contributedAmount: number | string
): number {
  const target = toSafeNumber(targetAmount) ?? 0;
  const contributed = toSafeNumber(contributedAmount) ?? 0;
  return Math.max(0, target - contributed);
}

export function calculateSafeToSpendAfterSavings(
  beforeSavings: number,
  remainingSavingsObligation: number
): number {
  return beforeSavings - remainingSavingsObligation;
}

export async function getSavingsGoals(householdId: string): Promise<{
  goals: SavingsGoal[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) {
    return { goals: [], error: error.message };
  }

  return { goals: (data as SavingsGoal[]) ?? [], error: null };
}

export async function createSavingsGoal(
  householdId: string,
  userId: string,
  input: {
    name: string;
    goalType: SavingsGoalType;
    targetAmount: number;
    startDate: string;
    endDate: string;
  }
): Promise<{ goal: SavingsGoal | null; error: string | null }> {
  const { data, error } = await supabase
    .from("savings_goals")
    .insert({
      household_id: householdId,
      created_by_user_id: userId,
      name: input.name,
      goal_type: input.goalType,
      target_amount: input.targetAmount,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .select()
    .single();

  if (error) {
    return { goal: null, error: error.message };
  }

  return { goal: data as SavingsGoal, error: null };
}

export async function getMySavingsGoalParticipants(
  householdId: string,
  userId: string
): Promise<{ participants: SavingsGoalParticipant[]; error: string | null }> {
  const { data, error } = await supabase
    .from("savings_goal_participants")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return { participants: [], error: error.message };
  }

  return { participants: (data as SavingsGoalParticipant[]) ?? [], error: null };
}

export async function addMySavingsContribution(
  householdId: string,
  userId: string,
  input: {
    savingsGoalId: string;
    amount: number;
    contributionDate?: string;
    personId?: string | null;
    notes?: string | null;
  }
): Promise<{ contribution: SavingsContribution | null; error: string | null }> {
  const { data, error } = await supabase
    .from("savings_contributions")
    .insert({
      household_id: householdId,
      user_id: userId,
      savings_goal_id: input.savingsGoalId,
      amount: input.amount,
      contribution_date: input.contributionDate,
      person_id: input.personId ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return { contribution: null, error: error.message };
  }

  return { contribution: data as SavingsContribution, error: null };
}

export async function getMySavingsContributions(
  householdId: string,
  userId: string
): Promise<{ contributions: SavingsContribution[]; error: string | null }> {
  const { data, error } = await supabase
    .from("savings_contributions")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .order("contribution_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { contributions: [], error: error.message };
  }

  return {
    contributions: (data as SavingsContribution[]) ?? [],
    error: null,
  };
}

export async function upsertMySavingsGoalParticipant(
  householdId: string,
  userId: string,
  input: {
    savingsGoalId: string;
    targetContributionAmount: number;
    contributionPeriod: SavingsGoalParticipant["contribution_period"];
    personId?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
  }
): Promise<{ participant: SavingsGoalParticipant | null; error: string | null }> {
  const { data, error } = await supabase
    .from("savings_goal_participants")
    .upsert(
      {
        savings_goal_id: input.savingsGoalId,
        household_id: householdId,
        user_id: userId,
        person_id: input.personId ?? null,
        target_contribution_amount: input.targetContributionAmount,
        contribution_period: input.contributionPeriod,
        period_start: input.periodStart ?? null,
        period_end: input.periodEnd ?? null,
      },
      { onConflict: "savings_goal_id,user_id" }
    )
    .select()
    .single();

  if (error) {
    return { participant: null, error: error.message };
  }

  return { participant: data as SavingsGoalParticipant, error: null };
}

export function filterMyContributionsForGoal(
  contributions: SavingsContribution[],
  savingsGoalId: string
): SavingsContribution[] {
  return contributions.filter(
    (contribution) => contribution.savings_goal_id === savingsGoalId
  );
}

export function sumMyContributionsForGoal(
  contributions: SavingsContribution[],
  savingsGoalId: string
): number {
  return filterMyContributionsForGoal(contributions, savingsGoalId).reduce(
    (total, contribution) => total + Number(contribution.amount),
    0
  );
}
