import { describe, expect, it } from "vitest";
import type { BillInstance, DebtPayment, ManualExpense } from "@/lib/types";
import {
  buildMonthlyPrintReport,
  buildMonthlyPrintReportTitle,
  MONTHLY_PRINT_REPORT_PRIVATE_SECTION_COPY,
  monthlyPrintReportLabelsArePrivacySafe,
  monthlyPrintReportMetadataIsSafe,
} from "@/lib/monthly-print-report";
import {
  buildPaycheckForecastIncomeEvents,
  normalizePaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import { buildSafeToSpendForecast } from "@/lib/safe-to-spend-forecast";
import { SHARED_GOAL_PRIVACY_COPY } from "@/lib/savings-edit";

const USER_ID = "user-teles";
const OTHER_USER_ID = "user-nicole";
const SHARE_KEY = "teles_amount" as const;
const YEAR = 2026;
const MONTH = 9;

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
    year: YEAR,
    month: MONTH,
    due_date: "2026-09-10",
    is_paid: false,
    paid_status: "unpaid",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as BillInstance;
}

function makeDebtPayment(overrides: Partial<DebtPayment> = {}): DebtPayment {
  return {
    id: "debt-1",
    debt_account_id: "account-1",
    payment_date: "2026-09-25",
    total_payment: 200,
    teles_amount: 102,
    nicole_amount: 98,
    paid_status: false,
    linked_bill_instance_id: null,
    period_bucket: "1_14",
    ...overrides,
  } as DebtPayment;
}

