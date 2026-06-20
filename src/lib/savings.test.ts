import { describe, expect, it } from "vitest";
import type { SavingsContribution, SavingsGoalParticipant } from "@/lib/types";
import {
  calculateRemainingSavingsObligation,
  calculateSafeToSpendAfterSavings,
  filterMyContributionsForGoal,
  getDashboardViewDateRange,
  sumMyContributionsForGoal,
  sumMySavingsContributionsForView,
  sumMySavingsTargetForView,
} from "@/lib/savings";

const goalA = "goal-a";
const goalB = "goal-b";

function contribution(
  overrides: Partial<SavingsContribution> & Pick<SavingsContribution, "savings_goal_id" | "amount">
): SavingsContribution {
  return {
    id: overrides.id ?? "contrib-1",
    household_id: "household-1",
    user_id: "user-1",
    person_id: null,
    contribution_date: "2026-01-15",
    notes: null,
    created_at: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterMyContributionsForGoal", () => {
  it("returns only contributions for the requested goal", () => {
    const contributions = [
      contribution({ id: "1", savings_goal_id: goalA, amount: 100 }),
      contribution({ id: "2", savings_goal_id: goalB, amount: 50 }),
      contribution({ id: "3", savings_goal_id: goalA, amount: 25 }),
    ];

    expect(filterMyContributionsForGoal(contributions, goalA)).toEqual([
      contributions[0],
      contributions[2],
    ]);
  });

  it("returns an empty array when no contributions match", () => {
    const contributions = [
      contribution({ savings_goal_id: goalB, amount: 50 }),
    ];

    expect(filterMyContributionsForGoal(contributions, goalA)).toEqual([]);
  });
});

describe("sumMyContributionsForGoal", () => {
  it("sums numeric amounts for the requested goal", () => {
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 100 }),
      contribution({ savings_goal_id: goalA, amount: 25.5 }),
      contribution({ savings_goal_id: goalB, amount: 999 }),
    ];

    expect(sumMyContributionsForGoal(contributions, goalA)).toBe(125.5);
  });

  it("coerces string amounts from the database", () => {
    const contributions = [
      contribution({
        savings_goal_id: goalA,
        amount: "40" as unknown as number,
      }),
      contribution({
        savings_goal_id: goalA,
        amount: "10.25" as unknown as number,
      }),
    ];

    expect(sumMyContributionsForGoal(contributions, goalA)).toBe(50.25);
  });

  it("returns zero when there are no contributions for the goal", () => {
    expect(sumMyContributionsForGoal([], goalA)).toBe(0);
  });
});

