import { describe, expect, it } from "vitest";
import {
  buildBillTemplateLookup,
  countVariableBillsNeedingConfirmationForDashboardView,
  isPlaceholderVariableAmount,
  needsVariableAmountConfirmation,
} from "@/lib/variable-bills";
import type { Bill, BillInstance } from "@/lib/types";

function makeTemplate(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "template-1",
    household_id: "household-1",
    name: "Water",
    category: "utilities",
    default_amount: null,
    due_day: "10",
    is_variable: true,
    period_bucket: "1_14",
    recurring: true,
    active_from: "2026-01-01",
    active_until: null,
    notes: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeInstance(overrides: Partial<BillInstance> = {}): BillInstance {
  return {
    id: "instance-1",
    bill_id: "template-1",
    household_id: "household-1",
    year: 2026,
    month: 6,
    period_bucket: "1_14",
    name: "Water",
    amount: 0,
    teles_amount: 0,
    nicole_amount: 0,
    due_date: "2026-06-10",
    is_paid: false,
    paid_status: "unpaid",
    paid_at: null,
    paid_by_user_id: null,
    notes: "[Generated for June 2026]",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

describe("needsVariableAmountConfirmation", () => {
  const context = {
    templateByBillId: buildBillTemplateLookup([makeTemplate()]),
    debtLinkedBillIds: new Set<string>(),
  };

  it("flags unpaid generated variable row with zero amount", () => {
    expect(needsVariableAmountConfirmation(makeInstance(), context)).toBe(true);
  });

  it("flags unpaid generated variable row with placeholder default amount", () => {
    const templateContext = {
      templateByBillId: buildBillTemplateLookup([
        makeTemplate({ default_amount: 75 }),
      ]),
      debtLinkedBillIds: new Set<string>(),
    };

    expect(
      needsVariableAmountConfirmation(
        makeInstance({ amount: 75, teles_amount: 38.25, nicole_amount: 36.75 }),
        templateContext
      )
    ).toBe(true);
  });

  it("does not flag paid variable row", () => {
    expect(
      needsVariableAmountConfirmation(
        makeInstance({ is_paid: true, paid_status: "paid" }),
        context
      )
    ).toBe(false);
  });

  it("does not flag fixed bill with zero amount", () => {
    const fixedContext = {
      templateByBillId: buildBillTemplateLookup([
        makeTemplate({ is_variable: false, default_amount: 100 }),
      ]),
      debtLinkedBillIds: new Set<string>(),
    };

    expect(
      needsVariableAmountConfirmation(makeInstance({ amount: 0 }), fixedContext)
    ).toBe(false);
  });

  it("does not flag debt-linked bill as regular variable bill", () => {
    expect(
      needsVariableAmountConfirmation(
        makeInstance({
          id: "debt-bill",
          bill_id: null,
          name: "Debt: Card",
          amount: 0,
        }),
        {
          ...context,
          debtLinkedBillIds: new Set(["debt-bill"]),
        }
      )
    ).toBe(false);
  });

  it("clears warning when generated variable row has confirmed non-zero amount", () => {
    const templateContext = {
      templateByBillId: buildBillTemplateLookup([
        makeTemplate({ default_amount: 75 }),
      ]),
      debtLinkedBillIds: new Set<string>(),
    };

    expect(
      needsVariableAmountConfirmation(
        makeInstance({ amount: 82.5, teles_amount: 42.08, nicole_amount: 40.42 }),
        templateContext
      )
    ).toBe(false);
  });

  it("does not flag manual non-variable bill", () => {
    expect(
      needsVariableAmountConfirmation(
        makeInstance({ bill_id: null, amount: 0 }),
        context
      )
    ).toBe(false);
  });
});

describe("isPlaceholderVariableAmount", () => {
  it("treats zero as placeholder for variable templates", () => {
    expect(
      isPlaceholderVariableAmount({ amount: 0 }, makeTemplate())
    ).toBe(true);
  });

  it("treats matching default amount as placeholder", () => {
    expect(
      isPlaceholderVariableAmount(
        { amount: 50 },
        makeTemplate({ default_amount: 50 })
      )
    ).toBe(true);
  });
});

describe("countVariableBillsNeedingConfirmationForDashboardView", () => {
  const context = {
    templateByBillId: buildBillTemplateLookup([makeTemplate()]),
    debtLinkedBillIds: new Set<string>(),
  };

  it("counts only bills in the current dashboard view period", () => {
    const instances = [
      makeInstance({ id: "p1", period_bucket: "1_14", amount: 0 }),
      makeInstance({
        id: "p2",
        period_bucket: "15_eom",
        amount: 0,
      }),
    ];

    expect(
      countVariableBillsNeedingConfirmationForDashboardView({
        instances,
        context,
        periodView: "1_14",
        year: 2026,
        month: 6,
      })
    ).toBe(1);

    expect(
      countVariableBillsNeedingConfirmationForDashboardView({
        instances,
        context,
        periodView: "full",
        year: 2026,
        month: 6,
      })
    ).toBe(2);
  });
});
