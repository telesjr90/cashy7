import { describe, expect, it } from "vitest";
import type { DebtAccount, DebtPayment } from "@/lib/types";
import {
  buildActiveDebtProgressTotals,
  buildDebtAccountProgress,
  buildDebtProgressTotals,
  computeProgressPercentage,
  computeRemainingBalance,
  computeTotalPaidFromPayments,
  countRemainingUnpaidPayments,
  DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED,
  DEBT_PAYOFF_PAID_OFF_LABEL,
  estimatePayoffDate,
  filterPaidDebtPayments,
  filterUnpaidDebtPayments,
  formatDebtProgressPayoffLabel,
  getNextScheduledPayment,
  getUpcomingUnpaidPayments,
  resolvePayoffLabel,
} from "@/lib/debt-progress";

function makeAccount(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: "account-1",
    household_id: "household-1",
    name: "Visa",
    original_amount: 1000,
    current_balance: 400,
    target_payoff_date: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    is_archived: false,
    archived_at: null,
    archive_reason: null,
    ...overrides,
  };
}

function makePayment(
  overrides: Partial<DebtPayment> = {}
): Pick<
  DebtPayment,
  "id" | "debt_account_id" | "payment_date" | "total_payment" | "paid_status"
> {
  return {
    id: "payment-1",
    debt_account_id: "account-1",
    payment_date: "2026-07-01",
    total_payment: 100,
    paid_status: false,
    ...overrides,
  };
}

describe("debt progress helpers", () => {
  it("computes total paid from paid rows only", () => {
    const payments = [
      makePayment({ id: "p1", total_payment: 200, paid_status: true }),
      makePayment({ id: "p2", total_payment: 150, paid_status: true }),
      makePayment({ id: "p3", total_payment: 100, paid_status: false }),
    ];

    expect(filterPaidDebtPayments(payments)).toHaveLength(2);
    expect(filterUnpaidDebtPayments(payments)).toHaveLength(1);
    expect(computeTotalPaidFromPayments(payments)).toBe(350);
  });

  it("excludes unpaid rows from paid total", () => {
    const payments = [
      makePayment({ total_payment: 500, paid_status: false }),
      makePayment({ id: "p2", total_payment: 250, paid_status: true }),
    ];

    expect(computeTotalPaidFromPayments(payments)).toBe(250);
  });

  it("computes remaining balance clamped at zero", () => {
    expect(computeRemainingBalance(1000, 350)).toBe(650);
    expect(computeRemainingBalance(1000, 1200)).toBe(0);
  });

  it("clamps progress percentage between 0 and 100", () => {
    expect(computeProgressPercentage(1000, 350)).toBe(35);
    expect(computeProgressPercentage(1000, 1500)).toBe(100);
    expect(computeProgressPercentage(1000, -50)).toBe(0);
  });

  it("avoids divide by zero when original amount is zero", () => {
    expect(computeProgressPercentage(0, 0)).toBe(0);
    expect(computeProgressPercentage(0, 100)).toBe(0);
  });

  it("selects the earliest unpaid payment as next scheduled payment", () => {
    const payments = [
      makePayment({ id: "p1", payment_date: "2026-09-01", paid_status: false }),
      makePayment({ id: "p2", payment_date: "2026-07-01", paid_status: false }),
      makePayment({ id: "p3", payment_date: "2026-08-01", paid_status: true }),
    ];

    expect(getNextScheduledPayment(payments)?.id).toBe("p2");
  });

  it("sorts upcoming unpaid payments by date", () => {
    const payments = [
      makePayment({ id: "p1", payment_date: "2026-09-01" }),
      makePayment({ id: "p2", payment_date: "2026-07-01" }),
      makePayment({ id: "p3", payment_date: "2026-08-01", paid_status: true }),
    ];

    expect(getUpcomingUnpaidPayments(payments).map((payment) => payment.id)).toEqual([
      "p2",
      "p1",
    ]);
  });

  it("estimates payoff date when scheduled payments cover remaining balance", () => {
    const payments = [
      makePayment({ payment_date: "2026-07-01", total_payment: 100 }),
      makePayment({ id: "p2", payment_date: "2026-08-01", total_payment: 100 }),
      makePayment({ id: "p3", payment_date: "2026-09-01", total_payment: 100 }),
    ];

    expect(estimatePayoffDate(200, payments)).toBe("2026-08-01");
    expect(estimatePayoffDate(250, payments)).toBe("2026-09-01");
    expect(countRemainingUnpaidPayments(payments)).toBe(3);
  });

  it("returns fallback when payoff cannot be estimated", () => {
    const payments = [
      makePayment({ payment_date: "2026-07-01", total_payment: 50 }),
    ];

    expect(estimatePayoffDate(500, payments)).toBeNull();
    expect(
      resolvePayoffLabel(500, null, countRemainingUnpaidPayments(payments))
    ).toBe(DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED);
  });

  it("labels paid-off accounts without a payoff date", () => {
    expect(resolvePayoffLabel(0, null, 0)).toBe(DEBT_PAYOFF_PAID_OFF_LABEL);
    expect(formatDebtProgressPayoffLabel(DEBT_PAYOFF_PAID_OFF_LABEL)).toBe(
      DEBT_PAYOFF_PAID_OFF_LABEL
    );
  });

  it("builds per-account progress from original amount and paid payments", () => {
    const account = makeAccount({ original_amount: 1000 });
    const payments = [
      makePayment({ total_payment: 200, paid_status: true }),
      makePayment({ id: "p2", payment_date: "2026-08-01", total_payment: 100 }),
    ];

    const progress = buildDebtAccountProgress(account, payments);

    expect(progress.originalAmount).toBe(1000);
    expect(progress.totalPaid).toBe(200);
    expect(progress.remainingBalance).toBe(800);
    expect(progress.progressPercentage).toBe(20);
    expect(progress.nextPayment?.id).toBe("p2");
    expect(progress.remainingUnpaidCount).toBe(1);
  });

  it("excludes archived accounts from active totals by default", () => {
    const active = makeAccount({ id: "active", original_amount: 1000 });
    const archived = makeAccount({
      id: "archived",
      original_amount: 500,
      is_archived: true,
    });
    const payments = [
      makePayment({
        debt_account_id: "active",
        total_payment: 200,
        paid_status: true,
      }),
      makePayment({
        id: "p2",
        debt_account_id: "archived",
        total_payment: 100,
        paid_status: true,
      }),
    ];

    const activeTotals = buildActiveDebtProgressTotals(
      [active, archived],
      payments
    );
    expect(activeTotals.totalOriginal).toBe(1000);
    expect(activeTotals.totalPaid).toBe(200);

    const allTotals = buildDebtProgressTotals([active, archived], payments);
    expect(allTotals.totalOriginal).toBe(1500);
    expect(allTotals.totalPaid).toBe(300);
  });

  it("includes archived accounts only when explicitly requested via totals builder", () => {
    const archived = makeAccount({
      id: "archived",
      original_amount: 800,
      is_archived: true,
    });
    const payments = [
      makePayment({
        debt_account_id: "archived",
        total_payment: 300,
        paid_status: true,
      }),
    ];

    expect(
      buildActiveDebtProgressTotals([archived], payments).accountCount
    ).toBe(0);
    expect(buildDebtProgressTotals([archived], payments).totalPaid).toBe(300);
  });
});
