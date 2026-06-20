import { describe, expect, it } from "vitest";
import type { SavingsContribution } from "@/lib/types";
import {
  filterMyContributionsForGoal,
  sumMyContributionsForGoal,
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
