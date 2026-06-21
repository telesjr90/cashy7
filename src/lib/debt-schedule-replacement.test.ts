import { describe, expect, it } from "vitest";
import type { DebtPayment } from "@/lib/types";
import {
  buildDebtPaymentRowLabel,
  getDebtPaymentProtectionReason,
  getDebtScheduleReplacementMutation,
  isDebtPaymentReplaceable,
  planDebtScheduleReplacement,
  protectionReasonLabel,
} from "./debt-schedule-replacement";

function makePayment(
  overrides: Partial<DebtPayment> & Pick<DebtPayment, "id" | "payment_date">
): DebtPayment {
  return {
    household_id: "household-1",
    debt_account_id: "account-1",
    month: 7,
    year: 2026,
    period_bucket: "1_14",
    total_payment: 100,
    teles_amount: 51,
    nicole_amount: 49,
    remaining_balance_after_payment: 900,
    paid_status: false,
    linked_bill_instance_id: "bill-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getDebtPaymentProtectionReason", () => {
  it("protects paid payments", () => {
    const payment = makePayment({
      id: "paid-1",
      payment_date: "2026-08-01",
      paid_status: true,
    });

    expect(
      getDebtPaymentProtectionReason(payment, "2026-07-01", new Set())
    ).toBe("paid");
    expect(isDebtPaymentReplaceable(payment, "2026-07-01", new Set())).toBe(
      false
    );
  });

  it("protects cash-deducted payments", () => {
    const payment = makePayment({
      id: "deducted-1",
      payment_date: "2026-08-01",
    });

    expect(
      getDebtPaymentProtectionReason(
        payment,
        "2026-07-01",
        new Set(["deducted-1"])
      )
    ).toBe("cash_deducted");
  });

  it("protects historical payments before replacement start", () => {
    const payment = makePayment({
      id: "historical-1",
      payment_date: "2026-06-01",
    });

    expect(
      getDebtPaymentProtectionReason(payment, "2026-07-01", new Set())
    ).toBe("before_start_date");
  });

  it("treats future unpaid non-deducted payments as replaceable", () => {
    const payment = makePayment({
      id: "future-1",
      payment_date: "2026-08-01",
    });

    expect(
      getDebtPaymentProtectionReason(payment, "2026-07-01", new Set())
    ).toBeNull();
    expect(isDebtPaymentReplaceable(payment, "2026-07-01", new Set())).toBe(
      true
    );
  });
});

describe("planDebtScheduleReplacement", () => {
  const baseInput = {
    accountName: "RBC Card",
    currentBalance: 400,
    replacementStartDate: "2026-07-01",
    paymentsLeft: 4,
    regularPayment: 100,
    splitType: "5149" as const,
  };

  it("marks future unpaid payments as replaceable", () => {
    const plan = planDebtScheduleReplacement({
      ...baseInput,
      existingPayments: [
        makePayment({ id: "future-1", payment_date: "2026-08-01" }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    expect(plan.summary.toReplace).toBe(1);
    expect(plan.existingRows[0]?.disposition).toBe("replace");
    expect(plan.proposedRows.some((row) => row.status === "create")).toBe(true);
  });

  it("preserves paid and cash-deducted rows in summary counts", () => {
    const plan = planDebtScheduleReplacement({
      ...baseInput,
      existingPayments: [
        makePayment({
          id: "paid-1",
          payment_date: "2026-08-01",
          paid_status: true,
        }),
        makePayment({
          id: "deducted-1",
          payment_date: "2026-09-01",
        }),
      ],
      cashDeductedPaymentIds: new Set(["deducted-1"]),
    });

    expect(plan.summary.preservedPaid).toBe(1);
    expect(plan.summary.preservedCashDeducted).toBe(1);
    expect(plan.summary.toReplace).toBe(0);
    expect(
      plan.existingRows.every((row) => row.disposition === "preserve")
    ).toBe(true);
  });

  it("skips proposed rows that would duplicate preserved months", () => {
    const plan = planDebtScheduleReplacement({
      ...baseInput,
      replacementStartDate: "2026-07-01",
      paymentsLeft: 2,
      existingPayments: [
        makePayment({
          id: "paid-1",
          payment_date: "2026-07-01",
          month: 7,
          year: 2026,
          paid_status: true,
        }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    expect(plan.summary.skippedDuplicates).toBe(1);
    expect(plan.proposedRows[0]?.status).toBe("skip_duplicate");
    expect(plan.proposedRows[1]?.status).toBe("create");
  });

  it("represents linked bill impact in preview rows", () => {
    const plan = planDebtScheduleReplacement({
      ...baseInput,
      existingPayments: [
        makePayment({
          id: "future-1",
          payment_date: "2026-08-01",
          month: 8,
          year: 2026,
          linked_bill_instance_id: "bill-99",
        }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    expect(plan.existingRows[0]?.linkedBillLabel).toBe(
      "Debt: RBC Card · August 2026"
    );
    expect(plan.summary.linkedBillsToRemove).toBe(1);
    expect(plan.proposedRows[0]?.linkedBillLabel).toContain("Debt: RBC Card");
  });

  it("builds mutation candidates without paid rows", () => {
    const plan = planDebtScheduleReplacement({
      ...baseInput,
      existingPayments: [
        makePayment({
          id: "paid-1",
          payment_date: "2026-08-01",
          paid_status: true,
        }),
        makePayment({
          id: "future-1",
          payment_date: "2026-09-01",
          linked_bill_instance_id: "bill-future",
        }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    const mutation = getDebtScheduleReplacementMutation(plan);

    expect(mutation.paymentIdsToDelete).toEqual(["future-1"]);
    expect(mutation.billInstanceIdsToDelete).toEqual(["bill-future"]);
    expect(mutation.paymentIdsToDelete).not.toContain("paid-1");
    expect(mutation.paymentsToCreate.length).toBeGreaterThan(0);
  });

  it("summarizes created, replaced, and preserved counts", () => {
    const plan = planDebtScheduleReplacement({
      ...baseInput,
      existingPayments: [
        makePayment({
          id: "historical-1",
          payment_date: "2026-06-01",
        }),
        makePayment({
          id: "future-1",
          payment_date: "2026-08-01",
        }),
        makePayment({
          id: "paid-1",
          payment_date: "2026-09-01",
          paid_status: true,
        }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    expect(plan.summary.toReplace).toBe(1);
    expect(plan.summary.preservedHistorical).toBe(1);
    expect(plan.summary.preservedPaid).toBe(1);
    expect(plan.summary.toCreate).toBe(3);
    expect(plan.summary.skippedDuplicates).toBe(1);
  });
});

describe("labels", () => {
  it("uses readable payment labels without UUIDs", () => {
    const label = buildDebtPaymentRowLabel("2026-08-01", 125.5, "RBC Card");
    expect(label).toContain("Aug 1, 2026");
    expect(label).toContain("CA$125.50");
    expect(label).toContain("RBC Card");
    expect(label).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });

  it("uses explicit protection copy", () => {
    expect(protectionReasonLabel("paid")).toContain("Paid");
    expect(protectionReasonLabel("cash_deducted")).toContain("Cash-deducted");
    expect(protectionReasonLabel("before_start_date")).toContain(
      "replacement start"
    );
  });
});
