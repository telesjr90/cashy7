import { describe, expect, it } from "vitest";
import type { ImportValidatedRow } from "@/lib/import-validation";
import {
  appendImportNote,
  buildImportApplyResultSummary,
  buildImportConfirmationSummary,
  buildImportCreatePlans,
  buildImportSourceNote,
  canUserApplyImport,
  emptyImportApplyResultCounts,
  isRowWritable,
  planProducesCashDeduction,
  userFacingImportBatchLabel,
  type ImportApplyContext,
} from "./import-apply";

const emptyContext = (): ImportApplyContext => ({
  existingBillTemplates: [],
  existingBillInstances: [],
  existingDebtAccounts: [],
  existingDebtPayments: [],
  existingManualExpenses: [],
  existingSavingsContributions: [],
  savingsGoals: [{ id: "goal-1", name: "Emergency fund" }],
});

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

describe("import apply helpers", () => {
  it("allows household owners to apply imports", () => {
    expect(canUserApplyImport({ role: "owner", is_owner: true })).toBe(true);
    expect(canUserApplyImport({ role: "member", is_owner: false })).toBe(false);
  });

  it("excludes error and unknown rows from writable set", () => {
    expect(isRowWritable(makeValidatedRow({ status: "error" }))).toBe(false);
    expect(isRowWritable(makeValidatedRow({ rowType: "unknown" }))).toBe(false);
    expect(isRowWritable(makeValidatedRow({ status: "warning", rowType: "bill" }))).toBe(true);
  });

  it("creates a bill instance plan for a valid bill row", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1200,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.kind).toBe("bill_instance");
    expect(result.plans[0]?.billInstance?.is_paid).toBe(false);
    expect(result.plans[0]?.billInstance?.paid_status).toBe("unpaid");
    expect(result.plans[0]?.billInstance?.amount).toBe(1200);
  });

  it("creates a bill template plan when recurring marker is set", () => {
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

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans[0]?.kind).toBe("bill_template");
    expect(result.plans[0]?.billTemplate?.recurring).toBe(true);
  });

  it("creates debt payment and linked bill plans", () => {
    const row = makeValidatedRow({
      rowType: "debt",
      mappedValues: {
        debtMarker: "yes",
        name: "Visa",
        amount: 250,
        dueDate: "2026-06-20",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans[0]?.kind).toBe("debt_payment_with_bill");
    expect(result.plans[0]?.debtPaymentWithBill?.bill.is_paid).toBe(false);
    expect(result.plans[0]?.debtPaymentWithBill?.payment.paid_status).toBe(false);
    expect(result.plans[0]?.batchRecordPlans).toHaveLength(2);
  });

  it("creates manual expense plans without paid status", () => {
    const row = makeValidatedRow({
      rowType: "expense",
      mappedValues: {
        expenseMarker: "yes",
        name: "Groceries",
        amount: 45.5,
        dueDate: "2026-06-03",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: "person-1",
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans[0]?.kind).toBe("manual_expense");
    expect(result.plans[0]?.manualExpense?.is_paid).toBe(false);
    expect(result.plans[0]?.manualExpense?.created_by_user_id).toBe("user-1");
  });

  it("creates own savings contribution plans only when goal matches", () => {
    const row = makeValidatedRow({
      rowType: "savings",
      mappedValues: {
        savingsMarker: "yes",
        category: "Emergency fund",
        amount: 100,
        dueDate: "2026-06-05",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans[0]?.kind).toBe("savings_contribution");
    expect(result.plans[0]?.savingsContribution?.savingsGoalId).toBe("goal-1");
  });

  it("skips savings rows when goal matching is ambiguous", () => {
    const row = makeValidatedRow({
      rowType: "savings",
      mappedValues: {
        savingsMarker: "yes",
        category: "Vacation",
        amount: 100,
        dueDate: "2026-06-05",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: {
        ...emptyContext(),
        savingsGoals: [
          { id: "goal-a", name: "Vacation" },
          { id: "goal-b", name: "Vacation" },
        ],
      },
    });

    expect(result.plans).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain("Multiple savings goals");
  });

  it("excludes validation error rows from create plans", () => {
    const result = buildImportCreatePlans({
      rows: [makeValidatedRow({ status: "error", rowType: "bill" })],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans).toHaveLength(0);
    expect(result.excluded[0]?.reason).toContain("validation errors");
  });

  it("includes warning-only rows in create plans", () => {
    const row = makeValidatedRow({
      status: "warning",
      mappedValues: {
        billMarker: "yes",
        name: "Water",
        amount: 40,
        dueDate: "2026-06-08",
        period: "1st-14th",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.hasWarning).toBe(true);
  });

  it("builds confirmation summary counts by target type", () => {
    const billRow = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1200,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });
    const expenseRow = makeValidatedRow({
      rowId: "row-2",
      rowNumber: 3,
      rowType: "expense",
      mappedValues: {
        expenseMarker: "yes",
        name: "Coffee",
        amount: 5,
        dueDate: "2026-06-02",
      },
    });

    const planBuild = buildImportCreatePlans({
      rows: [billRow, expenseRow],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    const summary = buildImportConfirmationSummary({
      fileName: "sample.csv",
      sheetName: "CSV",
      sheetCount: 1,
      validationRows: [billRow, expenseRow],
      planBuild,
    });

    expect(summary.rowsToCreate).toBe(2);
    expect(summary.countsByKind.bill_instance).toBe(1);
    expect(summary.countsByKind.manual_expense).toBe(1);
    expect(summary.noRecordsChangedYet).toBe(true);
  });

  it("builds result summary for created and failed counts", () => {
    const counts = emptyImportApplyResultCounts();
    counts.billInstances = 2;
    counts.failed = 1;

    const summary = buildImportApplyResultSummary({
      counts,
      importBatchId: "batch-123",
      developerDetails: ["Row 4: duplicate"],
    });

    expect(summary.partial).toBe(true);
    expect(summary.success).toBe(false);
    expect(summary.userMessage).toContain("partially");
  });

  it("tracks batch record plans with table names not user-facing UUID labels", () => {
    const row = makeValidatedRow({
      mappedValues: {
        billMarker: "yes",
        name: "Rent",
        amount: 1200,
        dueDate: "2026-06-15",
        period: "15th-EOM",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(result.plans[0]?.batchRecordPlans[0]?.targetTable).toBe("bill_instances");
    expect(result.plans[0]?.batchRecordPlans[0]?.targetIdPlaceholder).not.toMatch(
      /[0-9a-f-]{36}/i
    );
  });

  it("does not produce cash deduction mutations in plans", () => {
    const row = makeValidatedRow({
      rowType: "savings",
      mappedValues: {
        savingsMarker: "yes",
        category: "Emergency fund",
        amount: 50,
        dueDate: "2026-06-04",
      },
    });

    const result = buildImportCreatePlans({
      rows: [row],
      householdId: "house-1",
      userId: "user-1",
      personId: null,
      fileName: "sample.csv",
      context: emptyContext(),
    });

    expect(planProducesCashDeduction(result.plans[0]!)).toBe(false);
  });

  it("avoids raw UUIDs in user-facing import batch labels", () => {
    expect(userFacingImportBatchLabel("00000000-0000-4000-8000-000000000001")).toBeNull();
  });

  it("builds import source notes without raw UUIDs in source labels", () => {
    const note = buildImportSourceNote("sample.csv", 5, "00000000-0000-4000-8000-000000000001");
    expect(note).not.toMatch(/00000000-0000-4000-8000-000000000001/);
    expect(note).toContain("row 5");
    expect(note).toContain("sample.csv");
  });

  it("appends import notes to existing notes", () => {
    expect(appendImportNote("Existing", "[Imported from spreadsheet]")).toBe(
      "Existing\n[Imported from spreadsheet]"
    );
  });
});
