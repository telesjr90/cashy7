import { describe, expect, it } from "vitest";
import {
  computeDebtPaymentAmounts,
  computeRegularDebtPayment,
  debtBillInstanceName,
  formatCurrency,
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

describe("splitDebtPayment", () => {
  it("uses 51/49 by default", () => {
    expect(splitDebtPayment(100, "5149")).toEqual(split5149(100));
  });

  it("scales custom split amounts for the final payment", () => {
    const split = splitDebtPayment(375.54, "custom", 60, 40, 100);
    expect(split.teles + split.nicole).toBeCloseTo(375.54, 2);
  });
});
