import { describe, expect, it } from "vitest";
import type { BillInstance } from "@/lib/types";
import {
  DEFAULT_BILL_INSTANCE_FILTERS,
  filterBillInstances,
  type BillInstanceFilterContext,
} from "@/lib/bill-filters";
import {
  BILL_PRE_START_LABEL,
  BILLS_PRE_START_HIDDEN_NOTICE,
  billCashflowStartLabelContainsRawUuid,
  getBillInstancePreStartLabel,
  getBillsPageVisibleInstances,
  isBillInstancePreStart,
  SHOW_PRE_START_BILLS_LABEL,
  splitBillInstancesByCashflowStart,
} from "./bill-cashflow-start";

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

const START_DATE = "2026-06-15";

const beforeStart = makeBill({
  id: "before",
  year: 2026,
  month: 6,
  period_bucket: "1_14",
});
const onStart = makeBill({
  id: "on-start",
  year: 2026,
  month: 6,
  period_bucket: "15_eom",
});
const afterStart = makeBill({
  id: "after",
  year: 2026,
  month: 7,
  period_bucket: "1_14",
});

const emptyFilterContext: BillInstanceFilterContext = {
  debtLinkedBillIds: new Set(),
  cashDeductedBillIds: new Set(),
  templateCategoryByBillId: new Map(),
  variableBillContext: {
    templateByBillId: new Map(),
    debtLinkedBillIds: new Set(),
  },
};

describe("isBillInstancePreStart", () => {
  it("classifies bills before the start date as pre-start", () => {
    expect(isBillInstancePreStart(beforeStart, START_DATE)).toBe(true);
  });

  it("does not classify bills on the start date as pre-start", () => {
    expect(isBillInstancePreStart(onStart, START_DATE)).toBe(false);
  });

  it("does not classify bills after the start date as pre-start", () => {
    expect(isBillInstancePreStart(afterStart, START_DATE)).toBe(false);
  });

  it("keeps all bills visible when no start date is configured", () => {
    expect(isBillInstancePreStart(beforeStart, null)).toBe(false);
    expect(isBillInstancePreStart(beforeStart, undefined)).toBe(false);
  });
});

describe("splitBillInstancesByCashflowStart", () => {
  it("splits active and pre-start bills when a start date is set", () => {
    const { activeBills, preStartBills } = splitBillInstancesByCashflowStart(
      [beforeStart, onStart, afterStart],
      START_DATE
    );

    expect(activeBills.map((bill) => bill.id)).toEqual(["on-start", "after"]);
    expect(preStartBills.map((bill) => bill.id)).toEqual(["before"]);
  });

  it("returns all bills as active when no start date is set", () => {
    const { activeBills, preStartBills } = splitBillInstancesByCashflowStart(
      [beforeStart, onStart, afterStart],
      null
    );

    expect(activeBills).toHaveLength(3);
    expect(preStartBills).toHaveLength(0);
  });
});

describe("getBillsPageVisibleInstances", () => {
  const bills = [beforeStart, onStart, afterStart];

  it("excludes pre-start bills from the default visible list", () => {
    const visible = getBillsPageVisibleInstances(bills, START_DATE, false);
    expect(visible.map((bill) => bill.id)).toEqual(["on-start", "after"]);
  });

  it("includes pre-start bills when show-pre-start mode is on", () => {
    const visible = getBillsPageVisibleInstances(bills, START_DATE, true);
    expect(visible.map((bill) => bill.id)).toEqual(["before", "on-start", "after"]);
  });

  it("includes all bills when no start date is configured", () => {
    expect(getBillsPageVisibleInstances(bills, null, false)).toEqual(bills);
  });
});

describe("bill cashflow start labels", () => {
  it("returns a readable pre-start label", () => {
    expect(getBillInstancePreStartLabel(beforeStart, START_DATE)).toBe(
      BILL_PRE_START_LABEL
    );
    expect(getBillInstancePreStartLabel(onStart, START_DATE)).toBeNull();
  });

  it("does not expose raw UUIDs in user-facing labels", () => {
    for (const label of [
      BILL_PRE_START_LABEL,
      BILLS_PRE_START_HIDDEN_NOTICE,
      SHOW_PRE_START_BILLS_LABEL,
    ]) {
      expect(billCashflowStartLabelContainsRawUuid(label)).toBe(false);
    }
  });
});

describe("filters with cashflow start boundary", () => {
  const bills = [beforeStart, onStart, afterStart];

  it("does not reveal pre-start bills through filters when the toggle is off", () => {
    const visible = getBillsPageVisibleInstances(bills, START_DATE, false);
    const filtered = filterBillInstances(
      visible,
      { ...DEFAULT_BILL_INSTANCE_FILTERS, searchText: "Test" },
      emptyFilterContext
    );

    expect(filtered.map((bill) => bill.id)).toEqual(["on-start", "after"]);
  });

  it("allows filters to match pre-start bills when the toggle is on", () => {
    const visible = getBillsPageVisibleInstances(bills, START_DATE, true);
    const filtered = filterBillInstances(
      visible,
      { ...DEFAULT_BILL_INSTANCE_FILTERS, periodBucket: "1_14" },
      emptyFilterContext
    );

    expect(filtered.map((bill) => bill.id)).toEqual(["before", "after"]);
  });

  it("keeps pre-start bills hidden after clearing filters when the toggle is off", () => {
    const visible = getBillsPageVisibleInstances(bills, START_DATE, false);
    const filtered = filterBillInstances(
      visible,
      DEFAULT_BILL_INSTANCE_FILTERS,
      emptyFilterContext
    );

    expect(filtered.map((bill) => bill.id)).toEqual(["on-start", "after"]);
  });
});