function participant(
  overrides: Partial<SavingsGoalParticipant> &
    Pick<SavingsGoalParticipant, "contribution_period" | "target_contribution_amount">
): SavingsGoalParticipant {
  return {
    id: overrides.id ?? "participant-1",
    household_id: "household-1",
    user_id: "user-1",
    savings_goal_id: overrides.savings_goal_id ?? "goal-a",
    person_id: null,
    period_start: null,
    period_end: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sumMySavingsTargetForView", () => {
  const selectedYear = 2026;
  const selectedMonth = 1;

  const participants = [
    participant({ id: "1", contribution_period: "1_14", target_contribution_amount: 100 }),
    participant({ id: "2", contribution_period: "15_eom", target_contribution_amount: 200 }),
    participant({ id: "3", contribution_period: "monthly", target_contribution_amount: 300 }),
  ];

  it("includes only 1_14 targets for 1_14 view", () => {
    expect(
      sumMySavingsTargetForView(participants, "1_14", selectedYear, selectedMonth)
    ).toBe(100);
  });

  it("includes only 15_eom targets for 15_eom view", () => {
    expect(
      sumMySavingsTargetForView(participants, "15_eom", selectedYear, selectedMonth)
    ).toBe(200);
  });

  it("includes 1_14, 15_eom, and monthly targets for full view", () => {
    expect(
      sumMySavingsTargetForView(participants, "full", selectedYear, selectedMonth)
    ).toBe(600);
  });

  it("does not include monthly targets in single-period views", () => {
    expect(
      sumMySavingsTargetForView(participants, "1_14", selectedYear, selectedMonth)
    ).not.toBe(400);
    expect(
      sumMySavingsTargetForView(participants, "15_eom", selectedYear, selectedMonth)
    ).not.toBe(500);
  });

  it("1_14 includes active 1_14 target for selected view", () => {
    const active = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: 150,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      }),
    ];

    expect(
      sumMySavingsTargetForView(active, "1_14", selectedYear, selectedMonth)
    ).toBe(150);
  });

  it("1_14 excludes 1_14 target whose date range does not overlap selected view", () => {
    const futureOnly = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: 150,
        period_start: "2026-02-01",
        period_end: "2026-02-28",
      }),
    ];

    expect(
      sumMySavingsTargetForView(futureOnly, "1_14", selectedYear, selectedMonth)
    ).toBe(0);
  });

  it("15_eom includes active 15_eom target for selected view", () => {
    const active = [
      participant({
        contribution_period: "15_eom",
        target_contribution_amount: 250,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      }),
    ];

    expect(
      sumMySavingsTargetForView(active, "15_eom", selectedYear, selectedMonth)
    ).toBe(250);
  });

  it("15_eom excludes 15_eom target whose date range does not overlap selected view", () => {
    const expired = [
      participant({
        contribution_period: "15_eom",
        target_contribution_amount: 250,
        period_start: "2025-11-01",
        period_end: "2025-11-30",
      }),
    ];

    expect(
      sumMySavingsTargetForView(expired, "15_eom", selectedYear, selectedMonth)
    ).toBe(0);
  });

  it("full includes active 1_14, 15_eom, and monthly targets", () => {
    const active = [
      participant({
        id: "1",
        contribution_period: "1_14",
        target_contribution_amount: 100,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      }),
      participant({
        id: "2",
        contribution_period: "15_eom",
        target_contribution_amount: 200,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      }),
      participant({
        id: "3",
        contribution_period: "monthly",
        target_contribution_amount: 300,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      }),
    ];

    expect(
      sumMySavingsTargetForView(active, "full", selectedYear, selectedMonth)
    ).toBe(600);
  });

  it("monthly is excluded from single-period views", () => {
    const monthlyOnly = [
      participant({
        contribution_period: "monthly",
        target_contribution_amount: 300,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      }),
    ];

    expect(
      sumMySavingsTargetForView(monthlyOnly, "1_14", selectedYear, selectedMonth)
    ).toBe(0);
    expect(
      sumMySavingsTargetForView(monthlyOnly, "15_eom", selectedYear, selectedMonth)
    ).toBe(0);
  });

  it("no period_start / period_end means generally active", () => {
    const generallyActive = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: 80,
        period_start: null,
        period_end: null,
      }),
    ];

    expect(
      sumMySavingsTargetForView(
        generallyActive,
        "1_14",
        selectedYear,
        selectedMonth
      )
    ).toBe(80);
  });

  it("only period_start works", () => {
    const startOnly = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: 90,
        period_start: "2026-01-10",
        period_end: null,
      }),
    ];

    expect(
      sumMySavingsTargetForView(startOnly, "1_14", selectedYear, selectedMonth)
    ).toBe(90);
    expect(
      sumMySavingsTargetForView(startOnly, "1_14", 2025, 12)
    ).toBe(0);
  });

  it("only period_end works", () => {
    const endOnly = [
      participant({
        contribution_period: "15_eom",
        target_contribution_amount: 110,
        period_start: null,
        period_end: "2026-01-20",
      }),
    ];

    expect(
      sumMySavingsTargetForView(endOnly, "15_eom", selectedYear, selectedMonth)
    ).toBe(110);
    expect(
      sumMySavingsTargetForView(endOnly, "15_eom", 2026, 2)
    ).toBe(0);
  });

  it("both dates use overlap logic", () => {
    const overlapping = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: 120,
        period_start: "2026-01-05",
        period_end: "2026-01-10",
      }),
    ];
    const nonOverlapping = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: 120,
        period_start: "2026-01-20",
        period_end: "2026-01-25",
      }),
    ];

    expect(
      sumMySavingsTargetForView(overlapping, "1_14", selectedYear, selectedMonth)
    ).toBe(120);
    expect(
      sumMySavingsTargetForView(nonOverlapping, "1_14", selectedYear, selectedMonth)
    ).toBe(0);
  });

  it("selected previous month does not include a future-only target", () => {
    const futureOnly = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: 200,
        period_start: "2026-03-01",
        period_end: "2026-06-30",
      }),
    ];

    expect(
      sumMySavingsTargetForView(futureOnly, "1_14", selectedYear, selectedMonth)
    ).toBe(0);
    expect(
      sumMySavingsTargetForView(futureOnly, "full", selectedYear, selectedMonth)
    ).toBe(0);
  });

  it("selected future month does not include an expired target", () => {
    const expired = [
      participant({
        contribution_period: "15_eom",
        target_contribution_amount: 200,
        period_start: "2025-01-01",
        period_end: "2025-12-31",
      }),
    ];

    expect(
      sumMySavingsTargetForView(expired, "15_eom", 2026, 6)
    ).toBe(0);
    expect(
      sumMySavingsTargetForView(expired, "full", 2026, 6)
    ).toBe(0);
  });

  it("skips invalid amounts", () => {
    const withInvalid = [
      participant({ contribution_period: "1_14", target_contribution_amount: 50 }),
      participant({
        id: "bad",
        contribution_period: "1_14",
        target_contribution_amount: "invalid" as unknown as number,
      }),
    ];

    expect(
      sumMySavingsTargetForView(withInvalid, "1_14", selectedYear, selectedMonth)
    ).toBe(50);
  });

  it("returns zero when participants is empty", () => {
    expect(sumMySavingsTargetForView([], "full", selectedYear, selectedMonth)).toBe(0);
  });

  it("coerces string amounts from the database", () => {
    const withStrings = [
      participant({
        contribution_period: "1_14",
        target_contribution_amount: "75.50" as unknown as number,
      }),
      participant({
        id: "2",
        contribution_period: "15_eom",
        target_contribution_amount: "24.50" as unknown as number,
      }),
    ];

    expect(
      sumMySavingsTargetForView(withStrings, "full", selectedYear, selectedMonth)
    ).toBe(100);
  });
});

