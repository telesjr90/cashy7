import type { BillShareKey } from "@/lib/bill-share";
import { getMyBillShareAmount } from "@/lib/bill-share";
import { billInstanceDashboardDate } from "@/lib/cashflow-filter";
import { getBillInstancePreStartLabel } from "@/lib/bill-cashflow-start";
import { getDebtPaymentPreStartLabel } from "@/lib/debt-cashflow-start";
import { getManualExpensePreStartLabel } from "@/lib/expense-cashflow-start";
import { getSavingsContributionPreStartLabel } from "@/lib/savings-cashflow-start";
import {
  filterOwnSavingsContributions,
  filterOwnSavingsParticipants,
} from "@/lib/dashboard-savings-drilldown";
import { buildActiveDebtProgressTotals, type DebtProgressAccount } from "@/lib/debt-progress";
import { getManualExpenseSignedShareAmount } from "@/lib/expenses";
import { PERIOD_LABELS } from "@/lib/periods";
import {
  buildPaycheckForecastIncomeEvents,
  filterOwnPaycheckIncomeEvents,
  PAYCHECK_SETTINGS_DISABLED_LABEL,
  type PaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import {
  buildSafeToSpendForecast,
  type SafeToSpendForecastDebtPayment,
  type SafeToSpendForecastResult,
} from "@/lib/safe-to-spend-forecast";
import { getDashboardViewDateRange } from "@/lib/savings";
import {
  calculateRemainingSavingsObligation,
  sumMySavingsContributionsForView,
  sumMySavingsTargetForView,
} from "@/lib/savings";
import type {
  BillInstance,
  ManualExpense,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import {
  needsVariableAmountConfirmation,
  VARIABLE_AMOUNT_CONFIRMATION_MESSAGE,
  type VariableBillContext,
} from "@/lib/variable-bills";

export type CashflowCalendarEventType =
  | "bill"
  | "debt_payment"
  | "savings"
  | "expense"
  | "income"
  | "safe_to_spend"
  | "remaining_debt"
  | "period_marker";

export type CashflowCalendarEventStatus =
  | "paid"
  | "unpaid"
  | "marked_paid_only"
  | "deducted_from_cash"
  | "variable_needs_confirmation"
  | "info";

export interface CashflowCalendarEvent {
  id: string;
  date: string;
  type: CashflowCalendarEventType;
  title: string;
  amount: number | null;
  signedEffect: number | null;
  shareLabel: string | null;
  status: CashflowCalendarEventStatus | null;
  statusLabel: string | null;
  sourceLabel: string | null;
  warningLabels: string[];
  periodLabel: string | null;
  countsTowardNetEffect: boolean;
}

export interface CashflowCalendarDayCell {
  date: string | null;
  dayOfMonth: number | null;
  isCurrentMonth: boolean;
  isToday: boolean;
  periodBucket: "1_14" | "15_eom" | null;
  events: CashflowCalendarEvent[];
  hiddenEventCount: number;
}

export interface CashflowCalendarDaySummary {
  date: string;
  incomeTotal: number;
  obligationTotal: number;
  netEffect: number;
  projectedBalance: number | null;
  events: CashflowCalendarEvent[];
}

export interface CashflowCalendarMonthSummary {
  monthLabel: string;
  year: number;
  month: number;
  totalIncome: number;
  totalObligations: number;
  netEffect: number;
  remainingDebtTotal: number | null;
  forecastSummary: SafeToSpendForecastResult["summary"] | null;
  forecastIncompleteReason: string | null;
  paycheckScheduleMessage: string | null;
}

export interface CashflowCalendarResult {
  gridWeeks: CashflowCalendarDayCell[][];
  chronologicalDays: CashflowCalendarDaySummary[];
  allEvents: CashflowCalendarEvent[];
  monthSummary: CashflowCalendarMonthSummary;
  emptyStateMessage: string | null;
}

export interface BuildCashflowCalendarInput {
  selectedYear: number;
  selectedMonth: number;
  today?: string;
  shareKey: BillShareKey | null;
  signedInUserId: string;
  bills: BillInstance[];
  debtPayments: readonly SafeToSpendForecastDebtPayment[];
  debtLinkedBillIds: ReadonlySet<string>;
  debtAccountNames?: ReadonlyMap<string, string>;
  debtAccounts?: readonly DebtProgressAccount[];
  manualExpenses: ManualExpense[];
  deductedManualExpenseIds?: ReadonlySet<string>;
  savingsParticipants: SavingsGoalParticipant[];
  savingsContributions: SavingsContribution[];
  savingsGoals?: ReadonlyArray<Pick<SavingsGoal, "id" | "name">>;
  variableBillContext: VariableBillContext;
  paycheckSchedule?: PaycheckScheduleSettings | null;
  cashflowStartDate?: string | null;
  startingCash?: number | null;
  snapshotDate?: string | null;
  maxVisibleEventsPerDay?: number;
}

export const CALENDAR_MISSING_PROFILE_MESSAGE =
  "Choose your budget profile in Settings to see your share on the calendar.";

export const CALENDAR_MISSING_CASH_FORECAST_MESSAGE =
  "Record your current amount in Settings to include safe-to-spend forecast on the calendar.";

export const CALENDAR_MAX_VISIBLE_EVENTS_PER_DAY = 3;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const EVENT_TYPE_SORT_ORDER: Record<CashflowCalendarEventType, number> = {
  period_marker: 0,
  income: 1,
  bill: 2,
  debt_payment: 3,
  savings: 4,
  expense: 5,
  safe_to_spend: 6,
  remaining_debt: 7,
};

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function compareDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function resolveToday(input?: string): string {
  return parseDateOnly(input) ?? formatIsoDate(new Date());
}

export function buildMonthDateRange(
  year: number,
  month: number
): { start: string; end: string } {
  const monthStr = String(month).padStart(2, "0");
  const endDay = lastDayOfMonth(year, month);
  return {
    start: `${year}-${monthStr}-01`,
    end: `${year}-${monthStr}-${String(endDay).padStart(2, "0")}`,
  };
}

export function resolvePeriodBucketForDate(
  date: string
): "1_14" | "15_eom" | null {
  const day = Number(date.slice(8, 10));
  if (!Number.isFinite(day)) {
    return null;
  }

  return day <= 14 ? "1_14" : "15_eom";
}

export function buildCalendarGridDays(input: {
  year: number;
  month: number;
  today?: string;
}): CashflowCalendarDayCell[] {
  const today = resolveToday(input.today);
  const firstOfMonth = new Date(input.year, input.month - 1, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = lastDayOfMonth(input.year, input.month);
  const cells: CashflowCalendarDayCell[] = [];

  for (let index = 0; index < startWeekday; index += 1) {
    cells.push({
      date: null,
      dayOfMonth: null,
      isCurrentMonth: false,
      isToday: false,
      periodBucket: null,
      events: [],
      hiddenEventCount: 0,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const monthStr = String(input.month).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    const date = `${input.year}-${monthStr}-${dayStr}`;

    cells.push({
      date,
      dayOfMonth: day,
      isCurrentMonth: true,
      isToday: date === today,
      periodBucket: resolvePeriodBucketForDate(date),
      events: [],
      hiddenEventCount: 0,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      date: null,
      dayOfMonth: null,
      isCurrentMonth: false,
      isToday: false,
      periodBucket: null,
      events: [],
      hiddenEventCount: 0,
    });
  }

  return cells;
}

export function chunkCalendarGridWeeks(
  cells: CashflowCalendarDayCell[]
): CashflowCalendarDayCell[][] {
  const weeks: CashflowCalendarDayCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function resolveBillEventDate(bill: BillInstance): string {
  return parseDateOnly(bill.due_date) ?? billInstanceDashboardDate(bill);
}

function resolveBillStatus(
  bill: BillInstance
): { status: CashflowCalendarEventStatus; statusLabel: string } {
  if (bill.is_paid || bill.paid_status === "paid") {
    return { status: "paid", statusLabel: "Paid" };
  }

  return { status: "unpaid", statusLabel: "Unpaid" };
}

function sortCalendarEvents(events: CashflowCalendarEvent[]): CashflowCalendarEvent[] {
  return [...events].sort((left, right) => {
    const dateCompare = compareDates(left.date, right.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    const typeCompare =
      EVENT_TYPE_SORT_ORDER[left.type] - EVENT_TYPE_SORT_ORDER[right.type];
    if (typeCompare !== 0) {
      return typeCompare;
    }

    return left.title.localeCompare(right.title);
  });
}

function buildPeriodMarkerEvents(
  year: number,
  month: number,
  range: { start: string; end: string }
): CashflowCalendarEvent[] {
  const monthStr = String(month).padStart(2, "0");
  const monthName = MONTH_NAMES[month - 1] ?? String(month);
  const events: CashflowCalendarEvent[] = [];

  const periodStarts: Array<{ date: string; bucket: "1_14" | "15_eom" }> = [
    { date: `${year}-${monthStr}-01`, bucket: "1_14" },
    { date: `${year}-${monthStr}-15`, bucket: "15_eom" },
  ];

  for (const period of periodStarts) {
    if (!dateInRange(period.date, range.start, range.end)) {
      continue;
    }

    events.push({
      id: `period-${year}-${month}-${period.bucket}`,
      date: period.date,
      type: "period_marker",
      title: PERIOD_LABELS[period.bucket],
      amount: null,
      signedEffect: null,
      shareLabel: "Household",
      status: "info",
      statusLabel: "Pay period",
      sourceLabel: `${monthName} ${year}`,
      warningLabels: [],
      periodLabel: PERIOD_LABELS[period.bucket],
      countsTowardNetEffect: false,
    });
  }

  return events;
}

function buildBillEvents(input: {
  bills: BillInstance[];
  range: { start: string; end: string };
  shareKey: BillShareKey;
  debtLinkedBillIds: ReadonlySet<string>;
  variableBillContext: VariableBillContext;
  cashflowStartDate: string | null | undefined;
}): CashflowCalendarEvent[] {
  const events: CashflowCalendarEvent[] = [];

  for (const bill of input.bills) {
    if (
      bill.year !== Number(input.range.start.slice(0, 4)) ||
      bill.month !== Number(input.range.start.slice(5, 7))
    ) {
      continue;
    }

    const eventDate = resolveBillEventDate(bill);
    const myShare = getMyBillShareAmount(bill, input.shareKey) ?? 0;
    const isDebtLinked = input.debtLinkedBillIds.has(bill.id);
    const billStatus = resolveBillStatus(bill);
    const needsVariable = needsVariableAmountConfirmation(
      bill,
      input.variableBillContext
    );
    const preStartLabel = getBillInstancePreStartLabel(
      bill,
      input.cashflowStartDate
    );

    if (preStartLabel || !dateInRange(eventDate, input.range.start, input.range.end)) {
      continue;
    }

    const warningLabels: string[] = [];
    if (needsVariable) {
      warningLabels.push(VARIABLE_AMOUNT_CONFIRMATION_MESSAGE);
    }

    const isUnpaid = billStatus.status === "unpaid";

    events.push({
      id: `bill-${bill.id}`,
      date: eventDate,
      type: "bill",
      title: bill.name,
      amount: myShare,
      signedEffect: isUnpaid ? -myShare : 0,
      shareLabel: "Your share",
      status: needsVariable ? "variable_needs_confirmation" : billStatus.status,
      statusLabel: needsVariable
        ? "Variable amount unconfirmed"
        : billStatus.statusLabel,
      sourceLabel: isDebtLinked ? "Debt-linked bill" : "Bill",
      warningLabels,
      periodLabel: bill.period_bucket ? PERIOD_LABELS[bill.period_bucket] : null,
      countsTowardNetEffect: isUnpaid,
    });
  }

  return events;
}

function buildDebtPaymentEvents(input: {
  debtPayments: readonly SafeToSpendForecastDebtPayment[];
  bills: BillInstance[];
  range: { start: string; end: string };
  shareKey: BillShareKey;
  debtAccountNames?: ReadonlyMap<string, string>;
  cashflowStartDate: string | null | undefined;
}): CashflowCalendarEvent[] {
  const unpaidBillIds = new Set(
    input.bills
      .filter((bill) => !bill.is_paid && bill.paid_status !== "paid")
      .map((bill) => bill.id)
  );

  return input.debtPayments
    .filter((payment) =>
      dateInRange(payment.payment_date, input.range.start, input.range.end)
    )
    .filter((payment) => {
      const preStartLabel = getDebtPaymentPreStartLabel(
        payment,
        input.cashflowStartDate
      );
      return !preStartLabel;
    })
    .filter((payment) => {
      if (!payment.linked_bill_instance_id) {
        return true;
      }

      return !unpaidBillIds.has(payment.linked_bill_instance_id);
    })
    .map((payment) => {
      const shareAmount =
        input.shareKey === "teles_amount"
          ? Number(payment.teles_amount)
          : Number(payment.nicole_amount);
      const accountName =
        input.debtAccountNames?.get(payment.debt_account_id) ?? "Debt payment";
      const isPaid = payment.paid_status === true;

      return {
        id: `debt-${payment.id}`,
        date: payment.payment_date,
        type: "debt_payment" as const,
        title: accountName,
        amount: shareAmount,
        signedEffect: isPaid ? 0 : -shareAmount,
        shareLabel: "Your share",
        status: isPaid ? ("paid" as const) : ("unpaid" as const),
        statusLabel: isPaid ? "Paid" : "Unpaid",
        sourceLabel: payment.linked_bill_instance_id
          ? "Debt payment (bill already shown)"
          : "Scheduled debt payment",
        warningLabels: [],
        periodLabel: payment.period_bucket
          ? PERIOD_LABELS[payment.period_bucket]
          : null,
        countsTowardNetEffect: !isPaid,
      };
    })
    .filter((event) => event.amount > 0);
}

function buildExpenseEvents(input: {
  expenses: ManualExpense[];
  range: { start: string; end: string };
  shareKey: BillShareKey;
  cashflowStartDate: string | null | undefined;
  deductedManualExpenseIds?: ReadonlySet<string>;
}): CashflowCalendarEvent[] {
  const events: CashflowCalendarEvent[] = [];

  for (const expense of input.expenses) {
    const expenseDate = parseDateOnly(expense.expense_date);
    if (!expenseDate) {
      continue;
    }

    const preStartLabel = getManualExpensePreStartLabel(
      expense,
      input.cashflowStartDate
    );
    if (preStartLabel || !dateInRange(expenseDate, input.range.start, input.range.end)) {
      continue;
    }

    if (expense.id && input.deductedManualExpenseIds?.has(expense.id)) {
      continue;
    }

    const signedShare = getManualExpenseSignedShareAmount(expense, input.shareKey);
    if (signedShare === null || signedShare === 0) {
      continue;
    }

    const isAdjustment = expense.adjusts_manual_expense_id != null;

    events.push({
      id: `expense-${expense.id}`,
      date: expenseDate,
      type: "expense",
      title: expense.description,
      amount: Math.abs(signedShare),
      signedEffect: -Math.abs(signedShare),
      shareLabel: "Your share",
      status: "unpaid",
      statusLabel: isAdjustment ? "Adjustment" : "Manual expense",
      sourceLabel: isAdjustment ? "Expense adjustment" : "Manual expense",
      warningLabels: [],
      periodLabel: null,
      countsTowardNetEffect: true,
    });
  }

  return events;
}

function buildSavingsEvents(input: {
  range: { start: string; end: string };
  signedInUserId: string;
  participants: SavingsGoalParticipant[];
  contributions: SavingsContribution[];
  savingsGoals: ReadonlyArray<Pick<SavingsGoal, "id" | "name">>;
  cashflowStartDate: string | null | undefined;
}): CashflowCalendarEvent[] {
  const ownParticipants = filterOwnSavingsParticipants(
    input.participants,
    input.signedInUserId
  );
  const ownContributions = filterOwnSavingsContributions(
    input.contributions,
    input.signedInUserId
  );
  const goalNameById = new Map(
    input.savingsGoals.map((goal) => [goal.id, goal.name])
  );

  const events: CashflowCalendarEvent[] = [];

  for (const contribution of ownContributions) {
    const contributionDate = parseDateOnly(contribution.contribution_date);
    if (!contributionDate) {
      continue;
    }

    const preStartLabel = getSavingsContributionPreStartLabel(
      contribution,
      input.cashflowStartDate
    );
    if (preStartLabel) {
      continue;
    }

    if (!dateInRange(contributionDate, input.range.start, input.range.end)) {
      continue;
    }

    const amount = Number(contribution.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    events.push({
      id: `savings-contribution-${contribution.id}`,
      date: contributionDate,
      type: "savings",
      title: goalNameById.get(contribution.savings_goal_id) ?? "Savings contribution",
      amount,
      signedEffect: -amount,
      shareLabel: "Your contribution",
      status: "paid",
      statusLabel: "Contributed",
      sourceLabel: "Your savings",
      warningLabels: [],
      periodLabel: null,
      countsTowardNetEffect: true,
    });
  }

  const year = Number(input.range.start.slice(0, 4));
  const month = Number(input.range.start.slice(5, 7));

  for (const periodView of ["1_14", "15_eom"] as const) {
    const periodRange = getDashboardViewDateRange(periodView, year, month);
    if (periodRange.end < input.range.start || periodRange.start > input.range.end) {
      continue;
    }

    const periodParticipants = ownParticipants.filter(
      (participant) => participant.contribution_period === periodView
    );
    const targetTotal = sumMySavingsTargetForView(
      periodParticipants,
      periodView,
      year,
      month
    );
    const contributedTotal = sumMySavingsContributionsForView(
      ownContributions,
      periodParticipants,
      periodView,
      year,
      month
    );
    const remaining = calculateRemainingSavingsObligation(
      targetTotal,
      contributedTotal
    );
    if (remaining <= 0) {
      continue;
    }

    events.push({
      id: `savings-obligation-${year}-${month}-${periodView}`,
      date: periodRange.end,
      type: "savings",
      title: "Your savings obligation",
      amount: remaining,
      signedEffect: -remaining,
      shareLabel: "Your target",
      status: "unpaid",
      statusLabel: "Remaining obligation",
      sourceLabel: "Your savings target",
      warningLabels: [],
      periodLabel: PERIOD_LABELS[periodView],
      countsTowardNetEffect: true,
    });
  }

  return events;
}

function buildIncomeEvents(input: {
  range: { start: string; end: string };
  signedInUserId: string;
  paycheckSchedule?: PaycheckScheduleSettings | null;
  snapshotDate?: string | null;
}): CashflowCalendarEvent[] {
  if (!input.paycheckSchedule) {
    return [];
  }

  const incomeEvents = buildPaycheckForecastIncomeEvents({
    settings: input.paycheckSchedule,
    range: input.range,
    signedInUserId: input.signedInUserId,
    snapshotDate: input.snapshotDate,
  });

  return filterOwnPaycheckIncomeEvents(incomeEvents, input.signedInUserId).map(
    (event) => ({
      id: `income-${event.date}`,
      date: event.date,
      type: "income" as const,
      title: event.label,
      amount: event.amount,
      signedEffect: event.amount,
      shareLabel: "Your paycheck",
      status: "info" as const,
      statusLabel: "Expected income",
      sourceLabel: event.sourceLabel,
      warningLabels: [],
      periodLabel: null,
      countsTowardNetEffect: true,
    })
  );
}

function buildRemainingDebtEvent(input: {
  range: { start: string; end: string };
  debtAccounts?: readonly DebtProgressAccount[];
  debtPayments: readonly SafeToSpendForecastDebtPayment[];
}): CashflowCalendarEvent | null {
  if (!input.debtAccounts || input.debtAccounts.length === 0) {
    return null;
  }

  const totals = buildActiveDebtProgressTotals(
    input.debtAccounts,
    input.debtPayments.map((payment) => ({
      id: payment.id,
      debt_account_id: payment.debt_account_id,
      payment_date: payment.payment_date,
      total_payment: payment.total_payment,
      paid_status: payment.paid_status,
    }))
  );

  if (totals.totalRemaining <= 0 && totals.accountCount === 0) {
    return null;
  }

  return {
    id: `remaining-debt-${input.range.end}`,
    date: input.range.end,
    type: "remaining_debt",
    title: "Household remaining debt",
    amount: totals.totalRemaining,
    signedEffect: null,
    shareLabel: "Household",
    status: "info",
    statusLabel: totals.payoffLabel,
    sourceLabel: "Debt progress summary",
    warningLabels: [],
    periodLabel: null,
    countsTowardNetEffect: false,
  };
}

function buildSafeToSpendSummaryEvent(input: {
  forecast: SafeToSpendForecastResult | null;
  range: { start: string; end: string };
}): CashflowCalendarEvent | null {
  if (!input.forecast || input.forecast.summary.isIncomplete) {
    return null;
  }

  return {
    id: `safe-to-spend-${input.range.end}`,
    date: input.range.end,
    type: "safe_to_spend",
    title: "Month forecast ending balance",
    amount: input.forecast.summary.projectedEndingBalance,
    signedEffect: null,
    shareLabel: "Your forecast",
    status: input.forecast.summary.hasShortfall ? "variable_needs_confirmation" : "info",
    statusLabel: input.forecast.summary.hasShortfall ? "Shortfall projected" : "Forecast complete",
    sourceLabel: input.forecast.summary.windowLabel,
    warningLabels: input.forecast.summary.incompleteVariableBillCount
      ? [`${input.forecast.summary.incompleteVariableBillCount} variable bill(s) unconfirmed`]
      : [],
    periodLabel: null,
    countsTowardNetEffect: false,
  };
}

function groupEventsByDate(
  events: CashflowCalendarEvent[]
): Map<string, CashflowCalendarEvent[]> {
  const grouped = new Map<string, CashflowCalendarEvent[]>();

  for (const event of sortCalendarEvents(events)) {
    const existing = grouped.get(event.date) ?? [];
    existing.push(event);
    grouped.set(event.date, existing);
  }

  return grouped;
}

function buildDaySummaries(input: {
  eventsByDate: Map<string, CashflowCalendarEvent[]>;
  range: { start: string; end: string };
  forecast: SafeToSpendForecastResult | null;
}): CashflowCalendarDaySummary[] {
  const summaries: CashflowCalendarDaySummary[] = [];
  const forecastBalanceByDate = new Map<string, number>();

  if (input.forecast) {
    for (const event of input.forecast.events) {
      forecastBalanceByDate.set(event.date, event.projectedBalance);
    }
  }

  const startYear = Number(input.range.start.slice(0, 4));
  const startMonth = Number(input.range.start.slice(5, 7));
  const startDay = Number(input.range.start.slice(8, 10));
  const endDay = Number(input.range.end.slice(8, 10));

  for (let day = startDay; day <= endDay; day += 1) {
    const monthStr = String(startMonth).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    const date = `${startYear}-${monthStr}-${dayStr}`;
    const events = input.eventsByDate.get(date) ?? [];

    const obligationEvents = events.filter(
      (event) =>
        event.countsTowardNetEffect &&
        event.type !== "income" &&
        event.signedEffect !== null &&
        event.signedEffect < 0
    );
    const incomeEvents = events.filter(
      (event) => event.type === "income" && event.countsTowardNetEffect
    );

    const incomeTotal = incomeEvents.reduce(
      (sum, event) => sum + (event.signedEffect ?? 0),
      0
    );
    const obligationTotal = obligationEvents.reduce(
      (sum, event) => sum + Math.abs(event.signedEffect ?? 0),
      0
    );
    const netEffect = Math.round((incomeTotal - obligationTotal) * 100) / 100;

    summaries.push({
      date,
      incomeTotal,
      obligationTotal,
      netEffect,
      projectedBalance: forecastBalanceByDate.get(date) ?? null,
      events,
    });
  }

  return summaries;
}

function applyVisibleEventCap(
  cells: CashflowCalendarDayCell[],
  maxVisible: number
): CashflowCalendarDayCell[] {
  return cells.map((cell) => {
    if (!cell.date || cell.events.length <= maxVisible) {
      return cell;
    }

    return {
      ...cell,
      events: cell.events.slice(0, maxVisible),
      hiddenEventCount: cell.events.length - maxVisible,
    };
  });
}

export function calendarEventLabelsArePrivacySafe(
  events: readonly CashflowCalendarEvent[]
): boolean {
  for (const event of events) {
    const labels = [
      event.title,
      event.shareLabel,
      event.statusLabel,
      event.sourceLabel,
      event.periodLabel,
      ...event.warningLabels,
    ];

    if (labels.some((label) => label && UUID_PATTERN.test(label))) {
      return false;
    }
  }

  return true;
}

export function buildCashflowCalendar(
  input: BuildCashflowCalendarInput
): CashflowCalendarResult {
  const range = buildMonthDateRange(input.selectedYear, input.selectedMonth);
  const monthName = MONTH_NAMES[input.selectedMonth - 1] ?? String(input.selectedMonth);
  const maxVisible = input.maxVisibleEventsPerDay ?? CALENDAR_MAX_VISIBLE_EVENTS_PER_DAY;

  const baseGrid = buildCalendarGridDays({
    year: input.selectedYear,
    month: input.selectedMonth,
    today: input.today,
  });

  if (input.shareKey === null) {
    return {
      gridWeeks: chunkCalendarGridWeeks(baseGrid),
      chronologicalDays: [],
      allEvents: [],
      monthSummary: {
        monthLabel: `${monthName} ${input.selectedYear}`,
        year: input.selectedYear,
        month: input.selectedMonth,
        totalIncome: 0,
        totalObligations: 0,
        netEffect: 0,
        remainingDebtTotal: null,
        forecastSummary: null,
        forecastIncompleteReason: CALENDAR_MISSING_PROFILE_MESSAGE,
        paycheckScheduleMessage: null,
      },
      emptyStateMessage: CALENDAR_MISSING_PROFILE_MESSAGE,
    };
  }

  const periodMarkers = buildPeriodMarkerEvents(
    input.selectedYear,
    input.selectedMonth,
    range
  );
  const billEvents = buildBillEvents({
    bills: input.bills,
    range,
    shareKey: input.shareKey,
    debtLinkedBillIds: input.debtLinkedBillIds,
    variableBillContext: input.variableBillContext,
    cashflowStartDate: input.cashflowStartDate,
  });
  const debtEvents = buildDebtPaymentEvents({
    debtPayments: input.debtPayments,
    bills: input.bills,
    range,
    shareKey: input.shareKey,
    debtAccountNames: input.debtAccountNames,
    cashflowStartDate: input.cashflowStartDate,
  });
  const expenseEvents = buildExpenseEvents({
    expenses: input.manualExpenses,
    range,
    shareKey: input.shareKey,
    cashflowStartDate: input.cashflowStartDate,
    deductedManualExpenseIds: input.deductedManualExpenseIds,
  });
  const savingsEvents = buildSavingsEvents({
    range,
    signedInUserId: input.signedInUserId,
    participants: input.savingsParticipants,
    contributions: input.savingsContributions,
    savingsGoals: input.savingsGoals ?? [],
    cashflowStartDate: input.cashflowStartDate,
  });
  const incomeEvents = buildIncomeEvents({
    range,
    signedInUserId: input.signedInUserId,
    paycheckSchedule: input.paycheckSchedule,
    snapshotDate: input.snapshotDate,
  });

  let forecast: SafeToSpendForecastResult | null = null;
  let forecastIncompleteReason: string | null = null;

  if (input.startingCash == null || input.snapshotDate == null) {
    forecastIncompleteReason = CALENDAR_MISSING_CASH_FORECAST_MESSAGE;
  } else {
    forecast = buildSafeToSpendForecast({
      startingCash: input.startingCash,
      snapshotDate: input.snapshotDate,
      shareKey: input.shareKey,
      signedInUserId: input.signedInUserId,
      windowKind: "current_period",
      periodView: "full",
      selectedYear: input.selectedYear,
      selectedMonth: input.selectedMonth,
      today: input.today,
      bills: input.bills,
      debtPayments: input.debtPayments,
      debtLinkedBillIds: input.debtLinkedBillIds,
      debtAccountNames: input.debtAccountNames,
      manualExpenses: input.manualExpenses,
      deductedManualExpenseIds: input.deductedManualExpenseIds,
      savingsParticipants: input.savingsParticipants,
      savingsContributions: input.savingsContributions,
      savingsGoals: input.savingsGoals,
      variableBillContext: input.variableBillContext,
      paycheckSchedule: input.paycheckSchedule,
    });

    if (forecast.summary.isIncomplete) {
      forecastIncompleteReason = forecast.summary.incompleteReason;
    }
  }

  const safeToSpendEvent = buildSafeToSpendSummaryEvent({ forecast, range });
  const remainingDebtEvent = buildRemainingDebtEvent({
    range,
    debtAccounts: input.debtAccounts,
    debtPayments: input.debtPayments,
  });

  const displayEvents = sortCalendarEvents([
    ...periodMarkers,
    ...billEvents,
    ...debtEvents,
    ...expenseEvents,
    ...savingsEvents,
    ...incomeEvents,
    ...(safeToSpendEvent ? [safeToSpendEvent] : []),
    ...(remainingDebtEvent ? [remainingDebtEvent] : []),
  ]);

  const eventsByDate = groupEventsByDate(displayEvents);

  const gridWithEvents = baseGrid.map((cell) => {
    if (!cell.date) {
      return cell;
    }

    return {
      ...cell,
      events: eventsByDate.get(cell.date) ?? [],
      hiddenEventCount: 0,
    };
  });

  const cappedGrid = applyVisibleEventCap(gridWithEvents, maxVisible);
  const chronologicalDays = buildDaySummaries({
    eventsByDate,
    range,
    forecast,
  });

  const totalIncome = incomeEvents.reduce((sum, event) => sum + (event.amount ?? 0), 0);
  const obligationEvents = displayEvents.filter(
    (event) =>
      event.countsTowardNetEffect &&
      event.type !== "income" &&
      (event.signedEffect ?? 0) < 0
  );
  const totalObligations = obligationEvents.reduce(
    (sum, event) => sum + Math.abs(event.signedEffect ?? 0),
    0
  );

  const paycheckScheduleMessage =
    input.paycheckSchedule?.scheduleType === "disabled"
      ? PAYCHECK_SETTINGS_DISABLED_LABEL
      : null;

  const emptyStateMessage =
    displayEvents.length === 0
      ? `No planning events for ${monthName} ${input.selectedYear}.`
      : null;

  return {
    gridWeeks: chunkCalendarGridWeeks(cappedGrid),
    chronologicalDays,
    allEvents: displayEvents,
    monthSummary: {
      monthLabel: `${monthName} ${input.selectedYear}`,
      year: input.selectedYear,
      month: input.selectedMonth,
      totalIncome,
      totalObligations,
      netEffect: Math.round((totalIncome - totalObligations) * 100) / 100,
      remainingDebtTotal: remainingDebtEvent?.amount ?? null,
      forecastSummary: forecast?.summary ?? null,
      forecastIncompleteReason,
      paycheckScheduleMessage,
    },
    emptyStateMessage,
  };
}

export function formatCalendarEventTypeLabel(
  type: CashflowCalendarEventType
): string {
  switch (type) {
    case "bill":
      return "Bill";
    case "debt_payment":
      return "Debt payment";
    case "savings":
      return "Savings";
    case "expense":
      return "Expense";
    case "income":
      return "Income";
    case "safe_to_spend":
      return "Forecast";
    case "remaining_debt":
      return "Remaining debt";
    case "period_marker":
      return "Period";
  }
}
