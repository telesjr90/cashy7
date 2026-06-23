import type { BillShareKey } from "@/lib/bill-share";
import { getMyBillShareAmount } from "@/lib/bill-share";
import { filterBillsForDashboardView } from "@/lib/dashboard-drilldowns";
import { filterUnpaidDebtPayments } from "@/lib/debt-progress";
import type { PeriodView } from "@/lib/periods";
import { getDashboardViewDateRange } from "@/lib/savings";
import type { SafeToSpendForecastSummary } from "@/lib/safe-to-spend-forecast";
import type { BillInstance, CashSnapshot, DebtPayment } from "@/lib/types";

export type DashboardWarningSeverity = "critical" | "warning" | "info";

export type DashboardWarningCategory =
  | "stale_cash_snapshot"
  | "missing_budget_profile"
  | "missing_variable_bill_amount"
  | "negative_safe_to_spend"
  | "forecast_shortfall"
  | "unpaid_required_obligations"
  | "no_cashflow_start_date";

export type DashboardWarningAffectedArea =
  | "Safe-to-spend"
  | "Forecast"
  | "Bills"
  | "Savings"
  | "Cash setup"
  | "Settings"
  | "Debt";

export interface DashboardWarning {
  id: string;
  category: DashboardWarningCategory;
  severity: DashboardWarningSeverity;
  title: string;
  description: string;
  affectedArea: DashboardWarningAffectedArea;
  actionLabel?: string;
  actionPath?: string;
  drilldownKind?:
    | "unpaid-bills"
    | "savings"
    | "safe-to-spend-before"
    | "safe-to-spend-after";
}

export type DashboardWarningDebtPayment = Pick<
  DebtPayment,
  | "id"
  | "payment_date"
  | "teles_amount"
  | "nicole_amount"
  | "paid_status"
  | "linked_bill_instance_id"
  | "period_bucket"
>;

export interface BuildDashboardWarningsInput {
  signedInUserId: string;
  shareKey: BillShareKey | null;
  peopleLoaded: boolean;
  cashSnapshot: Pick<CashSnapshot, "snapshot_date" | "amount" | "user_id"> | null;
  cashflowStartDate: string | null;
  settingsLoaded: boolean;
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  today?: string;
  safeToSpendBeforeSavings: number | null;
  safeToSpendAfterSavings: number | null;
  variableBillCountForView: number;
  forecastVariableBillCount?: number;
  remainingSavingsObligation: number;
  bills: BillInstance[];
  debtPayments: readonly DashboardWarningDebtPayment[];
  debtLinkedBillIds: ReadonlySet<string>;
  forecastSummary?: Pick<
    SafeToSpendForecastSummary,
    "hasShortfall" | "firstShortfallDate" | "windowLabel"
  > | null;
  cashSnapshotReady?: boolean;
  forecastReady?: boolean;
}

export const STALE_CASH_SNAPSHOT_MAX_AGE_DAYS = 7;