describe("getDashboardViewDateRange", () => {
  it("returns day 1 through 14 for 1_14 view", () => {
    expect(getDashboardViewDateRange("1_14", 2026, 1)).toEqual({
      start: "2026-01-01",
      end: "2026-01-14",
    });
  });

  it("returns day 15 through month end for 15_eom view", () => {
    expect(getDashboardViewDateRange("15_eom", 2026, 1)).toEqual({
      start: "2026-01-15",
      end: "2026-01-31",
    });
  });

  it("returns full month for full view", () => {
    expect(getDashboardViewDateRange("full", 2026, 1)).toEqual({
      start: "2026-01-01",
      end: "2026-01-31",
    });
  });

  it("handles leap-year February month end", () => {
    expect(getDashboardViewDateRange("15_eom", 2024, 2)).toEqual({
      start: "2024-02-15",
      end: "2024-02-29",
    });
    expect(getDashboardViewDateRange("full", 2024, 2)).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });
});

describe("sumMySavingsContributionsForView", () => {
  const selectedYear = 2026;
  const selectedMonth = 1;

  const participants = [
    participant({ id: "1", savings_goal_id: goalA, contribution_period: "1_14", target_contribution_amount: 100 }),
    participant({ id: "2", savings_goal_id: goalB, contribution_period: "15_eom", target_contribution_amount: 200 }),
    participant({ id: "3", savings_goal_id: "goal-c", contribution_period: "monthly", target_contribution_amount: 300 }),
  ];

  it("1_14 counts only contributions dated day 1-14 in selected month", () => {
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 40, contribution_date: "2026-01-10" }),
      contribution({ id: "2", savings_goal_id: goalA, amount: 25, contribution_date: "2026-01-14" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "1_14",
        selectedYear,
        selectedMonth
      )
    ).toBe(65);
  });

  it("1_14 ignores day 15+ contributions", () => {
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 40, contribution_date: "2026-01-15" }),
      contribution({ id: "2", savings_goal_id: goalA, amount: 25, contribution_date: "2026-01-31" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "1_14",
        selectedYear,
        selectedMonth
      )
    ).toBe(0);
  });

  it("15_eom counts only contributions dated day 15-end of selected month", () => {
    const contributions = [
      contribution({ savings_goal_id: goalB, amount: 75, contribution_date: "2026-01-15" }),
      contribution({ id: "2", savings_goal_id: goalB, amount: 25, contribution_date: "2026-01-31" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "15_eom",
        selectedYear,
        selectedMonth
      )
    ).toBe(100);
  });

  it("15_eom ignores day 1-14 contributions", () => {
    const contributions = [
      contribution({ savings_goal_id: goalB, amount: 75, contribution_date: "2026-01-14" }),
      contribution({ id: "2", savings_goal_id: goalB, amount: 25, contribution_date: "2026-01-01" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "15_eom",
        selectedYear,
        selectedMonth
      )
    ).toBe(0);
  });

  it("full counts all selected-month contributions for 1_14, 15_eom, and monthly participant periods", () => {
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 10, contribution_date: "2026-01-05" }),
      contribution({ id: "2", savings_goal_id: goalB, amount: 20, contribution_date: "2026-01-20" }),
      contribution({ id: "3", savings_goal_id: "goal-c", amount: 30, contribution_date: "2026-01-25" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "full",
        selectedYear,
        selectedMonth
      )
    ).toBe(60);
  });

  it("full ignores previous-month contributions", () => {
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 50, contribution_date: "2025-12-31" }),
      contribution({ id: "2", savings_goal_id: goalB, amount: 40, contribution_date: "2026-01-10" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "full",
        selectedYear,
        selectedMonth
      )
    ).toBe(40);
  });

  it("full ignores next-month contributions", () => {
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 50, contribution_date: "2026-02-01" }),
      contribution({ id: "2", savings_goal_id: goalB, amount: 40, contribution_date: "2026-01-20" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "full",
        selectedYear,
        selectedMonth
      )
    ).toBe(40);
  });

  it("excludes monthly contributions from single-period views", () => {
    const contributions = [
      contribution({ savings_goal_id: "goal-c", amount: 50, contribution_date: "2026-01-10" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "1_14",
        selectedYear,
        selectedMonth
      )
    ).toBe(0);
    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "15_eom",
        selectedYear,
        selectedMonth
      )
    ).toBe(0);
  });

  it("ignores contributions without a matching participant", () => {
    const contributions = [
      contribution({ savings_goal_id: "unknown-goal", amount: 100, contribution_date: "2026-01-10" }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "full",
        selectedYear,
        selectedMonth
      )
    ).toBe(0);
  });

  it("skips invalid amounts", () => {
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 25, contribution_date: "2026-01-10" }),
      contribution({
        id: "bad",
        savings_goal_id: goalA,
        amount: "invalid" as unknown as number,
        contribution_date: "2026-01-11",
      }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "1_14",
        selectedYear,
        selectedMonth
      )
    ).toBe(25);
  });

  it("returns zero when contributions is empty", () => {
    expect(
      sumMySavingsContributionsForView([], participants, "full", selectedYear, selectedMonth)
    ).toBe(0);
  });

  it("coerces string amounts from the database", () => {
    const contributions = [
      contribution({
        savings_goal_id: goalA,
        amount: "12.50" as unknown as number,
        contribution_date: "2026-01-10",
      }),
    ];

    expect(
      sumMySavingsContributionsForView(
        contributions,
        participants,
        "1_14",
        selectedYear,
        selectedMonth
      )
    ).toBe(12.5);
  });

  it("counts leap-year February contributions through month end in 15_eom view", () => {
    const febParticipants = [
      participant({
        savings_goal_id: goalA,
        contribution_period: "15_eom",
        target_contribution_amount: 100,
      }),
    ];
    const contributions = [
      contribution({ savings_goal_id: goalA, amount: 30, contribution_date: "2024-02-29" }),
      contribution({ id: "2", savings_goal_id: goalA, amount: 20, contribution_date: "2024-02-14" }),
    ];

    expect(
      sumMySavingsContributionsForView(contributions, febParticipants, "15_eom", 2024, 2)
    ).toBe(30);
  });
});

