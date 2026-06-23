import { describe, expect, it } from "vitest";
import {
  buildDashboardBillViewLabel,
  buildUnpaidBillDrilldown,
  buildUnpaidBillDrilldownReconciliation,
  buildUnpaidBillDrilldownRows,
  sumUnpaidBillDrilldownRowShares,
  UNPAID_BILL_DRILLDOWN_EMPTY_MESSAGE,
} from "@/lib/dashboard-bill-drilldown";
import type { BillInstance } from "@/lib/types";

function makeBill(
  overrides: Partial<BillInstance> & Pick<BillInstance, "id" | "name">
): BillInstance {
  return {
    id: overrides.id,
    bill_id: overrides.bill_id ?? null,
    household_id: "household-1",
    name: overrides.name,
    amount: overrides.amount ?? 100,
    teles_amount: overrides.teles_amount ?? 51,
    nicole_amount: overrides.nicole_amount ?? 49,
    year: overrides.year ?? 2026,
    month: overrides.month ?? 6,
    period_bucket: overrides.period_bucket ?? "1_14",
    due_date: overrides.due_date ?? "2026-06-10",
    is_paid: overrides.is_paid ?? false,
    paid_status: overrides.paid_status ?? (overrides.is_paid ? "paid" : "unpaid"),
    paid_at: overrides.paid_at ?? null,
    paid_by_user_id: overrides.paid_by_user_id ?? null,
    notes: overrides.notes ?? null,
    created_at: overrides.created_at ?? "2026-06-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-01T00:00:00.000Z",
  };
}

describe("buildDashboardBillViewLabel", () => {
  it("includes month, year, and period view", () => {
    expect(buildDashboardBillViewLabel(2026, 6, "1_14")).toBe(
      "June 2026 · 1st - 14th"
    );
    expect(buildDashboardBillViewLabel(2026, 6, "full")).toBe(
      "June 2026 · Full month"
    );
  });
});

describe("buildUnpaidBillDrilldownRows", () => {
  const variableContext = {
    templateByBillId: new Map([
      [
        "template-1",
        { is_variable: true, default_amount: 100 },
      ],
    ]),
    debtLinkedBillIds: new Set<string>(),
  };

  it("preserves debt-linked and source labels without raw UUIDs", () => {
    const rows = buildUnpaidBillDrilldownRows(
      [
        makeBill({
          id: "bill-1",
          name: "Debt: Card payment",
          bill_id: "template-1",
          notes: "[Generated for June 2026]",
        }),
      ],
      "teles_amount",
      new Set(["bill-1"]),
      variableContext,
      null
    );

    expect(rows[0].isDebtLinked).toBe(true);
    expect(rows[0].sourceLabel).toBe("Generated from template");
    expect(rows[0].name).toBe("Debt: Card payment");
    expect(rows[0].name).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });

  it("preserves variable amount warning when confirmation is needed", () => {
    const rows = buildUnpaidBillDrilldownRows(
      [
        makeBill({
          id: "bill-2",
          name: "Electric",
          bill_id: "template-1",
          amount: 100,
          notes: "[Generated for June 2026]",
        }),
      ],
      "teles_amount",
      new Set(),
      variableContext,
      null
    );

    expect(rows[0].variableAmountWarningLabel).toContain("Forecast is incomplete");
  });

  it("omits cash deduction label when payment context is unavailable", () => {
    const rows = buildUnpaidBillDrilldownRows(
      [makeBill({ id: "bill-3", name: "Internet" })],
      "teles_amount",
      new Set(),
      variableContext,
      null
    );

    expect(rows[0].cashDeductionStatusLabel).toBeNull();
  });

  it("shows cash deduction label from the signed-in user's payment context", () => {
    const rows = buildUnpaidBillDrilldownRows(
      [makeBill({ id: "bill-4", name: "Rent", is_paid: false })],
      "teles_amount",
      new Set(),
      variableContext,
      {
        billPaymentSourceIds: new Map([["bill-4", {} as never]]),
        debtPaymentTransactionSourceIds: new Map(),
        debtPaymentIdByBillId: new Map(),
      }
    );

    expect(rows[0].cashDeductionStatusLabel).toBe("Deducted from cash");
  });
});

