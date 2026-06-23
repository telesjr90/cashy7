import type { DebtPayment } from "@/lib/types";

export const DEBT_PRE_START_LABEL = "Before cashflow start";

export const DEBT_PAYMENTS_PRE_START_HIDDEN_NOTICE =
  "Debt payments before the cashflow start date are hidden from the active list.";

export const SHOW_PRE_START_DEBT_PAYMENTS_LABEL = "Show pre-start debt payments";

export const DEBT_PROGRESS_EXCLUDES_PRE_START_NOTICE =
  "Debt progress excludes payments before the cashflow start date.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function parseDebtPaymentDateOnly(
  paymentDate: string | null | undefined
): string | null {
  if (!paymentDate) {
    return null;
  }

  const match = paymentDate.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function isDebtPaymentOnOrAfterCashflowStart(
  payment: Pick<DebtPayment, "payment_date">,
  cashflowStartDate: string
): boolean {
  const paymentDate = parseDebtPaymentDateOnly(payment.payment_date);
  if (!paymentDate) {
    return true;
  }

  return paymentDate >= cashflowStartDate;
}

export function isDebtPaymentPreStart(
  payment: Pick<DebtPayment, "payment_date">,
  cashflowStartDate: string | null | undefined
): boolean {
  if (!cashflowStartDate) {
    return false;
  }

  return !isDebtPaymentOnOrAfterCashflowStart(payment, cashflowStartDate);
}

export function getDebtPaymentPreStartLabel(
  payment: Pick<DebtPayment, "payment_date">,
  cashflowStartDate: string | null | undefined
): string | null {
  return isDebtPaymentPreStart(payment, cashflowStartDate)
    ? DEBT_PRE_START_LABEL
    : null;
}

export function filterDebtPaymentsByCashflowStart<
  T extends Pick<DebtPayment, "payment_date">,
>(payments: readonly T[], cashflowStartDate: string | null | undefined): T[] {
  if (!cashflowStartDate) {
    return [...payments];
  }

  return payments.filter((payment) =>
    isDebtPaymentOnOrAfterCashflowStart(payment, cashflowStartDate)
  );
}

export function splitDebtPaymentsByCashflowStart<
  T extends Pick<DebtPayment, "payment_date">,
>(
  payments: readonly T[],
  cashflowStartDate: string | null | undefined
): { activePayments: T[]; preStartPayments: T[] } {
  if (!cashflowStartDate) {
    return { activePayments: [...payments], preStartPayments: [] };
  }

  const activePayments: T[] = [];
  const preStartPayments: T[] = [];

  for (const payment of payments) {
    if (isDebtPaymentOnOrAfterCashflowStart(payment, cashflowStartDate)) {
      activePayments.push(payment);
    } else {
      preStartPayments.push(payment);
    }
  }

  return { activePayments, preStartPayments };
}

/** Debt payments eligible for the default active list on the Debt page. */
export function getDebtPageVisiblePayments<
  T extends Pick<DebtPayment, "payment_date">,
>(
  payments: readonly T[],
  cashflowStartDate: string | null | undefined,
  showPreStartDebtPayments: boolean
): T[] {
  if (!cashflowStartDate || showPreStartDebtPayments) {
    return [...payments];
  }

  return filterDebtPaymentsByCashflowStart(payments, cashflowStartDate);
}

export function debtCashflowStartLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}
