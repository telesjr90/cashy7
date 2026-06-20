import { describe, expect, it } from "vitest";
import {
  applyDebtPaymentBalanceChange,
  applyPaidDebtPaymentAmountEdit,
  computeDebtPaymentAmounts,
  computeProjectedRemainingBalances,
  computeRegularDebtPayment,
  debtBillInstanceName,
  formatCurrency,
  formatDeductionAmount,
  splitDebtPayment,
  split5149,
} from "./format";

describe("formatCurrency", () => {
  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("CA$0.00");
  });

  it("formats whole dollars", () => {
    expect(formatCurrency(51)).toBe("CA$51.00");
  });

  it("formats cents", () => {
    expect(formatCurrency(214.55)).toBe("CA$214.55");
  });

  it("formats thousands with separator", () => {
    expect(formatCurrency(2127.08)).toBe("CA$2,127.08");
  });

  it("formats negative values", () => {
    expect(formatCurrency(-25)).toBe("-CA$25.00");
  });
});

describe("formatDeductionAmount", () => {
  it("formats zero", () => {
    expect(formatDeductionAmount(0)).toBe("− CA$0.00");
  });

  it("formats whole dollars", () => {
    expect(formatDeductionAmount(5)).toBe("− CA$5.00");
  });

  it("formats cents", () => {
    expect(formatDeductionAmount(127.5)).toBe("− CA$127.50");
  });

  it("uses the same currency style as formatCurrency", () => {
    expect(formatDeductionAmount(2127.08)).toBe(`− ${formatCurrency(2127.08)}`);
  });
});

describe("debtBillInstanceName", () => {
  it("prefixes the debt account name", () => {
    expect(debtBillInstanceName("RBC Credit Card")).toBe("Debt: RBC Credit Card");
  });
});

describe("computeRegularDebtPayment", () => {
  it("floors to cents", () => {
    expect(computeRegularDebtPayment(1502.13, 4)).toBe(375.53);
  });
});

describe("computeDebtPaymentAmounts", () => {
  it("keeps regular payments equal and adjusts the final payment", () => {
    expect(computeDebtPaymentAmounts(1502.13, 4)).toEqual([
      375.53, 375.53, 375.53, 375.54,
    ]);
  });

  it("sums to the full balance", () => {
    const amounts = computeDebtPaymentAmounts(1502.13, 4);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    expect(Math.round(total * 100) / 100).toBe(1502.13);
  });
});

describe("computeProjectedRemainingBalances", () => {
  it("projects remaining balance after each scheduled payment", () => {
    const amounts = computeDebtPaymentAmounts(1502.13, 4);
    expect(amounts).toEqual([375.53, 375.53, 375.53, 375.54]);
    expect(computeProjectedRemainingBalances(1502.13, amounts)).toEqual([
      1126.6, 751.07, 375.54, 0,
    ]);
  });

  it("ends at zero on the final payment without changing actual balance", () => {
    const balance = 1502.13;
    const amounts = computeDebtPaymentAmounts(balance, 4);
    const projected = computeProjectedRemainingBalances(balance, amounts);
    expect(projected[projected.length - 1]).toBe(0);
    expect(balance).toBe(1502.13);
  });
});

describe("applyDebtPaymentBalanceChange", () => {
  it("reduces balance when marking paid", () => {
    expect(applyDebtPaymentBalanceChange(1502.13, 375.53, "pay")).toBe(1126.6);
  });

  it("restores balance when marking unpaid", () => {
    expect(applyDebtPaymentBalanceChange(1126.6, 375.53, "unpay")).toBe(1502.13);
  });

  it("does not reduce below zero", () => {
    expect(applyDebtPaymentBalanceChange(100, 150, "pay")).toBe(0);
  });

  it("keeps cent rounding stable", () => {
    expect(applyDebtPaymentBalanceChange(0.01, 0.01, "pay")).toBe(0);
    expect(applyDebtPaymentBalanceChange(0, 0.01, "unpay")).toBe(0.01);
  });
});

describe("applyPaidDebtPaymentAmountEdit", () => {
  it("decreases current balance when an already-paid payment increases", () => {
    expect(applyPaidDebtPaymentAmountEdit(500, 100, 120, true)).toBe(480);
  });

  it("increases current balance when an already-paid payment decreases", () => {
    expect(applyPaidDebtPaymentAmountEdit(500, 120, 100, true)).toBe(520);
  });

  it("does not change current balance for unpaid payment edits", () => {
    expect(applyPaidDebtPaymentAmountEdit(500, 100, 120, false)).toBe(500);
  });

  it("does not change current balance for split-only edits", () => {
    expect(applyPaidDebtPaymentAmountEdit(500, 100, 100, true)).toBe(500);
  });

  it("does not reduce balance below zero", () => {
    expect(applyPaidDebtPaymentAmountEdit(10, 100, 120, true)).toBe(0);
  });
});

describe("splitDebtPayment", () => {
  it("uses 51/49 by default", () => {
    expect(splitDebtPayment(100, "5149")).toEqual(split5149(100));
  });

  it("scales custom split amounts for the final payment", () => {
    const split = splitDebtPayment(375.54, "custom", 60, 40, 100);
    expect(split.teles + split.nicole).toBeCloseTo(375.54, 2);
  });
});
