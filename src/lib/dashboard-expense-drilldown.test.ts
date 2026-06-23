import { describe, expect, it } from "vitest";
import {
  buildExpenseDrilldownReconciliation,
  buildExpenseDrilldownRows,
  buildManualExpenseDrilldown,
  DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS,
  EXPENSE_DRILLDOWN_EMPTY_MESSAGE,
  expenseDrilldownRowLabelsArePrivacySafe,
  filterExpenseDrilldownRowsLocally,
  getExpenseDrilldownCategoryOptions,
  hasActiveExpenseDrilldownFilters,
  sumExpenseDrilldownRowShares,
} from "@/lib/dashboard-expense-drilldown";
import { filterManualExpensesCountedInDashboardView } from "@/lib/dashboard-drilldowns";
import type { ManualExpense, Person } from "@/lib/types";

function makeExpense(
  overrides: Partial<ManualExpense> & Pick<ManualExpense, "id" | "description">
): ManualExpense {
  return {
    id: overrides.id,
    household_id: "household-1",
    created_by_user_id: "user-1",
    person_id: overrides.person_id ?? null,
    expense_scope: overrides.expense_scope ?? "private",
    description: overrides.description,
    category: overrides.category ?? null,
    amount: overrides.amount ?? 100,
    expense_date: overrides.expense_date ?? "2026-06-15",
    period_bucket: overrides.period_bucket ?? "15_eom",
    split_type: overrides.split_type ?? "personal",
    teles_amount: overrides.teles_amount ?? 100,
    nicole_amount: overrides.nicole_amount ?? 0,
    is_paid: overrides.is_paid ?? false,
    paid_at: overrides.paid_at ?? null,
    notes: overrides.notes ?? null,
    adjusts_manual_expense_id: overrides.adjusts_manual_expense_id ?? null,
    adjustment_direction: overrides.adjustment_direction ?? null,
    adjustment_reason: overrides.adjustment_reason ?? null,
    created_at: overrides.created_at ?? "2026-06-15T10:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-15T10:00:00.000Z",
  };
}

