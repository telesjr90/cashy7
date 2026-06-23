import { describe, expect, it } from "vitest";
import {
  approvalBlockedReason,
  approvalCopyAvoidsRawUuids,
  assessCandidateApprovalReadiness,
  buildApprovedExpenseSummaryLabel,
  buildCandidateApprovalUpdatePayload,
  buildManualExpensePayloadFromApproval,
  buildReceiptAuditNote,
  candidateApprovalUpdatePreservesAuditFields,
  manualExpensePayloadDoesNotDeductCash,
  partialApprovalFailureMessage,
  RECEIPT_APPROVAL_CONFIRMATION_LINES,
  RECEIPT_APPROVAL_SUCCESS_LINES,
  sanitizeApprovalErrorMessage,
  validateCandidateApprovalForm,
} from "./receipt-approval";
import type { ReceiptCandidate } from "./types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_ID = "33333333-3333-4333-8333-333333333333";
const EXPENSE_ID = "55555555-5555-4555-8555-555555555555";

function makeCandidate(overrides: Partial<ReceiptCandidate> = {}): ReceiptCandidate {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    household_id: HOUSEHOLD_ID,
    receipt_upload_id: "22222222-2222-4222-8222-222222222222",
    created_by: USER_ID,
    status: "pending",
    merchant: "Corner Store",
    transaction_date: "2026-06-20",
    total_amount: 42.5,
    tax_amount: 3.2,
    category: "Groceries",
    line_items: [],
    confidence: 0.88,
    field_confidence: {},
    warnings: [],
    source_status: "success",
    approved_at: null,
    approved_by: null,
    linked_manual_expense_id: null,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    ...overrides,
  };
}

