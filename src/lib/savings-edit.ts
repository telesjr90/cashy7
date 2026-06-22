import type {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
  SavingsGoalType,
  UpdateTables,
} from "@/lib/types";

export const SHARED_GOAL_PRIVACY_COPY =
  "Only your savings target and contribution details are shown.";
export const OTHER_USER_TARGET_PRIVACY_LABEL =
  "The other user's target and saved amount remain private.";
export const OTHER_USER_SAVED_AMOUNT_FALLBACK =
  "Private — only visible to the other member";
export const SHARED_GOAL_METADATA_ONLY_COPY = "Shared goal metadata only.";

export type GoalEditFormValues = {
  name: string;
  goalType: SavingsGoalType | "";
  targetAmount: string;
  startDate: string;
  endDate: string;
};

export type OwnTargetEditFormValues = {
  targetAmount: string;
  contributionPeriod: SavingsGoalParticipant["contribution_period"] | "";
  periodStart: string;
  periodEnd: string;
};

export type OwnContributionEditFormValues = {
  amount: string;
  contributionDate: string;
  notes: string;
};

export type GoalDeleteStatus = {
  allowed: boolean;
  requiresConfirmation: boolean;
  blockedReason: string | null;
  confirmTitle: string;
  confirmDescription: string;
};

export type PrivacySafeSharedGoalDisplay = {
  goalName: string;
  goalType: SavingsGoalType;
  householdTargetAmount: number;
  myTargetAmount: number | null;
  mySavedAmount: number;
  otherUserSavedAmount: null;
  combinedSavedTotal: null;
  privacyCopy: string;
  otherUserPrivacyLabel: string;
};

function parseNonNegativeAmount(
  value: string | number,
  fieldLabel: string
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false, error: `${fieldLabel} must be a valid number.` };
    }
    if (value < 0) {
      return { ok: false, error: `${fieldLabel} must be zero or greater.` };
    }
    return { ok: true, value };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: false, error: `${fieldLabel} is required.` };
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return { ok: false, error: `${fieldLabel} must be a valid number.` };
  }
  if (num < 0) {
    return { ok: false, error: `${fieldLabel} must be zero or greater.` };
  }

  return { ok: true, value: num };
}

export function canUserEditGoal(
  goal: Pick<SavingsGoal, "created_by_user_id">,
  userId: string
): boolean {
  return goal.created_by_user_id === userId;
}

export function canUserEditParticipant(
  participant: Pick<SavingsGoalParticipant, "user_id">,
  userId: string
): boolean {
  return participant.user_id === userId;
}

export function canUserEditContribution(
  contribution: Pick<SavingsContribution, "user_id">,
  userId: string
): boolean {
  return contribution.user_id === userId;
}

export function goalEditFormFromGoal(goal: SavingsGoal): GoalEditFormValues {
  return {
    name: goal.name,
    goalType: goal.goal_type,
    targetAmount: String(goal.target_amount),
    startDate: goal.start_date,
    endDate: goal.end_date,
  };
}

export function validateGoalTypeChange(
  currentType: SavingsGoalType,
  nextType: SavingsGoalType
): { allowed: true } | { allowed: false; error: string } {
  if (currentType === nextType) {
    return { allowed: true };
  }

  if (currentType === "shared" && nextType === "private") {
    return {
      allowed: false,
      error:
        "Shared goals cannot be changed to private because another member may already have private target or contribution records tied to this goal.",
    };
  }

  return { allowed: true };
}

export function validateGoalEditForm(
  form: GoalEditFormValues,
  goal: SavingsGoal,
  userId: string
): {
  error: string | null;
  values: {
    name: string;
    goalType: SavingsGoalType;
    targetAmount: number;
    startDate: string;
    endDate: string;
  } | null;
} {
  if (!canUserEditGoal(goal, userId)) {
    return { error: "You can only edit savings goals you created.", values: null };
  }

  const name = form.name.trim();
  if (!name) {
    return { error: "Goal name is required.", values: null };
  }

  if (form.goalType !== "private" && form.goalType !== "shared") {
    return { error: "Please select a goal type.", values: null };
  }

  const typeChange = validateGoalTypeChange(goal.goal_type, form.goalType);
  if (!typeChange.allowed) {
    return { error: typeChange.error, values: null };
  }

  const targetParsed = parseNonNegativeAmount(form.targetAmount, "Target amount");
  if (!targetParsed.ok) {
    return { error: targetParsed.error, values: null };
  }

  const startDate = form.startDate.trim();
  const endDate = form.endDate.trim();
  if (!startDate || !endDate) {
    return { error: "Start and end dates are required.", values: null };
  }
  if (endDate < startDate) {
    return { error: "End date must be on or after the start date.", values: null };
  }

  return {
    error: null,
    values: {
      name,
      goalType: form.goalType,
      targetAmount: targetParsed.value,
      startDate,
      endDate,
    },
  };
}

export function buildGoalUpdatePayload(
  values: NonNullable<ReturnType<typeof validateGoalEditForm>["values"]>
): UpdateTables<"savings_goals"> {
  return {
    name: values.name,
    goal_type: values.goalType,
    target_amount: values.targetAmount,
    start_date: values.startDate,
    end_date: values.endDate,
  };
}

export function ownTargetEditFormFromParticipant(
  participant: SavingsGoalParticipant
): OwnTargetEditFormValues {
  return {
    targetAmount: String(participant.target_contribution_amount),
    contributionPeriod: participant.contribution_period,
    periodStart: participant.period_start ?? "",
    periodEnd: participant.period_end ?? "",
  };
}

