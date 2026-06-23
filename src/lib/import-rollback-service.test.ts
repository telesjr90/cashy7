import { describe, expect, it } from "vitest";
import {
  canUserRollbackImport,
  sanitizeRollbackErrorMessage,
} from "./import-rollback-service";
import {
  IMPORT_ROLLBACK_OWNER_ONLY_COPY,
  resolveRollbackBatchStatus,
} from "./import-rollback";

describe("import rollback service helpers", () => {
  it("sanitizes raw UUID database errors for user-facing text", () => {
    const message = sanitizeRollbackErrorMessage(
      "delete failed for id 00000000-0000-4000-8000-000000000001"
    );
    expect(message).not.toMatch(/00000000-0000-4000-8000-000000000001/);
  });

  it("blocks non-owner rollback at permission layer", () => {
    expect(canUserRollbackImport({ role: "member", is_owner: false })).toBe(false);
    expect(IMPORT_ROLLBACK_OWNER_ONLY_COPY).toContain("owner");
  });

  it("allows household owner rollback", () => {
    expect(canUserRollbackImport({ role: "owner", is_owner: true })).toBe(true);
  });

  it("maps full delete success to rolled_back status", () => {
    expect(
      resolveRollbackBatchStatus({
        deleted: 4,
        protected: 0,
        alreadyMissing: 0,
        failed: 0,
        byGroup: {
          bill_templates: 0,
          bill_instances: 4,
          debt_accounts: 0,
          debt_payments: 0,
          linked_debt_bill_instances: 0,
          manual_expenses: 0,
          savings_contributions: 0,
        },
      })
    ).toBe("rolled_back");
  });

  it("maps skipped protected rows to rollback_partial status", () => {
    expect(
      resolveRollbackBatchStatus({
        deleted: 1,
        protected: 2,
        alreadyMissing: 0,
        failed: 0,
        byGroup: {
          bill_templates: 0,
          bill_instances: 1,
          debt_accounts: 0,
          debt_payments: 0,
          linked_debt_bill_instances: 0,
          manual_expenses: 0,
          savings_contributions: 0,
        },
      })
    ).toBe("rollback_partial");
  });

  it("maps all failures with zero deletes to rollback_failed status", () => {
    expect(
      resolveRollbackBatchStatus({
        deleted: 0,
        protected: 0,
        alreadyMissing: 0,
        failed: 2,
        byGroup: {
          bill_templates: 0,
          bill_instances: 0,
          debt_accounts: 0,
          debt_payments: 0,
          linked_debt_bill_instances: 0,
          manual_expenses: 0,
          savings_contributions: 0,
        },
      })
    ).toBe("rollback_failed");
  });
});