describe("receipt approval helpers", () => {
  it("marks pending candidate with merchant/date/total as approval-ready", () => {
    const readiness = assessCandidateApprovalReadiness(makeCandidate(), {
      merchant: "Corner Store",
      transactionDate: "2026-06-20",
      totalAmount: "42.5",
      taxAmount: "3.2",
      category: "Groceries",
    });

    expect(readiness.ready).toBe(true);
    if (readiness.ready) {
      expect(readiness.values.merchant).toBe("Corner Store");
      expect(readiness.values.transaction_date).toBe("2026-06-20");
      expect(readiness.values.total_amount).toBe(42.5);
    }
  });

  it("blocks approval when date is missing", () => {
    const readiness = assessCandidateApprovalReadiness(makeCandidate(), {
      merchant: "Corner Store",
      transactionDate: "",
      totalAmount: "42.5",
      taxAmount: "",
      category: "",
    });

    expect(readiness.ready).toBe(false);
    if (!readiness.ready) {
      expect(readiness.error).toMatch(/date/i);
    }
  });

  it("blocks approval for missing or invalid amount", () => {
    const missing = assessCandidateApprovalReadiness(makeCandidate(), {
      merchant: "Corner Store",
      transactionDate: "2026-06-20",
      totalAmount: "",
      taxAmount: "",
      category: "",
    });
    expect(missing.ready).toBe(false);

    const invalid = validateCandidateApprovalForm({
      merchant: "Corner Store",
      transactionDate: "2026-06-20",
      totalAmount: "abc",
      taxAmount: "",
      category: "",
    });
    expect(invalid.error).toMatch(/total amount/i);
  });

  it("blocks negative amount approval", () => {
    const readiness = assessCandidateApprovalReadiness(makeCandidate(), {
      merchant: "Corner Store",
      transactionDate: "2026-06-20",
      totalAmount: "-5",
      taxAmount: "",
      category: "",
    });

    expect(readiness.ready).toBe(false);
  });

  it("blocks approving an already approved candidate", () => {
    expect(
      approvalBlockedReason(
        makeCandidate({
          status: "approved",
          linked_manual_expense_id: EXPENSE_ID,
        })
      )
    ).toMatch(/already approved/i);
  });

  it("blocks approving a dismissed candidate", () => {
    expect(approvalBlockedReason(makeCandidate({ status: "dismissed" }))).toMatch(
      /dismissed/i
    );
  });

  it("maps merchant/date/total/category into manual expense payload", () => {
    const { payload, error } = buildManualExpensePayloadFromApproval({
      householdId: HOUSEHOLD_ID,
      userId: USER_ID,
      draft: {
        merchant: "Corner Store",
        transaction_date: "2026-06-20",
        total_amount: 42.5,
        tax_amount: 3.2,
        category: "Groceries",
      },
      receiptFileName: "receipt.jpg",
    });

    expect(error).toBeNull();
    expect(payload).toMatchObject({
      description: "Corner Store",
      expense_date: "2026-06-20",
      amount: 42.5,
      category: "Groceries",
      expense_scope: "shared",
      split_type: "51_49",
      is_paid: false,
    });
    expect(payload?.notes).toContain("approved receipt candidate");
    expect(payload?.notes).toContain("receipt.jpg");
  });

  it("does not produce cash deduction payload", () => {
    const { payload } = buildManualExpensePayloadFromApproval({
      householdId: HOUSEHOLD_ID,
      userId: USER_ID,
      draft: {
        merchant: "Cafe",
        transaction_date: "2026-06-01",
        total_amount: 8.5,
        tax_amount: null,
        category: "Food",
      },
    });

    expect(payload).not.toBeNull();
    expect(manualExpensePayloadDoesNotDeductCash(payload!)).toBe(true);
  });

  it("builds candidate approval update without touching audit-only fields", () => {
    const update = buildCandidateApprovalUpdatePayload({
      draft: {
        merchant: "Corner Store",
        transaction_date: "2026-06-20",
        total_amount: 42.5,
        tax_amount: 3.2,
        category: "Groceries",
      },
      manualExpenseId: EXPENSE_ID,
      approvedBy: USER_ID,
      approvedAt: "2026-06-23T13:00:00.000Z",
    });

    expect(update.status).toBe("approved");
    expect(update.linked_manual_expense_id).toBe(EXPENSE_ID);
    expect(candidateApprovalUpdatePreservesAuditFields(update)).toBe(true);
  });

  it("success copy says no cash deducted and audit preserved", () => {
    expect(RECEIPT_APPROVAL_SUCCESS_LINES.join(" ")).toMatch(/no cash was deducted/i);
    expect(RECEIPT_APPROVAL_SUCCESS_LINES.join(" ")).toMatch(/audit preserved/i);
    expect(approvalCopyAvoidsRawUuids(RECEIPT_APPROVAL_SUCCESS_LINES)).toBe(true);
    expect(approvalCopyAvoidsRawUuids(RECEIPT_APPROVAL_CONFIRMATION_LINES)).toBe(true);
    expect(approvalCopyAvoidsRawUuids([partialApprovalFailureMessage()])).toBe(true);
    expect(approvalCopyAvoidsRawUuids([buildReceiptAuditNote({ receiptFileName: "x.jpg" })])).toBe(
      true
    );
  });

  it("sanitizes raw UUIDs from user-facing errors", () => {
    expect(
      sanitizeApprovalErrorMessage(
        "insert failed for 44444444-4444-4444-8444-444444444444"
      )
    ).toMatch(/please try again/i);
    expect(
      sanitizeApprovalErrorMessage("Total amount must be greater than zero.")
    ).toBe("Total amount must be greater than zero.");
  });

  it("builds approved expense summary without raw UUIDs", () => {
    const label = buildApprovedExpenseSummaryLabel({
      description: "Corner Store",
      amount: 42.5,
      expenseDate: "2026-06-20",
    });
    expect(label).toContain("Corner Store");
    expect(label).toContain("2026-06-20");
    expect(label).not.toMatch(/[0-9a-f]{8}-/i);
  });
});
