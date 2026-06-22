import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import {
  OTHER_USER_TARGET_PRIVACY_LABEL,
  SHARED_GOAL_METADATA_ONLY_COPY,
  SHARED_GOAL_PRIVACY_COPY,
} from "@/lib/savings-edit";
import {
  ROLLOVER_NOT_CONFIGURED_COPY,
  buildContinuePeriodPayload,
  buildCurrentPeriodInfo,
  buildNextPeriodPreview,
  buildRolloverInfo,
  buildSavingsRolloverDisplayView,
  canContinueToNextPeriod,
  collectSavingsRolloverUserFacingStrings,
  getCalendarPeriodBounds,
  getNextPeriodBounds,
  getSavingsPeriodStatus,
  savingsRolloverViewContainsRawUuid,
  sumOwnContributionsInPeriodWindow,
} from "@/lib/savings-rollover";
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
    period_end: "2026-06-30",
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

describe("getSavingsPeriodStatus", () => {
  it("returns active when reference date is within bounds", () => {
    expect(
      getSavingsPeriodStatus("2026-06-01", "2026-06-30", new Date("2026-06-15"))
    ).toBe("active");
  });

  it("returns expired when reference date is after period_end", () => {
    expect(
      getSavingsPeriodStatus(
        "2026-06-01",
        "2026-06-30",
        new Date(2026, 5, 30, 12, 0, 0)
      )
    ).toBe("active");
    expect(
      getSavingsPeriodStatus(
        "2026-06-01",
        "2026-06-30",
        new Date(2026, 6, 1, 12, 0, 0)
      )
    ).toBe("expired");
  });

  it("returns upcoming when reference date is before period_start", () => {
    expect(
      getSavingsPeriodStatus("2026-06-01", "2026-06-30", new Date("2026-05-31"))
    ).toBe("upcoming");
  });

  it("returns undated when period dates are missing", () => {
    expect(getSavingsPeriodStatus(null, null, new Date("2026-06-15"))).toBe(
      "undated"
    );
  });
});

describe("buildCurrentPeriodInfo", () => {
  it("calculates monthly current period using configured dates", () => {
    const info = buildCurrentPeriodInfo(
      participant({
        contribution_period: "monthly",
        target_contribution_amount: 200,
        period_start: "2026-06-01",
        period_end: "2026-06-30",
      }),
      [contribution({ amount: 50, contribution_date: "2026-06-10" })],
      userA,
      new Date("2026-06-15")
    );

    expect(info.status).toBe("active");
    expect(info.targetAmount).toBe(200);
    expect(info.contributedAmount).toBe(50);
    expect(info.remainingObligation).toBe(150);
    expect(info.periodStart).toBe("2026-06-01");
    expect(info.periodEnd).toBe("2026-06-30");
  });

  it("uses calendar month when period dates are not set", () => {
    const info = buildCurrentPeriodInfo(
      participant({
        contribution_period: "monthly",
        target_contribution_amount: 100,
        period_start: null,
        period_end: null,
      }),
      [contribution({ amount: 25, contribution_date: "2026-06-05" })],
      userA,
      new Date("2026-06-19")
    );

    expect(info.status).toBe("undated");
    expect(info.periodStart).toBe("2026-06-01");
    expect(info.periodEnd).toBe("2026-06-30");
    expect(info.contributedAmount).toBe(25);
    expect(info.remainingObligation).toBe(75);
  });

  it("ignores other-user contributions even if accidentally passed in", () => {
    const info = buildCurrentPeriodInfo(
      participant(),
      [
        contribution({ amount: 50, user_id: userA }),
        contribution({ id: "other", amount: 999, user_id: userB }),
      ],
      userA,
      new Date("2026-06-15")
    );

    expect(info.contributedAmount).toBe(50);
  });
});

describe("sumOwnContributionsInPeriodWindow", () => {
  it("counts only signed-in user rows in the date window", () => {
    const total = sumOwnContributionsInPeriodWindow(
      participant({ contribution_period: "monthly" }),
      [
        contribution({ amount: 40, contribution_date: "2026-06-05", user_id: userA }),
        contribution({
          id: "other",
          amount: 500,
          contribution_date: "2026-06-06",
          user_id: userB,
        }),
      ],
      userA,
      "2026-06-01",
      "2026-06-30"
    );

    expect(total).toBe(40);
  });

  it("applies 1_14 contribution period day filter", () => {
    const total = sumOwnContributionsInPeriodWindow(
      participant({ contribution_period: "1_14" }),
      [
        contribution({ amount: 30, contribution_date: "2026-06-10" }),
        contribution({ id: "late", amount: 99, contribution_date: "2026-06-20" }),
      ],
      userA,
      "2026-06-01",
      "2026-06-30"
    );

    expect(total).toBe(30);
  });
});

