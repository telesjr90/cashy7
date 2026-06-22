import { describe, expect, it } from "vitest";
import type {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import {
  OTHER_USER_SAVED_AMOUNT_FALLBACK,
  SHARED_GOAL_PRIVACY_COPY,
  buildGoalUpdatePayload,
  buildOwnContributionDeleteId,
  buildOwnContributionUpdatePayload,
  buildOwnParticipantDeleteId,
  buildOwnTargetUpdatePayload,
  buildPrivacySafeSharedGoalDisplay,
  canUserEditContribution,
  canUserEditGoal,
  canUserEditParticipant,
  getGoalDeleteStatus,
  getOtherUserSavedAmountLabel,
  ownContributionEditFormFromContribution,
  ownTargetEditFormFromParticipant,
  producesCashDeductionMutation,
  validateGoalEditForm,
  validateGoalTypeChange,
  validateOwnContributionEditForm,
  validateOwnTargetEditForm,
} from "@/lib/savings-edit";

const userA = "user-a";
const userB = "user-b";

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal-1",
    household_id: "household-1",
    name: "Emergency fund",
    goal_type: "shared",
    target_amount: 5000,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    created_by_user_id: userA,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function participant(
  overrides: Partial<SavingsGoalParticipant> = {}
): SavingsGoalParticipant {
  return {
    id: "participant-1",
    household_id: "household-1",
    savings_goal_id: "goal-1",
    user_id: userA,
    person_id: null,
    target_contribution_amount: 200,
    contribution_period: "monthly",
    period_start: null,
    period_end: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function contribution(
  overrides: Partial<SavingsContribution> = {}
): SavingsContribution {
  return {
    id: "contrib-1",
    household_id: "household-1",
    savings_goal_id: "goal-1",
    user_id: userA,
    person_id: null,
    amount: 50,
    contribution_date: "2026-01-15",
    notes: null,
    created_at: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("ownership checks", () => {
  it("allows the creator to edit a goal", () => {
    expect(canUserEditGoal(goal(), userA)).toBe(true);
  });

  it("blocks another user from editing a goal", () => {
    expect(canUserEditGoal(goal(), userB)).toBe(false);
  });

  it("allows the signed-in user to edit their own target", () => {
    expect(canUserEditParticipant(participant(), userA)).toBe(true);
  });

  it("blocks editing another user's target", () => {
    expect(canUserEditParticipant(participant({ user_id: userB }), userA)).toBe(
      false
    );
  });

  it("allows the signed-in user to edit their own contribution", () => {
    expect(canUserEditContribution(contribution(), userA)).toBe(true);
  });

  it("blocks editing another user's contribution", () => {
    expect(
      canUserEditContribution(contribution({ user_id: userB }), userA)
    ).toBe(false);
  });
});

describe("validateOwnTargetEditForm", () => {
  it("accepts valid target amounts", () => {
    const result = validateOwnTargetEditForm({
      targetAmount: "150.25",
      contributionPeriod: "1_14",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
    });

    expect(result.error).toBeNull();
    expect(result.values?.targetContributionAmount).toBe(150.25);
  });

  it("rejects negative target amounts", () => {
    const result = validateOwnTargetEditForm({
      targetAmount: "-10",
      contributionPeriod: "monthly",
      periodStart: "",
      periodEnd: "",
    });

    expect(result.error).toContain("zero or greater");
    expect(result.values).toBeNull();
  });

  it("rejects NaN target amounts", () => {
    const result = validateOwnTargetEditForm({
      targetAmount: "abc",
      contributionPeriod: "monthly",
      periodStart: "",
      periodEnd: "",
    });

    expect(result.error).toContain("valid number");
    expect(result.values).toBeNull();
  });
});

describe("validateOwnContributionEditForm", () => {
  it("accepts valid contribution amounts", () => {
    const result = validateOwnContributionEditForm({
      amount: "75",
      contributionDate: "2026-02-01",
      notes: "Paycheck",
    });

    expect(result.error).toBeNull();
    expect(result.values?.amount).toBe(75);
  });

  it("rejects negative contribution amounts", () => {
    const result = validateOwnContributionEditForm({
      amount: "-1",
      contributionDate: "2026-02-01",
      notes: "",
    });

    expect(result.error).toContain("zero or greater");
    expect(result.values).toBeNull();
  });

  it("rejects NaN contribution amounts", () => {
    const result = validateOwnContributionEditForm({
      amount: "NaN",
      contributionDate: "2026-02-01",
      notes: "",
    });

    expect(result.error).toContain("valid number");
    expect(result.values).toBeNull();
  });
});

describe("validateGoalEditForm", () => {
  it("validates goal metadata for the creator", () => {
    const result = validateGoalEditForm(
      {
        name: "Vacation",
        goalType: "shared",
        targetAmount: "3000",
        startDate: "2026-03-01",
        endDate: "2026-08-31",
      },
      goal(),
      userA
    );

    expect(result.error).toBeNull();
    expect(result.values?.name).toBe("Vacation");
  });

  it("blocks non-creators from editing goals", () => {
    const result = validateGoalEditForm(
      {
        name: "Vacation",
        goalType: "shared",
        targetAmount: "3000",
        startDate: "2026-03-01",
        endDate: "2026-08-31",
      },
      goal(),
      userB
    );

    expect(result.error).toContain("you created");
    expect(result.values).toBeNull();
  });

  it("blocks shared to private visibility changes", () => {
    expect(validateGoalTypeChange("shared", "private").allowed).toBe(false);

    const result = validateGoalEditForm(
      {
        name: "Emergency fund",
        goalType: "private",
        targetAmount: "5000",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      goal({ goal_type: "shared" }),
      userA
    );

    expect(result.error).toContain("cannot be changed to private");
    expect(result.values).toBeNull();
  });
});

describe("buildPrivacySafeSharedGoalDisplay", () => {
  it("does not include the other user's target", () => {
    const display = buildPrivacySafeSharedGoalDisplay({
      goal: goal({ goal_type: "shared" }),
      myParticipant: participant({ target_contribution_amount: 200 }),
      mySavedAmount: 80,
    });

    expect(display.myTargetAmount).toBe(200);
    expect(display.otherUserSavedAmount).toBeNull();
    expect(display.combinedSavedTotal).toBeNull();
    expect(display.privacyCopy).toBe(SHARED_GOAL_PRIVACY_COPY);
  });

  it("does not include the other user's saved amount", () => {
    const display = buildPrivacySafeSharedGoalDisplay({
      goal: goal({ goal_type: "shared" }),
      myParticipant: undefined,
      mySavedAmount: 0,
    });

    expect(display.mySavedAmount).toBe(0);
    expect(display.otherUserSavedAmount).toBeNull();
    expect(getOtherUserSavedAmountLabel()).toBe(OTHER_USER_SAVED_AMOUNT_FALLBACK);
  });
});

describe("getGoalDeleteStatus", () => {
  it("blocks delete for shared goals with other-user data risk", () => {
    const status = getGoalDeleteStatus(goal({ goal_type: "shared" }), userA);

    expect(status.allowed).toBe(false);
    expect(status.blockedReason).toContain("Shared goals cannot be deleted");
  });

  it("allows delete with confirmation for private goals", () => {
    const status = getGoalDeleteStatus(goal({ goal_type: "private" }), userA);

    expect(status.allowed).toBe(true);
    expect(status.requiresConfirmation).toBe(true);
  });

  it("blocks delete for non-creators", () => {
    const status = getGoalDeleteStatus(goal({ goal_type: "private" }), userB);

    expect(status.allowed).toBe(false);
    expect(status.blockedReason).toContain("you created");
  });
});

describe("delete payloads", () => {
  it("includes only the signed-in user's contribution id", () => {
    const payload = buildOwnContributionDeleteId(contribution(), userA);
    expect(payload).toEqual({ contributionId: "contrib-1" });
  });

  it("rejects deleting another user's contribution", () => {
    const payload = buildOwnContributionDeleteId(
      contribution({ user_id: userB }),
      userA
    );
    expect(payload).toEqual({ error: "You can only delete your own contributions." });
  });

  it("includes only the signed-in user's participant id for reset", () => {
    const payload = buildOwnParticipantDeleteId(participant(), userA);
    expect(payload).toEqual({ participantId: "participant-1" });
  });

  it("rejects resetting another user's participant target", () => {
    const payload = buildOwnParticipantDeleteId(
      participant({ user_id: userB }),
      userA
    );
    expect(payload).toEqual({ error: "You can only reset your own savings target." });
  });
});

describe("update payload builders", () => {
  it("builds goal update payload from validated values", () => {
    const validated = validateGoalEditForm(
      {
        name: "Vacation",
        goalType: "private",
        targetAmount: "2500",
        startDate: "2026-04-01",
        endDate: "2026-10-01",
      },
      goal({ goal_type: "private" }),
      userA
    );

    expect(buildGoalUpdatePayload(validated.values!)).toEqual({
      name: "Vacation",
      goal_type: "private",
      target_amount: 2500,
      start_date: "2026-04-01",
      end_date: "2026-10-01",
    });
  });

  it("builds own target update payload", () => {
    const validated = validateOwnTargetEditForm(
      ownTargetEditFormFromParticipant(participant())
    );
    expect(buildOwnTargetUpdatePayload(validated.values!)).toEqual({
      target_contribution_amount: 200,
      contribution_period: "monthly",
      period_start: null,
      period_end: null,
    });
  });

  it("builds own contribution update payload", () => {
    const validated = validateOwnContributionEditForm(
      ownContributionEditFormFromContribution(contribution({ notes: "Updated" }))
    );
    expect(buildOwnContributionUpdatePayload(validated.values!)).toEqual({
      amount: 50,
      contribution_date: "2026-01-15",
      notes: "Updated",
    });
  });
});

describe("producesCashDeductionMutation", () => {
  it("never produces cash deduction mutations", () => {
    expect(producesCashDeductionMutation()).toBe(false);
  });
});
