import { describe, expect, it } from "vitest";
import {
  buildBillDrilldownRows,
  buildExpenseDrilldownRows,
  buildMySavingsDrilldownRows,
  filterBillsForDashboardView,
  filterManualExpensesCountedInDashboardView,
} from "@/lib/dashboard-drilldowns";
import type {
  BillInstance,
  ManualExpense,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";

function makeBill(
  overrides: Partial<BillInstance> & Pick<BillInstance, "id" | "name">
): BillInstance {
  return {
    id: overrides.id,
    bill_id: overrides.bill_id ?? null,
    household_id: "household-1",
    name: overrides.name,
    amount: overrides.amount ?? 100,
    teles_amount: overrides.teles_amount ?? 51,
    nicole_amount: overrides.nicole_amount ?? 49,
    year: overrides.year ?? 2026,
    month: overrides.month ?? 6,
    period_bucket: overrides.period_bucket ?? "1_14",
    due_date: overrides.due_date ?? "2026-06-10",
    is_paid: overrides.is_paid ?? false,
    paid_status: overrides.paid_status ?? (overrides.is_paid ? "paid" : "unpaid"),
    paid_at: overrides.paid_at ?? null,
    paid_by_user_id: overrides.paid_by_user_id ?? null,
    notes: overrides.notes ?? null,
    created_at: overrides.created_at ?? "2026-06-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-01T00:00:00.000Z",
  };
}

function makeExpense(
  overrides: Partial<ManualExpense> & Pick<ManualExpense, "id" | "description">
): ManualExpense {
  return {
    id: overrides.id,
    household_id: "household-1",
    created_by_user_id: "user-1",
    person_id: null,
    expense_scope: overrides.expense_scope ?? "private",
    description: overrides.description,
    category: overrides.category ?? null,
    amount: overrides.amount ?? 100,
    expense_date: overrides.expense_date ?? "2026-06-15",
    period_bucket: overrides.period_bucket ?? "15_eom",
    split_type: overrides.split_type ?? "personal",
    teles_amount: overrides.teles_amount ?? 100,
    nicole_amount: overrides.nicole_amount ?? 0,
    is_paid: overrides.is_paid ?? false,
    paid_at: overrides.paid_at ?? null,
    notes: overrides.notes ?? null,
    adjusts_manual_expense_id: overrides.adjusts_manual_expense_id ?? null,
    adjustment_direction: overrides.adjustment_direction ?? null,
    adjustment_reason: overrides.adjustment_reason ?? null,
    created_at: overrides.created_at ?? "2026-06-15T10:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-15T10:00:00.000Z",
  };
}

function makeParticipant(
  overrides: Partial<SavingsGoalParticipant> &
    Pick<SavingsGoalParticipant, "id" | "savings_goal_id">
): SavingsGoalParticipant {
  return {
    id: overrides.id,
    savings_goal_id: overrides.savings_goal_id,
    household_id: "household-1",
    user_id: "user-1",
    person_id: null,
    target_contribution_amount: overrides.target_contribution_amount ?? 200,
    contribution_period: overrides.contribution_period ?? "1_14",
    period_start: overrides.period_start ?? null,
    period_end: overrides.period_end ?? null,
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
    user_id: "user-1",
    person_id: null,
    amount: overrides.amount ?? 50,
    contribution_date: overrides.contribution_date ?? "2026-06-05",
    notes: overrides.notes ?? null,
    created_at: overrides.created_at ?? "2026-06-05T10:00:00.000Z",
  };
}

describe("filterBillsForDashboardView", () => {
  const bills = [
    makeBill({ id: "b1", name: "Rent", period_bucket: "1_14", is_paid: false }),
    makeBill({ id: "b2", name: "Internet", period_bucket: "15_eom", is_paid: true }),
    makeBill({ id: "b3", name: "Phone", period_bucket: "1_14", is_paid: true }),
  ];

  it("returns all bills for full month view", () => {
    expect(filterBillsForDashboardView(bills, "full")).toHaveLength(3);
  });

  it("filters by period bucket", () => {
    expect(filterBillsForDashboardView(bills, "1_14")).toHaveLength(2);
    expect(filterBillsForDashboardView(bills, "15_eom")).toHaveLength(1);
  });

  it("can filter unpaid bills only", () => {
    expect(
      filterBillsForDashboardView(bills, "full", { unpaidOnly: true })
    ).toEqual([bills[0]]);
  });
});

describe("filterManualExpensesCountedInDashboardView", () => {
  const expenses = [
    makeExpense({ id: "e1", description: "Before snapshot", expense_date: "2026-06-01" }),
    makeExpense({ id: "e2", description: "After snapshot", expense_date: "2026-06-15" }),
    makeExpense({ id: "e3", description: "Paid through app", expense_date: "2026-06-16" }),
    makeExpense({ id: "e4", description: "Other period", expense_date: "2026-07-01" }),
  ];

  it("matches safe-to-spend expense counting rules", () => {
    const filtered = filterManualExpensesCountedInDashboardView(
      expenses,
      "full",
      2026,
      6,
      "2026-06-10",
      new Set(["e3"])
    );

    expect(filtered.map((expense) => expense.id)).toEqual(["e2"]);
  });
});

describe("buildExpenseDrilldownRows", () => {
  it("includes split and share details", () => {
    const rows = buildExpenseDrilldownRows(
      [makeExpense({ id: "e1", description: "Groceries", category: "Food" })],
      "teles_amount"
    );

    expect(rows[0]).toMatchObject({
      description: "Groceries",
      category: "Food",
      myShareAmount: 100,
      splitLabel: "Personal",
    });
  });
});

describe("buildBillDrilldownRows", () => {
  it("marks debt-linked bills", () => {
    const rows = buildBillDrilldownRows(
      [makeBill({ id: "b1", name: "Card payment" })],
      "teles_amount",
      new Set(["b1"])
    );

    expect(rows[0].isDebtLinked).toBe(true);
    expect(rows[0].myShareAmount).toBe(51);
  });
});

describe("buildMySavingsDrilldownRows", () => {
  const goals: Pick<SavingsGoal, "id" | "name" | "goal_type">[] = [
    { id: "goal-1", name: "Emergency fund", goal_type: "private" },
    { id: "goal-2", name: "Vacation", goal_type: "shared" },
  ];

  it("returns only the signed-in user's savings rows for the view", () => {
    const participants = [
      makeParticipant({
        id: "p1",
        savings_goal_id: "goal-1",
        contribution_period: "1_14",
        target_contribution_amount: 200,
      }),
    ];
    const contributions = [
      makeContribution({
        id: "c1",
        savings_goal_id: "goal-1",
        amount: 75,
        contribution_date: "2026-06-05",
      }),
      makeContribution({
        id: "c2",
        savings_goal_id: "goal-1",
        amount: 25,
        contribution_date: "2026-06-20",
      }),
    ];

    const rows = buildMySavingsDrilldownRows(
      participants,
      contributions,
      goals,
      "1_14",
      2026,
      6
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      goalLabel: "Emergency fund",
      isSharedGoal: false,
      targetAmount: 200,
      contributedAmount: 75,
      remainingObligation: 125,
    });
    expect(rows[0].contributions).toHaveLength(1);
  });

  it("does not include contributions outside the selected view", () => {
    const participants = [
      makeParticipant({
        id: "p1",
        savings_goal_id: "goal-2",
        contribution_period: "15_eom",
      }),
    ];
    const contributions = [
      makeContribution({
        id: "c1",
        savings_goal_id: "goal-2",
        contribution_date: "2026-06-16",
      }),
    ];

    const rows = buildMySavingsDrilldownRows(
      participants,
      contributions,
      goals,
      "15_eom",
      2026,
      6
    );

    expect(rows[0].contributions).toHaveLength(1);
    expect(
      buildMySavingsDrilldownRows(
        participants,
        contributions,
        goals,
        "1_14",
        2026,
        6
      )
    ).toHaveLength(0);
  });
});
