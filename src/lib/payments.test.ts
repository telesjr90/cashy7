import { describe, expect, it } from "vitest";
import {
  calculateCashAfterPayment,
  cashDeductionStatusLabel,
  getCashDeductionStatus,
  getPaidManualExpenseSourceIds,
  hasCashDeductionForBill,
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

describe("getPaidManualExpenseSourceIds", () => {
  it("extracts manual expense payment transaction source IDs", () => {
    const ids = getPaidManualExpenseSourceIds([
      {
        source_type: "manual_expense",
        source_id: "exp-1",
      },
      {
        source_type: "manual_expense",
        source_id: "exp-2",
      },
    ]);

    expect(ids).toEqual(new Set(["exp-1", "exp-2"]));
  });

  it("ignores bill and debt payment transactions", () => {
    const ids = getPaidManualExpenseSourceIds([
      {
        source_type: "bill_instance",
        source_id: "bill-1",
      },
      {
        source_type: "debt_payment",
        source_id: "debt-1",
      },
      {
        source_type: "manual_expense",
        source_id: "exp-1",
      },
    ]);

    expect(ids).toEqual(new Set(["exp-1"]));
  });

  it("returns an empty set when no manual expense payments exist", () => {
    expect(getPaidManualExpenseSourceIds([])).toEqual(new Set());
  });
});

describe("isDuplicatePaymentError", () => {
  it("detects duplicate payment errors", () => {
    expect(isDuplicatePaymentError(new Error("DUPLICATE_PAYMENT"))).toBe(true);
    expect(isDuplicatePaymentError({ message: "DUPLICATE_PAYMENT" })).toBe(true);
    expect(isDuplicatePaymentError(new Error("other"))).toBe(false);
  });
});

describe("getCashDeductionStatus", () => {
  it("returns unpaid when not marked paid and no transaction", () => {
    expect(
      getCashDeductionStatus({ isMarkedPaid: false, hasPaymentTransaction: false })
    ).toBe("unpaid");
  });

  it("returns marked_paid_only when marked paid without transaction", () => {
    expect(
      getCashDeductionStatus({ isMarkedPaid: true, hasPaymentTransaction: false })
    ).toBe("marked_paid_only");
  });

  it("returns deducted_from_cash when marked paid with transaction", () => {
    expect(
      getCashDeductionStatus({ isMarkedPaid: true, hasPaymentTransaction: true })
    ).toBe("deducted_from_cash");
  });

  it("returns deducted_from_cash when unpaid but transaction exists", () => {
    expect(
      getCashDeductionStatus({ isMarkedPaid: false, hasPaymentTransaction: true })
    ).toBe("deducted_from_cash");
  });
});

describe("cashDeductionStatusLabel", () => {
  it("returns clear labels for each status", () => {
    expect(cashDeductionStatusLabel("unpaid")).toBe("Unpaid");
    expect(cashDeductionStatusLabel("marked_paid_only")).toBe(
      "Marked paid — cash not deducted"
    );
    expect(cashDeductionStatusLabel("deducted_from_cash")).toBe(
      "Deducted from cash"
    );
  });
});

function billCashDeductionContext(
  overrides: Partial<{
    billPaymentSourceIds: Set<string>;
    debtPaymentIdByBillId: Map<string, string>;
    debtPaymentTransactionSourceIds: Set<string>;
  }> = {}
) {
  return {
    billPaymentSourceIds: overrides.billPaymentSourceIds ?? new Set<string>(),
    debtPaymentIdByBillId: overrides.debtPaymentIdByBillId ?? new Map<string, string>(),
    debtPaymentTransactionSourceIds:
      overrides.debtPaymentTransactionSourceIds ?? new Set<string>(),
  };
}

function resolveBillCashDeductionStatus(
  billId: string,
  isMarkedPaid: boolean,
  context: ReturnType<typeof billCashDeductionContext>
) {
  return getCashDeductionStatus({
    isMarkedPaid,
    hasPaymentTransaction: hasCashDeductionForBill(billId, context),
  });
}

describe("hasCashDeductionForBill", () => {
  it("returns true when a direct bill_instance payment transaction exists", () => {
    const context = billCashDeductionContext({
      billPaymentSourceIds: new Set(["bill-1"]),
    });

    expect(hasCashDeductionForBill("bill-1", context)).toBe(true);
  });

  it("returns true when a linked debt_payment transaction exists", () => {
    const context = billCashDeductionContext({
      debtPaymentIdByBillId: new Map([["bill-1", "debt-pay-1"]]),
      debtPaymentTransactionSourceIds: new Set(["debt-pay-1"]),
    });

    expect(hasCashDeductionForBill("bill-1", context)).toBe(true);
  });

  it("returns false for a debt-linked bill without a matching debt payment transaction", () => {
    const context = billCashDeductionContext({
      debtPaymentIdByBillId: new Map([["bill-1", "debt-pay-1"]]),
    });

    expect(hasCashDeductionForBill("bill-1", context)).toBe(false);
  });

  it("returns false when no direct or linked payment transaction exists", () => {
    expect(hasCashDeductionForBill("bill-1", billCashDeductionContext())).toBe(false);
  });

  it("prefers direct bill payment when both direct and linked debt transactions exist", () => {
    const context = billCashDeductionContext({
      billPaymentSourceIds: new Set(["bill-1"]),
      debtPaymentIdByBillId: new Map([["bill-1", "debt-pay-1"]]),
      debtPaymentTransactionSourceIds: new Set(["debt-pay-1"]),
    });

    expect(hasCashDeductionForBill("bill-1", context)).toBe(true);
  });
});

describe("bill cash deduction status (regression: debt-linked bills)", () => {
  it("shows deducted from cash for a direct bill payment transaction", () => {
    const status = resolveBillCashDeductionStatus(
      "bill-1",
      true,
      billCashDeductionContext({ billPaymentSourceIds: new Set(["bill-1"]) })
    );

    expect(status).toBe("deducted_from_cash");
    expect(cashDeductionStatusLabel(status)).toBe("Deducted from cash");
  });

  it("shows deducted from cash for a linked debt payment transaction", () => {
    const status = resolveBillCashDeductionStatus(
      "bill-1",
      true,
      billCashDeductionContext({
        debtPaymentIdByBillId: new Map([["bill-1", "debt-pay-1"]]),
        debtPaymentTransactionSourceIds: new Set(["debt-pay-1"]),
      })
    );

    expect(status).toBe("deducted_from_cash");
    expect(cashDeductionStatusLabel(status)).toBe("Deducted from cash");
  });

  it("shows marked paid only when marked paid without any payment transaction", () => {
    const status = resolveBillCashDeductionStatus("bill-1", true, billCashDeductionContext());

    expect(status).toBe("marked_paid_only");
    expect(cashDeductionStatusLabel(status)).toBe("Marked paid — cash not deducted");
  });

  it("shows unpaid when not marked paid and no payment transaction", () => {
    const status = resolveBillCashDeductionStatus("bill-1", false, billCashDeductionContext());

    expect(status).toBe("unpaid");
    expect(cashDeductionStatusLabel(status)).toBe("Unpaid");
  });

  it("does not falsely show deducted from cash for debt-linked bill without matching transaction", () => {
    const status = resolveBillCashDeductionStatus(
      "bill-1",
      true,
      billCashDeductionContext({
        debtPaymentIdByBillId: new Map([["bill-1", "debt-pay-1"]]),
      })
    );

    expect(status).toBe("marked_paid_only");
    expect(cashDeductionStatusLabel(status)).not.toBe("Deducted from cash");
  });

  it("keeps direct bill transaction authoritative when linked debt transaction also exists", () => {
    const status = resolveBillCashDeductionStatus(
      "bill-1",
      true,
      billCashDeductionContext({
        billPaymentSourceIds: new Set(["bill-1"]),
        debtPaymentIdByBillId: new Map([["bill-1", "debt-pay-1"]]),
        debtPaymentTransactionSourceIds: new Set(["debt-pay-other"]),
      })
    );

    expect(status).toBe("deducted_from_cash");
  });
});