describe("buildRolloverInfo", () => {
  it("returns rollover not configured when period dates are missing", () => {
    const rollover = buildRolloverInfo(
      participant({ period_start: null, period_end: null }),
      [],
      userA
    );

    expect(rollover.configured).toBe(false);
    expect(rollover.statusLabel).toBe(ROLLOVER_NOT_CONFIGURED_COPY);
    expect(rollover.priorShortfall).toBeNull();
  });

  it("derives prior shortfall from own visible values when period expired", () => {
    const rollover = buildRolloverInfo(
      participant({
        target_contribution_amount: 200,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      }),
      [contribution({ amount: 50, contribution_date: "2026-05-10" })],
      userA,
      new Date("2026-06-15")
    );

    expect(rollover.configured).toBe(true);
    expect(rollover.priorShortfall).toBe(150);
    expect(rollover.rolloverAmount).toBe(150);
  });

  it("does not infer rollover from other-user contributions", () => {
    const rollover = buildRolloverInfo(
      participant({
        target_contribution_amount: 200,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      }),
      [
        contribution({ amount: 50, user_id: userA, contribution_date: "2026-05-10" }),
        contribution({
          id: "other",
          amount: 200,
          user_id: userB,
          contribution_date: "2026-05-12",
        }),
      ],
      userA,
      new Date("2026-06-15")
    );

    expect(rollover.priorShortfall).toBe(150);
    expect(rollover.priorShortfall).not.toBe(0);
  });
});

describe("getNextPeriodBounds", () => {
  it("builds next monthly period after period end", () => {
    expect(getNextPeriodBounds("monthly", "2026-06-30")).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      periodLabel: "July 2026",
    });
  });

  it("builds next 1_14 period after period end", () => {
    expect(getNextPeriodBounds("1_14", "2026-06-14")).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-14",
      periodLabel: "July 2026",
    });
  });
});

describe("buildNextPeriodPreview", () => {
  it("returns null when period cannot continue yet", () => {
    const preview = buildNextPeriodPreview(
      participant(),
      [],
      userA,
      new Date("2026-06-15")
    );

    expect(preview).toBeNull();
  });

  it("includes rollover shortfall in suggested target when period expired", () => {
    const preview = buildNextPeriodPreview(
      participant({
        target_contribution_amount: 200,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      }),
      [contribution({ amount: 50, contribution_date: "2026-05-10" })],
      userA,
      new Date("2026-06-15"),
      true
    );

    expect(preview).toMatchObject({
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      baseTargetAmount: 200,
      rolloverAmount: 150,
      suggestedTargetAmount: 350,
      includeRollover: true,
    });
  });
});

describe("canContinueToNextPeriod", () => {
  it("is true only when configured period_end has passed", () => {
    expect(
      canContinueToNextPeriod(participant(), new Date(2026, 6, 1, 12, 0, 0))
    ).toBe(true);
    expect(
      canContinueToNextPeriod(participant(), new Date(2026, 5, 15, 12, 0, 0))
    ).toBe(false);
    expect(
      canContinueToNextPeriod(
        participant({ period_end: null }),
        new Date("2026-07-01")
      )
    ).toBe(false);
  });
});

describe("buildContinuePeriodPayload", () => {
  it("includes only own participant id and user id", () => {
    const preview = buildNextPeriodPreview(
      participant({
        id: "participant-a",
        target_contribution_amount: 200,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      }),
      [contribution({ amount: 50, contribution_date: "2026-05-10" })],
      userA,
      new Date("2026-06-15")
    );

    expect(preview).not.toBeNull();
    const payload = buildContinuePeriodPayload(
      participant({ id: "participant-a", user_id: userA }),
      preview!,
      userA
    );

    expect(payload).toEqual({
      participantId: "participant-a",
      userId: userA,
      savingsGoalId: "goal-1",
      targetContributionAmount: 350,
      contributionPeriod: "monthly",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
    });
  });

  it("blocks payload for another user's participant row", () => {
    const preview = buildNextPeriodPreview(
      participant({
        user_id: userB,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      }),
      [],
      userB,
      new Date("2026-06-15")
    );

    expect(preview).not.toBeNull();
    expect(
      buildContinuePeriodPayload(
        participant({ user_id: userB }),
        preview!,
        userA
      )
    ).toEqual({ error: "You can only update your own savings target period." });
  });
});

describe("buildSavingsRolloverDisplayView", () => {
  it("includes privacy-safe copy for shared goals without other-user amounts", () => {
    const view = buildSavingsRolloverDisplayView({
      goal: goal(),
      participant: participant({ target_contribution_amount: 200 }),
      contributions: [
        contribution({ amount: 50, user_id: userA }),
        contribution({ id: "other", amount: 300, user_id: userB }),
      ],
      userId: userA,
      referenceDate: new Date("2026-06-15"),
    });

    const strings = collectSavingsRolloverUserFacingStrings(view).join(" ");
    expect(view.privacyCopy).toBe(SHARED_GOAL_PRIVACY_COPY);
    expect(view.otherUserPrivacyLabel).toBe(OTHER_USER_TARGET_PRIVACY_LABEL);
    expect(view.sharedMetadataCopy).toBe(SHARED_GOAL_METADATA_ONLY_COPY);
    expect(strings).toContain(formatCurrency(200));
    expect(strings).toContain(formatCurrency(50));
    expect(strings).not.toContain(formatCurrency(300));
    expect(strings).not.toContain(formatCurrency(350));
    expect(strings.toLowerCase()).not.toContain("combined");
  });

  it("does not expose raw UUIDs in user-facing labels", () => {
    const view = buildSavingsRolloverDisplayView({
      goal: goal({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      participant: participant({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      contributions: [
        contribution({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
      ],
      userId: userA,
    });

    expect(savingsRolloverViewContainsRawUuid(view)).toBe(false);
  });
});

describe("getCalendarPeriodBounds", () => {
  it("returns full month for monthly period", () => {
    expect(getCalendarPeriodBounds("monthly", 2026, 6)).toEqual({
      start: "2026-06-01",
      end: "2026-06-30",
    });
  });
});