export const DASHBOARD_WARNINGS_SETTINGS_PATH = "/settings";
export const DASHBOARD_WARNINGS_BILLS_PATH = "/bills";
export const DASHBOARD_WARNINGS_DEBT_PATH = "/debt";
export const DASHBOARD_WARNINGS_SAVINGS_PATH = "/settings";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const SEVERITY_ORDER: Record<DashboardWarningSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const CATEGORY_ORDER: Record<DashboardWarningCategory, number> = {
  forecast_shortfall: 0,
  negative_safe_to_spend: 1,
  stale_cash_snapshot: 2,
  missing_budget_profile: 3,
  missing_variable_bill_amount: 4,
  no_cashflow_start_date: 5,
  unpaid_required_obligations: 6,
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

function resolveToday(input?: string): string {
  return parseDateOnly(input) ?? formatIsoDate(new Date());
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

function dateInViewRange(
  date: string,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): boolean {
  const { start, end } = getDashboardViewDateRange(
    periodView,
    selectedYear,
    selectedMonth
  );
  return date >= start && date <= end;
}

export function filterOwnCashSnapshot(
  snapshot: Pick<CashSnapshot, "snapshot_date" | "amount" | "user_id"> | null,
  signedInUserId: string
): Pick<CashSnapshot, "snapshot_date" | "amount" | "user_id"> | null {
  if (!snapshot) {
    return null;
  }

  if (snapshot.user_id !== signedInUserId) {
    return null;
  }

  return snapshot;
}

export function isCashSnapshotMissing(
  snapshot: Pick<CashSnapshot, "snapshot_date" | "amount" | "user_id"> | null,
  signedInUserId: string
): boolean {
  return filterOwnCashSnapshot(snapshot, signedInUserId) === null;
}

export function isCashSnapshotStale(input: {
  snapshotDate: string | null | undefined;
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  today?: string;
  maxAgeDays?: number;
}): boolean {
  const snapshotDate = parseDateOnly(input.snapshotDate);
  if (!snapshotDate) {
    return true;
  }

  const today = resolveToday(input.today);
  const maxAgeDays = input.maxAgeDays ?? STALE_CASH_SNAPSHOT_MAX_AGE_DAYS;
  const staleByAge = snapshotDate < addDays(today, -(maxAgeDays - 1));

  const viewStart = getDashboardViewDateRange(
    input.periodView,
    input.selectedYear,
    input.selectedMonth
  ).start;
  const staleByPeriod = snapshotDate < viewStart;

  return staleByAge || staleByPeriod;
}

export function countUnpaidBillsInDashboardView(input: {
  bills: BillInstance[];
  shareKey: BillShareKey;
  periodView: PeriodView;
}): number {
  const visibleBills = filterBillsForDashboardView(input.bills, input.periodView);

  return visibleBills.filter((bill) => {
    if (bill.is_paid || bill.paid_status === "paid") {
      return false;
    }

    const share = getMyBillShareAmount(bill, input.shareKey) ?? 0;
    return share > 0;
  }).length;
}

export function countUnpaidDebtPaymentsInDashboardView(input: {
  debtPayments: readonly DashboardWarningDebtPayment[];
  bills: BillInstance[];
  debtLinkedBillIds: ReadonlySet<string>;
  shareKey: BillShareKey;
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
}): number {
  const unpaidBillIds = new Set(
    input.bills
      .filter((bill) => !bill.is_paid && bill.paid_status !== "paid")
      .map((bill) => bill.id)
  );

  return filterUnpaidDebtPayments(input.debtPayments)
    .filter((payment) => {
      const paymentDate = parseDateOnly(payment.payment_date);
      if (!paymentDate) {
        return false;
      }

      if (
        !dateInViewRange(
          paymentDate,
          input.periodView,
          input.selectedYear,
          input.selectedMonth
        )
      ) {
        return false;
      }

      if (input.periodView !== "full" && payment.period_bucket !== input.periodView) {
        return false;
      }

      if (
        payment.linked_bill_instance_id &&
        unpaidBillIds.has(payment.linked_bill_instance_id)
      ) {
        return false;
      }

      const shareAmount =
        input.shareKey === "teles_amount"
          ? Number(payment.teles_amount)
          : Number(payment.nicole_amount);

      return Number.isFinite(shareAmount) && shareAmount > 0;
    }).length;
}

export function dashboardWarningLabelsArePrivacySafe(
  warnings: ReadonlyArray<
    Pick<DashboardWarning, "title" | "description" | "actionLabel" | "affectedArea">
  >
): boolean {
  for (const warning of warnings) {
    const labels = [
      warning.title,
      warning.description,
      warning.actionLabel,
      warning.affectedArea,
    ];

    if (!labels.every((label) => !label || !UUID_PATTERN.test(label))) {
      return false;
    }
  }

  return true;
}

function sortWarnings(warnings: DashboardWarning[]): DashboardWarning[] {
  return [...warnings].sort((left, right) => {
    const severityCompare =
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityCompare !== 0) {
      return severityCompare;
    }

    return CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
  });
}

function buildStaleCashSnapshotWarning(input: {
  snapshot: Pick<CashSnapshot, "snapshot_date" | "amount" | "user_id"> | null;
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  today?: string;
}): DashboardWarning | null {
  if (!input.snapshot) {
    return {
      id: "stale-cash-missing",
      category: "stale_cash_snapshot",
      severity: "warning",
      title: "No current amount recorded",
      description:
        "Safe-to-spend and the future forecast need your latest available amount. Record it so totals stay accurate.",
      affectedArea: "Cash setup",
      actionLabel: "Update in Settings",
      actionPath: DASHBOARD_WARNINGS_SETTINGS_PATH,
    };
  }

  if (
    !isCashSnapshotStale({
      snapshotDate: input.snapshot.snapshot_date,
      periodView: input.periodView,
      selectedYear: input.selectedYear,
      selectedMonth: input.selectedMonth,
      today: input.today,
    })
  ) {
    return null;
  }

  return {
    id: "stale-cash-outdated",
    category: "stale_cash_snapshot",
    severity: "warning",
    title: "Current amount snapshot is outdated",
    description:
      "Your recorded available amount is older than this view or has not been refreshed recently. Safe-to-spend and forecast may be outdated until you update it.",
    affectedArea: "Cash setup",
    actionLabel: "Update in Settings",
    actionPath: DASHBOARD_WARNINGS_SETTINGS_PATH,
  };
}

function buildMissingBudgetProfileWarning(
  peopleLoaded: boolean,
  shareKey: BillShareKey | null
): DashboardWarning | null {
  if (!peopleLoaded || shareKey !== null) {
    return null;
  }

  return {
    id: "missing-budget-profile",
    category: "missing_budget_profile",
    severity: "warning",
    title: "Budget profile not set up",
    description:
      "Choose your budget profile so bill shares, savings targets, and private safe-to-spend calculations can load for you.",
    affectedArea: "Settings",
    actionLabel: "Set up profile",
    actionPath: DASHBOARD_WARNINGS_SETTINGS_PATH,
  };
}

function buildVariableBillWarning(variableBillCount: number): DashboardWarning | null {
  if (variableBillCount <= 0) {
    return null;
  }

  const billLabel = variableBillCount === 1 ? "bill" : "bills";

  return {
    id: "missing-variable-bill-amount",
    category: "missing_variable_bill_amount",
    severity: "warning",
    title: "Variable bill amounts need confirmation",
    description: `${variableBillCount} variable ${billLabel} in this view still need a confirmed amount. Bill totals and forecast may be incomplete until you confirm them.`,
    affectedArea: "Bills",
    actionLabel: "Confirm on Bills",
    actionPath: DASHBOARD_WARNINGS_BILLS_PATH,
  };
}

function buildNegativeSafeToSpendWarnings(input: {
  safeToSpendBeforeSavings: number | null;
  safeToSpendAfterSavings: number | null;
  shareKey: BillShareKey | null;
}): DashboardWarning[] {
  if (input.shareKey === null) {
    return [];
  }

  const warnings: DashboardWarning[] = [];

  if (
    input.safeToSpendBeforeSavings !== null &&
    input.safeToSpendBeforeSavings < 0
  ) {
    warnings.push({
      id: "negative-safe-to-spend-before",
      category: "negative_safe_to_spend",
      severity: "critical",
      title: "Safe to spend before savings is negative",
      description:
        "Your unpaid bills and manual expenses in this view exceed your recorded available amount.",
      affectedArea: "Safe-to-spend",
      actionLabel: "Review breakdown",
      drilldownKind: "safe-to-spend-before",
    });
  }

  if (
    input.safeToSpendAfterSavings !== null &&
    input.safeToSpendAfterSavings < 0
  ) {
    warnings.push({
      id: "negative-safe-to-spend-after",
      category: "negative_safe_to_spend",
      severity: "critical",
      title: "Safe to spend after savings is negative",
      description:
        "After required savings obligations, your available amount in this view is below zero.",
      affectedArea: "Safe-to-spend",
      actionLabel: "Review savings impact",
      drilldownKind: "safe-to-spend-after",
    });
  }

  return warnings;
}

function buildForecastShortfallWarning(
  forecastSummary: BuildDashboardWarningsInput["forecastSummary"]
): DashboardWarning | null {
  if (!forecastSummary?.hasShortfall) {
    return null;
  }

  const dateSuffix = forecastSummary.firstShortfallDate
    ? ` on ${forecastSummary.firstShortfallDate}`
    : "";

  return {
    id: "forecast-shortfall",
    category: "forecast_shortfall",
    severity: "critical",
    title: "Projected balance shortfall",
    description: `Your ${forecastSummary.windowLabel.toLowerCase()} forecast drops below zero${dateSuffix}. Review upcoming bills, debt payments, savings obligations, and expenses in that window.`,
    affectedArea: "Forecast",
  };
}

function buildUnpaidRequiredObligationsWarning(input: {
  shareKey: BillShareKey | null;
  bills: BillInstance[];
  debtPayments: readonly DashboardWarningDebtPayment[];
  debtLinkedBillIds: ReadonlySet<string>;
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  remainingSavingsObligation: number;
}): DashboardWarning | null {
  if (input.shareKey === null) {
    return null;
  }

  const unpaidBillCount = countUnpaidBillsInDashboardView({
    bills: input.bills,
    shareKey: input.shareKey,
    periodView: input.periodView,
  });
  const unpaidDebtCount = countUnpaidDebtPaymentsInDashboardView({
    debtPayments: input.debtPayments,
    bills: input.bills,
    debtLinkedBillIds: input.debtLinkedBillIds,
    shareKey: input.shareKey,
    periodView: input.periodView,
    selectedYear: input.selectedYear,
    selectedMonth: input.selectedMonth,
  });
  const hasSavingsObligation = input.remainingSavingsObligation > 0;

  if (unpaidBillCount === 0 && unpaidDebtCount === 0 && !hasSavingsObligation) {
    return null;
  }

  const parts: string[] = [];
  if (unpaidBillCount > 0) {
    parts.push(
      `${unpaidBillCount} unpaid bill${unpaidBillCount === 1 ? "" : "s"}`
    );
  }
  if (unpaidDebtCount > 0) {
    parts.push(
      `${unpaidDebtCount} scheduled debt payment${unpaidDebtCount === 1 ? "" : "s"}`
    );
  }
  if (hasSavingsObligation) {
    parts.push("remaining savings obligation");
  }

  const primaryAction =
    unpaidBillCount > 0
      ? {
          actionLabel: "Review unpaid bills",
          actionPath: DASHBOARD_WARNINGS_BILLS_PATH,
          drilldownKind: "unpaid-bills" as const,
        }
      : unpaidDebtCount > 0
        ? {
            actionLabel: "Review debt",
            actionPath: DASHBOARD_WARNINGS_DEBT_PATH,
          }
        : {
            actionLabel: "Review savings",
            actionPath: DASHBOARD_WARNINGS_SAVINGS_PATH,
            drilldownKind: "savings" as const,
          };

  return {
    id: "unpaid-required-obligations",
    category: "unpaid_required_obligations",
    severity: "info",
    title: "Required outflows still unpaid",
    description: `This view still includes ${parts.join(", ")}. These amounts are already reflected in your safe-to-spend totals.`,
    affectedArea:
      unpaidBillCount > 0
        ? "Bills"
        : unpaidDebtCount > 0
          ? "Debt"
          : "Savings",
    ...primaryAction,
  };
}

function buildNoCashflowStartDateWarning(
  settingsLoaded: boolean,
  cashflowStartDate: string | null
): DashboardWarning | null {
  if (!settingsLoaded || cashflowStartDate) {
    return null;
  }

  return {
    id: "no-cashflow-start-date",
    category: "no_cashflow_start_date",
    severity: "warning",
    title: "Cashflow start date not configured",
    description:
      "Historical bills before your planning start may still affect dashboard totals until a household cashflow start date is set.",
    affectedArea: "Settings",
    actionLabel: "Set start date",
    actionPath: DASHBOARD_WARNINGS_SETTINGS_PATH,
  };
}

export function buildDashboardWarnings(
  input: BuildDashboardWarningsInput
): DashboardWarning[] {
  const ownCashSnapshot = filterOwnCashSnapshot(
    input.cashSnapshot,
    input.signedInUserId
  );
  const variableBillCount = Math.max(
    input.variableBillCountForView,
    input.forecastVariableBillCount ?? 0
  );

  const warnings = [
    input.forecastReady === false
      ? null
      : buildForecastShortfallWarning(input.forecastSummary),
    ...buildNegativeSafeToSpendWarnings({
      safeToSpendBeforeSavings: input.safeToSpendBeforeSavings,
      safeToSpendAfterSavings: input.safeToSpendAfterSavings,
      shareKey: input.shareKey,
    }),
    input.cashSnapshotReady === false
      ? null
      : buildStaleCashSnapshotWarning({
          snapshot: ownCashSnapshot,
          periodView: input.periodView,
          selectedYear: input.selectedYear,
          selectedMonth: input.selectedMonth,
          today: input.today,
        }),
    buildMissingBudgetProfileWarning(input.peopleLoaded, input.shareKey),
    buildVariableBillWarning(variableBillCount),
    buildNoCashflowStartDateWarning(input.settingsLoaded, input.cashflowStartDate),
    buildUnpaidRequiredObligationsWarning({
      shareKey: input.shareKey,
      bills: input.bills,
      debtPayments: input.debtPayments,
      debtLinkedBillIds: input.debtLinkedBillIds,
      periodView: input.periodView,
      selectedYear: input.selectedYear,
      selectedMonth: input.selectedMonth,
      remainingSavingsObligation: input.remainingSavingsObligation,
    }),
  ].filter((warning): warning is DashboardWarning => warning !== null);

  return sortWarnings(warnings);
}
