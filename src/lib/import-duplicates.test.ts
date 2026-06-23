import { describe, expect, it } from "vitest";
import type { ImportValidatedRow } from "@/lib/import-validation";
import { buildImportCreatePlans, type ImportRowCreatePlan } from "./import-apply";
import {
  buildImportStrategyPlan,
  buildImportStrategyPlanSummary,
  classifyBillInstanceMatch,
  classifyBillTemplateMatch,
  classifyCreatePlanMatch,
  classifyDebtPaymentMatch,
  classifyManualExpenseMatch,
  classifySavingsContributionMatch,
  normalizeMatchKey,
  userFacingRecordLabel,
  type ImportDuplicateContext,
  type ImportProtectionContext,
} from "./import-duplicates";

const protection = (): ImportProtectionContext => ({
  cashDeductedBillIds: new Set(),
  cashDeductedDebtPaymentIds: new Set(),
  cashDeductedExpenseIds: new Set(),
  debtLinkedBillIds: new Set(),
});

function emptyContext(overrides: Partial<ImportDuplicateContext> = {}): ImportDuplicateContext {
  return {
    existingBillTemplates: [],
    existingBillInstances: [],
    existingDebtAccounts: [],
    existingDebtPayments: [],
    existingManualExpenses: [],
    existingSavingsContributions: [],
    savingsGoals: [{ id: "goal-1", name: "Emergency fund" }],
    protection: protection(),
    importedRecords: [],
    ...overrides,
  };
}

function makeValidatedRow(
  overrides: Partial<ImportValidatedRow> = {}
): ImportValidatedRow {
  return {
    rowId: "row-1",
    sheetName: "CSV",
    rowNumber: 2,
    status: "valid",
    rowType: "bill",
    mappedValues: {},
    issues: [],
    ...overrides,
  };
}

function buildPlan(row: ImportValidatedRow): ImportRowCreatePlan {
  const result = buildImportCreatePlans({
    rows: [row],
    householdId: "house-1",
    userId: "user-1",
    personId: null,
    fileName: "sample.csv",
    context: {
      allowDuplicates: true,
      existingBillTemplates: [],
      existingBillInstances: [],
      existingDebtAccounts: [],
      existingDebtPayments: [],
      existingManualExpenses: [],
      existingSavingsContributions: [],
      savingsGoals: [{ id: "goal-1", name: "Emergency fund" }],
    },
  });
  return result.plans[0]!;
}

