import { formatCurrency } from "@/lib/format";
import {
  calculateRemainingSavingsObligation,
  filterMyContributionsForGoal,
} from "@/lib/savings";
import {
  SHARED_GOAL_METADATA_ONLY_COPY,
  SHARED_GOAL_PRIVACY_COPY,
  OTHER_USER_TARGET_PRIVACY_LABEL,
} from "@/lib/savings-edit";
import type {
  SavingsContribution,
  SavingsContributionPeriod,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import { format, parseISO } from "date-fns";

export const ROLLOVER_NOT_CONFIGURED_COPY = "Rollover not configured.";
export const ROLLOVER_ACTIVE_PERIOD_COPY =
  "No prior-period shortfall — your current period is still active.";
export const ROLLOVER_UPCOMING_PERIOD_COPY =
  "Rollover applies after a completed period with a recorded shortfall.";
export const ROLLOVER_SHORTFALL_COPY =
  "Prior-period shortfall can roll into your next period target when you continue.";
export const SAVINGS_RECURRING_PRIVACY_COPY =
  "Only your period target and contributions are shown.";

export type SavingsPeriodStatus = "active" | "upcoming" | "expired" | "undated";

const CONTRIBUTION_PERIOD_LABELS: Record<SavingsContributionPeriod, string> = {
  "1_14": "1st–14th of month",
  "15_eom": "15th–end of month",
  monthly: "Monthly",
};

function parseDateOnly(dateValue: string | null | undefined): string | null {
  if (!dateValue) {
    return null;
  }

  const match = dateValue.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function referenceIsoDate(referenceDate: Date): string {
  return format(referenceDate, "yyyy-MM-dd");
}

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

function formatPeriodMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function toSafeNumber(value: number | string): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function padMonth(month: number): string {
  return String(month).padStart(2, "0");
}

function padDay(day: number): string {
  return String(day).padStart(2, "0");
}

function isoDateParts(isoDate: string): { year: number; month: number; day: number } {
  const [yearStr, monthStr, dayStr] = isoDate.split("-");
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

function addDaysIso(isoDate: string, days: number): string {
  const date = parseISO(isoDate);
  date.setDate(date.getDate() + days);
  return format(date, "yyyy-MM-dd");
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function getContributionPeriodLabel(
  contributionPeriod: SavingsContributionPeriod
): string {
  return CONTRIBUTION_PERIOD_LABELS[contributionPeriod];
}

export function getCalendarPeriodBounds(
  contributionPeriod: SavingsContributionPeriod,
  year: number,
  month: number
): { start: string; end: string } {
  const monthStr = padMonth(month);
  const lastDay = getLastDayOfMonth(year, month);

  if (contributionPeriod === "1_14") {
    return {
      start: `${year}-${monthStr}-01`,
      end: `${year}-${monthStr}-14`,
    };
  }

  if (contributionPeriod === "15_eom") {
    return {
      start: `${year}-${monthStr}-15`,
      end: `${year}-${monthStr}-${padDay(lastDay)}`,
    };
  }

  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${padDay(lastDay)}`,
  };
}

export function getSavingsPeriodStatus(
  periodStart: string | null,
  periodEnd: string | null,
  referenceDate: Date = new Date()
): SavingsPeriodStatus {
  const today = referenceIsoDate(referenceDate);

  if (!periodStart && !periodEnd) {
    return "undated";
  }

  if (periodStart && today < periodStart) {
    return "upcoming";
  }

  if (periodEnd && today > periodEnd) {
    return "expired";
  }

  return "active";
}

function getStatusLabel(status: SavingsPeriodStatus): string {
  switch (status) {
    case "active":
      return "Current period active";
    case "upcoming":
      return "Period has not started yet";
    case "expired":
      return "Period ended — continue to the next period";
    case "undated":
      return "Using calendar period (no period dates set)";
  }
}

function contributionDateMatchesPeriodType(
  contributionDate: string,
  contributionPeriod: SavingsContributionPeriod
): boolean {
  const day = Number(contributionDate.slice(8, 10));
  if (contributionPeriod === "monthly") {
    return true;
  }
  if (contributionPeriod === "1_14") {
    return day >= 1 && day <= 14;
  }
  return day >= 15;
}

export function sumOwnContributionsInPeriodWindow(
  participant: SavingsGoalParticipant,
  contributions: SavingsContribution[],
  userId: string,
  periodStart: string,
  periodEnd: string
): number {
  const goalContributions = filterMyContributionsForGoal(
    contributions,
    participant.savings_goal_id,
    userId
  );

  return goalContributions.reduce((sum, contribution) => {
    if (contribution.user_id !== userId) {
      return sum;
    }

    const dateOnly = parseDateOnly(contribution.contribution_date);
    if (!dateOnly || dateOnly < periodStart || dateOnly > periodEnd) {
      return sum;
    }

    if (!contributionDateMatchesPeriodType(dateOnly, participant.contribution_period)) {
      return sum;
    }

    return sum + toSafeNumber(contribution.amount);
  }, 0);
}

export interface SavingsCurrentPeriodInfo {
  status: SavingsPeriodStatus;
  statusLabel: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  contributedAmount: number;
  remainingObligation: number;
  contributionPeriod: SavingsContributionPeriod;
}

export function buildCurrentPeriodInfo(
  participant: SavingsGoalParticipant,
  contributions: SavingsContribution[],
  userId: string,
  referenceDate: Date = new Date()
): SavingsCurrentPeriodInfo {
  const configuredStart = parseDateOnly(participant.period_start);
  const configuredEnd = parseDateOnly(participant.period_end);
  const status = getSavingsPeriodStatus(configuredStart, configuredEnd, referenceDate);

  let periodStart = configuredStart;
  let periodEnd = configuredEnd;
  let periodLabel: string;

  if (!periodStart || !periodEnd) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth() + 1;
    const bounds = getCalendarPeriodBounds(participant.contribution_period, year, month);
    periodStart = bounds.start;
    periodEnd = bounds.end;
    periodLabel = formatPeriodMonthLabel(year, month);
  } else {
    const startParts = isoDateParts(periodStart);
    periodLabel = formatPeriodMonthLabel(startParts.year, startParts.month);
  }

  const targetAmount = toSafeNumber(participant.target_contribution_amount);
  const contributedAmount = sumOwnContributionsInPeriodWindow(
    participant,
    contributions,
    userId,
    periodStart,
    periodEnd
  );

  return {
    status,
    statusLabel: getStatusLabel(status),
    periodLabel,
    periodStart,
    periodEnd,
    targetAmount,
    contributedAmount,
    remainingObligation: calculateRemainingSavingsObligation(
      targetAmount,
      contributedAmount
    ),
    contributionPeriod: participant.contribution_period,
  };
}

export interface SavingsRolloverInfo {
  configured: boolean;
  statusLabel: string;
  priorShortfall: number | null;
  rolloverAmount: number | null;
  explanation: string;
}

export function buildRolloverInfo(
  participant: SavingsGoalParticipant,
  contributions: SavingsContribution[],
  userId: string,
  referenceDate: Date = new Date()
): SavingsRolloverInfo {
  const periodStart = parseDateOnly(participant.period_start);
  const periodEnd = parseDateOnly(participant.period_end);

  if (!periodStart || !periodEnd) {
    return {
      configured: false,
      statusLabel: ROLLOVER_NOT_CONFIGURED_COPY,
      priorShortfall: null,
      rolloverAmount: null,
      explanation:
        "Set both period start and end on your target to track completed periods and rollover.",
    };
  }

  const status = getSavingsPeriodStatus(periodStart, periodEnd, referenceDate);

  if (status === "active") {
    return {
      configured: true,
      statusLabel: ROLLOVER_ACTIVE_PERIOD_COPY,
      priorShortfall: null,
      rolloverAmount: null,
      explanation: ROLLOVER_SHORTFALL_COPY,
    };
  }

  if (status === "upcoming") {
    return {
      configured: true,
      statusLabel: ROLLOVER_UPCOMING_PERIOD_COPY,
      priorShortfall: null,
      rolloverAmount: null,
      explanation: ROLLOVER_SHORTFALL_COPY,
    };
  }

  const targetAmount = toSafeNumber(participant.target_contribution_amount);
  const contributedAmount = sumOwnContributionsInPeriodWindow(
    participant,
    contributions,
    userId,
    periodStart,
    periodEnd
  );
  const priorShortfall = calculateRemainingSavingsObligation(
    targetAmount,
    contributedAmount
  );

  if (priorShortfall <= 0) {
    return {
      configured: true,
      statusLabel: "No prior-period shortfall to roll over.",
      priorShortfall: 0,
      rolloverAmount: 0,
      explanation: ROLLOVER_SHORTFALL_COPY,
    };
  }

  return {
    configured: true,
    statusLabel: `Prior-period shortfall: ${formatCurrency(priorShortfall)}`,
    priorShortfall,
    rolloverAmount: priorShortfall,
    explanation: ROLLOVER_SHORTFALL_COPY,
  };
}

export interface SavingsNextPeriodPreview {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  baseTargetAmount: number;
  rolloverAmount: number;
  suggestedTargetAmount: number;
  includeRollover: boolean;
}

export function getNextPeriodBounds(
  contributionPeriod: SavingsContributionPeriod,
  afterPeriodEnd: string
): { periodStart: string; periodEnd: string; periodLabel: string } {
  const dayAfter = addDaysIso(afterPeriodEnd, 1);
  const { year, month, day } = isoDateParts(dayAfter);

  if (contributionPeriod === "monthly") {
    const lastDay = getLastDayOfMonth(year, month);
    return {
      periodStart: `${year}-${padMonth(month)}-01`,
      periodEnd: `${year}-${padMonth(month)}-${padDay(lastDay)}`,
      periodLabel: formatPeriodMonthLabel(year, month),
    };
  }

  if (contributionPeriod === "1_14") {
    if (day <= 14) {
      return {
        periodStart: `${year}-${padMonth(month)}-01`,
        periodEnd: `${year}-${padMonth(month)}-14`,
        periodLabel: formatPeriodMonthLabel(year, month),
      };
    }

    const next = addMonths(year, month, 1);
    return {
      periodStart: `${next.year}-${padMonth(next.month)}-01`,
      periodEnd: `${next.year}-${padMonth(next.month)}-14`,
      periodLabel: formatPeriodMonthLabel(next.year, next.month),
    };
  }

  if (day >= 15) {
    const lastDay = getLastDayOfMonth(year, month);
    return {
      periodStart: `${year}-${padMonth(month)}-15`,
      periodEnd: `${year}-${padMonth(month)}-${padDay(lastDay)}`,
      periodLabel: formatPeriodMonthLabel(year, month),
    };
  }

  const lastDay = getLastDayOfMonth(year, month);
  return {
    periodStart: `${year}-${padMonth(month)}-15`,
    periodEnd: `${year}-${padMonth(month)}-${padDay(lastDay)}`,
    periodLabel: formatPeriodMonthLabel(year, month),
  };
}

export function canContinueToNextPeriod(
  participant: SavingsGoalParticipant,
  referenceDate: Date = new Date()
): boolean {
  const periodEnd = parseDateOnly(participant.period_end);
  if (!periodEnd) {
    return false;
  }

  return getSavingsPeriodStatus(
    parseDateOnly(participant.period_start),
    periodEnd,
    referenceDate
  ) === "expired";
}

export function buildNextPeriodPreview(
  participant: SavingsGoalParticipant,
  contributions: SavingsContribution[],
  userId: string,
  referenceDate: Date = new Date(),
  includeRollover = true
): SavingsNextPeriodPreview | null {
  const periodEnd = parseDateOnly(participant.period_end);
  if (!periodEnd || !canContinueToNextPeriod(participant, referenceDate)) {
    return null;
  }

  const nextBounds = getNextPeriodBounds(participant.contribution_period, periodEnd);
  const baseTargetAmount = toSafeNumber(participant.target_contribution_amount);
  const rollover = buildRolloverInfo(participant, contributions, userId, referenceDate);
  const rolloverAmount =
    includeRollover && rollover.rolloverAmount && rollover.rolloverAmount > 0
      ? rollover.rolloverAmount
      : 0;

  return {
    periodStart: nextBounds.periodStart,
    periodEnd: nextBounds.periodEnd,
    periodLabel: nextBounds.periodLabel,
    baseTargetAmount,
    rolloverAmount,
    suggestedTargetAmount: baseTargetAmount + rolloverAmount,
    includeRollover: rolloverAmount > 0,
  };
}

export interface SavingsContinuePeriodPayload {
  participantId: string;
  userId: string;
  savingsGoalId: string;
  targetContributionAmount: number;
  contributionPeriod: SavingsContributionPeriod;
  periodStart: string;
  periodEnd: string;
}

export function buildContinuePeriodPayload(
  participant: SavingsGoalParticipant,
  preview: SavingsNextPeriodPreview,
  userId: string
): SavingsContinuePeriodPayload | { error: string } {
  if (participant.user_id !== userId) {
    return { error: "You can only update your own savings target period." };
  }

  if (!participant.id || !participant.savings_goal_id) {
    return { error: "Your savings target row is missing required identifiers." };
  }

  return {
    participantId: participant.id,
    userId: participant.user_id,
    savingsGoalId: participant.savings_goal_id,
    targetContributionAmount: preview.suggestedTargetAmount,
    contributionPeriod: participant.contribution_period,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
  };
}

export interface SavingsRolloverDisplayView {
  sectionTitle: string;
  statusLabel: string;
  currentPeriodLabel: string;
  periodStartLabel: string;
  periodEndLabel: string;
  contributionPeriodLabel: string;
  ownTargetLabel: string;
  ownContributedLabel: string;
  ownRemainingLabel: string;
  rolloverStatusLabel: string;
  rolloverExplanation: string;
  nextPeriodPreviewLabel: string | null;
  canContinue: boolean;
  continueActionLabel: string;
  isSharedGoal: boolean;
  privacyCopy: string | null;
  otherUserPrivacyLabel: string | null;
  sharedMetadataCopy: string | null;
}

export function buildSavingsRolloverDisplayView(input: {
  goal: SavingsGoal;
  participant: SavingsGoalParticipant;
  contributions: SavingsContribution[];
  userId: string;
  referenceDate?: Date;
}): SavingsRolloverDisplayView {
  const referenceDate = input.referenceDate ?? new Date();
  const currentPeriod = buildCurrentPeriodInfo(
    input.participant,
    input.contributions,
    input.userId,
    referenceDate
  );
  const rollover = buildRolloverInfo(
    input.participant,
    input.contributions,
    input.userId,
    referenceDate
  );
  const nextPreview = buildNextPeriodPreview(
    input.participant,
    input.contributions,
    input.userId,
    referenceDate,
    true
  );
  const isSharedGoal = input.goal.goal_type === "shared";

  let nextPeriodPreviewLabel: string | null = null;
  if (nextPreview) {
    nextPeriodPreviewLabel = `${nextPreview.periodLabel} · ${formatDisplayDate(nextPreview.periodStart)} – ${formatDisplayDate(nextPreview.periodEnd)} · suggested target ${formatCurrency(nextPreview.suggestedTargetAmount)}`;
    if (nextPreview.includeRollover) {
      nextPeriodPreviewLabel += ` (includes ${formatCurrency(nextPreview.rolloverAmount)} rollover)`;
    }
  }

  return {
    sectionTitle: "Recurring period & rollover",
    statusLabel: currentPeriod.statusLabel,
    currentPeriodLabel: currentPeriod.periodLabel,
    periodStartLabel: formatDisplayDate(currentPeriod.periodStart),
    periodEndLabel: formatDisplayDate(currentPeriod.periodEnd),
    contributionPeriodLabel: getContributionPeriodLabel(currentPeriod.contributionPeriod),
    ownTargetLabel: formatCurrency(currentPeriod.targetAmount),
    ownContributedLabel: formatCurrency(currentPeriod.contributedAmount),
    ownRemainingLabel: formatCurrency(currentPeriod.remainingObligation),
    rolloverStatusLabel: rollover.statusLabel,
    rolloverExplanation: rollover.explanation,
    nextPeriodPreviewLabel,
    canContinue: canContinueToNextPeriod(input.participant, referenceDate),
    continueActionLabel: "Continue to next period",
    isSharedGoal,
    privacyCopy: isSharedGoal ? SHARED_GOAL_PRIVACY_COPY : SAVINGS_RECURRING_PRIVACY_COPY,
    otherUserPrivacyLabel: isSharedGoal ? OTHER_USER_TARGET_PRIVACY_LABEL : null,
    sharedMetadataCopy: isSharedGoal ? SHARED_GOAL_METADATA_ONLY_COPY : null,
  };
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function collectSavingsRolloverUserFacingStrings(
  view: SavingsRolloverDisplayView
): string[] {
  return [
    view.sectionTitle,
    view.statusLabel,
    view.currentPeriodLabel,
    view.periodStartLabel,
    view.periodEndLabel,
    view.contributionPeriodLabel,
    view.ownTargetLabel,
    view.ownContributedLabel,
    view.ownRemainingLabel,
    view.rolloverStatusLabel,
    view.rolloverExplanation,
    view.continueActionLabel,
    ...(view.nextPeriodPreviewLabel ? [view.nextPeriodPreviewLabel] : []),
    ...(view.privacyCopy ? [view.privacyCopy] : []),
    ...(view.otherUserPrivacyLabel ? [view.otherUserPrivacyLabel] : []),
    ...(view.sharedMetadataCopy ? [view.sharedMetadataCopy] : []),
  ];
}

export function savingsRolloverViewContainsRawUuid(view: SavingsRolloverDisplayView): boolean {
  return collectSavingsRolloverUserFacingStrings(view).some((value) =>
    UUID_PATTERN.test(value)
  );
}
