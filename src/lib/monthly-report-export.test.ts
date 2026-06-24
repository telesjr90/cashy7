import { describe, expect, it } from "vitest";
import {
  buildMonthlyReportCsv,
  buildMonthlyReportCsvFilename,
  buildMonthlyReportExportRows,
  monthlyReportExportLabelsArePrivacySafe,
  monthlyReportExportMetadataIsSafe,
  monthlyReportExportSections,
} from "@/lib/monthly-report-export";
import { CSV_EXPORT_COLUMNS } from "@/lib/csv-export";
import {
  buildMonthlyPrintReport,
  type BuildMonthlyPrintReportInput,
} from "@/lib/monthly-print-report";
import {
  buildPaycheckForecastIncomeEvents,
  normalizePaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import type { BillInstance, DebtPayment, ManualExpense } from "@/lib/types";

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

const baseInput: BuildMonthlyPrintReportInput = {
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

describe("buildMonthlyReportExportRows", () => {
  it("includes all required sections", () => {
    const report = buildMonthlyPrintReport(baseInput);
    const sections = monthlyReportExportSections(report);

    expect(sections.has("metadata")).toBe(true);
    expect(sections.has("cash_position")).toBe(true);
    expect(sections.has("bills")).toBe(true);
    expect(sections.has("debt")).toBe(true);
    expect(sections.has("savings")).toBe(true);
    expect(sections.has("expenses")).toBe(true);
    expect(sections.has("income")).toBe(true);
    expect(sections.has("forecast")).toBe(true);
    expect(sections.has("warnings")).toBe(true);
    expect(sections.has("calendar")).toBe(true);
  });

  it("income rows use adjusted paycheck dates", () => {
    const report = buildMonthlyPrintReport(baseInput);
    const incomeRows = buildMonthlyReportExportRows(report).filter(
      (row) => row.section === "income" && row.type === "paycheck"
    );

    expect(incomeRows.length).toBeGreaterThan(0);
    expect(
      incomeRows.every(
        (row) => !row.date.includes("Saturday") && !row.date.includes("Sunday")
      )
    ).toBe(true);

    const forecastEvents = buildPaycheckForecastIncomeEvents({
      settings: paycheckSchedule,
      range: { start: "2026-09-01", end: "2026-09-30" },
      signedInUserId: USER_ID,
      snapshotDate: "2026-09-14",
    });
    expect(incomeRows.length).toBe(forecastEvents.length);
  });

  it("savings rows include own-user values only", () => {
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

    const savingsRows = buildMonthlyReportExportRows(report).filter(
      (row) => row.section === "savings" && row.type === "summary"
    );

    expect(savingsRows.find((row) => row.title === "My savings target")?.amount).toBe(
      "CA$200.00"
    );
    expect(savingsRows.find((row) => row.title === "My contributions")?.amount).toBe(
      "CA$50.00"
    );
    expect(
      savingsRows.find((row) => row.title === "Remaining obligation")?.amount
    ).toBe("CA$150.00");
  });

  it("other-user paycheck, savings, and cash rows are ignored if accidentally passed in", () => {
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

    const rows = buildMonthlyReportExportRows(report);
    const cashRow = rows.find(
      (row) => row.section === "cash_position" && row.title === "Current cash"
    );
    const savingsRow = rows.find(
      (row) => row.section === "savings" && row.title === "My contributions"
    );

    expect(cashRow?.amount).toBe("");
    expect(savingsRow?.amount).toBe("CA$50.00");
  });

  it("warnings rows are included when present", () => {
    const report = buildMonthlyPrintReport({
      ...baseInput,
      cashSnapshot: null,
      startingCash: null,
      snapshotDate: null,
    });

    const warningRows = buildMonthlyReportExportRows(report).filter(
      (row) => row.section === "warnings"
    );
    expect(warningRows.length).toBeGreaterThan(0);
  });

  it("calendar and list events are included", () => {
    const report = buildMonthlyPrintReport(baseInput);
    const calendarRows = buildMonthlyReportExportRows(report).filter(
      (row) => row.section === "calendar"
    );

    expect(calendarRows.some((row) => row.type === "day_summary")).toBe(true);
    expect(calendarRows.some((row) => row.title === "Internet")).toBe(true);
  });

  it("export metadata contains selected month but no secrets", () => {
    const report = buildMonthlyPrintReport(baseInput);
    const csv = buildMonthlyReportCsv(report);
    const filename = buildMonthlyReportCsvFilename(YEAR, MONTH);

    expect(filename).toBe("cashflow-report-2026-09.csv");
    expect(csv).toContain("September 2026");
    expect(monthlyReportExportMetadataIsSafe(report, YEAR, MONTH)).toBe(true);
    expect(monthlyReportExportLabelsArePrivacySafe(report)).toBe(true);
  });

  it("generated CSV includes required headers", () => {
    const report = buildMonthlyPrintReport(baseInput);
    const csv = buildMonthlyReportCsv(report);
    expect(csv).toContain(CSV_EXPORT_COLUMNS.join(","));
  });
});
