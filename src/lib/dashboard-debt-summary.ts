import { formatBillPeriodBucketLabel } from "@/lib/bill-detail";
import { filterActiveDebtAccounts } from "@/lib/debt-accounts";
import {
  buildActiveDebtProgressTotals,
  formatDebtProgressDate,
  formatDebtProgressPayoffLabel,
  getUpcomingUnpaidPayments,
  type DebtProgressAccount,
  type DebtProgressPayment,
  type DebtProgressTotals,
} from "@/lib/debt-progress";
import { formatCurrency } from "@/lib/format";
import type { DebtPayment } from "@/lib/types";

export type DashboardDebtSummaryPaymentInput = Pick<
  DebtPayment,
  | "id"
  | "debt_account_id"
  | "payment_date"
  | "total_payment"
  | "teles_amount"
  | "nicole_amount"
  | "period_bucket"
  | "paid_status"
  | "linked_bill_instance_id"
>;

export type DashboardDebtUpcomingPaymentRow = {
  rowKey: string;
  accountName: string;
  paymentDateLabel: string;
  totalPaymentLabel: string;
  telesAmountLabel: string;
  nicoleAmountLabel: string;
  periodBucketLabel: string | null;
  paidStatusLabel: string;
  linkedBillLabel: string | null;
};

export type DashboardDebtSummaryResult = {
  totals: DebtProgressTotals;
  upcomingPayments: DashboardDebtUpcomingPaymentRow[];
  hasActiveDebts: boolean;
  emptyStateMessage: string | null;
  sourceContextLabel: string;
};

export const DASHBOARD_DEBT_EMPTY_MESSAGE =
  "No active debt accounts. Add debts on the Debt page to track payoff progress.";

export const DASHBOARD_DEBT_SOURCE_CONTEXT =
  "Active household debt from paid payment rows and scheduled unpaid payments.";

export const DASHBOARD_DEBT_LINKED_BILL_LABEL = "Linked bill";

export const DASHBOARD_DEBT_UPCOMING_PAYMENT_LIMIT = 8;

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function toProgressPayment(
  payment: DashboardDebtSummaryPaymentInput
): DebtProgressPayment {
  return {
    id: payment.id,
    debt_account_id: payment.debt_account_id,
    payment_date: payment.payment_date,
    total_payment: payment.total_payment,
    paid_status: payment.paid_status,
  };
}

function resolveAccountName(
  accountNameById: ReadonlyMap<string, string>,
  debtAccountId: string
): string {
  return accountNameById.get(debtAccountId) ?? "Debt account";
}

function buildUpcomingPaymentRow(
  payment: DashboardDebtSummaryPaymentInput,
  accountNameById: ReadonlyMap<string, string>
): DashboardDebtUpcomingPaymentRow {
  const accountName = resolveAccountName(accountNameById, payment.debt_account_id);

  return {
    rowKey: payment.id,
    accountName,
    paymentDateLabel:
      formatDebtProgressDate(payment.payment_date) ?? payment.payment_date,
    totalPaymentLabel: formatCurrency(payment.total_payment),
    telesAmountLabel: formatCurrency(payment.teles_amount),
    nicoleAmountLabel: formatCurrency(payment.nicole_amount),
    periodBucketLabel: formatBillPeriodBucketLabel(payment.period_bucket),
    paidStatusLabel: payment.paid_status ? "Paid" : "Unpaid",
    linkedBillLabel: payment.linked_bill_instance_id
      ? DASHBOARD_DEBT_LINKED_BILL_LABEL
      : null,
  };
}

export interface BuildDashboardDebtSummaryInput {
  accounts: readonly DebtProgressAccount[];
  payments: readonly DashboardDebtSummaryPaymentInput[];
  upcomingLimit?: number;
}

export function buildDashboardDebtSummary(
  input: BuildDashboardDebtSummaryInput
): DashboardDebtSummaryResult {
  const activeAccounts = filterActiveDebtAccounts(input.accounts);
  const activeAccountIds = new Set(activeAccounts.map((account) => account.id));
  const accountNameById = new Map(
    activeAccounts.map((account) => [account.id, account.name])
  );
  const progressPayments = input.payments.map(toProgressPayment);
  const activePayments = input.payments.filter((payment) =>
    activeAccountIds.has(payment.debt_account_id)
  );
  const upcomingLimit =
    input.upcomingLimit ?? DASHBOARD_DEBT_UPCOMING_PAYMENT_LIMIT;
  const upcomingPayments = getUpcomingUnpaidPayments(activePayments)
    .slice(0, upcomingLimit)
    .map((payment) => buildUpcomingPaymentRow(payment, accountNameById));

  return {
    totals: buildActiveDebtProgressTotals(input.accounts, progressPayments),
    upcomingPayments,
    hasActiveDebts: activeAccounts.length > 0,
    emptyStateMessage:
      activeAccounts.length === 0 ? DASHBOARD_DEBT_EMPTY_MESSAGE : null,
    sourceContextLabel: DASHBOARD_DEBT_SOURCE_CONTEXT,
  };
}

export function formatDashboardDebtPayoffLabel(payoffLabel: string): string {
  return formatDebtProgressPayoffLabel(payoffLabel);
}

export function formatDashboardDebtNextPaymentLabel(
  totals: DebtProgressTotals
): { value: string; description: string | null } {
  if (!totals.nextPayment) {
    return { value: "None scheduled", description: null };
  }

  const dateLabel =
    formatDebtProgressDate(totals.nextPayment.payment_date) ??
    totals.nextPayment.payment_date;
  const amountLabel = formatCurrency(totals.nextPayment.total_payment);
  const accountLabel = totals.nextPaymentAccountName;

  return {
    value: dateLabel,
    description: accountLabel ? `${accountLabel} · ${amountLabel}` : amountLabel,
  };
}

export function dashboardDebtSummaryLabelsArePrivacySafe(input: {
  summary: DashboardDebtSummaryResult;
}): boolean {
  const labels: Array<string | null | undefined> = [
    input.summary.emptyStateMessage,
    input.summary.sourceContextLabel,
    formatDashboardDebtPayoffLabel(input.summary.totals.payoffLabel),
  ];

  const nextPayment = formatDashboardDebtNextPaymentLabel(input.summary.totals);
  labels.push(nextPayment.value, nextPayment.description);

  for (const row of input.summary.upcomingPayments) {
    labels.push(
      row.accountName,
      row.paymentDateLabel,
      row.totalPaymentLabel,
      row.telesAmountLabel,
      row.nicoleAmountLabel,
      row.periodBucketLabel,
      row.paidStatusLabel,
      row.linkedBillLabel
    );
  }

  return labels.every((label) => !label || !UUID_PATTERN.test(label));
}
