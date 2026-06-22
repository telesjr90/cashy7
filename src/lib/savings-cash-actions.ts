import type { PaymentSourceType } from "@/lib/types";
import type { SavingsContribution, SavingsGoal } from "@/lib/types";

export type SavingsContributionCashAction = "log_only" | "log_and_deduct";

export const SAVINGS_CONTRIBUTION_PAYMENT_SOURCE_TYPE =
  "savings_contribution" as const satisfies PaymentSourceType;

export const SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY: SavingsContributionCashAction =
  "log_only";
export const SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT: SavingsContributionCashAction =
  "log_and_deduct";

export const SAVINGS_CONTRIBUTION_LOG_ONLY_LABEL = "Log contribution only";
export const SAVINGS_CONTRIBUTION_LOG_AND_DEDUCT_LABEL =
  "Log and deduct from my current cash";

export const SAVINGS_CONTRIBUTION_DEDUCT_PRIVACY_COPY =
  "This will reduce only your private current cash.";
export const SAVINGS_CONTRIBUTION_OTHER_USER_PRIVACY_COPY =
  "The other user's cash and savings details remain private.";
export const SAVINGS_CONTRIBUTION_LOG_ONLY_SUCCESS =
  "Contribution logged. Current cash was not deducted.";
export const SAVINGS_CONTRIBUTION_LOG_AND_DEDUCT_SUCCESS =
  "Contribution logged and deducted from your current cash.";

export const SAVINGS_CONTRIBUTION_CASH_DEDUCTED_LABEL =
  "Deducted from your current cash";
export const SAVINGS_CONTRIBUTION_NO_CASH_DEDUCTION_LABEL =
  "No cash deduction — contribution logged only";
export const SAVINGS_CONTRIBUTION_NO_CASH_DEDUCTION_VISIBLE_LABEL =
  "No cash deduction record visible for your user.";
export const SAVINGS_CONTRIBUTION_CASH_DEDUCTION_SEPARATE_LABEL =
  "Cash deduction was recorded separately.";
export const SAVINGS_CONTRIBUTION_EDIT_NO_CASH_ADJUST_LABEL =
  "Editing this contribution does not automatically change current cash.";

export const SAVINGS_CONTRIBUTION_PAYMENT_SOURCE_TYPE_LABEL = "Savings contribution";
export const SAVINGS_CONTRIBUTION_PAYMENT_DEDUCTION_FALLBACK_LABEL =
  "Savings contribution";

export interface SavingsContributionInsertPayload {
  savingsGoalId: string;
  amount: number;
  contributionDate?: string;
  personId?: string | null;
  notes?: string | null;
}

export interface SavingsContributionCashDeductionPayload {
  householdId: string;
  userId: string;
  sourceType: typeof SAVINGS_CONTRIBUTION_PAYMENT_SOURCE_TYPE;
  sourceId: string;
  amount: number;
  notes: string;
}

export function isSavingsContributionCashAction(
  value: string
): value is SavingsContributionCashAction {
  return (
    value === SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY ||
    value === SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT
  );
}

export function validateSavingsContributionCashAction(
  action: string
): { ok: true; action: SavingsContributionCashAction } | { ok: false; error: string } {
  if (!isSavingsContributionCashAction(action)) {
    return {
      ok: false,
      error: "Choose whether to log only or also deduct from your current cash.",
    };
  }

  return { ok: true, action };
}

export function shouldDeductCashForSavingsContribution(
  action: SavingsContributionCashAction
): boolean {
  return action === SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT;
}

export function buildSavingsContributionInsertPayload(input: {
  savingsGoalId: string;
  amount: number;
  contributionDate?: string;
  personId?: string | null;
  notes?: string | null;
}): SavingsContributionInsertPayload {
  return {
    savingsGoalId: input.savingsGoalId,
    amount: input.amount,
    contributionDate: input.contributionDate,
    personId: input.personId ?? null,
    notes: input.notes ?? null,
  };
}

