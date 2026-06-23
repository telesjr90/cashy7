import { describe, expect, it } from "vitest";
import {
  canUserApplyImport,
  IMPORT_OWNER_ONLY_COPY,
} from "./import-apply";
import { buildImportStrategyPlan, type ImportDuplicateContext } from "./import-duplicates";
import { sanitizeApplyImportErrorMessage } from "./import-apply-service";

describe("import apply service helpers", () => {
  it("sanitizes raw UUID database errors for user-facing text", () => {
    const message = sanitizeApplyImportErrorMessage(
      "insert failed for id 00000000-0000-4000-8000-000000000001"
    );
    expect(message).not.toMatch(/00000000-0000-4000-8000-000000000001/);
  });

  it("blocks non-owner apply at permission layer", () => {
    expect(canUserApplyImport({ role: "member", is_owner: false })).toBe(false);
    expect(IMPORT_OWNER_ONLY_COPY).toContain("owner");
  });

  it("create-new-only strategy plan preserves skip behavior for duplicates", () => {
    const context: ImportDuplicateContext = {
      existingBillTemplates: [],
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
      existingDebtAccounts: [],
      existingDebtPayments: [],
      existingManualExpenses: [],
      existingSavingsContributions: [],
      savingsGoals: [],
      protection: {
        cashDeductedBillIds: new Set(),
        cashDeductedDebtPaymentIds: new Set(),
        cashDeductedExpenseIds: new Set(),
        debtLinkedBillIds: new Set(),
      },
      importedRecords: [],
    };

    const plan = buildImportStrategyPlan({
      strategy: "create_new_only",
      createPlans: [
        {
          rowId: "row-1",
          sheetName: "CSV",
          rowNumber: 2,
          rowType: "bill",
          kind: "bill_instance",
          hasWarning: false,
          billInstance: {
            household_id: "house-1",
            bill_id: null,
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            name: "Rent",
            amount: 1200,
            teles_amount: 612,
            nicole_amount: 588,
            due_date: "2026-06-15",
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
          },
          batchRecordPlans: [],
        },
      ],
      skippedFromBuild: [],
      excludedFromBuild: [],
      context,
      userId: "user-1",
    });

    expect(plan.summary.toSkipDuplicate).toBe(1);
    expect(plan.summary.toCreate).toBe(0);
  });

  it("update-matching plans updates only for exact safe matches", () => {
    const context: ImportDuplicateContext = {
      existingBillTemplates: [],
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
      existingDebtAccounts: [],
      existingDebtPayments: [],
      existingManualExpenses: [],
      existingSavingsContributions: [],
      savingsGoals: [],
      protection: {
        cashDeductedBillIds: new Set(["bill-1"]),
        cashDeductedDebtPaymentIds: new Set(),
        cashDeductedExpenseIds: new Set(),
        debtLinkedBillIds: new Set(),
      },
      importedRecords: [],
    };

    const plan = buildImportStrategyPlan({
      strategy: "update_matching",
      createPlans: [
        {
          rowId: "row-1",
          sheetName: "CSV",
          rowNumber: 2,
          rowType: "bill",
          kind: "bill_instance",
          hasWarning: false,
          billInstance: {
            household_id: "house-1",
            bill_id: null,
            year: 2026,
            month: 6,
            period_bucket: "15_eom",
            name: "Rent",
            amount: 1300,
            teles_amount: 663,
            nicole_amount: 637,
            due_date: "2026-06-15",
            is_paid: false,
            paid_status: "unpaid",
            notes: null,
          },
          batchRecordPlans: [],
        },
      ],
      skippedFromBuild: [],
      excludedFromBuild: [],
      context,
      userId: "user-1",
    });

    expect(plan.summary.toUpdate).toBe(0);
    expect(plan.summary.toSkipProtected).toBe(1);
  });
});
