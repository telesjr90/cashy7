import { describe, expect, it } from "vitest";
import type { BillInstance, CashSnapshot, DebtPayment } from "@/lib/types";
import {
  buildDashboardWarnings,
  countUnpaidBillsInDashboardView,
  countUnpaidDebtPaymentsInDashboardView,
  dashboardWarningLabelsArePrivacySafe,
  filterOwnCashSnapshot,
  isCashSnapshotMissing,
  isCashSnapshotStale,
  STALE_CASH_SNAPSHOT_MAX_AGE_DAYS,
} from "@/lib/dashboard-warnings";
import { buildSafeToSpendForecast } from "@/lib/safe-to-spend-forecast";

const USER_ID = "user-teles";
const OTHER_USER_ID = "user-other";
const SHARE_KEY = "teles_amount" as const;
const TODAY = "2026-06-22";

function makeSnapshot(
  overrides: Partial<CashSnapshot> = {}
): Pick<CashSnapshot, "snapshot_date" | "amount" | "user_id"> {
  return {
    snapshot_date: "2026-06-20",
    amount: 1000,
    user_id: USER_ID,
    ...overrides,
  };
}

function makeBill(overrides: Partial<BillInstance> = {}): BillInstance {
  return {
    id: "bill-1",
    household_id: "household-1",
    bill_id: "template-1",
    name: "Internet",
    amount: 100,
    teles_amount: 51,
    nicole_amount: 49,
    period_bucket: "1_14",
    year: 2026,
    month: 6,
    due_date: "2026-06-10",
    is_paid: false,
    paid_status: "unpaid",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as BillInstance;
}

function makeDebtPayment(
  overrides: Partial<DebtPayment> = {}
): Pick<
  DebtPayment,
  | "id"
  | "payment_date"
  | "teles_amount"
  | "nicole_amount"
  | "paid_status"
  | "linked_bill_instance_id"
  | "period_bucket"
> {
  return {
    id: "debt-1",
    payment_date: "2026-06-12",
    teles_amount: 51,
    nicole_amount: 49,
    paid_status: false,
    linked_bill_instance_id: null,
    period_bucket: "1_14",
    ...overrides,
  };
}

const baseInput = {
  signedInUserId: USER_ID,
  shareKey: SHARE_KEY,
  peopleLoaded: true,
  cashSnapshot: makeSnapshot(),
  cashflowStartDate: "2026-01-01",
  settingsLoaded: true,
  periodView: "1_14" as const,
  selectedYear: 2026,
  selectedMonth: 6,
  today: TODAY,
  safeToSpendBeforeSavings: 500,
  safeToSpendAfterSavings: 300,
  variableBillCountForView: 0,
  remainingSavingsObligation: 0,
  bills: [] as BillInstance[],
  debtPayments: [] as ReturnType<typeof makeDebtPayment>[],
  debtLinkedBillIds: new Set<string>(),
  forecastSummary: null,
};

describe("isCashSnapshotMissing", () => {
  it("treats missing snapshot as missing", () => {
    expect(isCashSnapshotMissing(null, USER_ID)).toBe(true);
  });

  it("ignores another user's snapshot", () => {
    expect(
      isCashSnapshotMissing(makeSnapshot({ user_id: OTHER_USER_ID }), USER_ID)
    ).toBe(true);
  });
});

describe("isCashSnapshotStale", () => {
  it("treats missing snapshot date as stale", () => {
    expect(
      isCashSnapshotStale({
        snapshotDate: null,
        periodView: "1_14",
        selectedYear: 2026,
        selectedMonth: 6,
        today: TODAY,
      })
    ).toBe(true);
  });

  it("flags snapshots older than the selected period start", () => {
    expect(
      isCashSnapshotStale({
        snapshotDate: "2026-05-30",
        periodView: "1_14",
        selectedYear: 2026,
        selectedMonth: 6,
        today: TODAY,
      })
    ).toBe(true);
  });

  it("does not flag a fresh snapshot", () => {
    expect(
      isCashSnapshotStale({
        snapshotDate: "2026-06-20",
        periodView: "1_14",
        selectedYear: 2026,
        selectedMonth: 6,
        today: TODAY,
        maxAgeDays: STALE_CASH_SNAPSHOT_MAX_AGE_DAYS,
      })
    ).toBe(false);
  });
});

describe("buildDashboardWarnings cash snapshot", () => {
  it("produces a warning when the current-cash snapshot is missing", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      cashSnapshot: null,
    });

    expect(warnings.some((warning) => warning.category === "stale_cash_snapshot")).toBe(
      true
    );
    expect(warnings.find((warning) => warning.category === "stale_cash_snapshot")?.title).toBe(
      "No current amount recorded"
    );
  });

  it("produces a warning when the current-cash snapshot is stale", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      cashSnapshot: makeSnapshot({ snapshot_date: "2026-05-01" }),
    });

    expect(
      warnings.find((warning) => warning.category === "stale_cash_snapshot")?.title
    ).toBe("Current amount snapshot is outdated");
  });

  it("does not produce a stale warning for a fresh snapshot", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      cashSnapshot: makeSnapshot({ snapshot_date: "2026-06-20" }),
    });

    expect(
      warnings.some((warning) => warning.category === "stale_cash_snapshot")
    ).toBe(false);
  });
});

