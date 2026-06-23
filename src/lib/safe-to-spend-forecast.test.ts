import { describe, expect, it } from "vitest";
import type { BillInstance, DebtPayment, ManualExpense } from "@/lib/types";
import {
  buildDaysDateRange,
  buildForecastWindowDefinition,
  buildNextMonthDateRange,
  buildRestOfMonthDateRange,
  buildSafeToSpendForecast,
  forecastEventLabelsArePrivacySafe,
  FORECAST_INCOME_DEFERRED_LABEL,
  FORECAST_MISSING_CASH_LABEL,
  FORECAST_MISSING_PROFILE_LABEL,
  getYearMonthKeysInDateRange,
} from "@/lib/safe-to-spend-forecast";

const TODAY = "2026-06-22";
const SHARE_KEY = "teles_amount" as const;
const USER_ID = "user-teles";

function makeBill(overrides: Partial<BillInstance> = {}): BillInstance {
  return {
    id: "bill-1",
    household_id: "household-1",
    bill_id: "template-1",
    name: "Internet",
    amount: 100,
    teles_amount: 51,
    nicole_amount: 49,
    period_bucket: "1_14",
    year: 2026,
    month: 6,
    due_date: "2026-06-10",
    is_paid: false,
    paid_status: "unpaid",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as BillInstance;
}

function makeDebtPayment(
  overrides: Partial<DebtPayment> = {}
): Pick<
  DebtPayment,
  | "id"
  | "debt_account_id"
  | "payment_date"
  | "total_payment"
  | "teles_amount"
  | "nicole_amount"
  | "paid_status"
  | "linked_bill_instance_id"
  | "period_bucket"
> {
  return {
    id: "debt-1",
    debt_account_id: "account-1",
    payment_date: "2026-06-25",
    total_payment: 200,
    teles_amount: 102,
    nicole_amount: 98,
    paid_status: false,
    linked_bill_instance_id: null,
    period_bucket: "1_14",
    ...overrides,
  };
}

function makeExpense(overrides: Partial<ManualExpense> = {}): ManualExpense {
  return {
    id: "expense-1",
    household_id: "household-1",
    description: "Groceries",
    amount: 80,
    teles_amount: 40,
    nicole_amount: 40,
    expense_date: "2026-06-24",
    expense_scope: "household",
    split_type: "equal",
    category: null,
    notes: null,
    person_id: null,
    adjusts_manual_expense_id: null,
    adjustment_direction: null,
    adjustment_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ManualExpense;
}

const baseInput = {
  startingCash: 1000,
  snapshotDate: "2026-06-20",
  shareKey: SHARE_KEY,
  signedInUserId: USER_ID,
  windowKind: "days_30" as const,
  periodView: "full" as const,
  selectedYear: 2026,
  selectedMonth: 6,
  today: TODAY,
  bills: [] as BillInstance[],
  debtPayments: [] as ReturnType<typeof makeDebtPayment>[],
  debtLinkedBillIds: new Set<string>(),
  manualExpenses: [] as ManualExpense[],
  savingsParticipants: [],
  savingsContributions: [],
  variableBillContext: {
    templateByBillId: new Map(),
    debtLinkedBillIds: new Set<string>(),
  },
};

describe("safe-to-spend forecast windows", () => {
  it("builds current period window from dashboard selection", () => {
    const window = buildForecastWindowDefinition({
      kind: "current_period",
      periodView: "1_14",
      selectedYear: 2026,
      selectedMonth: 6,
      today: TODAY,
    });

    expect(window.dateRange).toEqual({ start: "2026-06-01", end: "2026-06-14" });
  });

  it("builds rest-of-month window from today through month end", () => {
    expect(buildRestOfMonthDateRange(TODAY)).toEqual({
      start: "2026-06-22",
      end: "2026-06-30",
    });
  });

  it("builds next-month window for the following calendar month", () => {
    expect(buildNextMonthDateRange(TODAY)).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });

  it("builds configurable day windows", () => {
    expect(buildDaysDateRange(30, TODAY)).toEqual({
      start: "2026-06-22",
      end: "2026-07-21",
    });
    expect(buildDaysDateRange(60, TODAY)).toEqual({
      start: "2026-06-22",
      end: "2026-08-20",
    });
    expect(buildDaysDateRange(90, TODAY)).toEqual({
      start: "2026-06-22",
      end: "2026-09-19",
    });
  });

  it("lists year-month keys across multi-month ranges", () => {
    expect(
      getYearMonthKeysInDateRange({ start: "2026-06-22", end: "2026-08-01" })
    ).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });
});

describe("buildSafeToSpendForecast", () => {
  it("starts from signed-in user current cash", () => {
    const result = buildSafeToSpendForecast(baseInput);

    expect(result.summary.startingCash).toBe(1000);
    expect(result.events[0]).toMatchObject({
      type: "starting_balance",
      projectedBalance: 1000,
    });
  });

  it("includes unpaid bills within the window and excludes paid or out-of-window bills", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      bills: [
        makeBill({ id: "in-window", due_date: "2026-06-25", teles_amount: 50 }),
        makeBill({
          id: "paid",
          due_date: "2026-06-26",
          teles_amount: 40,
          is_paid: true,
        }),
        makeBill({
          id: "outside",
          due_date: "2026-08-01",
          teles_amount: 30,
        }),
      ],
    });

    const billEvents = result.events.filter((event) => event.type === "bill");
    expect(billEvents).toHaveLength(1);
    expect(billEvents[0]?.label).toBe("Internet");
    expect(billEvents[0]?.signedAmount).toBe(50);
  });

  it("dedupes debt-linked bill and debt payment rows", () => {
    const linkedBill = makeBill({
      id: "linked-bill",
      due_date: "2026-06-28",
      teles_amount: 75,
    });

    const result = buildSafeToSpendForecast({
      ...baseInput,
      bills: [linkedBill],
      debtLinkedBillIds: new Set(["linked-bill"]),
      debtPayments: [
        makeDebtPayment({
          id: "linked-debt",
          linked_bill_instance_id: "linked-bill",
          teles_amount: 75,
          payment_date: "2026-06-28",
        }),
        makeDebtPayment({
          id: "standalone-debt",
          payment_date: "2026-06-29",
          teles_amount: 25,
        }),
      ],
    });

    expect(result.events.filter((event) => event.type === "bill")).toHaveLength(1);
    expect(result.events.filter((event) => event.type === "debt_payment")).toHaveLength(1);
    expect(
      result.events.find((event) => event.type === "bill")?.sourceLabel
    ).toBe("Debt-linked bill");
  });

  it("includes own savings obligations and excludes other-user rows passed accidentally", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      windowKind: "current_period",
      savingsParticipants: [
        {
          id: "mine",
          savings_goal_id: "goal-1",
          user_id: USER_ID,
          person_id: null,
          target_contribution_amount: 100,
          contribution_period: "15_eom",
          period_start: null,
          period_end: null,
          household_id: "household-1",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "other",
          savings_goal_id: "goal-2",
          user_id: "user-other",
          person_id: null,
          target_contribution_amount: 500,
          contribution_period: "15_eom",
          period_start: null,
          period_end: null,
          household_id: "household-1",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      savingsContributions: [],
      savingsGoals: [{ id: "goal-1", name: "Emergency fund" }],
    });

    const savingsEvents = result.events.filter(
      (event) => event.type === "savings_obligation"
    );
    expect(savingsEvents).toHaveLength(1);
    expect(savingsEvents[0]?.signedAmount).toBe(100);
  });

  it("includes manual expenses after snapshot using dashboard rules", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      manualExpenses: [
        makeExpense({ id: "counted", expense_date: "2026-06-24", teles_amount: 20 }),
        makeExpense({
          id: "before-snapshot",
          expense_date: "2026-06-18",
          teles_amount: 99,
        }),
        makeExpense({
          id: "deducted",
          expense_date: "2026-06-24",
          teles_amount: 99,
        }),
      ],
      deductedManualExpenseIds: new Set(["deducted"]),
    });

    const expenseEvents = result.events.filter(
      (event) => event.type === "manual_expense"
    );
    expect(expenseEvents).toHaveLength(1);
    expect(expenseEvents[0]?.signedAmount).toBe(20);
  });

  it("sorts events by date and computes running balance with shortfall detection", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      startingCash: 100,
      bills: [
        makeBill({ id: "b1", due_date: "2026-06-30", teles_amount: 80 }),
        makeBill({ id: "b2", due_date: "2026-06-24", teles_amount: 50 }),
      ],
    });

    const obligationEvents = result.events.filter(
      (event) => event.type !== "starting_balance"
    );
    expect(obligationEvents.map((event) => event.date)).toEqual([
      "2026-06-24",
      "2026-06-30",
    ]);
    expect(result.summary.lowestProjectedBalance).toBe(-30);
    expect(result.summary.firstShortfallDate).toBe("2026-06-30");
    expect(result.summary.hasShortfall).toBe(true);
  });

  it("surfaces variable bill unconfirmed warnings", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      bills: [
        makeBill({
          id: "variable",
          bill_id: "template-var",
          due_date: "2026-06-24",
          amount: 50,
          teles_amount: 25,
        }),
      ],
      variableBillContext: {
        templateByBillId: new Map([
          ["template-var", { is_variable: true, default_amount: 50 }],
        ]),
        debtLinkedBillIds: new Set(),
      },
    });

    expect(result.summary.incompleteVariableBillCount).toBe(1);
    expect(result.summary.isIncomplete).toBe(true);
    expect(
      result.events.find((event) => event.type === "bill")?.warningLabels
    ).toContain("Variable bill amount unconfirmed");
  });

  it("uses privacy-safe labels without raw UUIDs", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      bills: [
        makeBill({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Power bill",
          due_date: "2026-06-24",
          teles_amount: 10,
        }),
      ],
    });

    expect(forecastEventLabelsArePrivacySafe(result.events)).toBe(true);
    expect(result.events.some((event) => event.label.includes("bbbb"))).toBe(false);
  });

  it("shows deferred income fallback instead of guessing paychecks", () => {
    const result = buildSafeToSpendForecast(baseInput);

    expect(result.summary.incomeStatus).toBe("deferred");
    expect(result.summary.incomeLabel).toBe(FORECAST_INCOME_DEFERRED_LABEL);
    expect(result.events.some((event) => event.type === "income")).toBe(false);
  });

  it("returns missing profile state when share key is unavailable", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      shareKey: null,
    });

    expect(result.emptyStateMessage).toBe(FORECAST_MISSING_PROFILE_LABEL);
  });

  it("returns missing cash state when snapshot is unavailable", () => {
    const result = buildSafeToSpendForecast({
      ...baseInput,
      startingCash: null,
      snapshotDate: null,
    });

    expect(result.emptyStateMessage).toBe(FORECAST_MISSING_CASH_LABEL);
  });
});
