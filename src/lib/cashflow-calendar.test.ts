import { describe, expect, it } from "vitest";
import type { BillInstance, DebtPayment, ManualExpense } from "@/lib/types";
import {
  buildCalendarGridDays,
  buildCashflowCalendar,
  buildMonthDateRange,
  calendarEventLabelsArePrivacySafe,
  chunkCalendarGridWeeks,
  formatCalendarEventTypeLabel,
  resolvePeriodBucketForDate,
} from "@/lib/cashflow-calendar";
import {
  buildPaycheckForecastIncomeEvents,
  normalizePaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";

const USER_ID = "user-teles";
const OTHER_USER_ID = "user-nicole";
const SHARE_KEY = "teles_amount" as const;
const YEAR = 2026;
const MONTH = 6;

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
  selectedYear: YEAR,
  selectedMonth: MONTH,
  today: "2026-06-22",
  shareKey: SHARE_KEY,
  signedInUserId: USER_ID,
  bills: [] as BillInstance[],
  debtPayments: [] as ReturnType<typeof makeDebtPayment>[],
  debtLinkedBillIds: new Set<string>(),
  manualExpenses: [] as ManualExpense[],
  savingsParticipants: [],
  savingsContributions: [],
  savingsGoals: [],
  variableBillContext: {
    templateByBillId: new Map(),
    debtLinkedBillIds: new Set<string>(),
  },
  startingCash: 1000,
  snapshotDate: "2026-06-20",
};

describe("buildMonthDateRange", () => {
  it("returns the full selected month", () => {
    expect(buildMonthDateRange(2026, 6)).toEqual({
      start: "2026-06-01",
      end: "2026-06-30",
    });
  });
});

describe("buildCalendarGridDays", () => {
  it("includes correct days and leading/trailing blanks for June 2026", () => {
    const cells = buildCalendarGridDays({ year: 2026, month: 6, today: "2026-06-22" });
    expect(cells[0].isCurrentMonth).toBe(false);
    expect(cells[0].date).toBeNull();
    expect(cells.filter((cell) => cell.isCurrentMonth)).toHaveLength(30);
    expect(cells.at(-1)?.isCurrentMonth).toBe(false);
    expect(chunkCalendarGridWeeks(cells).every((week) => week.length === 7)).toBe(true);
  });

  it("marks today on the matching cell", () => {
    const cells = buildCalendarGridDays({ year: 2026, month: 6, today: "2026-06-22" });
    const todayCell = cells.find((cell) => cell.date === "2026-06-22");
    expect(todayCell?.isToday).toBe(true);
  });
});

describe("resolvePeriodBucketForDate", () => {
  it("assigns period markers correctly", () => {
    expect(resolvePeriodBucketForDate("2026-06-01")).toBe("1_14");
    expect(resolvePeriodBucketForDate("2026-06-14")).toBe("1_14");
    expect(resolvePeriodBucketForDate("2026-06-15")).toBe("15_eom");
    expect(resolvePeriodBucketForDate("2026-06-30")).toBe("15_eom");
  });
});

