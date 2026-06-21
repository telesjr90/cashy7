import type { DebtAccount, DebtPayment } from "@/lib/types";
import {
  filterActiveDebtAccounts,
  getDebtAccountArchivedBadgeLabel,
  isDebtAccountArchived,
} from "@/lib/debt-accounts";

export type DebtProgressPayment = Pick<
  DebtPayment,
  "id" | "debt_account_id" | "payment_date" | "total_payment" | "paid_status"
>;

export type DebtProgressAccount = Pick<
  DebtAccount,
  "id" | "name" | "original_amount" | "is_archived" | "current_balance"
>;

export type DebtAccountProgress = {
  accountId: string;
  accountName: string;
  originalAmount: number;
  totalPaid: number;
  remainingBalance: number;
  progressPercentage: number;
  nextPayment: DebtProgressPayment | null;
  upcomingPayments: DebtProgressPayment[];
  remainingUnpaidCount: number;
  estimatedPayoffDate: string | null;
  payoffLabel: string;
  isArchived: boolean;
  archivedBadgeLabel: string | null;
};

export type DebtProgressTotals = {
  accountCount: number;
  totalOriginal: number;
  totalPaid: number;
  totalRemaining: number;
  progressPercentage: number;
  nextPayment: DebtProgressPayment | null;
  nextPaymentAccountName: string | null;
  estimatedPayoffDate: string | null;
  payoffLabel: string;
};

export const DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED = "Not enough scheduled payments";
export const DEBT_PAYOFF_PAID_OFF_LABEL = "Paid off";

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function isDebtPaymentPaid(
  payment: Pick<DebtPayment, "paid_status">
): boolean {
  return payment.paid_status === true;
}

export function filterPaidDebtPayments<
  T extends Pick<DebtPayment, "paid_status">,
>(payments: readonly T[]): T[] {
  return payments.filter((payment) => isDebtPaymentPaid(payment));
}

export function filterUnpaidDebtPayments<
  T extends Pick<DebtPayment, "paid_status">,
>(payments: readonly T[]): T[] {
  return payments.filter((payment) => !isDebtPaymentPaid(payment));
}

export function computeTotalPaidFromPayments(
  payments: readonly Pick<DebtPayment, "total_payment" | "paid_status">[]
): number {
  return roundCurrency(
    filterPaidDebtPayments(payments).reduce(
      (sum, payment) => sum + payment.total_payment,
      0
    )
  );
}

export function computeRemainingBalance(
  originalAmount: number,
  totalPaid: number
): number {
  return Math.max(0, roundCurrency(originalAmount - totalPaid));
}

export function computeProgressPercentage(
  originalAmount: number,
  totalPaid: number
): number {
  if (originalAmount <= 0) {
    return 0;
  }

  const raw = (totalPaid / originalAmount) * 100;
  return Math.min(100, Math.max(0, Math.round(raw * 10) / 10));
}

export function sortDebtPaymentsByDate<
  T extends Pick<DebtPayment, "payment_date">,
>(payments: readonly T[]): T[] {
  return [...payments].sort((left, right) =>
    left.payment_date.localeCompare(right.payment_date)
  );
}

export function getUpcomingUnpaidPayments<
  T extends Pick<DebtPayment, "paid_status" | "payment_date">,
>(payments: readonly T[]): T[] {
  return sortDebtPaymentsByDate(filterUnpaidDebtPayments(payments));
}

export function getNextScheduledPayment<
  T extends Pick<DebtPayment, "paid_status" | "payment_date">,
>(payments: readonly T[]): T | null {
  const upcoming = getUpcomingUnpaidPayments(payments);
  return upcoming[0] ?? null;
}

export function countRemainingUnpaidPayments(
  payments: readonly Pick<DebtPayment, "paid_status">[]
): number {
  return filterUnpaidDebtPayments(payments).length;
}

export function estimatePayoffDate(
  remainingBalance: number,
  unpaidPayments: readonly Pick<DebtPayment, "payment_date" | "total_payment">[]
): string | null {
  if (remainingBalance <= 0) {
    return null;
  }

  const sorted = sortDebtPaymentsByDate(unpaidPayments);
  let cumulative = 0;

  for (const payment of sorted) {
    cumulative = roundCurrency(cumulative + payment.total_payment);
    if (cumulative + 0.001 >= remainingBalance) {
      return payment.payment_date;
    }
  }

  return null;
}

export function resolvePayoffLabel(
  remainingBalance: number,
  estimatedPayoffDate: string | null,
  unpaidPaymentCount: number
): string {
  if (remainingBalance <= 0) {
    return DEBT_PAYOFF_PAID_OFF_LABEL;
  }

  if (estimatedPayoffDate) {
    return estimatedPayoffDate;
  }

  if (unpaidPaymentCount === 0) {
    return DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED;
  }

  return DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED;
}