describe("calculateRemainingSavingsObligation", () => {
  it("returns target minus contributions", () => {
    expect(calculateRemainingSavingsObligation(300, 100)).toBe(200);
  });

  it("returns zero when target equals contributions", () => {
    expect(calculateRemainingSavingsObligation(500, 500)).toBe(0);
  });

  it("returns zero on over-contribution", () => {
    expect(calculateRemainingSavingsObligation(200, 350)).toBe(0);
  });

  it("handles zero target", () => {
    expect(calculateRemainingSavingsObligation(0, 50)).toBe(0);
  });

  it("coerces numeric strings", () => {
    expect(calculateRemainingSavingsObligation("300", "100")).toBe(200);
  });
});

describe("calculateSafeToSpendAfterSavings", () => {
  it("returns positive safe-to-spend after savings", () => {
    expect(calculateSafeToSpendAfterSavings(1000, 300)).toBe(700);
  });

  it("returns zero safe-to-spend after savings", () => {
    expect(calculateSafeToSpendAfterSavings(500, 500)).toBe(0);
  });

  it("returns negative safe-to-spend after savings", () => {
    expect(calculateSafeToSpendAfterSavings(200, 350)).toBe(-150);
  });

  it("subtracts remaining obligation, not full target", () => {
    const beforeSavings = 1000;
    const target = 500;
    const contributed = 200;
    const remaining = calculateRemainingSavingsObligation(target, contributed);

    expect(calculateSafeToSpendAfterSavings(beforeSavings, remaining)).toBe(700);
    expect(calculateSafeToSpendAfterSavings(beforeSavings, target)).toBe(500);
  });
});
