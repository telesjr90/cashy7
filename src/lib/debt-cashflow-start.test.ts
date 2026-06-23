import { describe, expect, it } from "vitest";
import type { DebtPayment } from "@/lib/types";
import {
  getDebtPaymentProtectionReason,
  isDebtPaymentReplaceable,
} from "@/lib/debt-schedule-replacement";
import {
  DEBT_PAYMENTS_PRE_START_HIDDEN_NOTICE,
  DEBT_PRE_START_LABEL,
  DEBT_PROGRESS_EXCLUDES_PRE_START_NOTICE,
  debtCashflowStartLabelContainsRawUuid,
  filterDebtPaymentsByCashflowStart,
  getDebtPageVisiblePayments,
  getDebtPaymentPreStartLabel,
  isDebtPaymentPreStart,
  SHOW_PRE_START_DEBT_PAYMENTS_LABEL,
  splitDebtPaymentsByCashflowStart,
} from "./debt-cashflow-start";

function makePayment(
  overrides: Partial<DebtPayment> & Pick<DebtPayment, "id" | "payment_date">
): DebtPayment {
  return {
    household_id: "household-1",
    debt_account_id: "account-1",
    month: 6,
    year: 2026,
    period_bucket: "1_14",
    total_payment: 100,
    teles_amount: 51,
    nicole_amount: 49,
    remaining_balance_after_payment: 900,
    paid_status: false,
    linked_bill_instance_id: null,
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

const START_DATE = "2026-06-15";

const beforeStart = makePayment({
  id: "before",
  payment_date: "2026-06-14",
});
const onStart = makePayment({
  id: "on-start",
  payment_date: "2026-06-15",
});
const afterStart = makePayment({
  id: "after",
  payment_date: "2026-06-20",
});
const unparseableDate = makePayment({
  id: "bad-date",
  payment_date: "not-a-date",
});

describe("isDebtPaymentPreStart", () => {
  it("classifies debt payments before the start date as pre-start", () => {
    expect(isDebtPaymentPreStart(beforeStart, START_DATE)).toBe(true);
  });

  it("does not classify debt payments on the start date as pre-start", () => {
    expect(isDebtPaymentPreStart(onStart, START_DATE)).toBe(false);
  });

  it("does not classify debt payments after the start date as pre-start", () => {
    expect(isDebtPaymentPreStart(afterStart, START_DATE)).toBe(false);
  });

  it("keeps all debt payments visible when no start date is configured", () => {
    expect(isDebtPaymentPreStart(beforeStart, null)).toBe(false);
    expect(isDebtPaymentPreStart(beforeStart, undefined)).toBe(false);
  });

  it("treats unparseable payment dates as active (not pre-start)", () => {
    expect(isDebtPaymentPreStart(unparseableDate, START_DATE)).toBe(false);
  });
});

describe("splitDebtPaymentsByCashflowStart", () => {
  it("splits active and pre-start debt payments when a start date is set", () => {
    const { activePayments, preStartPayments } = splitDebtPaymentsByCashflowStart(
      [beforeStart, onStart, afterStart],
      START_DATE
    );

    expect(activePayments.map((payment) => payment.id)).toEqual([
      "on-start",
      "after",
    ]);
    expect(preStartPayments.map((payment) => payment.id)).toEqual(["before"]);
  });

  it("returns all debt payments as active when no start date is set", () => {
    const { activePayments, preStartPayments } = splitDebtPaymentsByCashflowStart(
      [beforeStart, onStart, afterStart],
      null
    );

    expect(activePayments).toHaveLength(3);
    expect(preStartPayments).toHaveLength(0);
  });
});

describe("getDebtPageVisiblePayments", () => {
  const payments = [beforeStart, onStart, afterStart];

  it("excludes pre-start debt payments from the default visible list", () => {
    const visible = getDebtPageVisiblePayments(payments, START_DATE, false);
    expect(visible.map((payment) => payment.id)).toEqual(["on-start", "after"]);
  });

  it("includes pre-start debt payments when show-pre-start mode is on", () => {
    const visible = getDebtPageVisiblePayments(payments, START_DATE, true);
    expect(visible.map((payment) => payment.id)).toEqual([
      "before",
      "on-start",
      "after",
    ]);
  });

  it("includes all debt payments when no start date is configured", () => {
    expect(getDebtPageVisiblePayments(payments, null, false)).toEqual(payments);
  });
});

describe("filterDebtPaymentsByCashflowStart", () => {
  it("filters to active planning payments only", () => {
    const filtered = filterDebtPaymentsByCashflowStart(
      [beforeStart, onStart, afterStart],
      START_DATE
    );

    expect(filtered.map((payment) => payment.id)).toEqual(["on-start", "after"]);
  });
});

describe("debt cashflow start labels", () => {
  it("returns a readable pre-start label", () => {
    expect(getDebtPaymentPreStartLabel(beforeStart, START_DATE)).toBe(
      DEBT_PRE_START_LABEL
    );
    expect(getDebtPaymentPreStartLabel(onStart, START_DATE)).toBeNull();
  });

  it("does not expose raw UUIDs in user-facing labels", () => {
    for (const label of [
      DEBT_PRE_START_LABEL,
      DEBT_PAYMENTS_PRE_START_HIDDEN_NOTICE,
      SHOW_PRE_START_DEBT_PAYMENTS_LABEL,
      DEBT_PROGRESS_EXCLUDES_PRE_START_NOTICE,
    ]) {
      expect(debtCashflowStartLabelContainsRawUuid(label)).toBe(false);
    }
  });
});

describe("schedule replacement boundary", () => {
  it("does not treat pre-start debt payments as replacement candidates", () => {
    const payment = makePayment({
      id: "historical-1",
      payment_date: "2026-06-01",
    });

    expect(isDebtPaymentPreStart(payment, START_DATE)).toBe(true);
    expect(
      getDebtPaymentProtectionReason(payment, START_DATE, new Set())
    ).toBe("before_start_date");
    expect(isDebtPaymentReplaceable(payment, START_DATE, new Set())).toBe(false);
  });

  it("keeps replacement logic independent of show-pre-start display mode", () => {
    const payment = makePayment({
      id: "future-1",
      payment_date: "2026-07-01",
    });

    expect(getDebtPageVisiblePayments([payment], START_DATE, false)).toHaveLength(1);
    expect(getDebtPageVisiblePayments([payment], START_DATE, true)).toHaveLength(1);
    expect(isDebtPaymentReplaceable(payment, START_DATE, new Set())).toBe(true);
  });
});