describe("buildDashboardWarnings profile and setup", () => {
  it("produces a warning when the budget profile is missing", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      shareKey: null,
    });

    expect(
      warnings.find((warning) => warning.category === "missing_budget_profile")
    ).toMatchObject({
      severity: "warning",
      actionPath: "/settings",
    });
  });

  it("produces a warning when the cashflow start date is missing", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      cashflowStartDate: null,
    });

    expect(
      warnings.find((warning) => warning.category === "no_cashflow_start_date")
    ).toMatchObject({
      severity: "warning",
      actionPath: "/settings",
    });
  });
});

describe("buildDashboardWarnings variable bills", () => {
  it("produces a warning when variable bills need confirmation", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      variableBillCountForView: 2,
    });

    expect(
      warnings.find((warning) => warning.category === "missing_variable_bill_amount")
    ).toMatchObject({
      severity: "warning",
      description: expect.stringContaining("2 variable bills"),
      actionPath: "/bills",
    });
  });

  it("does not produce a variable bill warning when none need confirmation", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      variableBillCountForView: 0,
      forecastVariableBillCount: 0,
    });

    expect(
      warnings.some((warning) => warning.category === "missing_variable_bill_amount")
    ).toBe(false);
  });
});

describe("buildDashboardWarnings safe-to-spend and forecast", () => {
  it("produces a critical warning when safe-to-spend before savings is negative", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      safeToSpendBeforeSavings: -25,
    });

    expect(
      warnings.find(
        (warning) =>
          warning.category === "negative_safe_to_spend" &&
          warning.id === "negative-safe-to-spend-before"
      )
    ).toMatchObject({
      severity: "critical",
      drilldownKind: "safe-to-spend-before",
    });
  });

  it("produces a critical warning when safe-to-spend after savings is negative", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      safeToSpendAfterSavings: -10,
    });

    expect(
      warnings.find(
        (warning) =>
          warning.category === "negative_safe_to_spend" &&
          warning.id === "negative-safe-to-spend-after"
      )
    ).toMatchObject({
      severity: "critical",
      drilldownKind: "safe-to-spend-after",
    });
  });

  it("produces a critical forecast shortfall warning with the first shortfall date", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      forecastSummary: {
        hasShortfall: true,
        firstShortfallDate: "2026-06-28",
        windowLabel: "Rest of this month",
      },
    });

    expect(
      warnings.find((warning) => warning.category === "forecast_shortfall")
    ).toMatchObject({
      severity: "critical",
      description: expect.stringContaining("2026-06-28"),
    });
  });

  it("reuses forecast summary output without changing forecast calculations", () => {
    const forecast = buildSafeToSpendForecast({
      startingCash: 50,
      snapshotDate: "2026-06-20",
      shareKey: SHARE_KEY,
      signedInUserId: USER_ID,
      windowKind: "days_30",
      periodView: "1_14",
      selectedYear: 2026,
      selectedMonth: 6,
      today: TODAY,
      bills: [makeBill({ due_date: "2026-06-25", teles_amount: 100, nicole_amount: 0 })],
      debtPayments: [],
      debtLinkedBillIds: new Set(),
      manualExpenses: [],
      savingsParticipants: [],
      savingsContributions: [],
      variableBillContext: {
        templateByBillId: new Map(),
        debtLinkedBillIds: new Set(),
      },
    });

    const warnings = buildDashboardWarnings({
      ...baseInput,
      forecastSummary: forecast.summary,
    });

    expect(forecast.summary.hasShortfall).toBe(true);
    expect(
      warnings.some((warning) => warning.category === "forecast_shortfall")
    ).toBe(true);
  });
});

