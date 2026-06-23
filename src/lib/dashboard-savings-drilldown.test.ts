import { describe, expect, it } from "vitest";
import {
  buildMySavingsDrilldown,
  buildSavingsDrilldownReconciliation,
  buildSavingsDrilldownSharedPrivacyLines,
  DEFAULT_DASHBOARD_SAVINGS_DRILLDOWN_FILTERS,
  filterOwnSavingsContributions,
  filterOwnSavingsParticipants,
  filterSavingsTargetRowsLocally,
  hasActiveSavingsDrilldownFilters,
  SAVINGS_DRILLDOWN_EMPTY_MESSAGE,
  savingsDrilldownLabelsArePrivacySafe,
  sumSavingsTargetRowRemainingObligations,
} from "@/lib/dashboard-savings-drilldown";
import {
  SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY,
  SAVINGS_DETAIL_SHARED_PRIVACY_COPY,
} from "@/lib/savings-detail";
import { SHARED_GOAL_METADATA_ONLY_COPY } from "@/lib/savings-edit";
import type {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";

const SIGNED_IN_USER = "user-1";
const OTHER_USER = "user-2";

function makeParticipant(
  overrides: Partial<SavingsGoalParticipant> &
    Pick<SavingsGoalParticipant, "id" | "savings_goal_id">
): SavingsGoalParticipant {
  return {
    id: overrides.id,
    savings_goal_id: overrides.savings_goal_id,
    household_id: "household-1",
    user_id: overrides.user_id ?? SIGNED_IN_USER,
    person_id: null,
    target_contribution_amount: overrides.target_contribution_amount ?? 200,
    contribution_period: overrides.contribution_period ?? "1_14",
    period_start: overrides.period_start ?? "2026-06-01",
    period_end: overrides.period_end ?? "2026-06-14",
    created_at: overrides.created_at ?? "2026-06-01T00:00:00.000Z",
  };
}

function makeContribution(
  overrides: Partial<SavingsContribution> &
    Pick<SavingsContribution, "id" | "savings_goal_id">
): SavingsContribution {
  return {
    id: overrides.id,
    savings_goal_id: overrides.savings_goal_id,
    household_id: "household-1",
    user_id: overrides.user_id ?? SIGNED_IN_USER,
    person_id: null,
    amount: overrides.amount ?? 50,
    contribution_date: overrides.contribution_date ?? "2026-06-05",
    notes: overrides.notes ?? null,
    created_at: overrides.created_at ?? "2026-06-05T10:00:00.000Z",
  };
}

const goals: Pick<SavingsGoal, "id" | "name" | "goal_type">[] = [
  { id: "goal-private", name: "Emergency fund", goal_type: "private" },
  { id: "goal-shared", name: "Vacation", goal_type: "shared" },
];

describe("filterOwnSavingsParticipants", () => {
  it("excludes other-user participant targets even if accidentally passed in", () => {
    const participants = [
      makeParticipant({ id: "p1", savings_goal_id: "goal-private" }),
      makeParticipant({
        id: "p2",
        savings_goal_id: "goal-shared",
        user_id: OTHER_USER,
      }),
    ];

    expect(filterOwnSavingsParticipants(participants, SIGNED_IN_USER)).toHaveLength(1);
  });
});

describe("filterOwnSavingsContributions", () => {
  it("excludes other-user contributions even if accidentally passed in", () => {
    const contributions = [
      makeContribution({ id: "c1", savings_goal_id: "goal-private" }),
      makeContribution({
        id: "c2",
        savings_goal_id: "goal-shared",
        user_id: OTHER_USER,
      }),
    ];

    expect(filterOwnSavingsContributions(contributions, SIGNED_IN_USER)).toHaveLength(1);
  });
});

describe("buildMySavingsDrilldown", () => {
  it("includes own private and shared participant targets for the selected view", () => {
    const participants = [
      makeParticipant({
        id: "p-private",
        savings_goal_id: "goal-private",
        target_contribution_amount: 200,
      }),
      makeParticipant({
        id: "p-shared",
        savings_goal_id: "goal-shared",
        contribution_period: "15_eom",
        period_start: "2026-06-15",
        period_end: "2026-06-30",
        target_contribution_amount: 150,
      }),
    ];
    const contributions = [
      makeContribution({
        id: "c1",
        savings_goal_id: "goal-private",
        amount: 75,
        contribution_date: "2026-06-05",
      }),
      makeContribution({
        id: "c2",
        savings_goal_id: "goal-shared",
        amount: 50,
        contribution_date: "2026-06-16",
      }),
    ];

    const result = buildMySavingsDrilldown({
      participants,
      contributions,
      visibleGoals: goals,
      periodView: "full",
      selectedYear: 2026,
      selectedMonth: 6,
      signedInUserId: SIGNED_IN_USER,
      cardRemainingObligationTotal: 225,
      paymentTransactions: [
        {
          source_type: "savings_contribution",
          source_id: "c1",
        },
      ],
    });

    expect(result.targetRows).toHaveLength(2);
    expect(result.targetRows[0]).toMatchObject({
      goalLabel: "Emergency fund",
      isSharedGoal: false,
      targetAmount: 200,
      contributedAmount: 75,
      remainingObligation: 125,
      sourceLabel: "Your period target",
    });
    expect(result.targetRows[1]).toMatchObject({
      goalLabel: "Vacation",
      isSharedGoal: true,
      remainingObligation: 100,
      sharedPrivacyCopy: SAVINGS_DETAIL_SHARED_PRIVACY_COPY,
      otherUserPrivacyCopy: SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY,
      sharedMetadataCopy: SHARED_GOAL_METADATA_ONLY_COPY,
    });
    expect(result.targetRows[0].contributions[0]).toMatchObject({
      sourceLabel: "Your contribution",
      isCashDeducted: true,
    });
    expect(result.hasSharedGoals).toBe(true);
  });

  it("reconciles displayed target remaining obligations to the card total", () => {
    const participants = [
      makeParticipant({
        id: "p1",
        savings_goal_id: "goal-private",
        target_contribution_amount: 300,
      }),
    ];
    const contributions = [
      makeContribution({
        id: "c1",
        savings_goal_id: "goal-private",
        amount: 100,
      }),
    ];

    const result = buildMySavingsDrilldown({
      participants,
      contributions,
      visibleGoals: goals,
      periodView: "1_14",
      selectedYear: 2026,
      selectedMonth: 6,
      signedInUserId: SIGNED_IN_USER,
      cardRemainingObligationTotal: 200,
    });

    expect(sumSavingsTargetRowRemainingObligations(result.targetRows)).toBe(200);
    expect(result.summary.remainingObligationTotal).toBe(200);
    expect(result.reconciliation.totalsMatch).toBe(true);
    expect(result.reconciliation.matchLabel).toBe("Totals match");
  });

  it("does not produce combined saved totals or combined progress", () => {
    const result = buildMySavingsDrilldown({
      participants: [
        makeParticipant({ id: "p1", savings_goal_id: "goal-shared" }),
      ],
      contributions: [
        makeContribution({ id: "c1", savings_goal_id: "goal-shared", amount: 40 }),
      ],
      visibleGoals: goals,
      periodView: "1_14",
      selectedYear: 2026,
      selectedMonth: 6,
      signedInUserId: SIGNED_IN_USER,
      cardRemainingObligationTotal: 160,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/combinedSaved/i);
    expect(serialized).not.toMatch(/combinedProgress/i);
    expect(serialized).not.toMatch(/householdRemaining/i);
    expect(serialized).not.toMatch(/otherUserTarget/i);
    expect(serialized).not.toMatch(/otherUserSaved/i);
    expect(result.summary).not.toHaveProperty("combinedSavedTotal");
    expect(result.targetRows[0]).not.toHaveProperty("combinedProgressPercent");
  });

  it("returns empty rows when no savings apply to the view", () => {
    const result = buildMySavingsDrilldown({
      participants: [
        makeParticipant({
          id: "p1",
          savings_goal_id: "goal-private",
          contribution_period: "15_eom",
        }),
      ],
      contributions: [],
      visibleGoals: goals,
      periodView: "1_14",
      selectedYear: 2026,
      selectedMonth: 6,
      signedInUserId: SIGNED_IN_USER,
      cardRemainingObligationTotal: 0,
    });

    expect(result.targetRows).toHaveLength(0);
    expect(SAVINGS_DRILLDOWN_EMPTY_MESSAGE).toContain("No savings targets");
  });

  it("uses privacy-safe mismatch copy when totals differ", () => {
    const reconciliation = buildSavingsDrilldownReconciliation(200, 150);

    expect(reconciliation.totalsMatch).toBe(false);
    expect(reconciliation.matchLabel).toBeNull();
    expect(reconciliation.mismatchExplanation).toMatch(/private savings/i);
  });
});

describe("filterSavingsTargetRowsLocally", () => {
  const drilldown = buildMySavingsDrilldown({
    participants: [
      makeParticipant({ id: "p1", savings_goal_id: "goal-private" }),
      makeParticipant({
        id: "p2",
        savings_goal_id: "goal-shared",
        contribution_period: "15_eom",
        period_start: "2026-06-15",
        period_end: "2026-06-30",
      }),
    ],
    contributions: [
      makeContribution({ id: "c1", savings_goal_id: "goal-private" }),
      makeContribution({
        id: "c2",
        savings_goal_id: "goal-shared",
        contribution_date: "2026-06-16",
      }),
    ],
    visibleGoals: goals,
    periodView: "full",
    selectedYear: 2026,
    selectedMonth: 6,
    signedInUserId: SIGNED_IN_USER,
    cardRemainingObligationTotal: 300,
    paymentTransactions: [
      { source_type: "savings_contribution", source_id: "c1" },
    ],
  });

  it("filters by private/shared scope", () => {
    const sharedOnly = filterSavingsTargetRowsLocally(drilldown.targetRows, {
      ...DEFAULT_DASHBOARD_SAVINGS_DRILLDOWN_FILTERS,
      scope: "shared",
    });

    expect(sharedOnly).toHaveLength(1);
    expect(sharedOnly[0]?.goalLabel).toBe("Vacation");
  });

  it("filters cash-deducted contribution rows", () => {
    const cashDeducted = filterSavingsTargetRowsLocally(drilldown.targetRows, {
      ...DEFAULT_DASHBOARD_SAVINGS_DRILLDOWN_FILTERS,
      rowKind: "cash-deducted",
    });

    expect(cashDeducted).toHaveLength(1);
    expect(cashDeducted[0]?.goalLabel).toBe("Emergency fund");
    expect(cashDeducted[0]?.contributions[0]?.isCashDeducted).toBe(true);
  });

  it("supports text search by goal name", () => {
    const filtered = filterSavingsTargetRowsLocally(drilldown.targetRows, {
      ...DEFAULT_DASHBOARD_SAVINGS_DRILLDOWN_FILTERS,
      searchText: "vacation",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.goalLabel).toBe("Vacation");
  });

  it("reports active filters", () => {
    expect(
      hasActiveSavingsDrilldownFilters(DEFAULT_DASHBOARD_SAVINGS_DRILLDOWN_FILTERS)
    ).toBe(false);
    expect(
      hasActiveSavingsDrilldownFilters({
        ...DEFAULT_DASHBOARD_SAVINGS_DRILLDOWN_FILTERS,
        rowKind: "target",
      })
    ).toBe(true);
  });
});

describe("savingsDrilldownLabelsArePrivacySafe", () => {
  it("does not expose raw UUIDs in user-facing labels", () => {
    const drilldown = buildMySavingsDrilldown({
      participants: [makeParticipant({ id: "p1", savings_goal_id: "goal-private" })],
      contributions: [
        makeContribution({ id: "c1", savings_goal_id: "goal-private" }),
      ],
      visibleGoals: goals,
      periodView: "1_14",
      selectedYear: 2026,
      selectedMonth: 6,
      signedInUserId: SIGNED_IN_USER,
      cardRemainingObligationTotal: 150,
    });

    expect(
      savingsDrilldownLabelsArePrivacySafe({ targetRows: drilldown.targetRows })
    ).toBe(true);
  });
});

describe("buildSavingsDrilldownSharedPrivacyLines", () => {
  it("includes required shared savings privacy copy", () => {
    const lines = buildSavingsDrilldownSharedPrivacyLines();

    expect(lines).toContain(SAVINGS_DETAIL_SHARED_PRIVACY_COPY);
    expect(lines).toContain(SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY);
    expect(lines).toContain(SHARED_GOAL_METADATA_ONLY_COPY);
  });
});