const people: Person[] = [
  {
    id: "person-teles",
    household_id: "household-1",
    name: "Teles",
    color: null,
    pay_schedule: "biweekly",
    pay_schedule_description: null,
    paycheck_amount: 0,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

describe("buildManualExpenseDrilldown", () => {
  const snapshotDate = "2026-06-10";
  const expenses = [
    makeExpense({
      id: "exp-1",
      description: "Groceries",
      category: "Food",
      expense_date: "2026-06-15",
      teles_amount: 40,
      nicole_amount: 0,
      person_id: "person-teles",
      notes: "Weekly shop",
    }),
    makeExpense({
      id: "exp-2",
      description: "Before snapshot",
      expense_date: "2026-06-08",
    }),
    makeExpense({
      id: "exp-3",
      description: "Paid through app",
      expense_date: "2026-06-16",
    }),
    makeExpense({
      id: "adj-1",
      description: "Groceries correction",
      expense_date: "2026-06-18",
      teles_amount: 10,
      nicole_amount: 0,
      adjusts_manual_expense_id: "exp-1",
      adjustment_direction: "increase",
      adjustment_reason: "Forgot item",
    }),
    makeExpense({
      id: "exp-other-month",
      description: "July expense",
      expense_date: "2026-07-02",
    }),
  ];

  it("includes manual expenses and adjustments counted in the dashboard view", () => {
    const result = buildManualExpenseDrilldown({
      expenses,
      periodView: "full",
      selectedYear: 2026,
      selectedMonth: 6,
      snapshotDate,
      shareKey: "teles_amount",
      cardTotal: 50,
      deductedManualExpenseIds: new Set(["exp-3"]),
      people,
    });

    expect(result.rows.map((row) => row.id)).toEqual(["adj-1", "exp-1"]);
    expect(result.rows[1]).toMatchObject({
      rowTypeLabel: "Manual expense",
      sourceLabel: "Private",
      paidByLabel: "Teles",
      category: "Food",
      notes: "Weekly shop",
    });
    expect(result.rows[0]).toMatchObject({
      rowTypeLabel: "Adjustment",
      sourceLabel: "Expense adjustment",
      adjustmentDirectionLabel: "Increase",
      linkedOriginalDescription: "Groceries",
    });
  });

  it("reconciles listed row shares to the dashboard card total", () => {
    const result = buildManualExpenseDrilldown({
      expenses,
      periodView: "full",
      selectedYear: 2026,
      selectedMonth: 6,
      snapshotDate,
      shareKey: "teles_amount",
      cardTotal: 50,
      deductedManualExpenseIds: new Set(["exp-3"]),
      people,
    });

    expect(sumExpenseDrilldownRowShares(result.rows)).toBe(50);
    expect(result.reconciliation.totalsMatch).toBe(true);
    expect(result.reconciliation.matchLabel).toBe("Totals match");
  });

  it("excludes rows outside the selected month or before snapshot", () => {
    const filtered = filterManualExpensesCountedInDashboardView(
      expenses,
      "1_14",
      2026,
      6,
      snapshotDate,
      new Set(["exp-3"])
    );

    expect(filtered.map((expense) => expense.id)).toEqual([]);
  });
});

describe("buildExpenseDrilldownRows", () => {
  it("labels adjustment rows clearly with privacy-safe fallback", () => {
    const rows = buildExpenseDrilldownRows(
      [
        makeExpense({
          id: "adj-missing",
          description: "Correction",
          adjusts_manual_expense_id: "missing-original",
          adjustment_direction: "decrease",
        }),
      ],
      "teles_amount",
      [],
      []
    );

    expect(rows[0].kind).toBe("adjustment");
    expect(rows[0].linkedOriginalDescription).toBe(
      "Original expense unavailable"
    );
    expect(expenseDrilldownRowLabelsArePrivacySafe(rows[0])).toBe(true);
  });

  it("does not expose raw UUIDs in user-facing labels", () => {
    const rows = buildExpenseDrilldownRows(
      [
        makeExpense({
          id: "11111111-1111-1111-1111-111111111111",
          description: "Coffee",
          category: "Food",
        }),
      ],
      "teles_amount"
    );

    expect(rows[0].description).toBe("Coffee");
    expect(expenseDrilldownRowLabelsArePrivacySafe(rows[0])).toBe(true);
  });
});

describe("buildExpenseDrilldownReconciliation", () => {
  it("shows privacy-safe mismatch copy when totals differ", () => {
    const reconciliation = buildExpenseDrilldownReconciliation(50, 40);

    expect(reconciliation.totalsMatch).toBe(false);
    expect(reconciliation.matchLabel).toBeNull();
    expect(reconciliation.mismatchExplanation).toContain(
      "private expenses are not shown"
    );
  });
});

describe("filterExpenseDrilldownRowsLocally", () => {
  const rows = buildExpenseDrilldownRows(
    [
      makeExpense({
        id: "exp-1",
        description: "Groceries",
        category: "Food",
      }),
      makeExpense({
        id: "adj-1",
        description: "Groceries correction",
        category: "Food",
        adjusts_manual_expense_id: "exp-1",
        adjustment_direction: "increase",
      }),
      makeExpense({
        id: "exp-2",
        description: "Gas",
        category: "Transport",
      }),
    ],
    "teles_amount"
  );

  it("filters by search text, category, and row kind", () => {
    expect(
      filterExpenseDrilldownRowsLocally(rows, {
        ...DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS,
        searchText: "correction",
      })
    ).toHaveLength(1);

    expect(
      filterExpenseDrilldownRowsLocally(rows, {
        ...DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS,
        category: "Transport",
      })
    ).toEqual([rows[2]]);

    expect(
      filterExpenseDrilldownRowsLocally(rows, {
        ...DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS,
        rowKind: "adjustment",
      })
    ).toEqual([rows[1]]);
  });

  it("detects active filters and category options", () => {
    expect(
      hasActiveExpenseDrilldownFilters(DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS)
    ).toBe(false);
    expect(
      hasActiveExpenseDrilldownFilters({
        ...DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS,
        rowKind: "expense",
      })
    ).toBe(true);
    expect(getExpenseDrilldownCategoryOptions(rows)).toEqual([
      "Food",
      "Transport",
    ]);
  });
});

describe("EXPENSE_DRILLDOWN_EMPTY_MESSAGE", () => {
  it("describes the empty state", () => {
    expect(EXPENSE_DRILLDOWN_EMPTY_MESSAGE).toContain("No manual expenses");
  });
});
