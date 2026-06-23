import { describe, expect, it } from "vitest";
import type { DebtAccount, DebtPayment } from "@/lib/types";
import {
  buildDashboardDebtSummary,
  dashboardDebtSummaryLabelsArePrivacySafe,
  DASHBOARD_DEBT_EMPTY_MESSAGE,
  DASHBOARD_DEBT_LINKED_BILL_LABEL,
  formatDashboardDebtNextPaymentLabel,
} from "@/lib/dashboard-debt-summary";
import {
  DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED,
  DEBT_PAYOFF_PAID_OFF_LABEL,
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
  | "id"
  | "debt_account_id"
  | "payment_date"
  | "total_payment"
  | "teles_amount"
  | "nicole_amount"
  | "period_bucket"
  | "paid_status"
  | "linked_bill_instance_id"
> {
  return {
    id: "payment-1",
    debt_account_id: "account-1",
    payment_date: "2026-07-01",
    total_payment: 100,
    teles_amount: 51,
    nicole_amount: 49,
    period_bucket: "1_14",
    paid_status: false,
    linked_bill_instance_id: null,
    ...overrides,
  };
}

describe("dashboard debt summary helpers", () => {
  it("includes active debt accounts in dashboard totals", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount({ original_amount: 1000 })],
      payments: [
        makePayment({ total_payment: 200, paid_status: true }),
        makePayment({ id: "p2", payment_date: "2026-08-01", total_payment: 100 }),
      ],
    });

    expect(summary.hasActiveDebts).toBe(true);
    expect(summary.totals.totalOriginal).toBe(1000);
    expect(summary.totals.totalPaid).toBe(200);
    expect(summary.totals.totalRemaining).toBe(800);
  });

  it("excludes archived debt accounts from active dashboard totals", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [
        makeAccount({ id: "active", original_amount: 1000 }),
        makeAccount({
          id: "archived",
          name: "Old card",
          original_amount: 500,
          is_archived: true,
        }),
      ],
      payments: [
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
      ],
    });

    expect(summary.totals.totalOriginal).toBe(1000);
    expect(summary.totals.totalPaid).toBe(200);
    expect(summary.upcomingPayments.every((row) => row.accountName !== "Old card")).toBe(
      true
    );
  });

  it("counts paid rows toward total paid and ignores unpaid rows", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount()],
      payments: [
        makePayment({ total_payment: 250, paid_status: true }),
        makePayment({ id: "p2", total_payment: 150, paid_status: false }),
      ],
    });

    expect(summary.totals.totalPaid).toBe(250);
    expect(summary.totals.totalRemaining).toBe(750);
  });

  it("clamps progress percentage between 0 and 100", () => {
    const overpaid = buildDashboardDebtSummary({
      accounts: [makeAccount({ original_amount: 1000 })],
      payments: [makePayment({ total_payment: 1500, paid_status: true })],
    });
    expect(overpaid.totals.progressPercentage).toBe(100);
    expect(overpaid.totals.totalRemaining).toBe(0);
    expect(overpaid.totals.payoffLabel).toBe(DEBT_PAYOFF_PAID_OFF_LABEL);
  });

  it("selects the earliest unpaid payment as next scheduled payment", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount()],
      payments: [
        makePayment({ id: "p1", payment_date: "2026-09-01" }),
        makePayment({ id: "p2", payment_date: "2026-07-01" }),
        makePayment({ id: "p3", payment_date: "2026-08-01", paid_status: true }),
      ],
    });

    expect(summary.totals.nextPayment?.id).toBe("p2");
    expect(formatDashboardDebtNextPaymentLabel(summary.totals).value).toMatch(/Jul/);
  });

  it("sorts upcoming payments by date and limits the list", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount()],
      payments: [
        makePayment({ id: "p1", payment_date: "2026-09-01" }),
        makePayment({ id: "p2", payment_date: "2026-07-01" }),
        makePayment({ id: "p3", payment_date: "2026-08-01" }),
      ],
      upcomingLimit: 2,
    });

    expect(summary.upcomingPayments.map((row) => row.rowKey)).toEqual(["p2", "p3"]);
  });

  it("shows projected payoff date when scheduled payments cover remaining debt", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount({ original_amount: 1000 })],
      payments: [
        makePayment({ total_payment: 800, paid_status: true }),
        makePayment({ id: "p2", payment_date: "2026-08-01", total_payment: 100 }),
        makePayment({ id: "p3", payment_date: "2026-09-01", total_payment: 100 }),
      ],
    });

    expect(summary.totals.payoffLabel).toBe("2026-09-01");
  });

  it("shows fallback when scheduled payments are insufficient", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount({ original_amount: 1000 })],
      payments: [
        makePayment({ total_payment: 200, paid_status: true }),
        makePayment({ id: "p2", payment_date: "2026-08-01", total_payment: 50 }),
      ],
    });

    expect(summary.totals.payoffLabel).toBe(DEBT_PAYOFF_NOT_ENOUGH_SCHEDULED);
  });

  it("returns empty state when no active debts exist", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [
        makeAccount({
          id: "archived",
          is_archived: true,
        }),
      ],
      payments: [],
    });

    expect(summary.hasActiveDebts).toBe(false);
    expect(summary.emptyStateMessage).toBe(DASHBOARD_DEBT_EMPTY_MESSAGE);
    expect(summary.totals.accountCount).toBe(0);
  });

  it("builds upcoming row labels with linked bill indicator and no raw UUIDs", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount({ name: "Line of credit" })],
      payments: [
        makePayment({
          id: "payment-visible",
          linked_bill_instance_id: "bill-1",
        }),
      ],
    });

    expect(summary.upcomingPayments[0]?.accountName).toBe("Line of credit");
    expect(summary.upcomingPayments[0]?.linkedBillLabel).toBe(
      DASHBOARD_DEBT_LINKED_BILL_LABEL
    );
    expect(
      dashboardDebtSummaryLabelsArePrivacySafe({ summary })
    ).toBe(true);
  });

  it("flags raw UUIDs in user-facing labels", () => {
    const summary = buildDashboardDebtSummary({
      accounts: [makeAccount({ name: "Visa" })],
      payments: [makePayment()],
    });

    summary.upcomingPayments[0]!.accountName =
      "550e8400-e29b-41d4-a716-446655440000";

    expect(dashboardDebtSummaryLabelsArePrivacySafe({ summary })).toBe(false);
  });
});
