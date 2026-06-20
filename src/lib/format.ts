/**
 * Splits a total amount into Teles 51% / Nicole 49% shares, rounded to cents.
 * Teles absorbs any rounding residual so the two shares always sum to the total.
 */
export function split5149(total: number): { teles: number; nicole: number } {
  const t = Math.round(total * 0.51 * 100) / 100;
  const n = Math.round((total - t) * 100) / 100;
  return { teles: t, nicole: n };
}

export function debtBillInstanceName(debtAccountName: string): string {
  return `Debt: ${debtAccountName}`;
}

export function computeRegularDebtPayment(
  balance: number,
  paymentsLeft: number
): number {
  if (paymentsLeft <= 0 || balance <= 0) return 0;
  return Math.floor((balance / paymentsLeft) * 100) / 100;
}

/** Regular payments stay equal; the final payment absorbs any cent remainder. */
export function computeDebtPaymentAmounts(
  balance: number,
  paymentsLeft: number,
  regularPayment?: number
): number[] {
  if (paymentsLeft <= 0 || balance <= 0) return [];

  const regular =
    regularPayment ?? computeRegularDebtPayment(balance, paymentsLeft);
  if (paymentsLeft === 1) {
    return [Math.round(balance * 100) / 100];
  }

  const amounts = Array.from({ length: paymentsLeft - 1 }, () => regular);
  const sumRegular = regular * (paymentsLeft - 1);
  const finalPayment = Math.round((balance - sumRegular) * 100) / 100;
  amounts.push(finalPayment);
  return amounts;
}

export type DebtPaymentBalanceDirection = "pay" | "unpay";

/** Apply a paid or unpaid debt payment to the account's current balance. */
export function applyDebtPaymentBalanceChange(
  currentBalance: number,
  paymentAmount: number,
  direction: DebtPaymentBalanceDirection
): number {
  if (direction === "pay") {
    return Math.max(0, Math.round((currentBalance - paymentAmount) * 100) / 100);
  }
  return Math.round((currentBalance + paymentAmount) * 100) / 100;
}

/** Projected balance after each payment if all were paid in order; does not mutate actual balance. */
export function computeProjectedRemainingBalances(
  startingBalance: number,
  paymentAmounts: number[]
): number[] {
  let remaining = startingBalance;
  return paymentAmounts.map((payment) => {
    remaining = Math.max(0, Math.round((remaining - payment) * 100) / 100);
    return remaining;
  });
}

export function splitDebtPayment(
  totalPayment: number,
  splitType: "5149" | "custom",
  customTeles?: number,
  customNicole?: number,
  regularTotal?: number
): { teles: number; nicole: number } {
  if (splitType === "5149") {
    return split5149(totalPayment);
  }

  if (
    customTeles !== undefined &&
    customNicole !== undefined &&
    regularTotal !== undefined &&
    regularTotal > 0
  ) {
    const teles =
      Math.round(((totalPayment * customTeles) / regularTotal) * 100) / 100;
    const nicole = Math.round((totalPayment - teles) * 100) / 100;
    return { teles, nicole };
  }

  return split5149(totalPayment);
}

const CAD_SYMBOL = "CA" + String.fromCharCode(36);

export function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const body = CAD_SYMBOL + formatted;
  return value < 0 ? "-" + body : body;
}