describe("buildCashflowCalendar", () => {
  it("maps bill events to due dates", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      bills: [makeBill({ due_date: "2026-06-10" })],
    });

    const billEvents = result.allEvents.filter((event) => event.type === "bill");
    expect(billEvents).toHaveLength(1);
    expect(billEvents[0]?.date).toBe("2026-06-10");
    expect(billEvents[0]?.title).toBe("Internet");
  });

  it("maps debt payment events to payment dates", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      debtPayments: [makeDebtPayment({ payment_date: "2026-06-25" })],
      debtAccountNames: new Map([["account-1", "Credit card"]]),
    });

    const debtEvents = result.allEvents.filter((event) => event.type === "debt_payment");
    expect(debtEvents).toHaveLength(1);
    expect(debtEvents[0]?.date).toBe("2026-06-25");
    expect(debtEvents[0]?.title).toBe("Credit card");
  });

  it("does not double-count debt-linked bill/debt pair in net effect", () => {
    const linkedBill = makeBill({
      id: "linked-bill",
      due_date: "2026-06-12",
      teles_amount: 102,
    });
    const result = buildCashflowCalendar({
      ...baseInput,
      bills: [linkedBill],
      debtPayments: [
        makeDebtPayment({
          id: "linked-debt",
          payment_date: "2026-06-12",
          linked_bill_instance_id: "linked-bill",
          teles_amount: 102,
        }),
      ],
      debtLinkedBillIds: new Set(["linked-bill"]),
    });

    const daySummary = result.chronologicalDays.find((day) => day.date === "2026-06-12");
    expect(daySummary?.obligationTotal).toBe(102);
    expect(result.allEvents.filter((event) => event.type === "debt_payment")).toHaveLength(0);
    expect(result.allEvents.filter((event) => event.type === "bill")).toHaveLength(1);
  });

  it("maps expense events to expense dates", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      manualExpenses: [makeExpense({ expense_date: "2026-06-24" })],
    });

    const expenseEvents = result.allEvents.filter((event) => event.type === "expense");
    expect(expenseEvents).toHaveLength(1);
    expect(expenseEvents[0]?.date).toBe("2026-06-24");
  });

  it("uses own-user savings target/contribution only", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      savingsParticipants: [
        {
          id: "participant-own",
          savings_goal_id: "goal-1",
          user_id: USER_ID,
          household_id: "household-1",
          person_id: null,
          target_contribution_amount: 100,
          contribution_period: "1_14",
          period_start: "2026-06-01",
          period_end: "2026-06-14",
          created_at: "2026-01-01T00:00:00.000Z",
        } as never,
        {
          id: "participant-other",
          savings_goal_id: "goal-2",
          user_id: OTHER_USER_ID,
          household_id: "household-1",
          person_id: null,
          target_contribution_amount: 500,
          contribution_period: "1_14",
          period_start: "2026-06-01",
          period_end: "2026-06-14",
          created_at: "2026-01-01T00:00:00.000Z",
        } as never,
      ],
      savingsContributions: [
        {
          id: "contrib-own",
          savings_goal_id: "goal-1",
          user_id: USER_ID,
          amount: 25,
          contribution_date: "2026-06-05",
          created_at: "2026-01-01T00:00:00.000Z",
        } as never,
        {
          id: "contrib-other",
          savings_goal_id: "goal-2",
          user_id: OTHER_USER_ID,
          amount: 999,
          contribution_date: "2026-06-06",
          created_at: "2026-01-01T00:00:00.000Z",
        } as never,
      ],
      savingsGoals: [{ id: "goal-1", name: "Emergency fund" }],
    });

    const savingsEvents = result.allEvents.filter((event) => event.type === "savings");
    expect(savingsEvents.some((event) => event.title.includes("999"))).toBe(false);
    expect(savingsEvents.some((event) => event.title === "Emergency fund")).toBe(true);
    expect(savingsEvents.some((event) => event.title === "Your savings obligation")).toBe(
      true
    );
  });

  it("uses adjusted paycheck dates and signed-in user amount only", () => {
    const schedule = normalizePaycheckScheduleSettings({
      amount: 2500,
      scheduleType: "semi_monthly_15_30",
      firstPayDay: 15,
      secondPayDay: 30,
      useLastBusinessDay: false,
      isActive: true,
      effectiveFrom: null,
    });

    const incomeEvents = buildPaycheckForecastIncomeEvents({
      settings: schedule,
      range: buildMonthDateRange(YEAR, MONTH),
      signedInUserId: USER_ID,
      snapshotDate: "2026-06-01",
    });

    const result = buildCashflowCalendar({
      ...baseInput,
      paycheckSchedule: schedule,
      snapshotDate: "2026-06-01",
    });

    const calendarIncome = result.allEvents.filter((event) => event.type === "income");
    expect(calendarIncome.length).toBeGreaterThan(0);
    expect(calendarIncome.every((event) => event.amount === 2500)).toBe(true);
    expect(calendarIncome.map((event) => event.date)).toEqual(
      incomeEvents.map((event) => event.date)
    );
  });

  it("creates no income events when paycheck schedule is disabled", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      paycheckSchedule: normalizePaycheckScheduleSettings({
        amount: 0,
        scheduleType: "disabled",
        firstPayDay: null,
        secondPayDay: null,
        useLastBusinessDay: false,
        isActive: false,
        effectiveFrom: null,
      }),
    });

    expect(result.allEvents.filter((event) => event.type === "income")).toHaveLength(0);
    expect(result.monthSummary.paycheckScheduleMessage).toContain("disabled");
  });

  it("uses existing forecast values in month summary", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      bills: [makeBill({ teles_amount: 51 })],
      paycheckSchedule: normalizePaycheckScheduleSettings({
        amount: 2500,
        scheduleType: "semi_monthly_15_30",
        firstPayDay: 15,
        secondPayDay: 30,
        useLastBusinessDay: false,
        isActive: true,
        effectiveFrom: null,
      }),
      snapshotDate: "2026-06-01",
    });

    expect(result.monthSummary.forecastSummary).not.toBeNull();
    expect(result.monthSummary.forecastSummary?.startingCash).toBe(1000);
  });

  it("shows variable bill warning in event status model", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      bills: [makeBill({ bill_id: "variable-template", amount: 50 })],
      variableBillContext: {
        templateByBillId: new Map([
          ["variable-template", { is_variable: true, default_amount: 50 }],
        ]),
        debtLinkedBillIds: new Set(),
      },
    });

    const billEvent = result.allEvents.find((event) => event.type === "bill");
    expect(billEvent?.status).toBe("variable_needs_confirmation");
    expect(billEvent?.warningLabels.length).toBeGreaterThan(0);
  });

  it("hides cashflow-start pre-start rows", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      cashflowStartDate: "2026-06-15",
      bills: [
        makeBill({ id: "pre-start", due_date: "2026-06-05", period_bucket: "1_14" }),
        makeBill({
          id: "post-start",
          due_date: "2026-06-20",
          period_bucket: "15_eom",
          month: MONTH,
        }),
      ],
      manualExpenses: [
        makeExpense({ id: "pre-expense", expense_date: "2026-06-10" }),
        makeExpense({ id: "post-expense", expense_date: "2026-06-20" }),
      ],
    });

    expect(result.allEvents.some((event) => event.id === "bill-pre-start")).toBe(false);
    expect(result.allEvents.some((event) => event.id === "bill-post-start")).toBe(true);
    expect(result.allEvents.some((event) => event.id === "expense-pre-expense")).toBe(
      false
    );
    expect(result.allEvents.some((event) => event.id === "expense-post-expense")).toBe(
      true
    );
  });

  it("ignores other-user private savings/paycheck rows if accidentally passed in", () => {
    const schedule = normalizePaycheckScheduleSettings({
      amount: 2500,
      scheduleType: "semi_monthly_15_30",
      firstPayDay: 15,
      secondPayDay: 30,
      useLastBusinessDay: false,
      isActive: true,
      effectiveFrom: null,
    });

    const otherUserIncome = buildPaycheckForecastIncomeEvents({
      settings: { ...schedule, amount: 9999 },
      range: buildMonthDateRange(YEAR, MONTH),
      signedInUserId: OTHER_USER_ID,
      snapshotDate: "2026-06-01",
    });

    expect(otherUserIncome.length).toBeGreaterThan(0);

    const result = buildCashflowCalendar({
      ...baseInput,
      signedInUserId: USER_ID,
      paycheckSchedule: schedule,
      snapshotDate: "2026-06-01",
      savingsContributions: [
        {
          id: "other-contrib",
          savings_goal_id: "goal-other",
          user_id: OTHER_USER_ID,
          amount: 888,
          contribution_date: "2026-06-08",
          created_at: "2026-01-01T00:00:00.000Z",
        } as never,
      ],
    });

    expect(result.allEvents.every((event) => event.amount !== 9999)).toBe(true);
    expect(result.allEvents.every((event) => event.amount !== 888)).toBe(true);
  });

  it("keeps event labels free of raw UUIDs", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      bills: [
        makeBill({
          id: "550e8400-e29b-41d4-a716-446655440000",
          name: "Utilities",
        }),
      ],
      debtPayments: [makeDebtPayment()],
      manualExpenses: [makeExpense()],
    });

    expect(calendarEventLabelsArePrivacySafe(result.allEvents)).toBe(true);
  });

  it("sorts events by date and type deterministically", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      bills: [
        makeBill({ id: "bill-a", due_date: "2026-06-15", name: "Alpha bill" }),
        makeBill({ id: "bill-b", due_date: "2026-06-15", name: "Beta bill" }),
      ],
      paycheckSchedule: normalizePaycheckScheduleSettings({
        amount: 2500,
        scheduleType: "semi_monthly_15_30",
        firstPayDay: 15,
        secondPayDay: 30,
        useLastBusinessDay: false,
        isActive: true,
        effectiveFrom: null,
      }),
      snapshotDate: "2026-06-01",
    });

    const dates = result.allEvents.map((event) => event.date);
    const sortedDates = [...dates].sort((left, right) => left.localeCompare(right));
    expect(dates).toEqual(sortedDates);

    const sameDayEvents = result.allEvents.filter((event) => event.date === "2026-06-15");
    expect(sameDayEvents[0]?.type).toBe("period_marker");
  });

  it("calculates daily net effect from income minus obligations", () => {
    const result = buildCashflowCalendar({
      ...baseInput,
      bills: [makeBill({ due_date: "2026-06-12", teles_amount: 51 })],
      manualExpenses: [makeExpense({ expense_date: "2026-06-12", teles_amount: 20 })],
      paycheckSchedule: normalizePaycheckScheduleSettings({
        amount: 2500,
        scheduleType: "semi_monthly_15_30",
        firstPayDay: 15,
        secondPayDay: 30,
        useLastBusinessDay: false,
        isActive: true,
        effectiveFrom: null,
      }),
      snapshotDate: "2026-06-01",
    });

    const incomeDay = result.chronologicalDays.find((day) =>
      day.events.some((event) => event.type === "income")
    );
    expect(incomeDay?.netEffect).toBeGreaterThan(0);

    const obligationDay = result.chronologicalDays.find((day) => day.date === "2026-06-12");
    expect(obligationDay?.netEffect).toBe(-71);
    expect(obligationDay?.incomeTotal).toBe(0);
    expect(obligationDay?.obligationTotal).toBe(71);
  });

  it("includes period marker events on the 1st and 15th", () => {
    const result = buildCashflowCalendar(baseInput);
    const periodEvents = result.allEvents.filter((event) => event.type === "period_marker");
    expect(periodEvents.map((event) => event.date)).toEqual(["2026-06-01", "2026-06-15"]);
  });
});

describe("formatCalendarEventTypeLabel", () => {
  it("returns readable labels for all event types", () => {
    expect(formatCalendarEventTypeLabel("bill")).toBe("Bill");
    expect(formatCalendarEventTypeLabel("income")).toBe("Income");
    expect(formatCalendarEventTypeLabel("remaining_debt")).toBe("Remaining debt");
  });
});