export function validateOwnTargetEditForm(form: OwnTargetEditFormValues): {
  error: string | null;
  values: {
    targetContributionAmount: number;
    contributionPeriod: SavingsGoalParticipant["contribution_period"];
    periodStart: string | null;
    periodEnd: string | null;
  } | null;
} {
  const targetParsed = parseNonNegativeAmount(
    form.targetAmount,
    "Target contribution amount"
  );
  if (!targetParsed.ok) {
    return { error: targetParsed.error, values: null };
  }

  if (
    form.contributionPeriod !== "1_14" &&
    form.contributionPeriod !== "15_eom" &&
    form.contributionPeriod !== "monthly"
  ) {
    return { error: "Please select a contribution period.", values: null };
  }

  const periodStart = form.periodStart.trim() || null;
  const periodEnd = form.periodEnd.trim() || null;
  if (periodStart && periodEnd && periodEnd < periodStart) {
    return { error: "Period end must be on or after period start.", values: null };
  }

  return {
    error: null,
    values: {
      targetContributionAmount: targetParsed.value,
      contributionPeriod: form.contributionPeriod,
      periodStart,
      periodEnd,
    },
  };
}

export function buildOwnTargetUpdatePayload(
  values: NonNullable<ReturnType<typeof validateOwnTargetEditForm>["values"]>
): Pick<
  UpdateTables<"savings_goal_participants">,
  "target_contribution_amount" | "contribution_period" | "period_start" | "period_end"
> {
  return {
    target_contribution_amount: values.targetContributionAmount,
    contribution_period: values.contributionPeriod,
    period_start: values.periodStart,
    period_end: values.periodEnd,
  };
}

export function ownContributionEditFormFromContribution(
  contribution: SavingsContribution
): OwnContributionEditFormValues {
  return {
    amount: String(contribution.amount),
    contributionDate: contribution.contribution_date,
    notes: contribution.notes ?? "",
  };
}

export function validateOwnContributionEditForm(
  form: OwnContributionEditFormValues
): {
  error: string | null;
  values: {
    amount: number;
    contributionDate: string;
    notes: string | null;
  } | null;
} {
  const amountParsed = parseNonNegativeAmount(form.amount, "Contribution amount");
  if (!amountParsed.ok) {
    return { error: amountParsed.error, values: null };
  }

  const contributionDate = form.contributionDate.trim();
  if (!contributionDate) {
    return { error: "Contribution date is required.", values: null };
  }

  return {
    error: null,
    values: {
      amount: amountParsed.value,
      contributionDate,
      notes: form.notes.trim() || null,
    },
  };
}

export function buildOwnContributionUpdatePayload(
  values: NonNullable<ReturnType<typeof validateOwnContributionEditForm>["values"]>
): Pick<UpdateTables<"savings_contributions">, "amount" | "contribution_date" | "notes"> {
  return {
    amount: values.amount,
    contribution_date: values.contributionDate,
    notes: values.notes,
  };
}

export function getGoalDeleteStatus(
  goal: SavingsGoal,
  userId: string
): GoalDeleteStatus {
  if (!canUserEditGoal(goal, userId)) {
    return {
      allowed: false,
      requiresConfirmation: false,
      blockedReason: "You can only delete savings goals you created.",
      confirmTitle: "Delete savings goal",
      confirmDescription: "",
    };
  }

  if (goal.goal_type === "shared") {
    return {
      allowed: false,
      requiresConfirmation: false,
      blockedReason:
        "Shared goals cannot be deleted because another member may have private target or contribution history tied to this goal.",
      confirmTitle: "Delete savings goal",
      confirmDescription: "",
    };
  }

  return {
    allowed: true,
    requiresConfirmation: true,
    blockedReason: null,
    confirmTitle: "Delete private savings goal",
    confirmDescription:
      "This permanently deletes the goal and your contribution history for it. This cannot be undone.",
  };
}

export function buildOwnContributionDeleteId(
  contribution: SavingsContribution,
  userId: string
): { contributionId: string } | { error: string } {
  if (!canUserEditContribution(contribution, userId)) {
    return { error: "You can only delete your own contributions." };
  }

  return { contributionId: contribution.id };
}

export function buildOwnParticipantDeleteId(
  participant: SavingsGoalParticipant,
  userId: string
): { participantId: string } | { error: string } {
  if (!canUserEditParticipant(participant, userId)) {
    return { error: "You can only reset your own savings target." };
  }

  return { participantId: participant.id };
}

/** Savings edit/delete flows never mutate current cash or payment audit records. */
export function producesCashDeductionMutation(): false {
  return false;
}

export function buildPrivacySafeSharedGoalDisplay(input: {
  goal: SavingsGoal;
  myParticipant: SavingsGoalParticipant | undefined;
  mySavedAmount: number;
}): PrivacySafeSharedGoalDisplay {
  return {
    goalName: input.goal.name,
    goalType: input.goal.goal_type,
    householdTargetAmount: Number(input.goal.target_amount),
    myTargetAmount: input.myParticipant
      ? Number(input.myParticipant.target_contribution_amount)
      : null,
    mySavedAmount: input.mySavedAmount,
    otherUserSavedAmount: null,
    combinedSavedTotal: null,
    privacyCopy: SHARED_GOAL_PRIVACY_COPY,
    otherUserPrivacyLabel: OTHER_USER_TARGET_PRIVACY_LABEL,
  };
}

export function getOtherUserSavedAmountLabel(): string {
  return OTHER_USER_SAVED_AMOUNT_FALLBACK;
}
