import { describe, expect, it } from "vitest";
import {
  calculateSafeToSpendBeforeSavings,
  getMyBillShareAmount,
  resolveBillShareKeyForPerson,
  sumMyBillShareTotal,
  sumMyUnpaidBillShareTotal,
} from "./bill-share";

describe("resolveBillShareKeyForPerson", () => {
  it("maps Teles to teles_amount", () => {
    expect(resolveBillShareKeyForPerson({ name: "Teles" })).toBe("teles_amount");
  });

  it("maps Nicole to nicole_amount", () => {
    expect(resolveBillShareKeyForPerson({ name: "Nicole" })).toBe("nicole_amount");
  });

  it("handles case and whitespace", () => {
    expect(resolveBillShareKeyForPerson({ name: "  TELES  " })).toBe("teles_amount");
    expect(resolveBillShareKeyForPerson({ name: " nicole" })).toBe("nicole_amount");
  });

  it("returns null for unknown person", () => {
    expect(resolveBillShareKeyForPerson({ name: "Alex" })).toBeNull();
  });

  it("returns null when person is not mapped", () => {
    expect(resolveBillShareKeyForPerson(null)).toBeNull();
    expect(resolveBillShareKeyForPerson(undefined)).toBeNull();
    expect(resolveBillShareKeyForPerson({ name: "" })).toBeNull();
    expect(resolveBillShareKeyForPerson({ name: "   " })).toBeNull();
  });
});

describe("getMyBillShareAmount", () => {
  const bill = { teles_amount: 100, nicole_amount: 50 };

  it("returns teles_amount when share key is teles_amount", () => {
    expect(getMyBillShareAmount(bill, "teles_amount")).toBe(100);
  });

  it("returns nicole_amount when share key is nicole_amount", () => {
    expect(getMyBillShareAmount(bill, "nicole_amount")).toBe(50);
  });

  it("converts string amounts to numbers", () => {
    expect(
      getMyBillShareAmount({ teles_amount: "75.50", nicole_amount: "24.50" }, "teles_amount")
    ).toBe(75.5);
    expect(
      getMyBillShareAmount({ teles_amount: "75.50", nicole_amount: "24.50" }, "nicole_amount")
    ).toBe(24.5);
  });

  it("returns null when share key is null", () => {
    expect(getMyBillShareAmount(bill, null)).toBeNull();
  });

  it("returns null for non-numeric amounts", () => {
    expect(
      getMyBillShareAmount({ teles_amount: "abc", nicole_amount: 50 }, "teles_amount")
    ).toBeNull();
  });
});

describe("sumMyBillShareTotal", () => {
  const bills = [
    { period_bucket: "1_14" as const, teles_amount: 100, nicole_amount: 50 },
    { period_bucket: "1_14" as const, teles_amount: 25.5, nicole_amount: 30 },
    { period_bucket: "15_eom" as const, teles_amount: 200, nicole_amount: 75 },
    { period_bucket: "15_eom" as const, teles_amount: 10, nicole_amount: 40 },
  ];

  it("sums Teles share for full month", () => {
    expect(sumMyBillShareTotal(bills, "teles_amount", "full")).toBe(335.5);
  });

  it("sums Nicole share for full month", () => {
    expect(sumMyBillShareTotal(bills, "nicole_amount", "full")).toBe(195);
  });

  it("sums only 1_14 bills", () => {
    expect(sumMyBillShareTotal(bills, "teles_amount", "1_14")).toBe(125.5);
    expect(sumMyBillShareTotal(bills, "nicole_amount", "1_14")).toBe(80);
  });

  it("sums only 15_eom bills", () => {
    expect(sumMyBillShareTotal(bills, "teles_amount", "15_eom")).toBe(210);
    expect(sumMyBillShareTotal(bills, "nicole_amount", "15_eom")).toBe(115);
  });

  it("returns null when share key is null", () => {
    expect(sumMyBillShareTotal(bills, null, "full")).toBeNull();
  });

  it("ignores invalid amounts when summing", () => {
    const billsWithInvalid = [
      { period_bucket: "1_14" as const, teles_amount: 100, nicole_amount: 50 },
      { period_bucket: "1_14" as const, teles_amount: "bad", nicole_amount: 20 },
    ];
    expect(sumMyBillShareTotal(billsWithInvalid, "teles_amount", "1_14")).toBe(100);
    expect(sumMyBillShareTotal(billsWithInvalid, "nicole_amount", "1_14")).toBe(70);
  });
});

describe("sumMyUnpaidBillShareTotal", () => {
  const bills = [
    { period_bucket: "1_14" as const, teles_amount: 100, nicole_amount: 50, is_paid: false },
    { period_bucket: "1_14" as const, teles_amount: 25.5, nicole_amount: 30, is_paid: true },
    { period_bucket: "15_eom" as const, teles_amount: 200, nicole_amount: 75, is_paid: false },
    { period_bucket: "15_eom" as const, teles_amount: 10, nicole_amount: 40, is_paid: true },
  ];

  it("sums only unpaid bills for full month", () => {
    expect(sumMyUnpaidBillShareTotal(bills, "teles_amount", "full")).toBe(300);
    expect(sumMyUnpaidBillShareTotal(bills, "nicole_amount", "full")).toBe(125);
  });

  it("ignores paid bills", () => {
    expect(sumMyUnpaidBillShareTotal(bills, "teles_amount", "1_14")).toBe(100);
    expect(sumMyUnpaidBillShareTotal(bills, "nicole_amount", "1_14")).toBe(50);
  });

  it("sums only unpaid 1_14 bills", () => {
    expect(sumMyUnpaidBillShareTotal(bills, "teles_amount", "1_14")).toBe(100);
    expect(sumMyUnpaidBillShareTotal(bills, "nicole_amount", "1_14")).toBe(50);
  });

  it("sums only unpaid 15_eom bills", () => {
    expect(sumMyUnpaidBillShareTotal(bills, "teles_amount", "15_eom")).toBe(200);
    expect(sumMyUnpaidBillShareTotal(bills, "nicole_amount", "15_eom")).toBe(75);
  });

  it("returns null when share key is null", () => {
    expect(sumMyUnpaidBillShareTotal(bills, null, "full")).toBeNull();
  });

  it("ignores invalid amounts when summing", () => {
    const billsWithInvalid = [
      { period_bucket: "1_14" as const, teles_amount: 100, nicole_amount: 50, is_paid: false },
      { period_bucket: "1_14" as const, teles_amount: "bad", nicole_amount: 20, is_paid: false },
    ];
    expect(sumMyUnpaidBillShareTotal(billsWithInvalid, "teles_amount", "1_14")).toBe(100);
    expect(sumMyUnpaidBillShareTotal(billsWithInvalid, "nicole_amount", "1_14")).toBe(70);
  });
});

describe("calculateSafeToSpendBeforeSavings", () => {
  it("returns positive safe-to-spend", () => {
    expect(calculateSafeToSpendBeforeSavings(1000, 300)).toBe(700);
  });

  it("returns zero safe-to-spend", () => {
    expect(calculateSafeToSpendBeforeSavings(500, 500)).toBe(0);
  });

  it("returns negative safe-to-spend", () => {
    expect(calculateSafeToSpendBeforeSavings(200, 350)).toBe(-150);
  });
});
