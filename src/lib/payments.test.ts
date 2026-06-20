import { describe, expect, it } from "vitest";
import {
  calculateCashAfterPayment,
  isDuplicatePaymentError,
  parsePaymentAmount,
  paymentSourceLabel,
} from "@/lib/payments";

describe("calculateCashAfterPayment", () => {
  it("returns positive balance after payment", () => {
    expect(calculateCashAfterPayment(500, 100)).toBe(400);
  });

  it("returns zero balance after payment", () => {
    expect(calculateCashAfterPayment(75.5, 75.5)).toBe(0);
  });

  it("allows negative balance", () => {
    expect(calculateCashAfterPayment(50, 75)).toBe(-25);
  });

  it("rejects invalid amounts", () => {
    expect(calculateCashAfterPayment(Number.NaN, 10)).toBeNull();
    expect(calculateCashAfterPayment(100, -5)).toBeNull();
  });
});

describe("parsePaymentAmount", () => {
  it("parses numeric strings", () => {
    expect(parsePaymentAmount("42.555")).toBe(42.56);
  });

  it("rejects invalid values", () => {
    expect(parsePaymentAmount("bad")).toBeNull();
    expect(parsePaymentAmount(-1)).toBeNull();
  });
});

describe("paymentSourceLabel", () => {
  it("returns human-readable labels", () => {
    expect(paymentSourceLabel("bill_instance")).toBe("bill");
    expect(paymentSourceLabel("debt_payment")).toBe("debt payment");
    expect(paymentSourceLabel("manual_expense")).toBe("expense");
  });
});

describe("isDuplicatePaymentError", () => {
  it("detects duplicate payment errors", () => {
    expect(isDuplicatePaymentError(new Error("DUPLICATE_PAYMENT"))).toBe(true);
    expect(isDuplicatePaymentError({ message: "DUPLICATE_PAYMENT" })).toBe(true);
    expect(isDuplicatePaymentError(new Error("other"))).toBe(false);
  });
});
