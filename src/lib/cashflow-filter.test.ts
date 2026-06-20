import { describe, expect, it } from "vitest";
import type { BillInstance } from "@/lib/types";
import {
  billInstanceDashboardDate,
  filterBillInstancesByCashflowStart,
  isBillInstanceOnOrAfterCashflowStart,
} from "./cashflow-filter";

function makeBill(
  overrides: Partial<BillInstance> & Pick<BillInstance, "year" | "month" | "period_bucket">
): BillInstance {
  return {
    id: "bill-1",
    bill_id: null,
    household_id: "household-1",
    name: "Test Bill",
    amount: 100,
    teles_amount: 50,
    nicole_amount: 50,
    due_date: null,
    is_paid: false,
    paid_status: "unpaid",
    paid_at: null,
    paid_by_user_id: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

describe("billInstanceDashboardDate", () => {
  it("uses day 1 for the 1_14 period bucket", () => {
    expect(
      billInstanceDashboardDate({ year: 2026, month: 6, period_bucket: "1_14" })
    ).toBe("2026-06-01");
  });

  it("uses day 15 for the 15_eom period bucket", () => {
    expect(
      billInstanceDashboardDate({ year: 2026, month: 6, period_bucket: "15_eom" })
    ).toBe("2026-06-15");
  });
});

describe("isBillInstanceOnOrAfterCashflowStart", () => {
  const startDate = "2026-06-15";

  it("returns false when the dashboard date is before the start date", () => {
    const bill = makeBill({ year: 2026, month: 6, period_bucket: "1_14" });
    expect(isBillInstanceOnOrAfterCashflowStart(bill, startDate)).toBe(false);
  });

  it("returns true when the dashboard date is on the start date", () => {
    const bill = makeBill({ year: 2026, month: 6, period_bucket: "15_eom" });
    expect(isBillInstanceOnOrAfterCashflowStart(bill, startDate)).toBe(true);
  });

  it("returns true when the dashboard date is after the start date", () => {
    const bill = makeBill({ year: 2026, month: 7, period_bucket: "1_14" });
    expect(isBillInstanceOnOrAfterCashflowStart(bill, startDate)).toBe(true);
  });
});

describe("filterBillInstancesByCashflowStart", () => {
  const startDate = "2026-06-15";
  const before = makeBill({
    id: "before",
    year: 2026,
    month: 5,
    period_bucket: "15_eom",
  });
  const onStart = makeBill({
    id: "on-start",
    year: 2026,
    month: 6,
    period_bucket: "15_eom",
  });
  const after = makeBill({
    id: "after",
    year: 2026,
    month: 7,
    period_bucket: "1_14",
  });

  it("excludes bills before the start date", () => {
    const filtered = filterBillInstancesByCashflowStart(
      [before, onStart, after],
      startDate
    );
    expect(filtered.map((bill) => bill.id)).toEqual(["on-start", "after"]);
  });

  it("includes bills on the start date", () => {
    const filtered = filterBillInstancesByCashflowStart([onStart], startDate);
    expect(filtered).toHaveLength(1);
  });

  it("includes bills after the start date", () => {
    const filtered = filterBillInstancesByCashflowStart([after], startDate);
    expect(filtered).toHaveLength(1);
  });

  it("preserves all bills when no start date is set", () => {
    const bills = [before, onStart, after];
    expect(filterBillInstancesByCashflowStart(bills, null)).toEqual(bills);
    expect(filterBillInstancesByCashflowStart(bills, undefined)).toEqual(bills);
  });
});