describe("import duplicate helpers", () => {
  it("normalizes match keys conservatively", () => {
    expect(normalizeMatchKey("  Rent   Payment ")).toBe("rent payment");
  });

  it("avoids raw UUIDs in user-facing labels", () => {
    expect(
      userFacingRecordLabel(["Rent", "00000000-0000-4000-8000-000000000001"])
    ).toBe("Rent");
    expect(userFacingRecordLabel(["00000000-0000-4000-8000-000000000001"])).toBe(
      "Existing record"
    );
  });

  it("detects exact bill instance duplicate", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1200,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });
    const plan = buildPlan(row);
    const match = classifyBillInstanceMatch(
      plan,
      emptyContext({
        existingBillInstances: [
          {
            id: "bill-1",
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            due_date: "2026-06-15",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
            bill_id: null,
          },
        ],
      })
    );
    expect(match.status).toBe("exact_match");
    expect(match.label).toContain("Rent");
    expect(match.label).not.toMatch(/bill-1/);
  });

  it("detects exact bill template duplicate", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        recurringMarker: "yes",
        name: "Internet",
        amount: 80,
        dueDate: "2026-06-10",
        period: "1st-14th",
      },
    });
    const plan = buildPlan(row);
    const match = classifyBillTemplateMatch(
      plan,
      emptyContext({
        existingBillTemplates: [
          {
            id: "template-1",
            name: "Internet",
            period_bucket: "1_14",
            due_day: "10",
            category: "utilities",
            default_amount: 80,
            notes: null,
            is_active: true,
          },
        ],
      })
    );
    expect(match.status).toBe("exact_match");
  });

  it("detects exact debt payment duplicate", () => {
    const row = makeValidatedRow({
      rowType: "debt",
      mappedValues: {
        debtMarker: "yes",
        name: "Visa",
        amount: 250,
        dueDate: "2026-06-20",
      },
    });
    const plan = buildPlan(row);
    const match = classifyDebtPaymentMatch(
      plan,
      emptyContext({
        existingDebtAccounts: [{ id: "debt-1", name: "Visa", is_archived: false }],
        existingDebtPayments: [
          {
            id: "payment-1",
            debt_account_id: "debt-1",
            debt_account_name: "Visa",
            payment_date: "2026-06-20",
            total_payment: 250,
            paid_status: false,
            linked_bill_instance_id: null,
          },
        ],
      })
    );
    expect(match.status).toBe("exact_match");
  });

  it("detects exact manual expense duplicate", () => {
    const row = makeValidatedRow({
      rowType: "expense",
      mappedValues: {
        expenseMarker: "yes",
        name: "Groceries",
        amount: 45.5,
        dueDate: "2026-06-03",
        category: "food",
      },
    });
    const plan = buildPlan(row);
    const match = classifyManualExpenseMatch(
      plan,
      emptyContext({
        existingManualExpenses: [
          {
            id: "expense-1",
            description: "Groceries",
            expense_date: "2026-06-03",
            amount: 45.5,
            category: "food",
            is_paid: false,
            notes: null,
            created_by_user_id: "user-1",
          },
        ],
      })
    );
    expect(match.status).toBe("exact_match");
  });

  it("detects exact own savings contribution duplicate", () => {
    const row = makeValidatedRow({
      rowType: "savings",
      mappedValues: {
        savingsMarker: "yes",
        category: "Emergency fund",
        amount: 100,
        dueDate: "2026-06-05",
      },
    });
    const plan = buildPlan(row);
    const match = classifySavingsContributionMatch(plan, emptyContext(), "user-1");
    expect(match.status).toBe("no_match");

    const duplicateMatch = classifySavingsContributionMatch(
      plan,
      emptyContext({
        existingSavingsContributions: [
          {
            id: "contrib-1",
            savings_goal_id: "goal-1",
            savings_goal_name: "Emergency fund",
            contribution_date: "2026-06-05",
            amount: 100,
            notes: null,
            user_id: "user-1",
          },
        ],
      }),
      "user-1"
    );
    expect(duplicateMatch.status).toBe("exact_match");
  });

  it("does not match other-user savings rows", () => {
    const row = makeValidatedRow({
      rowType: "savings",
      mappedValues: {
        savingsMarker: "yes",
        category: "Emergency fund",
        amount: 100,
        dueDate: "2026-06-05",
      },
    });
    const plan = buildPlan(row);
    const match = classifySavingsContributionMatch(
      plan,
      emptyContext({
        existingSavingsContributions: [
          {
            id: "contrib-2",
            savings_goal_id: "goal-1",
            savings_goal_name: "Emergency fund",
            contribution_date: "2026-06-05",
            amount: 100,
            notes: null,
            user_id: "other-user",
          },
        ],
      }),
      "user-1"
    );
    expect(match.status).toBe("no_match");
  });

  it("marks ambiguous duplicates with skip reason", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1200,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });
    const plan = buildPlan(row);
    const match = classifyBillInstanceMatch(
      plan,
      emptyContext({
        existingBillInstances: [
          {
            id: "bill-a",
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            due_date: "2026-06-15",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
            bill_id: null,
          },
          {
            id: "bill-b",
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            due_date: "2026-06-15",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
            bill_id: null,
          },
        ],
      })
    );
    expect(match.status).toBe("ambiguous_match");
    expect(match.reason).toContain("Multiple bills");
  });

  it("marks possible duplicates with warning skip reason", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1200,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });
    const plan = buildPlan(row);
    const match = classifyBillInstanceMatch(
      plan,
      emptyContext({
        existingBillInstances: [
          {
            id: "bill-a",
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "1_14",
            due_date: "2026-06-05",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
            bill_id: null,
          },
        ],
      })
    );
    expect(match.status).toBe("possible_match");
    expect(match.reason).toContain("Possible duplicate");
  });

  it("create-new-only skips exact duplicates and creates new rows", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Water",
        amount: 40,
        dueDate: "2026-06-08",
        period: "1st-14th",
      },
    });
    const duplicateRow = makeValidatedRow({
      rowId: "row-2",
      rowNumber: 3,
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1200,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });
    const build = buildImportCreatePlans({
      rows: [row, duplicateRow],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: {
        allowDuplicates: true,
        existingBillTemplates: [],
        existingBillInstances: [
          {
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
          },
        ],
        existingDebtAccounts: [],
        existingDebtPayments: [],
        existingManualExpenses: [],
        existingSavingsContributions: [],
        savingsGoals: [],
      },
    });
    const plan = buildImportStrategyPlan({
      strategy: "create_new_only",
      createPlans: build.plans,
      skippedFromBuild: build.skipped,
      excludedFromBuild: build.excluded,
      context: emptyContext({
        existingBillInstances: [
          {
            id: "bill-1",
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            due_date: "2026-06-15",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
            bill_id: null,
          },
        ],
      }),
      userId: "user-1",
    });
    expect(plan.summary.toCreate).toBe(1);
    expect(plan.summary.toSkipDuplicate).toBe(1);
  });

  it("update-matching updates only safe exact matches", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1300,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });
    const build = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: {
        allowDuplicates: true,
        existingBillTemplates: [],
        existingBillInstances: [
          {
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
          },
        ],
        existingDebtAccounts: [],
        existingDebtPayments: [],
        existingManualExpenses: [],
        existingSavingsContributions: [],
        savingsGoals: [],
      },
    });
    const plan = buildImportStrategyPlan({
      strategy: "update_matching",
      createPlans: build.plans,
      skippedFromBuild: build.skipped,
      excludedFromBuild: build.excluded,
      context: emptyContext({
        existingBillInstances: [
          {
            id: "bill-1",
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            due_date: "2026-06-15",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
            bill_id: null,
          },
        ],
      }),
      userId: "user-1",
    });
    expect(plan.summary.toUpdate).toBe(1);
    expect(plan.items[0]?.action).toBe("update");
  });

  it("update-matching skips protected paid rows", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1300,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });
    const build = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: {
        allowDuplicates: true,
        existingBillTemplates: [],
        existingBillInstances: [],
        existingDebtAccounts: [],
        existingDebtPayments: [],
        existingManualExpenses: [],
        existingSavingsContributions: [],
        savingsGoals: [],
      },
    });
    const plan = buildImportStrategyPlan({
      strategy: "update_matching",
      createPlans: build.plans,
      skippedFromBuild: build.skipped,
      excludedFromBuild: build.excluded,
      context: emptyContext({
        existingBillInstances: [
          {
            id: "bill-1",
            name: "Rent",
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            due_date: "2026-06-15",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            is_paid: true,
            paid_status: "paid",
            notes: null,
            bill_id: null,
          },
        ],
      }),
      userId: "user-1",
    });
    expect(plan.summary.toUpdate).toBe(0);
    expect(plan.summary.toSkipProtected).toBe(1);
  });

  it("replace-selected-month plans only selected-scope imported rows", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Water",
        amount: 40,
        dueDate: "2026-06-08",
        period: "1st-14th",
      },
    });
    const build = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: {
        allowDuplicates: true,
        existingBillTemplates: [],
        existingBillInstances: [],
        existingDebtAccounts: [],
        existingDebtPayments: [],
        existingManualExpenses: [],
        existingSavingsContributions: [],
        savingsGoals: [],
      },
    });
    const plan = buildImportStrategyPlan({
      strategy: "replace_selected_month",
      scopeYear: 2026,
      scopeMonth: 6,
      createPlans: build.plans,
      skippedFromBuild: build.skipped,
      excludedFromBuild: build.excluded,
      context: emptyContext({
        existingBillInstances: [
          {
            id: "imported-bill",
            name: "Old import",
            year: 2026,
            month: 6,
            period_bucket: "1_14",
            due_date: "2026-06-04",
            amount: 30,
            teles_amount: 15,
            nicole_amount: 15,
            is_paid: false,
            paid_status: "unpaid",
            notes: "[Imported from spreadsheet]",
            bill_id: null,
          },
          {
            id: "other-month",
            name: "Other month",
            year: 2026,
            month: 5,
            period_bucket: "1_14",
            due_date: "2026-05-04",
            amount: 30,
            teles_amount: 15,
            nicole_amount: 15,
            is_paid: false,
            paid_status: "unpaid",
            notes: "[Imported from spreadsheet]",
            bill_id: null,
          },
        ],
        importedRecords: [
          {
            target_table: "bill_instances",
            target_id: "imported-bill",
            import_batch_id: "batch-1",
            year: 2026,
            month: 6,
          },
          {
            target_table: "bill_instances",
            target_id: "other-month",
            import_batch_id: "batch-1",
            year: 2026,
            month: 5,
          },
        ],
      }),
      userId: "user-1",
    });
    expect(plan.summary.toCreate).toBe(1);
    expect(plan.replaceDeletes).toHaveLength(1);
    expect(plan.replaceDeletes[0]?.targetId).toBe("imported-bill");
  });

  it("replace-selected-month preserves protected rows", () => {
    const plan = buildImportStrategyPlan({
      strategy: "replace_selected_month",
      scopeYear: 2026,
      scopeMonth: 6,
      createPlans: [],
      skippedFromBuild: [],
      excludedFromBuild: [],
      context: emptyContext({
        existingBillInstances: [
          {
            id: "paid-imported",
            name: "Paid import",
            year: 2026,
            month: 6,
            period_bucket: "1_14",
            due_date: "2026-06-04",
            amount: 30,
            teles_amount: 15,
            nicole_amount: 15,
            is_paid: true,
            paid_status: "paid",
            notes: "[Imported from spreadsheet]",
            bill_id: null,
          },
        ],
        importedRecords: [
          {
            target_table: "bill_instances",
            target_id: "paid-imported",
            import_batch_id: "batch-1",
            year: 2026,
            month: 6,
          },
        ],
      }),
      userId: "user-1",
    });
    expect(plan.replaceDeletes).toHaveLength(0);
  });

  it("builds strategy summary counts", () => {
    const summary = buildImportStrategyPlanSummary({
      items: [
        {
          action: "create",
          rowId: "1",
          sheetName: "CSV",
          rowNumber: 2,
          rowType: "bill",
          kind: "bill_instance",
          label: "Water",
          createPlan: {} as ImportRowCreatePlan,
          match: {
            status: "no_match",
            targetTable: null,
            targetId: null,
            label: "Water",
            reason: null,
          },
        },
        {
          action: "skip",
          rowId: "2",
          sheetName: "CSV",
          rowNumber: 3,
          rowType: "bill",
          label: "Rent",
          reason: "duplicate",
          match: {
            status: "exact_match",
            targetTable: "bill_instances",
            targetId: "bill-1",
            label: "Rent",
            reason: null,
          },
        },
      ],
      replaceDeletes: [],
      validationExcluded: 1,
    });
    expect(summary.toCreate).toBe(1);
    expect(summary.toSkipDuplicate).toBe(1);
    expect(summary.validationExcluded).toBe(1);
  });

  it("does not produce cash deduction in strategy classification", () => {
    const row = makeValidatedRow({
      rowType: "savings",
      mappedValues: {
        savingsMarker: "yes",
        category: "Emergency fund",
        amount: 50,
        dueDate: "2026-06-04",
      },
    });
    const plan = buildPlan(row);
    const match = classifyCreatePlanMatch(plan, emptyContext(), "user-1");
    expect(match.status).toBe("no_match");
    expect(plan.savingsContribution?.amount).toBe(50);
  });
});
