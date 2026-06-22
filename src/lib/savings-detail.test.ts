import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import type {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import {
  SAVINGS_DETAIL_NO_CONTRIBUTIONS_FALLBACK,
  SAVINGS_DETAIL_NO_OWN_TARGET_FALLBACK,
  SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY,
  SAVINGS_DETAIL_SHARED_PRIVACY_COPY,
  buildSavingsGoalDetailView,
  calculateOwnProgressPercent,
  collectSavingsDetailUserFacingStrings,
  savingsDetailViewContainsRawUuid,
} from "@/lib/savings-detail";

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
    id: "contrib-1",
    household_id: "household-1",
    savings_goal_id: "goal-1",
    user_id: userA,
    person_id: null,
    amount: 50,
    contribution_date: "2026-06-10",
    notes: "Payday transfer",
    created_at: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("calculateOwnProgressPercent", () => {
  it("returns progress based only on own visible values", () => {
    expect(calculateOwnProgressPercent(200, 50)).toBe(25);
    expect(calculateOwnProgressPercent(200, 250)).toBe(100);
  });

  it("returns null when target is zero", () => {
    expect(calculateOwnProgressPercent(0, 50)).toBeNull();
  });
});

describe("buildSavingsGoalDetailView", () => {
  it("shows own target and contributions for a private goal", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ goal_type: "private", name: "Vacation" }),
      participant: participant({ target_contribution_amount: 150 }),
      contributions: [
        contribution({ amount: 75, contribution_date: "2026-06-05" }),
      ],
      userId: userA,
      referenceDate: new Date("2026-06-15T12:00:00.000Z"),
    });

    expect(detail.goalTypeLabel).toBe("Private");
    expect(detail.hasOwnTarget).toBe(true);
    expect(detail.ownTargetAmountLabel).toBe(formatCurrency(150));
    expect(detail.contributions).toHaveLength(1);
    expect(detail.allTimeContributionsTotalLabel).toBe(formatCurrency(75));
    expect(detail.isSharedGoal).toBe(false);
    expect(detail.sharedPrivacyCopy).toBeNull();
  });

  it("shows shared metadata plus own target and contributions", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ goal_type: "shared" }),
      participant: participant(),
      contributions: [contribution()],
      userId: userA,
      referenceDate: new Date("2026-06-15T12:00:00.000Z"),
    });

    expect(detail.goalTypeLabel).toBe("Shared");
    expect(detail.householdTargetAmountLabel).toBe(formatCurrency(5000));
    expect(detail.ownTargetAmountLabel).toBe(formatCurrency(200));
    expect(detail.periodContributionsTotalLabel).toBe(formatCurrency(50));
    expect(detail.sharedPrivacyCopy).toBe(SAVINGS_DETAIL_SHARED_PRIVACY_COPY);
    expect(detail.otherUserPrivacyLabel).toBe(SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY);
  });

  it("does not include another user's target amount", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ goal_type: "shared", target_amount: 5000 }),
      participant: participant({ target_contribution_amount: 200 }),
      contributions: [],
      userId: userA,
    });

    const strings = collectSavingsDetailUserFacingStrings(detail).join(" ");
    expect(strings).toContain(formatCurrency(200));
    expect(strings).not.toContain(formatCurrency(300));
    expect(detail.ownTargetAmountLabel).toBe(formatCurrency(200));
  });

  it("does not include another user's contribution amount", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ goal_type: "shared" }),
      participant: participant(),
      contributions: [contribution({ amount: 50, user_id: userA })],
      userId: userA,
    });

    const strings = collectSavingsDetailUserFacingStrings(detail).join(" ");
    expect(strings).toContain(formatCurrency(50));
    expect(strings).not.toContain(formatCurrency(125));
    expect(detail.contributions).toHaveLength(1);
  });

  it("does not include a combined saved total", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ goal_type: "shared" }),
      participant: participant(),
      contributions: [contribution({ amount: 50 })],
      userId: userA,
    });

    const strings = collectSavingsDetailUserFacingStrings(detail).join(" ").toLowerCase();
    expect(strings).not.toContain("combined");
    expect(strings).not.toContain("household saved");
    expect(strings).not.toContain("total saved");
    expect(detail.allTimeContributionsTotalLabel).toBe(formatCurrency(50));
  });

  it("calculates own remaining obligation for the current period", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal(),
      participant: participant({ target_contribution_amount: 200 }),
      contributions: [contribution({ amount: 75 })],
      userId: userA,
      referenceDate: new Date("2026-06-15T12:00:00.000Z"),
    });

    expect(detail.ownRemainingObligationLabel).toBe(formatCurrency(125));
    expect(detail.ownProgressPercentLabel).toBe("38%");
  });

  it("totals period contributions using only own visible contributions", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal(),
      participant: participant({
        contribution_period: "1_14",
        period_start: "2026-06-01",
      }),
      contributions: [
        contribution({ amount: 20, contribution_date: "2026-06-05" }),
        contribution({ amount: 30, contribution_date: "2026-06-20" }),
      ],
      userId: userA,
      referenceDate: new Date("2026-06-15T12:00:00.000Z"),
    });

    expect(detail.periodContributionsTotalLabel).toBe(formatCurrency(20));
    expect(detail.allTimeContributionsTotalLabel).toBe(formatCurrency(50));
  });

  it("shows a fallback when no own participant row exists", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ goal_type: "shared" }),
      participant: undefined,
      contributions: [],
      userId: userB,
    });

    expect(detail.hasOwnTarget).toBe(false);
    expect(detail.noOwnTargetFallback).toBe(SAVINGS_DETAIL_NO_OWN_TARGET_FALLBACK);
    expect(detail.ownTargetAmountLabel).toBeNull();
    expect(detail.currentPeriodLabel).toBeNull();
  });

  it("shows a fallback when there are no contributions", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({ goal_type: "private" }),
      participant: participant(),
      contributions: [],
      userId: userA,
    });

    expect(detail.contributions).toHaveLength(0);
    expect(detail.noContributionsFallback).toBe(SAVINGS_DETAIL_NO_CONTRIBUTIONS_FALLBACK);
    expect(detail.allTimeContributionsTotalLabel).toBeNull();
  });

  it("does not expose raw UUIDs in user-facing fields", () => {
    const detail = buildSavingsGoalDetailView({
      goal: goal({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_by_user_id: userA,
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
