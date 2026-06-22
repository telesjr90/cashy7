import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import { buildMySavingsDrilldownRows } from "@/lib/dashboard-drilldowns";
import {
  SHARED_GOAL_METADATA_ONLY_COPY,
  SHARED_GOAL_PRIVACY_COPY,
  OTHER_USER_TARGET_PRIVACY_LABEL,
  buildOwnContributionDeleteId,
  buildOwnParticipantDeleteId,
  buildPrivacySafeSharedGoalDisplay,
  canUserEditContribution,
  canUserEditParticipant,
} from "@/lib/savings-edit";
import {
  SAVINGS_DETAIL_SHARED_PRIVACY_COPY,
  buildSavingsGoalDetailView,
  collectSavingsDetailUserFacingStrings,
  savingsDetailViewContainsRawUuid,
} from "@/lib/savings-detail";
import {
  buildSavingsRolloverDisplayView,
  collectSavingsRolloverUserFacingStrings,
} from "@/lib/savings-rollover";
import {
  sumMySavingsContributionsForView,
  sumMySavingsTargetForView,
} from "@/lib/savings";
import type {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";

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
    id: "participant-a",
    household_id: "household-1",
    savings_goal_id: "goal-1",
    user_id: userA,
    person_id: null,
    target_contribution_amount: 200,
    contribution_period: "monthly",
    period_start: "2026-06-01",
    period_end: "2026-12-31",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function contribution(
  overrides: Partial<SavingsContribution> = {}
): SavingsContribution {
  return {
    id: "contrib-a",
    household_id: "household-1",
    savings_goal_id: "goal-1",
    user_id: userA,
    person_id: null,
    amount: 50,
    contribution_date: "2026-06-10",
    notes: null,
    created_at: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("shared savings privacy regression", () => {
  const otherParticipant = participant({
    id: "participant-b",
    user_id: userB,
    target_contribution_amount: 300,
  });
  const otherContributions = [
    contribution({ id: "contrib-b1", user_id: userB, amount: 125 }),
    contribution({ id: "contrib-b2", user_id: userB, amount: 75 }),
  ];

  it("buildPrivacySafeSharedGoalDisplay excludes other user target and saved totals", () => {
    const display = buildPrivacySafeSharedGoalDisplay({
      goal: goal(),
      myParticipant: participant({ target_contribution_amount: 200 }),
      mySavedAmount: 80,
    });

    expect(display.myTargetAmount).toBe(200);
    expect(display.mySavedAmount).toBe(80);
    expect(display.otherUserSavedAmount).toBeNull();
    expect(display.combinedSavedTotal).toBeNull();
    expect(display.privacyCopy).toBe(SHARED_GOAL_PRIVACY_COPY);
    expect(display.otherUserPrivacyLabel).toBe(OTHER_USER_TARGET_PRIVACY_LABEL);
    expect(Object.values(display)).not.toContain(otherParticipant.target_contribution_amount);
  });

  it("buildSavingsGoalDetailView excludes other user participant target", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ target_amount: 5000 }),
      participant: participant({ target_contribution_amount: 200 }),
      contributions: [],
      userId: userA,
    });

    const strings = collectSavingsDetailUserFacingStrings(detail).join(" ");
    expect(strings).toContain(formatCurrency(200));
    expect(strings).not.toContain(formatCurrency(300));
    expect(strings).not.toContain(formatCurrency(5000 - 200));
  });

  it("buildSavingsGoalDetailView excludes other user contribution amounts and counts", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal(),
      participant: participant(),
      contributions: [
        contribution({ amount: 50, user_id: userA }),
        ...otherContributions,
      ],
      userId: userA,
    });

    expect(detail.contributions).toHaveLength(1);
    const strings = collectSavingsDetailUserFacingStrings(detail).join(" ");
    expect(strings).not.toContain(formatCurrency(125));
    expect(strings).not.toContain(formatCurrency(75));
    expect(strings).not.toContain(formatCurrency(300));
  });

  it("buildSavingsGoalDetailView excludes combined saved total and combined progress", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal(),
      participant: participant({ target_contribution_amount: 200 }),
      contributions: [
        contribution({ amount: 50, user_id: userA }),
        ...otherContributions,
      ],
      userId: userA,
      referenceDate: new Date("2026-06-15T12:00:00.000Z"),
    });

    const strings = collectSavingsDetailUserFacingStrings(detail).join(" ").toLowerCase();
    expect(strings).not.toContain("combined");
    expect(strings).not.toContain("household saved");
    expect(strings).not.toContain("total saved");
    expect(detail.allTimeContributionsTotalLabel).toBe(formatCurrency(50));
    expect(detail.ownProgressPercentLabel).toBe("25%");
    expect(detail.ownProgressPercentLabel).not.toBe("40%");
  });

  it("buildSavingsGoalDetailView does not infer household remaining amount", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ target_amount: 5000 }),
      participant: participant({ target_contribution_amount: 200 }),
      contributions: [contribution({ amount: 50, user_id: userA })],
      userId: userA,
      referenceDate: new Date("2026-06-15T12:00:00.000Z"),
    });

    const strings = collectSavingsDetailUserFacingStrings(detail).join(" ");
    expect(strings).not.toContain(formatCurrency(4950));
    expect(strings).not.toContain(formatCurrency(4750));
    expect(detail.ownRemainingObligationLabel).toBe(formatCurrency(150));
  });

  it("includes privacy-safe copy for shared goals", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal(),
      participant: participant(),
      contributions: [],
      userId: userA,
    });

    expect(detail.sharedPrivacyCopy).toBe(SAVINGS_DETAIL_SHARED_PRIVACY_COPY);
    expect(detail.otherUserPrivacyLabel).toBe(OTHER_USER_TARGET_PRIVACY_LABEL);
    expect(SHARED_GOAL_METADATA_ONLY_COPY).toBe("Shared goal metadata only.");
  });

  it("does not expose raw UUIDs in shared savings display strings", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      participant: participant({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      contributions: [
        contribution({
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        }),
      ],
      userId: userA,
    });

    expect(savingsDetailViewContainsRawUuid(detail)).toBe(false);
  });
});

