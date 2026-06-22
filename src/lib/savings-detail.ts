import { formatCurrency } from "@/lib/format";
import { canUserEditGoal } from "@/lib/savings-edit";
import {
  filterMyContributionsForGoal,
  getMySavingsGoalTargetPeriodSummary,
  getParticipantSummaryMonthHint,
  sumMyContributionsForGoal,
} from "@/lib/savings";
import type {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
  SavingsContributionPeriod,
} from "@/lib/types";
import { format, parseISO } from "date-fns";

export const SAVINGS_DETAIL_SHARED_PRIVACY_COPY =
  "Only your target and contribution details are shown.";
export const SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY =
  "The other user's target and saved amount remain private.";

export const SAVINGS_DETAIL_NO_OWN_TARGET_FALLBACK =
  "You have not set a contribution target for this goal yet.";
export const SAVINGS_DETAIL_NO_CONTRIBUTIONS_FALLBACK =
  "No contributions recorded by you for this goal yet.";

export const SAVINGS_DETAIL_EDIT_GOAL_HINT =
  "Edit goal metadata from the savings section.";
export const SAVINGS_DETAIL_EDIT_GOAL_BLOCKED_HINT =
  "Only the goal creator can edit goal metadata.";
export const SAVINGS_DETAIL_EDIT_TARGET_HINT =
  "Edit your contribution target from the savings section.";
export const SAVINGS_DETAIL_EDIT_CONTRIBUTION_HINT =
  "Edit or delete individual contributions from each contribution row in the savings section.";

const CONTRIBUTION_PERIOD_LABELS: Record<SavingsContributionPeriod, string> = {
  "1_14": "1st–14th of month",
  "15_eom": "15th–end of month",
  monthly: "Monthly",
};

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

function formatPeriodMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function goalTypeLabel(goalType: SavingsGoal["goal_type"]): string {
  return goalType === "private" ? "Private" : "Shared";
}

function resolveOwnerLabel(
  goal: Pick<SavingsGoal, "created_by_user_id">,
  userId: string
): string {
  return goal.created_by_user_id === userId
    ? "Created by you"
    : "Created by another household member";
}

export function calculateOwnProgressPercent(
  targetAmount: number,
  contributedAmount: number
): number | null {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return null;
  }

  const contributed = Number.isFinite(contributedAmount) ? contributedAmount : 0;
  return Math.min(100, Math.round((contributed / targetAmount) * 100));
}

export interface SavingsContributionDetailRow {
  dateLabel: string;
  amountLabel: string;
  notes: string | null;
}

export interface SavingsGoalDetailView {
  title: string;
  subtitle: string;
  goalName: string;
  goalTypeLabel: string;
  householdTargetAmountLabel: string;
  startDateLabel: string;
  endDateLabel: string;
  ownerLabel: string;
  currentPeriodLabel: string | null;
  periodStartLabel: string | null;
  periodEndLabel: string | null;
  contributionPeriodLabel: string | null;
  periodSummaryHint: string | null;
  hasOwnTarget: boolean;
  ownTargetAmountLabel: string | null;
  ownTargetPeriodLabel: string | null;
  ownRemainingObligationLabel: string | null;
  ownProgressPercentLabel: string | null;
  noOwnTargetFallback: string | null;
  contributions: SavingsContributionDetailRow[];
  periodContributionsTotalLabel: string | null;
  allTimeContributionsTotalLabel: string | null;
  noContributionsFallback: string | null;
  isSharedGoal: boolean;
  sharedPrivacyCopy: string | null;
  otherUserPrivacyLabel: string | null;
  canEditGoal: boolean;
  editGoalHint: string;
  editTargetHint: string;
  editContributionHint: string;
}

export type BuildSavingsGoalDetailViewInput = {
  goal: SavingsGoal;
  participant: SavingsGoalParticipant | undefined;
  contributions: SavingsContribution[];
  userId: string;
  referenceDate?: Date;
};

function buildContributionRows(
  goalContributions: SavingsContribution[]
): SavingsContributionDetailRow[] {
  return [...goalContributions]
    .sort((left, right) => {
      const byDate = right.contribution_date.localeCompare(left.contribution_date);
      if (byDate !== 0) {
        return byDate;
      }
      return right.created_at.localeCompare(left.created_at);
    })
    .map((contribution) => ({
      dateLabel: formatDisplayDate(contribution.contribution_date),
      amountLabel: formatCurrency(Number(contribution.amount)),
      notes: contribution.notes?.trim() ? contribution.notes.trim() : null,
    }));
}