describe("buildUnpaidBillDrilldown", () => {
  const bills = [
    makeBill({
      id: "unpaid-1",
      name: "Rent",
      period_bucket: "1_14",
      teles_amount: 51,
      is_paid: false,
    }),
    makeBill({
      id: "paid-1",
      name: "Internet",
      period_bucket: "1_14",
      teles_amount: 30,
      is_paid: true,
    }),
    makeBill({
      id: "unpaid-2",
      name: "Phone",
      period_bucket: "15_eom",
      teles_amount: 20,
      is_paid: false,
    }),
  ];

  const variableContext = {
    templateByBillId: new Map<string, { is_variable: boolean; default_amount: number | null }>(),
    debtLinkedBillIds: new Set<string>(),
  };

  it("includes only unpaid bills for the selected period view", () => {
    const fullMonth = buildUnpaidBillDrilldown({
      bills,
      periodView: "full",
      shareKey: "teles_amount",
      debtLinkedBillIds: new Set(),
      variableBillContext: variableContext,
      cardTotal: 71,
      cashDeductionContext: null,
    });

    expect(fullMonth.rows.map((row) => row.name)).toEqual(["Phone", "Rent"]);

    const firstPeriod = buildUnpaidBillDrilldown({
      bills,
      periodView: "1_14",
      shareKey: "teles_amount",
      debtLinkedBillIds: new Set(),
      variableBillContext: variableContext,
      cardTotal: 51,
      cashDeductionContext: null,
    });

    expect(firstPeriod.rows.map((row) => row.name)).toEqual(["Rent"]);
  });

  it("reconciles displayed row total to the dashboard card total", () => {
    const result = buildUnpaidBillDrilldown({
      bills,
      periodView: "full",
      shareKey: "teles_amount",
      debtLinkedBillIds: new Set(),
      variableBillContext: variableContext,
      cardTotal: 71,
      cashDeductionContext: null,
    });

    expect(sumUnpaidBillDrilldownRowShares(result.rows)).toBe(71);
    expect(result.reconciliation.totalsMatch).toBe(true);
    expect(result.reconciliation.matchLabel).toBe("Totals match");
  });

  it("returns an empty row list when no unpaid bills apply", () => {
    const paidOnly = bills.map((bill) => ({ ...bill, is_paid: true }));
    const result = buildUnpaidBillDrilldown({
      bills: paidOnly,
      periodView: "full",
      shareKey: "teles_amount",
      debtLinkedBillIds: new Set(),
      variableBillContext: variableContext,
      cardTotal: 0,
      cashDeductionContext: null,
    });

    expect(result.rows).toHaveLength(0);
    expect(result.reconciliation.cardTotal).toBe(0);
    expect(result.reconciliation.displayedRowTotal).toBe(0);
    expect(result.reconciliation.totalsMatch).toBe(true);
  });
});

describe("buildUnpaidBillDrilldownReconciliation", () => {
  it("explains privacy-safe mismatch without exposing hidden values", () => {
    const reconciliation = buildUnpaidBillDrilldownReconciliation(100, 80);

    expect(reconciliation.totalsMatch).toBe(false);
    expect(reconciliation.matchLabel).toBeNull();
    expect(reconciliation.mismatchExplanation).toContain("budget profile");
    expect(reconciliation.mismatchExplanation).not.toMatch(/80|100/);
  });
});

describe("UNPAID_BILL_DRILLDOWN_EMPTY_MESSAGE", () => {
  it("describes the empty unpaid-bill state", () => {
    expect(UNPAID_BILL_DRILLDOWN_EMPTY_MESSAGE).toContain("No unpaid bills");
  });
});
