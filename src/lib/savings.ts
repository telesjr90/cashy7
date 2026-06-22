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

function parseDateOnly(dateValue: string | null | undefined): string | null {
  if (!dateValue) {
    return null;
  }

  const match = dateValue.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function parseContributionDateOnly(
  contributionDate: string | null | undefined
): string | null {
  return parseDateOnly(contributionDate);
}

/** ISO date range for the Dashboard's selected month and period view. */
export function getDashboardViewDateRange(
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): { start: string; end: string } {
  const monthStr = String(selectedMonth).padStart(2, "0");
  const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
  const endDayStr = String(lastDay).padStart(2, "0");

  if (periodView === "1_14") {
    return {
      start: `${selectedYear}-${monthStr}-01`,
      end: `${selectedYear}-${monthStr}-14`,
    };
  }

  if (periodView === "15_eom") {
    return {
      start: `${selectedYear}-${monthStr}-15`,
      end: `${selectedYear}-${monthStr}-${endDayStr}`,
    };
  }

  return {
    start: `${selectedYear}-${monthStr}-01`,
    end: `${selectedYear}-${monthStr}-${endDayStr}`,
  };
}

function contributionDateInViewRange(
  contributionDate: string | null | undefined,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): boolean {
  const dateOnly = parseContributionDateOnly(contributionDate);
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

function participantAppliesToViewDateRange(
  participant: SavingsGoalParticipant,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): boolean {
  const { start: viewStart, end: viewEnd } = getDashboardViewDateRange(
    periodView,
    selectedYear,
    selectedMonth
  );

  const periodStart = parseDateOnly(participant.period_start);
  const periodEnd = parseDateOnly(participant.period_end);

  if (!periodStart && !periodEnd) {
    return true;
  }

  if (periodStart && !periodEnd) {
    return viewEnd >= periodStart;
  }

  if (!periodStart && periodEnd) {
    return viewStart <= periodEnd;
  }

  if (periodStart && periodEnd) {
    return viewStart <= periodEnd && viewEnd >= periodStart;
  }

  return true;
}

/** Sum the signed-in user's savings target for the selected dashboard period view. */
export function sumMySavingsTargetForView(
  participants: SavingsGoalParticipant[],
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): number {
  return participants.reduce((sum, participant) => {
    if (!participantMatchesView(participant.contribution_period, periodView)) {
      return sum;
    }

    if (
      !participantAppliesToViewDateRange(
        participant,
        periodView,
        selectedYear,
        selectedMonth
      )
    ) {
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
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): number {
  return contributions.reduce((sum, contribution) => {
    const participant = participants.find(
      (row) => row.savings_goal_id === contribution.savings_goal_id
    );
    if (!participant) {
      return sum;
    }

    if (!participantMatchesView(participant.contribution_period, periodView)) {
      return sum;
    }

    if (
      !participantAppliesToViewDateRange(
        participant,
        periodView,
        selectedYear,
        selectedMonth
      )
    ) {
      return sum;
    }

    if (
      !contributionDateInViewRange(
        contribution.contribution_date,
        periodView,
        selectedYear,
        selectedMonth
      )
    ) {
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

export async function updateSavingsGoal(
  goalId: string,
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
    .update({
      name: input.name,
      goal_type: input.goalType,
      target_amount: input.targetAmount,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .eq("id", goalId)
    .select()
    .single();

  if (error) {
    return { goal: null, error: error.message };
  }

  return { goal: data as SavingsGoal, error: null };
}

export async function deleteSavingsGoal(
  goalId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("savings_goals").delete().eq("id", goalId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function updateMySavingsContribution(
  householdId: string,
  userId: string,
  contributionId: string,
  input: {
    amount: number;
    contributionDate: string;
    notes?: string | null;
  }
): Promise<{ contribution: SavingsContribution | null; error: string | null }> {
  const { data, error } = await supabase
    .from("savings_contributions")
    .update({
      amount: input.amount,
      contribution_date: input.contributionDate,
      notes: input.notes ?? null,
    })
    .eq("id", contributionId)
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    return { contribution: null, error: error.message };
  }

  return { contribution: data as SavingsContribution, error: null };
}

export async function deleteMySavingsContribution(
  householdId: string,
  userId: string,
  contributionId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("savings_contributions")
    .delete()
    .eq("id", contributionId)
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function deleteMySavingsGoalParticipant(
  householdId: string,
  userId: string,
  participantId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("savings_goal_participants")
    .delete()
    .eq("id", participantId)
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
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
  savingsGoalId: string,
  userId: string
): SavingsContribution[] {
  return contributions.filter(
    (contribution) =>
      contribution.savings_goal_id === savingsGoalId &&
      contribution.user_id === userId
  );
}

export function sumMyContributionsForGoal(
  contributions: SavingsContribution[],
  savingsGoalId: string,
  userId: string
): number {
  return filterMyContributionsForGoal(contributions, savingsGoalId, userId).reduce(
    (total, contribution) => total + Number(contribution.amount),
    0
  );
}

function contributionPeriodToView(
  contributionPeriod: SavingsGoalParticipant["contribution_period"]
): PeriodView {
  if (contributionPeriod === "monthly") {
    return "full";
  }
  return contributionPeriod;
}

/** Month used for Settings target-period summaries: period_start month, else reference month. */
export function getParticipantSummaryMonth(
  participant: SavingsGoalParticipant,
  referenceDate: Date = new Date()
): { year: number; month: number } {
  const periodStart = parseDateOnly(participant.period_start);
  if (periodStart) {
    const [yearStr, monthStr] = periodStart.split("-");
    return { year: Number(yearStr), month: Number(monthStr) };
  }

  return {
    year: referenceDate.getFullYear(),
    month: referenceDate.getMonth() + 1,
  };
}

function formatSummaryMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

/** One-line hint explaining which month the Settings scoped summary uses. */
export function getParticipantSummaryMonthHint(
  participant: SavingsGoalParticipant,
  referenceDate: Date = new Date()
): string {
  const { year, month } = getParticipantSummaryMonth(participant, referenceDate);
  const monthLabel = formatSummaryMonthLabel(year, month);

  if (parseDateOnly(participant.period_start)) {
    return `Based on ${monthLabel} from your target period start.`;
  }

  return `Based on ${monthLabel} because no target period start is set.`;
}

export interface MySavingsGoalTargetPeriodSummary {
  contributionPeriod: SavingsGoalParticipant["contribution_period"];
  periodView: PeriodView;
  targetAmount: number;
  contributedAmount: number;
  remainingObligation: number;
  periodStart: string | null;
  periodEnd: string | null;
  summaryYear: number;
  summaryMonth: number;
  viewDateRange: { start: string; end: string };
}

/**
 * Scoped contribution summary for one participant row in Settings.
 * Uses the month of period_start when set, otherwise the reference month (default: today).
 * Applies the same view, date-range, and contribution-date rules as the Dashboard.
 */
export function getMySavingsGoalTargetPeriodSummary(
  participant: SavingsGoalParticipant,
  contributions: SavingsContribution[],
  referenceDate: Date = new Date()
): MySavingsGoalTargetPeriodSummary {
  const { year, month } = getParticipantSummaryMonth(participant, referenceDate);
  const periodView = contributionPeriodToView(participant.contribution_period);
  const participants = [participant];
  const goalContributions = filterMyContributionsForGoal(
    contributions,
    participant.savings_goal_id,
    participant.user_id
  );

  const targetAmount = sumMySavingsTargetForView(participants, periodView, year, month);
  const contributedAmount = sumMySavingsContributionsForView(
    goalContributions,
    participants,
    periodView,
    year,
    month
  );

  return {
    contributionPeriod: participant.contribution_period,
    periodView,
    targetAmount,
    contributedAmount,
    remainingObligation: calculateRemainingSavingsObligation(
      targetAmount,
      contributedAmount
    ),
    periodStart: parseDateOnly(participant.period_start),
    periodEnd: parseDateOnly(participant.period_end),
    summaryYear: year,
    summaryMonth: month,
    viewDateRange: getDashboardViewDateRange(periodView, year, month),
  };
}
