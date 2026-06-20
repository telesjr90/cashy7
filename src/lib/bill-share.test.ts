import { describe, expect, it } from "vitest";
import {
  getMyBillShareAmount,
  resolveBillShareKeyForPerson,
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
