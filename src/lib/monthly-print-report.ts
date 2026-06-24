import type { BillShareKey } from "@/lib/bill-share";
import {
  calculateSafeToSpendBeforeSavings,
  getMyBillShareAmount,
  sumMyBillShareTotal,
  sumMyUnpaidBillShareTotal,
} from "@/lib/bill-share";
import {
  buildCashflowCalendar,
  buildMonthDateRange,
  type CashflowCalendarDaySummary,
  type CashflowCalendarEvent,
} from "@/lib/cashflow-calendar";
import { filterBillsForDashboardView } from "@/lib/dashboard-drilldowns";
import {
  buildDashboardDebtSummary,
  formatDashboardDebtNextPaymentLabel,
  formatDashboardDebtPayoffLabel,
} from "@/lib/dashboard-debt-summary";
import { buildManualExpenseDrilldown } from "@/lib/dashboard-expense-drilldown";
import { filterOwnCashSnapshot, buildDashboardWarnings } from "@/lib/dashboard-warnings";
import {
  filterOwnSavingsContributions,
  filterOwnSavingsParticipants,
} from "@/lib/dashboard-savings-drilldown";
import { filterActiveDebtAccounts } from "@/lib/debt-accounts";
import type { DebtProgressAccount } from "@/lib/debt-progress";
import { formatCurrency, formatDeductionAmount } from "@/lib/format";
import {
  buildPaycheckForecastIncomeEvents,
  filterOwnPaycheckIncomeEvents,
  PAYCHECK_SETTINGS_DISABLED_LABEL,
  type PaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import { PERIOD_LABELS, type PeriodView } from "@/lib/periods";
import {
  buildSafeToSpendForecast,
  type SafeToSpendForecastResult,
  type SafeToSpendForecastDebtPayment,
} from "@/lib/safe-to-spend-forecast";
import {
  calculateRemainingSavingsObligation,
  calculateSafeToSpendAfterSavings,
  sumMySavingsContributionsForView,
  sumMySavingsTargetForView,
} from "@/lib/savings";
import { SHARED_GOAL_PRIVACY_COPY } from "@/lib/savings-edit";
import { sumMyManualExpenseShareForView } from "@/lib/expenses";
import type {
  BillInstance,
  CashSnapshot,
  ManualExpense,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import {
  countVariableBillsNeedingConfirmationForDashboardView,
  isDebtLinkedBillInstance,
  needsVariableAmountConfirmation,
  VARIABLE_AMOUNT_CONFIRMATION_MESSAGE,
  type VariableBillContext,
} from "@/lib/variable-bills";
import { format, parseISO } from "date-fns";

export const MONTHLY_PRINT_REPORT_PERIOD_VIEW: PeriodView = "full";

export const MONTHLY_PRINT_REPORT_PRIVATE_SECTION_COPY =
  "Private cash, paycheck, and savings sections show your data only. Shared household bills and debt remain visible to both members.";

export const MONTHLY_PRINT_REPORT_APP_LABEL = "Cashflow";

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

const SECRET_PATTERN =
  /(password|secret|api[_-]?key|token|credential|service[_-]?role|supabase[_-]?key)/i;

export interface MonthlyPrintReportHeader {
  title: string;
  monthLabel: string;
  generatedAtLabel: string;
  householdLabel: string | null;
  privateSectionCopy: string;
}

export interface MonthlyPrintReportCashPosition {
  currentAmount: number | null;
  snapshotDateLabel: string | null;
  safeToSpendBeforeSavings: number | null;
  safeToSpendAfterSavings: number | null;
  projectedEndingBalance: number | null;
  missingSnapshotMessage: string | null;
  staleSnapshotMessage: string | null;
  viewLabel: string;
}

export interface MonthlyPrintReportBillRow {
  name: string;
  dueDateLabel: string;
  amountLabel: string;
  statusLabel: string;
  periodLabel: string | null;
  debtLinkedLabel: string | null;
  variableWarningLabel: string | null;
}

export interface MonthlyPrintReportBillsSection {
  totalLabel: string;
  unpaidTotalLabel: string;
  paidTotalLabel: string;
  variableNeedsConfirmationCount: number;
  periodBreakdown: Array<{ periodLabel: string; totalLabel: string }>;
  unpaidRows: MonthlyPrintReportBillRow[];
  paidRows: MonthlyPrintReportBillRow[];
  variableRows: MonthlyPrintReportBillRow[];
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportDebtSection {
  activeDebtCount: number;
  remainingDebtLabel: string;
  payoffLabel: string;
  nextPaymentLabel: string;
  nextPaymentDescription: string | null;
  upcomingPayments: Array<{
    accountName: string;
    paymentDateLabel: string;
    totalPaymentLabel: string;
    paidStatusLabel: string;
    linkedBillLabel: string | null;
  }>;
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportSavingsSection {
  targetLabel: string;
  contributionsLabel: string;
  remainingObligationLabel: string;
  sharedPrivacyCopy: string;
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportExpenseRow {
  dateLabel: string;
  description: string;
  amountLabel: string;
  categoryLabel: string | null;
  rowTypeLabel: string;
  sourceLabel: string;
}

export interface MonthlyPrintReportExpensesSection {
  totalLabel: string;
  categorySummary: Array<{ category: string; totalLabel: string }>;
  rows: MonthlyPrintReportExpenseRow[];
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportIncomeRow {
  dateLabel: string;
  amountLabel: string;
  scheduleLabel: string;
}

export interface MonthlyPrintReportIncomeSection {
  projectedTotalLabel: string;
  scheduleStatusMessage: string | null;
  rows: MonthlyPrintReportIncomeRow[];
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportForecastSection {
  windowLabel: string | null;
  projectedIncomeLabel: string | null;
  projectedObligationsLabel: string | null;
  endingBalanceLabel: string | null;
  lowestBalanceLabel: string | null;
  firstShortfallDateLabel: string | null;
  incompleteReason: string | null;
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportWarningRow {
  severity: string;
  title: string;
  description: string;
  affectedArea: string;
}

export interface MonthlyPrintReportWarningsSection {
  rows: MonthlyPrintReportWarningRow[];
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportCalendarDay {
  dateLabel: string;
  incomeTotalLabel: string;
  obligationTotalLabel: string;
  netEffectLabel: string;
  projectedBalanceLabel: string | null;
  events: Array<{
    typeLabel: string;
    title: string;
    amountLabel: string | null;
    statusLabel: string | null;
  }>;
}

export interface MonthlyPrintReportCalendarSection {
  monthSummaryLabel: string;
  days: MonthlyPrintReportCalendarDay[];
  emptyStateMessage: string | null;
}

export interface MonthlyPrintReportResult {
  header: MonthlyPrintReportHeader;
  cashPosition: MonthlyPrintReportCashPosition;
  bills: MonthlyPrintReportBillsSection;
  debt: MonthlyPrintReportDebtSection;
  savings: MonthlyPrintReportSavingsSection;
  expenses: MonthlyPrintReportExpensesSection;
  income: MonthlyPrintReportIncomeSection;
  forecast: MonthlyPrintReportForecastSection;
  warnings: MonthlyPrintReportWarningsSection;
  calendar: MonthlyPrintReportCalendarSection;
  loadingBlockedMessage: string | null;
  errorMessage: string | null;
}

export interface BuildMonthlyPrintReportInput {
  selectedYear: number;
  selectedMonth: number;
  today?: string;
  generatedAt?: string;
  householdName?: string | null;
  signedInUserId: string;
  shareKey: BillShareKey | null;
  peopleLoaded: boolean;
  settingsLoaded: boolean;
  cashflowStartDate: string | null;
  cashSnapshot: Pick<CashSnapshot, "snapshot_date" | "amount" | "user_id"> | null;
  bills: BillInstance[];
  debtPayments: readonly SafeToSpendForecastDebtPayment[];
  debtLinkedBillIds: ReadonlySet<string>;
  debtAccounts?: readonly DebtProgressAccount[];
  debtAccountNames?: ReadonlyMap<string, string>;
  manualExpenses: ManualExpense[];
  deductedManualExpenseIds?: ReadonlySet<string>;
  savingsParticipants: SavingsGoalParticipant[];
  savingsContributions: SavingsContribution[];
  savingsGoals?: ReadonlyArray<Pick<SavingsGoal, "id" | "name">>;
  variableBillContext: VariableBillContext;
  paycheckSchedule?: PaycheckScheduleSettings | null;
  startingCash?: number | null;
  snapshotDate?: string | null;
  cashSnapshotReady?: boolean;
  forecastReady?: boolean;
}

function formatReportDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

function formatGeneratedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return format(parsed, "MMMM d, yyyy 'at' h:mm a");
}

export function buildMonthlyPrintReportTitle(year: number, month: number): string {
  const monthName = MONTH_NAMES[month - 1] ?? String(month);
  return `Cashflow Report — ${monthName} ${year}`;
}

function buildBillRow(
  bill: BillInstance,
  shareKey: BillShareKey,
  debtLinkedBillIds: ReadonlySet<string>,
  variableBillContext: VariableBillContext
): MonthlyPrintReportBillRow {
  const shareAmount = getMyBillShareAmount(bill, shareKey) ?? 0;
  const needsVariable = needsVariableAmountConfirmation(bill, variableBillContext);

  return {
    name: bill.name,
    dueDateLabel: bill.due_date ? formatReportDate(bill.due_date) : "No due date",
    amountLabel: needsVariable ? "Needs confirmation" : formatCurrency(shareAmount),
    statusLabel: bill.is_paid || bill.paid_status === "paid" ? "Paid" : "Unpaid",
    periodLabel: bill.period_bucket ? PERIOD_LABELS[bill.period_bucket] : null,
    debtLinkedLabel: isDebtLinkedBillInstance(bill, debtLinkedBillIds)
      ? "Debt-linked bill"
      : null,
    variableWarningLabel: needsVariable ? VARIABLE_AMOUNT_CONFIRMATION_MESSAGE : null,
  };
}

function buildCalendarDaySummary(day: CashflowCalendarDaySummary): MonthlyPrintReportCalendarDay {
  return {
    dateLabel: formatReportDate(day.date),
    incomeTotalLabel: formatCurrency(day.incomeTotal),
    obligationTotalLabel: formatDeductionAmount(day.obligationTotal),
    netEffectLabel:
      day.netEffect >= 0
        ? formatCurrency(day.netEffect)
        : formatDeductionAmount(Math.abs(day.netEffect)),
    projectedBalanceLabel:
      day.projectedBalance == null ? null : formatCurrency(day.projectedBalance),
    events: day.events.map((event: CashflowCalendarEvent) => ({
      typeLabel: event.type.replace(/_/g, " "),
      title: event.title,
      amountLabel:
        event.amount == null
          ? null
          : event.type === "income"
            ? formatCurrency(event.amount)
            : event.signedEffect != null && event.signedEffect < 0
              ? formatDeductionAmount(Math.abs(event.signedEffect))
              : formatCurrency(event.amount),
      statusLabel: event.statusLabel,
    })),
  };
}

function buildCategorySummary(
  rows: Array<{ category: string | null; amount: number }>
): Array<{ category: string; totalLabel: string }> {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const category = row.category?.trim() || "Uncategorized";
    totals.set(category, (totals.get(category) ?? 0) + row.amount);
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, total]) => ({
      category,
      totalLabel: formatCurrency(total),
    }));
}

export function buildMonthlyPrintReport(
  input: BuildMonthlyPrintReportInput
): MonthlyPrintReportResult {
  const periodView = MONTHLY_PRINT_REPORT_PERIOD_VIEW;
  const monthName = MONTH_NAMES[input.selectedMonth - 1] ?? String(input.selectedMonth);
  const monthLabel = `${monthName} ${input.selectedYear}`;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const ownCashSnapshot = filterOwnCashSnapshot(input.cashSnapshot, input.signedInUserId);
  const visibleBills = filterBillsForDashboardView(input.bills, periodView);
  const range = buildMonthDateRange(input.selectedYear, input.selectedMonth);

  const myBillTotal = sumMyBillShareTotal(input.bills, input.shareKey, periodView);
  const myUnpaidBillTotal = sumMyUnpaidBillShareTotal(input.bills, input.shareKey, periodView);
  const myPaidBillTotal =
    myBillTotal !== null && myUnpaidBillTotal !== null
      ? Math.max(0, myBillTotal - myUnpaidBillTotal)
      : null;

  const myManualExpenseTotalForView =
    input.shareKey === null
      ? null
      : sumMyManualExpenseShareForView(
          input.manualExpenses,
          input.shareKey,
          periodView,
          input.selectedYear,
          input.selectedMonth,
          input.snapshotDate ?? ownCashSnapshot?.snapshot_date ?? null,
          input.deductedManualExpenseIds
        );

  const safeToSpendBeforeSavings =
    ownCashSnapshot &&
    input.shareKey !== null &&
    myUnpaidBillTotal !== null &&
    myManualExpenseTotalForView !== null
      ? calculateSafeToSpendBeforeSavings(
          Number(ownCashSnapshot.amount),
          myUnpaidBillTotal,
          myManualExpenseTotalForView
        )
      : null;

  const ownSavingsParticipants = filterOwnSavingsParticipants(
    input.savingsParticipants,
    input.signedInUserId
  );
  const ownSavingsContributions = filterOwnSavingsContributions(
    input.savingsContributions,
    input.signedInUserId
  );

  const mySavingsTargetForView = sumMySavingsTargetForView(
    ownSavingsParticipants,
    periodView,
    input.selectedYear,
    input.selectedMonth
  );
  const myContributionsForView = sumMySavingsContributionsForView(
    ownSavingsContributions,
    ownSavingsParticipants,
    periodView,
    input.selectedYear,
    input.selectedMonth
  );
  const remainingSavingsObligationForView = calculateRemainingSavingsObligation(
    mySavingsTargetForView,
    myContributionsForView
  );
  const safeToSpendAfterSavings =
    safeToSpendBeforeSavings !== null
      ? calculateSafeToSpendAfterSavings(
          safeToSpendBeforeSavings,
          remainingSavingsObligationForView
        )
      : null;

  let forecast: SafeToSpendForecastResult | null = null;
  if (
    input.shareKey !== null &&
    input.startingCash != null &&
    input.snapshotDate != null
  ) {
    forecast = buildSafeToSpendForecast({
      startingCash: input.startingCash,
      snapshotDate: input.snapshotDate,
      shareKey: input.shareKey,
      signedInUserId: input.signedInUserId,
      windowKind: "current_period",
      periodView,
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
  }

  const calendar = buildCashflowCalendar({
    selectedYear: input.selectedYear,
    selectedMonth: input.selectedMonth,
    today: input.today,
    shareKey: input.shareKey,
    signedInUserId: input.signedInUserId,
    bills: input.bills,
    debtPayments: input.debtPayments,
    debtLinkedBillIds: input.debtLinkedBillIds,
    debtAccountNames: input.debtAccountNames,
    debtAccounts: input.debtAccounts,
    manualExpenses: input.manualExpenses,
    deductedManualExpenseIds: input.deductedManualExpenseIds,
    savingsParticipants: input.savingsParticipants,
    savingsContributions: input.savingsContributions,
    savingsGoals: input.savingsGoals,
    variableBillContext: input.variableBillContext,
    paycheckSchedule: input.paycheckSchedule,
    cashflowStartDate: input.cashflowStartDate,
    startingCash: input.startingCash ?? null,
    snapshotDate: input.snapshotDate ?? null,
    maxVisibleEventsPerDay: 100,
  });

  const variableConfirmationCount = countVariableBillsNeedingConfirmationForDashboardView({
    instances: input.bills,
    periodView,
    year: input.selectedYear,
    month: input.selectedMonth,
    context: input.variableBillContext,
  });

  const dashboardWarnings = buildDashboardWarnings({
    signedInUserId: input.signedInUserId,
    shareKey: input.shareKey,
    peopleLoaded: input.peopleLoaded,
    cashSnapshot: input.cashSnapshot,
    cashflowStartDate: input.cashflowStartDate,
    settingsLoaded: input.settingsLoaded,
    periodView,
    selectedYear: input.selectedYear,
    selectedMonth: input.selectedMonth,
    today: input.today,
    safeToSpendBeforeSavings,
    safeToSpendAfterSavings,
    variableBillCountForView: variableConfirmationCount,
    forecastVariableBillCount: forecast?.summary.incompleteVariableBillCount ?? 0,
    remainingSavingsObligation: remainingSavingsObligationForView,
    bills: input.bills,
    debtPayments: input.debtPayments,
    debtLinkedBillIds: input.debtLinkedBillIds,
    forecastSummary: forecast?.summary ?? null,
    cashSnapshotReady: input.cashSnapshotReady ?? true,
    forecastReady: input.forecastReady ?? true,
  });

  const staleSnapshotWarning = dashboardWarnings.find(
    (warning) => warning.category === "stale_cash_snapshot"
  );

  const debtSummary = buildDashboardDebtSummary({
    accounts: input.debtAccounts ?? [],
    payments: input.debtPayments,
  });
  const nextPayment = formatDashboardDebtNextPaymentLabel(debtSummary.totals);

  const expenseDrilldown =
    input.shareKey === null
      ? null
      : buildManualExpenseDrilldown({
          expenses: input.manualExpenses,
          periodView,
          selectedYear: input.selectedYear,
          selectedMonth: input.selectedMonth,
          snapshotDate: input.snapshotDate ?? ownCashSnapshot?.snapshot_date ?? null,
          shareKey: input.shareKey,
          cardTotal: myManualExpenseTotalForView ?? 0,
          deductedManualExpenseIds: input.deductedManualExpenseIds,
        });

  const incomeEvents =
    input.paycheckSchedule && input.shareKey !== null
      ? filterOwnPaycheckIncomeEvents(
          buildPaycheckForecastIncomeEvents({
            settings: input.paycheckSchedule,
            range,
            signedInUserId: input.signedInUserId,
            snapshotDate: input.snapshotDate ?? ownCashSnapshot?.snapshot_date ?? null,
          }),
          input.signedInUserId
        )
      : [];

  const billRows =
    input.shareKey === null
      ? []
      : visibleBills.map((bill) =>
          buildBillRow(bill, input.shareKey!, input.debtLinkedBillIds, input.variableBillContext)
        );

  const unpaidRows = billRows.filter((row) => row.statusLabel === "Unpaid");
  const paidRows = billRows.filter((row) => row.statusLabel === "Paid");
  const variableRows = billRows.filter((row) => row.variableWarningLabel !== null);

  const periodBreakdown = (["1_14", "15_eom"] as const).map((bucket) => ({
    periodLabel: PERIOD_LABELS[bucket],
    totalLabel:
      input.shareKey === null
        ? "—"
        : formatCurrency(
            sumMyBillShareTotal(
              input.bills.filter((bill) => bill.period_bucket === bucket),
              input.shareKey,
              periodView
            ) ?? 0
          ),
  }));

  const expenseRows: MonthlyPrintReportExpenseRow[] =
    expenseDrilldown?.rows.map((row) => ({
      dateLabel: formatReportDate(row.date),
      description: row.description,
      amountLabel: formatCurrency(row.myShareAmount ?? row.amount),
      categoryLabel: row.category,
      rowTypeLabel: row.rowTypeLabel,
      sourceLabel: row.sourceLabel,
    })) ?? [];
  const expenseCategorySummary = buildCategorySummary(
    (expenseDrilldown?.rows ?? []).map((row) => ({
      category: row.category,
      amount: row.myShareAmount ?? row.amount,
    }))
  );

  const loadingBlockedMessage =
    input.shareKey === null && input.peopleLoaded
      ? "Choose your budget profile in Settings to generate your printable report."
      : null;

  return {
    header: {
      title: buildMonthlyPrintReportTitle(input.selectedYear, input.selectedMonth),
      monthLabel,
      generatedAtLabel: formatGeneratedAt(generatedAt),
      householdLabel: input.householdName?.trim() ? input.householdName.trim() : null,
      privateSectionCopy: MONTHLY_PRINT_REPORT_PRIVATE_SECTION_COPY,
    },
    cashPosition: {
      currentAmount: ownCashSnapshot ? Number(ownCashSnapshot.amount) : null,
      snapshotDateLabel: ownCashSnapshot?.snapshot_date
        ? formatReportDate(ownCashSnapshot.snapshot_date)
        : null,
      safeToSpendBeforeSavings,
      safeToSpendAfterSavings,
      projectedEndingBalance: forecast?.summary.projectedEndingBalance ?? null,
      missingSnapshotMessage: ownCashSnapshot ? null : staleSnapshotWarning?.description ?? null,
      staleSnapshotMessage:
        ownCashSnapshot && staleSnapshotWarning ? staleSnapshotWarning.description : null,
      viewLabel: "Full month",
    },
    bills: {
      totalLabel: myBillTotal == null ? "—" : formatCurrency(myBillTotal),
      unpaidTotalLabel:
        myUnpaidBillTotal == null ? "—" : formatDeductionAmount(myUnpaidBillTotal),
      paidTotalLabel: myPaidBillTotal == null ? "—" : formatCurrency(myPaidBillTotal),
      variableNeedsConfirmationCount: variableConfirmationCount,
      periodBreakdown,
      unpaidRows,
      paidRows,
      variableRows,
      emptyStateMessage:
        input.shareKey === null
          ? "Choose your budget profile to see bill totals."
          : billRows.length === 0
            ? `No bills recorded for ${monthLabel}.`
            : null,
    },
    debt: {
      activeDebtCount: filterActiveDebtAccounts(input.debtAccounts ?? []).length,
      remainingDebtLabel: formatCurrency(debtSummary.totals.totalRemaining),
      payoffLabel: formatDashboardDebtPayoffLabel(debtSummary.totals.payoffLabel),
      nextPaymentLabel: nextPayment.value,
      nextPaymentDescription: nextPayment.description,
      upcomingPayments: debtSummary.upcomingPayments.map((payment) => ({
        accountName: payment.accountName,
        paymentDateLabel: payment.paymentDateLabel,
        totalPaymentLabel: payment.totalPaymentLabel,
        paidStatusLabel: payment.paidStatusLabel,
        linkedBillLabel: payment.linkedBillLabel,
      })),
      emptyStateMessage: debtSummary.emptyStateMessage,
    },
    savings: {
      targetLabel: formatCurrency(mySavingsTargetForView),
      contributionsLabel: formatCurrency(myContributionsForView),
      remainingObligationLabel: formatCurrency(remainingSavingsObligationForView),
      sharedPrivacyCopy: SHARED_GOAL_PRIVACY_COPY,
      emptyStateMessage:
        mySavingsTargetForView === 0 && myContributionsForView === 0
          ? `No savings targets or contributions for ${monthLabel}.`
          : null,
    },
    expenses: {
      totalLabel:
        myManualExpenseTotalForView == null
          ? "—"
          : formatDeductionAmount(myManualExpenseTotalForView),
      categorySummary: expenseCategorySummary,
      rows: expenseRows,
      emptyStateMessage:
        input.shareKey === null
          ? "Choose your budget profile to see expense totals."
          : expenseRows.length === 0
            ? `No manual expenses or adjustments for ${monthLabel}.`
            : null,
    },
    income: {
      projectedTotalLabel: formatCurrency(
        incomeEvents.reduce((sum, event) => sum + event.amount, 0)
      ),
      scheduleStatusMessage:
        input.paycheckSchedule?.scheduleType === "disabled"
          ? PAYCHECK_SETTINGS_DISABLED_LABEL
          : input.paycheckSchedule == null
            ? "No paycheck schedule configured for your account."
            : null,
      rows: incomeEvents.map((event) => ({
        dateLabel: formatReportDate(event.date),
        amountLabel: formatCurrency(event.amount),
        scheduleLabel: event.sourceLabel,
      })),
      emptyStateMessage:
        incomeEvents.length === 0
          ? input.paycheckSchedule?.scheduleType === "disabled"
            ? PAYCHECK_SETTINGS_DISABLED_LABEL
            : "No projected paycheck income in this month."
          : null,
    },
    forecast: {
      windowLabel: forecast?.summary.windowLabel ?? null,
      projectedIncomeLabel:
        forecast == null ? null : formatCurrency(forecast.summary.totalProjectedIncome),
      projectedObligationsLabel:
        forecast == null
          ? null
          : formatDeductionAmount(forecast.summary.totalProjectedObligations),
      endingBalanceLabel:
        forecast == null ? null : formatCurrency(forecast.summary.projectedEndingBalance),
      lowestBalanceLabel:
        forecast == null ? null : formatCurrency(forecast.summary.lowestProjectedBalance),
      firstShortfallDateLabel: forecast?.summary.firstShortfallDate
        ? formatReportDate(forecast.summary.firstShortfallDate)
        : null,
      incompleteReason: forecast?.summary.incompleteReason ?? calendar.monthSummary.forecastIncompleteReason,
      emptyStateMessage:
        forecast == null
          ? input.shareKey === null
            ? "Choose your budget profile to include forecast data."
            : input.startingCash == null
              ? "Record your current amount in Settings to include forecast data."
              : "Forecast unavailable for this month."
          : null,
    },
    warnings: {
      rows: dashboardWarnings.map((warning) => ({
        severity: warning.severity,
        title: warning.title,
        description: warning.description,
        affectedArea: warning.affectedArea,
      })),
      emptyStateMessage:
        dashboardWarnings.length === 0 ? "No active warnings for this month." : null,
    },
    calendar: {
      monthSummaryLabel: calendar.monthSummary.monthLabel,
      days: calendar.chronologicalDays.map(buildCalendarDaySummary),
      emptyStateMessage: calendar.emptyStateMessage,
    },
    loadingBlockedMessage,
    errorMessage: null,
  };
}

export function monthlyPrintReportLabelsArePrivacySafe(
  report: MonthlyPrintReportResult
): boolean {
  const labels: Array<string | null | undefined> = [
    report.header.title,
    report.header.monthLabel,
    report.header.generatedAtLabel,
    report.header.householdLabel,
    report.header.privateSectionCopy,
    report.cashPosition.missingSnapshotMessage,
    report.cashPosition.staleSnapshotMessage,
    report.bills.emptyStateMessage,
    report.debt.emptyStateMessage,
    report.savings.sharedPrivacyCopy,
    report.savings.emptyStateMessage,
    report.expenses.emptyStateMessage,
    report.income.scheduleStatusMessage,
    report.income.emptyStateMessage,
    report.forecast.incompleteReason,
    report.forecast.emptyStateMessage,
    report.warnings.emptyStateMessage,
    report.calendar.emptyStateMessage,
    report.loadingBlockedMessage,
    report.errorMessage,
  ];

  for (const row of report.bills.unpaidRows) {
    labels.push(
      row.name,
      row.dueDateLabel,
      row.amountLabel,
      row.statusLabel,
      row.periodLabel,
      row.debtLinkedLabel,
      row.variableWarningLabel
    );
  }

  for (const row of report.income.rows) {
    labels.push(row.dateLabel, row.amountLabel, row.scheduleLabel);
  }

  for (const row of report.warnings.rows) {
    labels.push(row.title, row.description, row.affectedArea);
  }

  for (const day of report.calendar.days) {
    labels.push(day.dateLabel);
    for (const event of day.events) {
      labels.push(event.typeLabel, event.title, event.amountLabel, event.statusLabel);
    }
  }

  return labels.every((label) => !label || !UUID_PATTERN.test(label));
}

export function monthlyPrintReportMetadataIsSafe(report: MonthlyPrintReportResult): boolean {
  const serialized = JSON.stringify(report);
  return !SECRET_PATTERN.test(serialized);
}