export function formatDebtProgressDate(date: string | null): string | null {
  if (!date) {
    return null;
  }

  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

export function formatDebtProgressPayoffLabel(payoffLabel: string): string {
  if (
    payoffLabel === DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED ||
    payoffLabel === DEBT_PAYOFF_PAID_OFF_LABEL
  ) {
    return payoffLabel;
  }

  return formatDebtProgressDate(payoffLabel) ?? payoffLabel;
}

export function buildDebtAccountProgress(
  account: DebtProgressAccount,
  payments: readonly DebtProgressPayment[]
): DebtAccountProgress {
  const accountPayments = payments.filter(
    (payment) => payment.debt_account_id === account.id
  );
  const totalPaid = computeTotalPaidFromPayments(accountPayments);
  const remainingBalance = computeRemainingBalance(
    account.original_amount,
    totalPaid
  );
  const upcomingPayments = getUpcomingUnpaidPayments(accountPayments);
  const nextPayment = upcomingPayments[0] ?? null;
  const remainingUnpaidCount = upcomingPayments.length;
  const estimatedPayoffDate = estimatePayoffDate(
    remainingBalance,
    upcomingPayments
  );
  const payoffLabel = resolvePayoffLabel(
    remainingBalance,
    estimatedPayoffDate,
    remainingUnpaidCount
  );

  return {
    accountId: account.id,
    accountName: account.name,
    originalAmount: account.original_amount,
    totalPaid,
    remainingBalance,
    progressPercentage: computeProgressPercentage(
      account.original_amount,
      totalPaid
    ),
    nextPayment,
    upcomingPayments,
    remainingUnpaidCount,
    estimatedPayoffDate,
    payoffLabel,
    isArchived: isDebtAccountArchived(account),
    archivedBadgeLabel: getDebtAccountArchivedBadgeLabel(account),
  };
}

export function buildDebtProgressTotals(
  accounts: readonly DebtProgressAccount[],
  payments: readonly DebtProgressPayment[],
  accountNameById: ReadonlyMap<string, string> = new Map(
    accounts.map((account) => [account.id, account.name])
  )
): DebtProgressTotals {
  const progressRows = accounts.map((account) =>
    buildDebtAccountProgress(account, payments)
  );

  const totalOriginal = roundCurrency(
    progressRows.reduce((sum, row) => sum + row.originalAmount, 0)
  );
  const totalPaid = roundCurrency(
    progressRows.reduce((sum, row) => sum + row.totalPaid, 0)
  );
  const totalRemaining = roundCurrency(
    progressRows.reduce((sum, row) => sum + row.remainingBalance, 0)
  );

  let nextPayment: DebtProgressPayment | null = null;
  for (const row of progressRows) {
    if (!row.nextPayment) {
      continue;
    }
    if (
      !nextPayment ||
      row.nextPayment.payment_date.localeCompare(nextPayment.payment_date) < 0
    ) {
      nextPayment = row.nextPayment;
    }
  }

  const payoffDates = progressRows
    .map((row) => row.estimatedPayoffDate)
    .filter((date): date is string => date !== null);

  let estimatedPayoffDate: string | null = null;
  if (payoffDates.length === progressRows.length && payoffDates.length > 0) {
    estimatedPayoffDate = payoffDates.reduce((latest, date) =>
      date.localeCompare(latest) > 0 ? date : latest
    );
  } else if (totalRemaining <= 0 && progressRows.length > 0) {
    estimatedPayoffDate = null;
  }

  const anyUnpaidScheduled = progressRows.some(
    (row) => row.remainingUnpaidCount > 0
  );
  const payoffLabel = resolvePayoffLabel(
    totalRemaining,
    estimatedPayoffDate,
    anyUnpaidScheduled ? 1 : 0
  );

  return {
    accountCount: accounts.length,
    totalOriginal,
    totalPaid,
    totalRemaining,
    progressPercentage: computeProgressPercentage(totalOriginal, totalPaid),
    nextPayment,
    nextPaymentAccountName: nextPayment
      ? (accountNameById.get(nextPayment.debt_account_id) ?? null)
      : null,
    estimatedPayoffDate,
    payoffLabel,
  };
}

export function buildActiveDebtProgressTotals(
  accounts: readonly DebtProgressAccount[],
  payments: readonly DebtProgressPayment[]
): DebtProgressTotals {
  return buildDebtProgressTotals(filterActiveDebtAccounts(accounts), payments);
}

export function buildDebtAccountProgressList(
  accounts: readonly DebtProgressAccount[],
  payments: readonly DebtProgressPayment[]
): DebtAccountProgress[] {
  return accounts.map((account) => buildDebtAccountProgress(account, payments));
}