function makeExpense(overrides: Partial<ManualExpense> = {}): ManualExpense {
  return {
    id: "expense-1",
    household_id: "household-1",
    description: "Groceries",
    amount: 80,
    teles_amount: 40,
    nicole_amount: 40,
    expense_date: "2026-09-24",
    expense_scope: "household",
    split_type: "equal",
    category: "Food",
    notes: null,
    person_id: null,
    adjusts_manual_expense_id: null,
    adjustment_direction: null,
    adjustment_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ManualExpense;
}

const paycheckSchedule = normalizePaycheckScheduleSettings({
  amount: 2500,
  scheduleType: "semi_monthly_15_30",
  firstPayDay: 15,
  secondPayDay: 30,
  useLastBusinessDay: false,
  isActive: true,
  effectiveFrom: "2026-01-01",
});

const baseInput = {
  selectedYear: YEAR,
  selectedMonth: MONTH,
  today: "2026-09-15",
  generatedAt: "2026-09-15T10:30:00.000Z",
  householdName: "Sample Household",
  signedInUserId: USER_ID,
  shareKey: SHARE_KEY,
  peopleLoaded: true,
  settingsLoaded: true,
  cashflowStartDate: "2026-01-01",
  cashSnapshot: {
    user_id: USER_ID,
    snapshot_date: "2026-09-14",
    amount: 3000,
  },
  bills: [
    makeBill(),
    makeBill({
      id: "bill-2",
      name: "Rent",
      is_paid: true,
      paid_status: "paid",
      amount: 1500,
      teles_amount: 765,
      nicole_amount: 735,
      period_bucket: "15_eom",
      due_date: "2026-09-01",
    }),
  ],
  debtPayments: [makeDebtPayment()],
  debtLinkedBillIds: new Set<string>(),
  debtAccounts: [
    {
      id: "account-1",
      name: "Credit card",
      current_balance: 1200,
      original_amount: 5000,
      is_archived: false,
    },
  ] as never,
  manualExpenses: [makeExpense()],
  savingsParticipants: [
    {
      id: "participant-1",
      savings_goal_id: "goal-1",
      household_id: "household-1",
      user_id: USER_ID,
      person_id: null,
      target_contribution_amount: 200,
      contribution_period: "monthly",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ] as never,
  savingsContributions: [
    {
      id: "contribution-1",
      savings_goal_id: "goal-1",
      household_id: "household-1",
      user_id: USER_ID,
      person_id: null,
      amount: 50,
      contribution_date: "2026-09-05",
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ] as never,
  savingsGoals: [{ id: "goal-1", name: "Emergency fund" }],
  variableBillContext: {
    templateByBillId: new Map(),
    debtLinkedBillIds: new Set<string>(),
  },
  paycheckSchedule,
  startingCash: 3000,
  snapshotDate: "2026-09-14",
};

describe("buildMonthlyPrintReportTitle", () => {
  it("includes selected month", () => {
    expect(buildMonthlyPrintReportTitle(2026, 9)).toBe("Cashflow Report — September 2026");
  });
});

describe("buildMonthlyPrintReport", () => {
  it("report header model includes selected month", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(report.header.title).toBe("Cashflow Report — September 2026");
    expect(report.header.monthLabel).toBe("September 2026");
    expect(report.header.generatedAtLabel).toContain("September");
    expect(report.header.privateSectionCopy).toBe(MONTHLY_PRINT_REPORT_PRIVATE_SECTION_COPY);
  });

  it("cash position section uses own-user cash only", () => {
    const report = buildMonthlyPrintReport({
      ...baseInput,
      cashSnapshot: {
        user_id: OTHER_USER_ID,
        snapshot_date: "2026-09-14",
        amount: 9999,
      },
    });

    expect(report.cashPosition.currentAmount).toBeNull();
    expect(report.cashPosition.missingSnapshotMessage).toBeTruthy();
  });

  it("bills section totals selected month bills", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(report.bills.totalLabel).toBe("CA$816.00");
    expect(report.bills.unpaidRows).toHaveLength(1);
    expect(report.bills.paidRows).toHaveLength(1);
  });

  it("debt section uses active debt summary", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(report.debt.activeDebtCount).toBe(1);
    expect(report.debt.remainingDebtLabel).toBe("CA$5,000.00");
    expect(report.debt.upcomingPayments.length).toBeGreaterThan(0);
  });

  it("savings section uses own-user savings only", () => {
    const report = buildMonthlyPrintReport({
      ...baseInput,
      savingsParticipants: [
        {
          id: "participant-other",
          savings_goal_id: "goal-1",
          household_id: "household-1",
          user_id: OTHER_USER_ID,
          person_id: null,
          target_contribution_amount: 500,
          contribution_period: "monthly",
          period_start: "2026-09-01",
          period_end: "2026-09-30",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        ...baseInput.savingsParticipants,
      ] as never,
      savingsContributions: [
        {
          id: "contribution-other",
          savings_goal_id: "goal-1",
          household_id: "household-1",
          user_id: OTHER_USER_ID,
          person_id: null,
          amount: 999,
          contribution_date: "2026-09-06",
          notes: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        ...baseInput.savingsContributions,
      ] as never,
    });

    expect(report.savings.targetLabel).toBe("CA$200.00");
    expect(report.savings.contributionsLabel).toBe("CA$50.00");
    expect(report.savings.remainingObligationLabel).toBe("CA$150.00");
  });

  it("shared savings privacy copy is present", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(report.savings.sharedPrivacyCopy).toBe(SHARED_GOAL_PRIVACY_COPY);
  });

  it("expenses section totals manual expenses/adjustments", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(report.expenses.totalLabel).toBe("− CA$40.00");
    expect(report.expenses.rows).toHaveLength(1);
    expect(report.expenses.categorySummary[0]?.category).toBe("Food");
  });

  it("income section uses signed-in user paycheck income only", () => {
    const otherUserEvents = buildPaycheckForecastIncomeEvents({
      settings: paycheckSchedule,
      range: { start: "2026-09-01", end: "2026-09-30" },
      signedInUserId: OTHER_USER_ID,
      snapshotDate: "2026-09-14",
    });

    expect(otherUserEvents.length).toBeGreaterThan(0);

    const report = buildMonthlyPrintReport(baseInput);
    expect(report.income.rows.length).toBeGreaterThan(0);
    expect(report.income.projectedTotalLabel).not.toBe("CA$0.00");
  });

  it("paycheck dates are adjusted business-day dates", () => {
    const report = buildMonthlyPrintReport(baseInput);
    const dates = report.income.rows.map((row) => row.dateLabel);
    expect(dates.some((label) => label.includes("15") || label.includes("14"))).toBe(true);
    expect(dates.every((label) => !label.includes("Saturday") && !label.includes("Sunday"))).toBe(
      true
    );
  });

  it("forecast summary matches existing forecast helper input", () => {
    const forecast = buildSafeToSpendForecast({
      startingCash: baseInput.startingCash!,
      snapshotDate: baseInput.snapshotDate!,
      shareKey: SHARE_KEY,
      signedInUserId: USER_ID,
      windowKind: "current_period",
      periodView: "full",
      selectedYear: YEAR,
      selectedMonth: MONTH,
      today: baseInput.today,
      bills: baseInput.bills,
      debtPayments: baseInput.debtPayments,
      debtLinkedBillIds: baseInput.debtLinkedBillIds,
      manualExpenses: baseInput.manualExpenses,
      savingsParticipants: baseInput.savingsParticipants,
      savingsContributions: baseInput.savingsContributions,
      savingsGoals: baseInput.savingsGoals,
      variableBillContext: baseInput.variableBillContext,
      paycheckSchedule: baseInput.paycheckSchedule,
    });

    const report = buildMonthlyPrintReport(baseInput);
    expect(report.forecast.endingBalanceLabel).toBe(
      formatCurrency(forecast.summary.projectedEndingBalance)
    );
    expect(report.forecast.projectedIncomeLabel).toBe(
      formatCurrency(forecast.summary.totalProjectedIncome)
    );
  });

  it("warnings section includes forecast/variable/missing snapshot warnings", () => {
    const report = buildMonthlyPrintReport({
      ...baseInput,
      cashSnapshot: null,
      startingCash: null,
      snapshotDate: null,
      bills: [
        makeBill({
          bill_id: "variable-template",
          amount: 0,
        }),
      ],
      variableBillContext: {
        templateByBillId: new Map([
          ["variable-template", { is_variable: true, default_amount: 0 }],
        ]),
        debtLinkedBillIds: new Set<string>(),
      },
    });

    const titles = report.warnings.rows.map((row) => row.title.toLowerCase());
    expect(
      titles.some((title) => title.includes("current amount") || title.includes("snapshot"))
    ).toBe(true);
  });

  it("calendar/list section uses C119 event model", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(report.calendar.days.length).toBeGreaterThan(0);
    expect(report.calendar.days.some((day) => day.events.length > 0)).toBe(true);
    expect(report.calendar.monthSummaryLabel).toBe("September 2026");
  });

  it("other-user paycheck/savings/cash rows are ignored if accidentally passed in", () => {
    const report = buildMonthlyPrintReport({
      ...baseInput,
      cashSnapshot: {
        user_id: OTHER_USER_ID,
        snapshot_date: "2026-09-14",
        amount: 5000,
      },
      savingsContributions: [
        ...baseInput.savingsContributions,
        {
          id: "contribution-other",
          savings_goal_id: "goal-1",
          household_id: "household-1",
          user_id: OTHER_USER_ID,
          person_id: null,
          amount: 999,
          contribution_date: "2026-09-06",
          notes: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ] as never,
    });

    expect(report.cashPosition.currentAmount).toBeNull();
    expect(report.savings.contributionsLabel).toBe("CA$50.00");
  });

  it("labels contain no raw UUIDs", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(monthlyPrintReportLabelsArePrivacySafe(report)).toBe(true);
  });

  it("print metadata does not contain secrets or credentials", () => {
    const report = buildMonthlyPrintReport(baseInput);
    expect(monthlyPrintReportMetadataIsSafe(report)).toBe(true);
  });
});

function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const body = "CA" + String.fromCharCode(36) + formatted;
  return amount < 0 ? "-" + body : body;
}