export function buildSavingsGoalDetailView(
  input: BuildSavingsGoalDetailViewInput
): SavingsGoalDetailView {
  const { goal, participant, contributions, userId } = input;
  const referenceDate = input.referenceDate ?? new Date();
  const goalContributions = filterMyContributionsForGoal(contributions, goal.id);
  const allTimeTotal = sumMyContributionsForGoal(contributions, goal.id);
  const targetPeriodSummary = participant
    ? getMySavingsGoalTargetPeriodSummary(participant, contributions, referenceDate)
    : null;
  const periodSummaryHint = participant
    ? getParticipantSummaryMonthHint(participant, referenceDate)
    : null;
  const progressPercent =
    targetPeriodSummary && targetPeriodSummary.targetAmount > 0
      ? calculateOwnProgressPercent(
          targetPeriodSummary.targetAmount,
          targetPeriodSummary.contributedAmount
        )
      : null;
  const isSharedGoal = goal.goal_type === "shared";
  const canEditGoal = canUserEditGoal(goal, userId);

  return {
    title: goal.name,
    subtitle: `${goalTypeLabel(goal.goal_type)} savings goal · read-only detail`,
    goalName: goal.name,
    goalTypeLabel: goalTypeLabel(goal.goal_type),
    householdTargetAmountLabel: formatCurrency(Number(goal.target_amount)),
    startDateLabel: formatDisplayDate(goal.start_date),
    endDateLabel: formatDisplayDate(goal.end_date),
    ownerLabel: resolveOwnerLabel(goal, userId),
    currentPeriodLabel: targetPeriodSummary
      ? formatPeriodMonthLabel(
          targetPeriodSummary.summaryYear,
          targetPeriodSummary.summaryMonth
        )
      : null,
    periodStartLabel: targetPeriodSummary?.periodStart
      ? formatDisplayDate(targetPeriodSummary.periodStart)
      : null,
    periodEndLabel: targetPeriodSummary?.periodEnd
      ? formatDisplayDate(targetPeriodSummary.periodEnd)
      : null,
    contributionPeriodLabel: targetPeriodSummary
      ? CONTRIBUTION_PERIOD_LABELS[targetPeriodSummary.contributionPeriod]
      : participant
        ? CONTRIBUTION_PERIOD_LABELS[participant.contribution_period]
        : null,
    periodSummaryHint,
    hasOwnTarget: participant != null,
    ownTargetAmountLabel: participant
      ? formatCurrency(Number(participant.target_contribution_amount))
      : null,
    ownTargetPeriodLabel: participant
      ? CONTRIBUTION_PERIOD_LABELS[participant.contribution_period]
      : null,
    ownRemainingObligationLabel: targetPeriodSummary
      ? formatCurrency(targetPeriodSummary.remainingObligation)
      : null,
    ownProgressPercentLabel:
      progressPercent === null ? null : `${progressPercent}%`,
    noOwnTargetFallback: participant ? null : SAVINGS_DETAIL_NO_OWN_TARGET_FALLBACK,
    contributions: buildContributionRows(goalContributions),
    periodContributionsTotalLabel: targetPeriodSummary
      ? formatCurrency(targetPeriodSummary.contributedAmount)
      : null,
    allTimeContributionsTotalLabel:
      goalContributions.length > 0 ? formatCurrency(allTimeTotal) : null,
    noContributionsFallback:
      goalContributions.length > 0 ? null : SAVINGS_DETAIL_NO_CONTRIBUTIONS_FALLBACK,
    isSharedGoal,
    sharedPrivacyCopy: isSharedGoal ? SAVINGS_DETAIL_SHARED_PRIVACY_COPY : null,
    otherUserPrivacyLabel: isSharedGoal ? SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY : null,
    canEditGoal,
    editGoalHint: canEditGoal
      ? SAVINGS_DETAIL_EDIT_GOAL_HINT
      : SAVINGS_DETAIL_EDIT_GOAL_BLOCKED_HINT,
    editTargetHint: SAVINGS_DETAIL_EDIT_TARGET_HINT,
    editContributionHint: SAVINGS_DETAIL_EDIT_CONTRIBUTION_HINT,
  };
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function collectSavingsDetailUserFacingStrings(
  detail: SavingsGoalDetailView
): string[] {
  const values: string[] = [
    detail.title,
    detail.subtitle,
    detail.goalName,
    detail.goalTypeLabel,
    detail.householdTargetAmountLabel,
    detail.startDateLabel,
    detail.endDateLabel,
    detail.ownerLabel,
    detail.editGoalHint,
    detail.editTargetHint,
    detail.editContributionHint,
    ...detail.contributions.flatMap((row) => [
      row.dateLabel,
      row.amountLabel,
      ...(row.notes ? [row.notes] : []),
    ]),
  ];

  for (const value of [
    detail.currentPeriodLabel,
    detail.periodStartLabel,
    detail.periodEndLabel,
    detail.contributionPeriodLabel,
    detail.periodSummaryHint,
    detail.ownTargetAmountLabel,
    detail.ownTargetPeriodLabel,
    detail.ownRemainingObligationLabel,
    detail.ownProgressPercentLabel,
    detail.noOwnTargetFallback,
    detail.periodContributionsTotalLabel,
    detail.allTimeContributionsTotalLabel,
    detail.noContributionsFallback,
    detail.sharedPrivacyCopy,
    detail.otherUserPrivacyLabel,
  ]) {
    if (value) {
      values.push(value);
    }
  }

  return values;
}

export function savingsDetailViewContainsRawUuid(
  detail: SavingsGoalDetailView
): boolean {
  return collectSavingsDetailUserFacingStrings(detail).some((value) =>
    UUID_PATTERN.test(value)
  );
}