export function buildSavingsContributionCashDeductionNotes(goalName: string): string {
  const trimmed = goalName.trim();
  if (trimmed) {
    return `Savings contribution · ${trimmed}`;
  }

  return SAVINGS_CONTRIBUTION_PAYMENT_DEDUCTION_FALLBACK_LABEL;
}

export function buildSavingsContributionPaymentSourceDescription(
  goalName: string
): string {
  const trimmed = goalName.trim();
  if (trimmed) {
    return trimmed;
  }

  return SAVINGS_CONTRIBUTION_PAYMENT_DEDUCTION_FALLBACK_LABEL;
}

export function buildSavingsContributionCashDeductionPayload(input: {
  householdId: string;
  userId: string;
  contributionId: string;
  amount: number;
  goalName: string;
}): SavingsContributionCashDeductionPayload {
  assertCashDeductionTargetsSignedInUser(input.userId, input.userId);

  return {
    householdId: input.householdId,
    userId: input.userId,
    sourceType: SAVINGS_CONTRIBUTION_PAYMENT_SOURCE_TYPE,
    sourceId: input.contributionId,
    amount: input.amount,
    notes: buildSavingsContributionCashDeductionNotes(input.goalName),
  };
}

export function assertCashDeductionTargetsSignedInUser(
  signedInUserId: string,
  targetUserId: string
): void {
  if (signedInUserId !== targetUserId) {
    throw new Error("Cash deduction must target only the signed-in user.");
  }
}

export function getSavingsContributionCashDeductionSourceIds(
  transactions: ReadonlyArray<Pick<{ source_type: string; source_id: string }, "source_type" | "source_id">>
): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const transaction of transactions) {
    if (transaction.source_type === SAVINGS_CONTRIBUTION_PAYMENT_SOURCE_TYPE) {
      ids.add(transaction.source_id);
    }
  }

  return ids;
}

export function hasCashDeductionForSavingsContribution(
  contributionId: string,
  cashDeductionSourceIds: ReadonlySet<string>
): boolean {
  return cashDeductionSourceIds.has(contributionId);
}

export function isDuplicateSavingsContributionCashDeduction(input: {
  contributionId: string;
  cashDeductionSourceIds: ReadonlySet<string>;
}): boolean {
  return hasCashDeductionForSavingsContribution(
    input.contributionId,
    input.cashDeductionSourceIds
  );
}

export function buildSavingsContributionGoalNameLookup(
  contributions: ReadonlyArray<Pick<SavingsContribution, "id" | "savings_goal_id">>,
  goals: ReadonlyArray<Pick<SavingsGoal, "id" | "name">>
): ReadonlyMap<string, string> {
  const goalNameById = new Map<string, string>();

  for (const goal of goals) {
    const name = goal.name.trim();
    if (name) {
      goalNameById.set(goal.id, name);
    }
  }

  const lookup = new Map<string, string>();

  for (const contribution of contributions) {
    const goalName = goalNameById.get(contribution.savings_goal_id);
    if (goalName) {
      lookup.set(contribution.id, goalName);
    }
  }

  return lookup;
}

export function buildContributionCashDeductionDetailLabel(
  contributionId: string,
  cashDeductionSourceIds: ReadonlySet<string>
): string {
  if (hasCashDeductionForSavingsContribution(contributionId, cashDeductionSourceIds)) {
    return SAVINGS_CONTRIBUTION_CASH_DEDUCTED_LABEL;
  }

  return SAVINGS_CONTRIBUTION_NO_CASH_DEDUCTION_VISIBLE_LABEL;
}

export function buildContributionListCashDeductionLabel(
  contributionId: string,
  cashDeductionSourceIds: ReadonlySet<string>
): string | null {
  if (hasCashDeductionForSavingsContribution(contributionId, cashDeductionSourceIds)) {
    return SAVINGS_CONTRIBUTION_CASH_DEDUCTED_LABEL;
  }

  return null;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function savingsCashLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}