describe("dashboard savings privacy", () => {
  it("uses only signed-in user participant and contribution rows", () => {
    const myParticipants = [
      participant({
        contribution_period: "monthly",
        target_contribution_amount: 200,
      }),
    ];
    const myContributions = [
      contribution({ amount: 60, contribution_date: "2026-06-05" }),
    ];

    expect(
      sumMySavingsTargetForView(myParticipants, "full", 2026, 6)
    ).toBe(200);
    expect(
      sumMySavingsContributionsForView(
        myContributions,
        myParticipants,
        "full",
        2026,
        6
      )
    ).toBe(60);

    const rows = buildMySavingsDrilldownRows(
      myParticipants,
      myContributions,
      [{ id: "goal-1", name: "Emergency fund", goal_type: "shared" }],
      "full",
      2026,
      6
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      isSharedGoal: true,
      targetAmount: 200,
      contributedAmount: 60,
      remainingObligation: 140,
    });
    expect(rows[0].contributions).toHaveLength(1);
    expect(rows[0].contributions[0].amount).toBe(60);
  });
});

describe("edit/delete payload privacy guards", () => {
  it("blocks participant delete for another user's row", () => {
    expect(canUserEditParticipant(participant({ user_id: userB }), userA)).toBe(
      false
    );
    expect(buildOwnParticipantDeleteId(participant({ user_id: userB }), userA)).toEqual(
      { error: "You can only reset your own savings target." }
    );
  });

  it("blocks contribution delete for another user's row", () => {
    expect(
      canUserEditContribution(contribution({ user_id: userB }), userA)
    ).toBe(false);
    expect(
      buildOwnContributionDeleteId(contribution({ user_id: userB }), userA)
    ).toEqual({ error: "You can only delete your own contributions." });
  });
});

describe("savings rollover privacy", () => {
  it("rollover display excludes other-user target and combined saved totals", () => {
    const view = buildSavingsRolloverDisplayView({
      goal: goal(),
      participant: participant({ target_contribution_amount: 200 }),
      contributions: [
        contribution({ amount: 50, user_id: userA }),
        contribution({ id: "b1", amount: 125, user_id: userB }),
      ],
      userId: userA,
      referenceDate: new Date("2026-06-15T12:00:00.000Z"),
    });

    const strings = collectSavingsRolloverUserFacingStrings(view).join(" ");
    expect(strings).toContain(SHARED_GOAL_PRIVACY_COPY);
    expect(strings).toContain(OTHER_USER_TARGET_PRIVACY_LABEL);
    expect(strings).toContain(SHARED_GOAL_METADATA_ONLY_COPY);
    expect(strings).not.toContain(formatCurrency(125));
    expect(strings).not.toContain(formatCurrency(300));
    expect(strings.toLowerCase()).not.toContain("combined");
  });
});
