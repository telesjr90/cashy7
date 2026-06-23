import type { BillShareKey } from "@/lib/bill-share";
import { getMyBillShareAmount } from "@/lib/bill-share";
import { billInstanceDashboardDate } from "@/lib/cashflow-filter";
import { filterOwnSavingsContributions, filterOwnSavingsParticipants } from "@/lib/dashboard-savings-drilldown";
import { getManualExpenseSignedShareAmount } from "@/lib/expenses";
import { filterUnpaidDebtPayments } from "@/lib/debt-progress";
import { PERIOD_LABELS, type PeriodView } from "@/lib/periods";
import {
  calculateRemainingSavingsObligation,
  getDashboardViewDateRange,
  sumMySavingsContributionsForView,
  sumMySavingsTargetForView,
} from "@/lib/savings";
import type {
  BillInstance,
  DebtPayment,
  ManualExpense,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import {
  buildPaycheckForecastIncomeEvents,
  filterOwnPaycheckIncomeEvents,
  FORECAST_INCOME_CONFIGURED_LABEL,
  FORECAST_INCOME_NOT_CONFIGURED_LABEL,
  isPaycheckScheduleConfigured,
  type PaycheckForecastIncomeEvent,
  type PaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import {
  needsVariableAmountConfirmation,
  type VariableBillContext,
} from "@/lib/variable-bills";

export type ForecastWindowKind =
  | "current_period"
  | "rest_of_month"
  | "next_month"
  | "days_30"
  | "days_60"
  | "days_90";

export type ForecastEventType =
  | "starting_balance"
  | "bill"
  | "debt_payment"
  | "savings_obligation"
  | "manual_expense"
  | "adjustment"
  | "income";

export type ForecastIncomeStatus = "not_configured" | "configured";

export interface ForecastDateRange {
  start: string;
  end: string;
}

export interface ForecastWindowDefinition {
  kind: ForecastWindowKind;
  label: string;
  dateRange: ForecastDateRange;
}

export interface SafeToSpendForecastEvent {
  id: string;
  date: string;
  type: ForecastEventType;
  label: string;
  amount: number;
  signedAmount: number;
  projectedBalance: number;
  periodLabel: string | null;
  sourceLabel: string;
  warningLabels: string[];
  isShortfall: boolean;
}

export interface SafeToSpendForecastSummary {
  startingCash: number;
  projectedEndingBalance: number;
  lowestProjectedBalance: number;
  firstShortfallDate: string | null;
  totalProjectedObligations: number;
  totalProjectedIncome: number;
  incomeStatus: ForecastIncomeStatus;
  incomeLabel: string;
  incompleteVariableBillCount: number;
  hasShortfall: boolean;
  windowLabel: string;
  isIncomplete: boolean;
  incompleteReason: string | null;
}

export interface SafeToSpendForecastResult {
  events: SafeToSpendForecastEvent[];
  summary: SafeToSpendForecastSummary;
  emptyStateMessage: string | null;
}

export type SafeToSpendForecastDebtPayment = Pick<
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
>;

export interface BuildSafeToSpendForecastInput {
  startingCash: number | null;
  snapshotDate: string | null | undefined;
  shareKey: BillShareKey | null;
  signedInUserId: string;
  windowKind: ForecastWindowKind;
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  today?: string;
  bills: BillInstance[];
  debtPayments: readonly SafeToSpendForecastDebtPayment[];
  debtLinkedBillIds: ReadonlySet<string>;
  debtAccountNames?: ReadonlyMap<string, string>;
  manualExpenses: ManualExpense[];
  deductedManualExpenseIds?: ReadonlySet<string>;
  savingsParticipants: SavingsGoalParticipant[];
  savingsContributions: SavingsContribution[];
  savingsGoals?: ReadonlyArray<Pick<SavingsGoal, "id" | "name">>;
  variableBillContext: VariableBillContext;
  paycheckSchedule?: PaycheckScheduleSettings | null;
  incomeEvents?: readonly PaycheckForecastIncomeEvent[];
}

export const FORECAST_MISSING_CASH_LABEL =
  "Record your current amount in Settings to build a forecast.";

export const FORECAST_MISSING_PROFILE_LABEL =
  "Choose your budget profile in Settings to build a private forecast.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

export const FORECAST_WINDOW_OPTIONS: ReadonlyArray<{
  kind: ForecastWindowKind;
  label: string;
}> = [
  { kind: "current_period", label: "Current selected period" },
  { kind: "rest_of_month", label: "Rest of this month" },
  { kind: "next_month", label: "Next month" },
  { kind: "days_30", label: "Next 30 days" },
  { kind: "days_60", label: "Next 60 days" },
  { kind: "days_90", label: "Next 90 days" },
];

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

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

function compareDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function dateInRange(date: string, range: ForecastDateRange): boolean {
  return date >= range.start && date <= range.end;
}

function maxDate(left: string, right: string): string {
  return compareDates(left, right) >= 0 ? left : right;
}

function resolveToday(input?: string): string {
  return parseDateOnly(input) ?? formatIsoDate(new Date());
}

export function buildRestOfMonthDateRange(today = formatIsoDate(new Date())): ForecastDateRange {
  const todayOnly = parseDateOnly(today)!;
  const year = Number(todayOnly.slice(0, 4));
  const month = Number(todayOnly.slice(5, 7));
  const monthStr = String(month).padStart(2, "0");
  const endDay = lastDayOfMonth(year, month);
  return {
    start: todayOnly,
    end: `${year}-${monthStr}-${String(endDay).padStart(2, "0")}`,
  };
}

export function buildNextMonthDateRange(today = formatIsoDate(new Date())): ForecastDateRange {
  const todayOnly = parseDateOnly(today)!;
  const year = Number(todayOnly.slice(0, 4));
  const month = Number(todayOnly.slice(5, 7));
  const nextMonthDate = new Date(year, month, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  const monthStr = String(nextMonth).padStart(2, "0");
  const endDay = lastDayOfMonth(nextYear, nextMonth);
  return {
    start: `${nextYear}-${monthStr}-01`,
    end: `${nextYear}-${monthStr}-${String(endDay).padStart(2, "0")}`,
  };
}

export function buildDaysDateRange(days: number, today = formatIsoDate(new Date())): ForecastDateRange {
  const todayOnly = parseDateOnly(today)!;
  return {
    start: todayOnly,
    end: addDays(todayOnly, days - 1),
  };
}

export function buildForecastWindowDefinition(input: {
  kind: ForecastWindowKind;
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  today?: string;
}): ForecastWindowDefinition {
  const today = resolveToday(input.today);
  const option = FORECAST_WINDOW_OPTIONS.find((row) => row.kind === input.kind);
  let dateRange: ForecastDateRange;

  switch (input.kind) {
    case "current_period":
      dateRange = getDashboardViewDateRange(
        input.periodView,
        input.selectedYear,
        input.selectedMonth
      );
      break;
    case "rest_of_month":
      dateRange = buildRestOfMonthDateRange(today);
      break;
    case "next_month":
      dateRange = buildNextMonthDateRange(today);
      break;
    case "days_30":
      dateRange = buildDaysDateRange(30, today);
      break;
    case "days_60":
      dateRange = buildDaysDateRange(60, today);
      break;
    case "days_90":
      dateRange = buildDaysDateRange(90, today);
      break;
  }

  return {
    kind: input.kind,
    label: option?.label ?? input.kind,
    dateRange,
  };
}

export function getYearMonthKeysInDateRange(range: ForecastDateRange): Array<{
  year: number;
  month: number;
}> {
  const startYear = Number(range.start.slice(0, 4));
  const startMonth = Number(range.start.slice(5, 7));
  const endYear = Number(range.end.slice(0, 4));
  const endMonth = Number(range.end.slice(5, 7));

  const keys: Array<{ year: number; month: number }> = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return keys;
}

function resolveBillEventDate(bill: BillInstance): string {
  return parseDateOnly(bill.due_date) ?? billInstanceDashboardDate(bill);
}

function resolvePeriodLabel(
  periodBucket: BillInstance["period_bucket"] | null | undefined,
  year?: number,
  month?: number
): string | null {
  if (!periodBucket) {
    return null;
  }

  const bucketLabel = PERIOD_LABELS[periodBucket];
  if (year != null && month != null) {
    const monthName = MONTH_NAMES[month - 1] ?? String(month);
    return `${monthName} ${year} · ${bucketLabel}`;
  }

  return bucketLabel;
}

function isManualExpenseAdjustment(
  expense: Pick<ManualExpense, "adjusts_manual_expense_id">
): boolean {
  return expense.adjusts_manual_expense_id != null;
}

function filterManualExpensesForForecast(
  expenses: ManualExpense[],
  range: ForecastDateRange,
  snapshotDate: string | null | undefined,
  deductedManualExpenseIds?: ReadonlySet<string>
): ManualExpense[] {
  const snapshotDateOnly = parseDateOnly(snapshotDate ?? "");
  if (!snapshotDateOnly) {
    return [];
  }

  return expenses.filter((expense) => {
    const expenseDateOnly = parseDateOnly(expense.expense_date);
    if (!expenseDateOnly || !dateInRange(expenseDateOnly, range)) {
      return false;
    }

    if (expenseDateOnly <= snapshotDateOnly) {
      return false;
    }

    if (expense.id && deductedManualExpenseIds?.has(expense.id)) {
      return false;
    }

    return true;
  });
}

function buildSavingsObligationEvents(input: {
  range: ForecastDateRange;
  signedInUserId: string;
  participants: SavingsGoalParticipant[];
  contributions: SavingsContribution[];
  savingsGoals: ReadonlyArray<Pick<SavingsGoal, "id" | "name">>;
}): Array<{
  id: string;
  date: string;
  amount: number;
  label: string;
  periodLabel: string;
  sourceLabel: string;
}> {
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

  const events: Array<{
    id: string;
    date: string;
    amount: number;
    label: string;
    periodLabel: string;
    sourceLabel: string;
  }> = [];

  for (const { year, month } of getYearMonthKeysInDateRange(input.range)) {
    for (const periodView of ["1_14", "15_eom"] as const) {
      const periodRange = getDashboardViewDateRange(periodView, year, month);
      if (periodRange.end < input.range.start || periodRange.start > input.range.end) {
        continue;
      }

      const targetTotal = sumMySavingsTargetForView(
        ownParticipants,
        periodView,
        year,
        month
      );
      const contributedTotal = sumMySavingsContributionsForView(
        ownContributions,
        ownParticipants,
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

      const eventDate = periodRange.end;
      if (!dateInRange(eventDate, input.range)) {
        continue;
      }

      events.push({
        id: `savings-${year}-${month}-${periodView}`,
        date: eventDate,
        amount: remaining,
        label: "Your savings obligation",
        periodLabel: resolvePeriodLabel(periodView, year, month) ?? periodView,
        sourceLabel: "Your savings target",
      });
    }

    const monthlyOnlyParticipants = ownParticipants.filter(
      (participant) => participant.contribution_period === "monthly"
    );
    if (monthlyOnlyParticipants.length === 0) {
      continue;
    }

    const monthlyTargetOnly = sumMySavingsTargetForView(
      monthlyOnlyParticipants,
      "full",
      year,
      month
    );
    const monthlyContributed = sumMySavingsContributionsForView(
      ownContributions,
      monthlyOnlyParticipants,
      "full",
      year,
      month
    );
    const monthlyRemaining = calculateRemainingSavingsObligation(
      monthlyTargetOnly,
      monthlyContributed
    );

    if (monthlyRemaining <= 0) {
      continue;
    }

    const monthStr = String(month).padStart(2, "0");
    const endDay = lastDayOfMonth(year, month);
    const eventDate = `${year}-${monthStr}-${String(endDay).padStart(2, "0")}`;

    if (!dateInRange(eventDate, input.range)) {
      continue;
    }

    const goalLabels = monthlyOnlyParticipants
      .map((participant) => goalNameById.get(participant.savings_goal_id) ?? "Savings goal")
      .join(", ");

    events.push({
      id: `savings-monthly-${year}-${month}`,
      date: eventDate,
      amount: monthlyRemaining,
      label: goalLabels,
      periodLabel: `${MONTH_NAMES[month - 1] ?? month} ${year} · Monthly`,
      sourceLabel: "Your savings target",
    });
  }

  return events;
}

function buildBillEvents(input: {
  bills: BillInstance[];
  range: ForecastDateRange;
  shareKey: BillShareKey;
  debtLinkedBillIds: ReadonlySet<string>;
  variableBillContext: VariableBillContext;
}): Array<{
  id: string;
  date: string;
  amount: number;
  label: string;
  periodLabel: string | null;
  sourceLabel: string;
  warningLabels: string[];
}> {
  return input.bills
    .filter((bill) => !bill.is_paid && bill.paid_status !== "paid")
    .map((bill) => {
      const eventDate = resolveBillEventDate(bill);
      const myShare = getMyBillShareAmount(bill, input.shareKey) ?? 0;
      const isDebtLinked = input.debtLinkedBillIds.has(bill.id);

      return {
        bill,
        eventDate,
        myShare,
        isDebtLinked,
      };
    })
    .filter(
      (row) => row.myShare > 0 && dateInRange(row.eventDate, input.range)
    )
    .map((row) => ({
      id: row.bill.id,
      date: row.eventDate,
      amount: row.myShare,
      label: row.bill.name,
      periodLabel: resolvePeriodLabel(
        row.bill.period_bucket,
        row.bill.year,
        row.bill.month
      ),
      sourceLabel: row.isDebtLinked ? "Debt-linked bill" : "Generated bill",
      warningLabels: needsVariableAmountConfirmation(row.bill, input.variableBillContext)
        ? ["Variable bill amount unconfirmed"]
        : [],
    }));
}

function buildDebtPaymentEvents(input: {
  debtPayments: readonly SafeToSpendForecastDebtPayment[];
  bills: BillInstance[];
  range: ForecastDateRange;
  shareKey: BillShareKey;
  debtAccountNames?: ReadonlyMap<string, string>;
}): Array<{
  id: string;
  date: string;
  amount: number;
  label: string;
  periodLabel: string | null;
  sourceLabel: string;
  warningLabels: string[];
}> {
  const unpaidBillIds = new Set(
    input.bills.filter((bill) => !bill.is_paid).map((bill) => bill.id)
  );

  return filterUnpaidDebtPayments(input.debtPayments)
    .filter((payment) => dateInRange(payment.payment_date, input.range))
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

      return {
        id: payment.id,
        date: payment.payment_date,
        amount: shareAmount,
        label: accountName,
        periodLabel: resolvePeriodLabel(payment.period_bucket),
        sourceLabel: payment.linked_bill_instance_id
          ? "Debt payment (unlinked bill)"
          : "Scheduled debt payment",
        warningLabels: [],
      };
    })
    .filter((row) => row.amount > 0);
}

function buildManualExpenseEvents(input: {
  expenses: ManualExpense[];
  range: ForecastDateRange;
  shareKey: BillShareKey;
}): Array<{
  id: string;
  date: string;
  amount: number;
  signedShare: number;
  type: "manual_expense" | "adjustment";
  label: string;
  periodLabel: string | null;
  sourceLabel: string;
  warningLabels: string[];
}> {
  return input.expenses
    .map((expense) => {
      const signedShare = getManualExpenseSignedShareAmount(expense, input.shareKey);
      if (signedShare === null || signedShare === 0) {
        return null;
      }

      const isAdjustment = isManualExpenseAdjustment(expense);
      const expenseDate = parseDateOnly(expense.expense_date);
      if (!expenseDate) {
        return null;
      }

      return {
        id: expense.id,
        date: expenseDate,
        amount: Math.abs(signedShare),
        type: isAdjustment ? ("adjustment" as const) : ("manual_expense" as const),
        label: expense.description,
        periodLabel: null,
        sourceLabel: isAdjustment ? "Expense adjustment" : "Manual expense",
        warningLabels: [],
        signedShare,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function sortForecastEvents<T extends { date: string; label: string }>(events: T[]): T[] {
  return [...events].sort((left, right) => {
    const dateCompare = compareDates(left.date, right.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.label.localeCompare(right.label);
  });
}

function applyRunningBalance(
  startingCash: number,
  rawEvents: Array<{
    id: string;
    date: string;
    type: ForecastEventType;
    label: string;
    amount: number;
    signedAmount: number;
    periodLabel: string | null;
    sourceLabel: string;
    warningLabels: string[];
  }>,
  startingDate: string
): SafeToSpendForecastEvent[] {
  const events: SafeToSpendForecastEvent[] = [];
  let balance = startingCash;

  events.push({
    id: "starting-balance",
    date: startingDate,
    type: "starting_balance",
    label: "Starting available amount",
    amount: startingCash,
    signedAmount: startingCash,
    projectedBalance: balance,
    periodLabel: null,
    sourceLabel: "Current amount snapshot",
    warningLabels: [],
    isShortfall: balance < 0,
  });

  for (const event of sortForecastEvents(rawEvents)) {
    balance = Math.round((balance - event.signedAmount) * 100) / 100;
    events.push({
      ...event,
      projectedBalance: balance,
      isShortfall: balance < 0,
    });
  }

  return events;
}

export function buildSafeToSpendForecast(
  input: BuildSafeToSpendForecastInput
): SafeToSpendForecastResult {
  const window = buildForecastWindowDefinition({
    kind: input.windowKind,
    periodView: input.periodView,
    selectedYear: input.selectedYear,
    selectedMonth: input.selectedMonth,
    today: input.today,
  });

  const incomeConfigured = isPaycheckScheduleConfigured(input.paycheckSchedule);
  const incomeLabel = incomeConfigured
    ? FORECAST_INCOME_CONFIGURED_LABEL
    : FORECAST_INCOME_NOT_CONFIGURED_LABEL;

  if (input.shareKey === null) {
    return {
      events: [],
      summary: {
        startingCash: 0,
        projectedEndingBalance: 0,
        lowestProjectedBalance: 0,
        firstShortfallDate: null,
        totalProjectedObligations: 0,
        totalProjectedIncome: 0,
        incomeStatus: "not_configured",
        incomeLabel,
        incompleteVariableBillCount: 0,
        hasShortfall: false,
        windowLabel: window.label,
        isIncomplete: true,
        incompleteReason: FORECAST_MISSING_PROFILE_LABEL,
      },
      emptyStateMessage: FORECAST_MISSING_PROFILE_LABEL,
    };
  }

  if (input.startingCash === null || input.snapshotDate == null) {
    return {
      events: [],
      summary: {
        startingCash: 0,
        projectedEndingBalance: 0,
        lowestProjectedBalance: 0,
        firstShortfallDate: null,
        totalProjectedObligations: 0,
        totalProjectedIncome: 0,
        incomeStatus: incomeConfigured ? "configured" : "not_configured",
        incomeLabel,
        incompleteVariableBillCount: 0,
        hasShortfall: false,
        windowLabel: window.label,
        isIncomplete: true,
        incompleteReason: FORECAST_MISSING_CASH_LABEL,
      },
      emptyStateMessage: FORECAST_MISSING_CASH_LABEL,
    };
  }

  const range = window.dateRange;
  const startingDate = maxDate(range.start, resolveToday(input.today));

  const billEvents = buildBillEvents({
    bills: input.bills,
    range,
    shareKey: input.shareKey,
    debtLinkedBillIds: input.debtLinkedBillIds,
    variableBillContext: input.variableBillContext,
  });

  const debtEvents = buildDebtPaymentEvents({
    debtPayments: input.debtPayments,
    bills: input.bills,
    range,
    shareKey: input.shareKey,
    debtAccountNames: input.debtAccountNames,
  });

  const manualExpenses = filterManualExpensesForForecast(
    input.manualExpenses,
    range,
    input.snapshotDate,
    input.deductedManualExpenseIds
  );

  const expenseEvents = buildManualExpenseEvents({
    expenses: manualExpenses,
    range,
    shareKey: input.shareKey,
  });

  const savingsEvents = buildSavingsObligationEvents({
    range,
    signedInUserId: input.signedInUserId,
    participants: input.savingsParticipants,
    contributions: input.savingsContributions,
    savingsGoals: input.savingsGoals ?? [],
  });

  const ownIncomeEvents = filterOwnPaycheckIncomeEvents(
    input.incomeEvents ??
      (input.paycheckSchedule
        ? buildPaycheckForecastIncomeEvents({
            settings: input.paycheckSchedule,
            range,
            signedInUserId: input.signedInUserId,
            snapshotDate: input.snapshotDate,
          })
        : []),
    input.signedInUserId
  );

  const rawEvents: Array<{
    id: string;
    date: string;
    type: ForecastEventType;
    label: string;
    amount: number;
    signedAmount: number;
    periodLabel: string | null;
    sourceLabel: string;
    warningLabels: string[];
  }> = [
    ...ownIncomeEvents.map((event) => ({
      id: event.id,
      date: event.date,
      type: "income" as const,
      label: event.label,
      amount: event.amount,
      signedAmount: -event.amount,
      periodLabel: null,
      sourceLabel: event.sourceLabel,
      warningLabels: [] as string[],
    })),
    ...billEvents.map((event) => ({
      ...event,
      type: "bill" as const,
      signedAmount: event.amount,
    })),
    ...debtEvents.map((event) => ({
      ...event,
      type: "debt_payment" as const,
      signedAmount: event.amount,
    })),
    ...expenseEvents.map((event) => ({
      id: event.id,
      date: event.date,
      type: event.type,
      label: event.label,
      amount: event.amount,
      signedAmount: event.signedShare,
      periodLabel: event.periodLabel,
      sourceLabel: event.sourceLabel,
      warningLabels: event.warningLabels,
    })),
    ...savingsEvents.map((event) => ({
      ...event,
      type: "savings_obligation" as const,
      signedAmount: event.amount,
      warningLabels: [] as string[],
    })),
  ];

  const events = applyRunningBalance(input.startingCash, rawEvents, startingDate);

  const obligationEvents = events.filter(
    (event) =>
      event.type !== "starting_balance" && event.type !== "income"
  );
  const incomeForecastEvents = events.filter((event) => event.type === "income");
  const totalProjectedObligations = obligationEvents.reduce(
    (sum, event) => sum + event.signedAmount,
    0
  );
  const totalProjectedIncome = incomeForecastEvents.reduce(
    (sum, event) => sum + event.amount,
    0
  );
  const projectedEndingBalance =
    events.length > 0 ? events[events.length - 1].projectedBalance : input.startingCash;
  const lowestProjectedBalance = events.reduce(
    (min, event) => Math.min(min, event.projectedBalance),
    input.startingCash
  );
  const firstShortfall = events.find((event) => event.isShortfall && event.type !== "starting_balance");
  const incompleteVariableBillCount = billEvents.filter((event) =>
    event.warningLabels.length > 0
  ).length;
  const incomeNotConfigured = !incomeConfigured;
  const incompleteReasons: string[] = [];

  if (incompleteVariableBillCount > 0) {
    incompleteReasons.push(
      `${incompleteVariableBillCount} variable bill${incompleteVariableBillCount === 1 ? "" : "s"} still need a confirmed amount.`
    );
  }

  if (incomeNotConfigured) {
    incompleteReasons.push(FORECAST_INCOME_NOT_CONFIGURED_LABEL);
  }

  return {
    events,
    summary: {
      startingCash: input.startingCash,
      projectedEndingBalance,
      lowestProjectedBalance,
      firstShortfallDate: firstShortfall?.date ?? null,
      totalProjectedObligations,
      totalProjectedIncome,
      incomeStatus: incomeConfigured ? "configured" : "not_configured",
      incomeLabel,
      incompleteVariableBillCount,
      hasShortfall: firstShortfall != null,
      windowLabel: window.label,
      isIncomplete: incompleteReasons.length > 0,
      incompleteReason:
        incompleteReasons.length > 0 ? incompleteReasons.join(" ") : null,
    },
    emptyStateMessage:
      obligationEvents.length === 0 && incomeForecastEvents.length === 0
        ? "No projected income or obligations in this window."
        : null,
  };
}

export function forecastEventLabelsArePrivacySafe(
  events: ReadonlyArray<Pick<SafeToSpendForecastEvent, "label" | "sourceLabel" | "periodLabel">>
): boolean {
  for (const event of events) {
    const labels = [event.label, event.sourceLabel, event.periodLabel];
    if (!labels.every((label) => !label || !UUID_PATTERN.test(label))) {
      return false;
    }
  }

  return true;
}

export function formatForecastEventTypeLabel(type: ForecastEventType): string {
  switch (type) {
    case "starting_balance":
      return "Starting balance";
    case "bill":
      return "Bill";
    case "debt_payment":
      return "Debt payment";
    case "savings_obligation":
      return "Savings obligation";
    case "manual_expense":
      return "Manual expense";
    case "adjustment":
      return "Adjustment";
    case "income":
      return "Income";
    default:
      return type;
  }
}