describe("buildDashboardWarnings unpaid obligations", () => {
  it("produces an informational warning for unpaid bills, debt, and savings", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      remainingSavingsObligation: 75,
      bills: [makeBill()],
      debtPayments: [makeDebtPayment()],
    });

    const obligationWarning = warnings.find(
      (warning) => warning.category === "unpaid_required_obligations"
    );

    expect(obligationWarning).toMatchObject({
      severity: "info",
      description: expect.stringContaining("unpaid bill"),
    });
    expect(obligationWarning?.description).toContain("scheduled debt payment");
    expect(obligationWarning?.description).toContain("remaining savings obligation");
  });

  it("does not double-count debt-linked bill and debt rows", () => {
    const linkedBill = makeBill({ id: "linked-bill" });
    const debtPayments = [
      makeDebtPayment({
        id: "linked-debt",
        linked_bill_instance_id: "linked-bill",
      }),
      makeDebtPayment({
        id: "standalone-debt",
        linked_bill_instance_id: null,
      }),
    ];

    expect(
      countUnpaidDebtPaymentsInDashboardView({
        debtPayments,
        bills: [linkedBill],
        debtLinkedBillIds: new Set(["linked-bill"]),
        shareKey: SHARE_KEY,
        periodView: "1_14",
        selectedYear: 2026,
        selectedMonth: 6,
      })
    ).toBe(1);

    const warnings = buildDashboardWarnings({
      ...baseInput,
      bills: [linkedBill],
      debtPayments,
      debtLinkedBillIds: new Set(["linked-bill"]),
    });

    const obligationWarning = warnings.find(
      (warning) => warning.category === "unpaid_required_obligations"
    );

    expect(obligationWarning?.description).toContain("1 unpaid bill");
    expect(obligationWarning?.description).toContain("1 scheduled debt payment");
    expect(obligationWarning?.description).not.toContain("2 scheduled debt");
  });
});

describe("countUnpaidBillsInDashboardView", () => {
  it("counts only unpaid bills in the selected view with a positive share", () => {
    expect(
      countUnpaidBillsInDashboardView({
        bills: [
          makeBill(),
          makeBill({ id: "bill-2", is_paid: true, paid_status: "paid" }),
          makeBill({
            id: "bill-3",
            period_bucket: "15_eom",
          }),
        ],
        shareKey: SHARE_KEY,
        periodView: "1_14",
      })
    ).toBe(1);
  });
});

describe("privacy-safe dashboard warnings", () => {
  it("ignores another user's cash snapshot even if passed accidentally", () => {
    expect(filterOwnCashSnapshot(makeSnapshot({ user_id: OTHER_USER_ID }), USER_ID)).toBe(
      null
    );

    const warnings = buildDashboardWarnings({
      ...baseInput,
      cashSnapshot: makeSnapshot({ user_id: OTHER_USER_ID }),
    });

    expect(
      warnings.find((warning) => warning.category === "stale_cash_snapshot")?.title
    ).toBe("No current amount recorded");
  });

  it("keeps action labels and descriptions free of raw UUIDs", () => {
    const warnings = buildDashboardWarnings({
      ...baseInput,
      variableBillCountForView: 1,
      remainingSavingsObligation: 50,
      bills: [makeBill({ id: "550e8400-e29b-41d4-a716-446655440000" })],
      debtPayments: [
        makeDebtPayment({ id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" }),
      ],
      forecastSummary: {
        hasShortfall: true,
        firstShortfallDate: "2026-06-28",
        windowLabel: "Rest of this month",
      },
      safeToSpendBeforeSavings: -1,
      safeToSpendAfterSavings: -2,
      cashflowStartDate: null,
    });

    expect(dashboardWarningLabelsArePrivacySafe(warnings)).toBe(true);
  });
});
