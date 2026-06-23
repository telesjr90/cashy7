import {
  buildCandidateDraftUpdatePayload,
  validateCandidateReviewForm,
  type CandidateDraftUpdateValues,
  type CandidateReviewFormValues,
  type CandidateReviewValidationResult,
} from "@/lib/receipt-candidate-review";
import { calculateExpenseSplit, getExpensePeriodBucket } from "@/lib/expenses";
import type {
  InsertManualExpense,
  InsertReceiptCandidate,
  InsertReceiptUpload,
  ReceiptCandidate,
} from "@/lib/types";

export const RECEIPT_APPROVAL_ACTION = "Approve and create expense";

export const RECEIPT_APPROVAL_CONFIRMATION_TITLE = "Create expense from receipt?";

export const RECEIPT_APPROVAL_CONFIRMATION_LINES = [
  "This will create a manual expense.",
  "No cash will be deducted.",
  "Receipt and extraction details will be preserved for audit.",
  "You can edit the expense later from Expenses.",
  "Only your receipt/candidate audit stays private to you.",
] as const;

export const RECEIPT_APPROVAL_SUCCESS_LINES = [
  "Expense created.",
  "No cash was deducted.",
  "Receipt audit preserved.",
] as const;

export const RECEIPT_APPROVAL_ALREADY_APPROVED_COPY =
  "This receipt candidate was already approved and linked to an expense.";

export const RECEIPT_APPROVAL_DISMISSED_COPY =
  "Dismissed receipt candidates cannot be approved.";

export const RECEIPT_APPROVAL_PARTIAL_FAILURE_COPY =
  "The expense was created, but linking the receipt candidate failed. Check Expenses for the new entry, then refresh this page. If the candidate still shows pending, try approving again or edit the expense manually.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type CandidateApprovalReadiness =
  | { ready: true; values: CandidateDraftUpdateValues; warnings: string[] }
  | { ready: false; error: string; warnings: string[] };

export function validateCandidateApprovalForm(
  form: CandidateReviewFormValues
): CandidateReviewValidationResult {
  const base = validateCandidateReviewForm(form);
  if (base.error || !base.values) {
    return base;
  }

  if (!base.values.transaction_date) {
    return {
      error: "Transaction date is required before approval.",
      warnings: base.warnings,
      values: null,
    };
  }

  return base;
}

export function approvalBlockedReason(
  candidate: Pick<ReceiptCandidate, "status" | "linked_manual_expense_id">
): string | null {
  if (candidate.status === "approved" || candidate.linked_manual_expense_id) {
    return RECEIPT_APPROVAL_ALREADY_APPROVED_COPY;
  }
  if (candidate.status === "dismissed") {
    return RECEIPT_APPROVAL_DISMISSED_COPY;
  }
  if (candidate.status !== "pending") {
    return "This receipt candidate cannot be approved.";
  }
  return null;
}

export function assessCandidateApprovalReadiness(
  candidate: Pick<ReceiptCandidate, "status" | "linked_manual_expense_id">,
  form: CandidateReviewFormValues
): CandidateApprovalReadiness {
  const blocked = approvalBlockedReason(candidate);
  if (blocked) {
    return { ready: false, error: blocked, warnings: [] };
  }

  const validated = validateCandidateApprovalForm(form);
  if (validated.error || !validated.values) {
    return {
      ready: false,
      error: validated.error ?? "Review the receipt fields before approving.",
      warnings: validated.warnings,
    };
  }

  if (validated.values.total_amount === null || validated.values.total_amount <= 0) {
    return {
      ready: false,
      error: "Total amount must be greater than zero before approval.",
      warnings: validated.warnings,
    };
  }

  return {
    ready: true,
    values: validated.values,
    warnings: validated.warnings,
  };
}

export function buildReceiptAuditNote(params: {
  receiptFileName?: string | null;
}): string {
  const parts = ["Created from an approved receipt candidate."];
  if (params.receiptFileName?.trim()) {
    parts.push(`Receipt file: ${params.receiptFileName.trim()}.`);
  }
  parts.push("Receipt and extraction details remain in your private candidate audit.");
  return parts.join(" ");
}

export function buildManualExpensePayloadFromApproval(params: {
  householdId: string;
  userId: string;
  personId?: string | null;
  draft: CandidateDraftUpdateValues;
  receiptFileName?: string | null;
}): { payload: InsertManualExpense | null; error: string | null } {
  const description = params.draft.merchant?.trim();
  const expenseDate = params.draft.transaction_date;
  const amount = params.draft.total_amount;

  if (!description) {
    return { payload: null, error: "Merchant or description is required." };
  }
  if (!expenseDate) {
    return { payload: null, error: "Transaction date is required." };
  }
  if (amount === null || amount <= 0) {
    return { payload: null, error: "Total amount must be greater than zero." };
  }

  const splitResult = calculateExpenseSplit(amount, "51_49");
  if (splitResult.error) {
    return { payload: null, error: splitResult.error };
  }

  return {
    payload: {
      household_id: params.householdId,
      created_by_user_id: params.userId,
      person_id: params.personId ?? null,
      expense_scope: "shared",
      description,
      category: params.draft.category,
      amount,
      expense_date: expenseDate,
      period_bucket: getExpensePeriodBucket(expenseDate),
      split_type: "51_49",
      teles_amount: splitResult.amounts.telesAmount,
      nicole_amount: splitResult.amounts.nicoleAmount,
      is_paid: false,
      paid_at: null,
      notes: buildReceiptAuditNote({ receiptFileName: params.receiptFileName }),
    },
    error: null,
  };
}

export function manualExpensePayloadDoesNotDeductCash(
  payload: InsertManualExpense
): boolean {
  return payload.is_paid !== true && payload.paid_at == null;
}

export function buildCandidateApprovalUpdatePayload(params: {
  draft: CandidateDraftUpdateValues;
  manualExpenseId: string;
  approvedBy: string;
  approvedAt: string;
}): Pick<
  InsertReceiptCandidate,
  | "merchant"
  | "transaction_date"
  | "total_amount"
  | "tax_amount"
  | "category"
  | "status"
  | "approved_at"
  | "approved_by"
  | "linked_manual_expense_id"
> {
  return {
    ...buildCandidateDraftUpdatePayload(params.draft),
    status: "approved",
    approved_at: params.approvedAt,
    approved_by: params.approvedBy,
    linked_manual_expense_id: params.manualExpenseId,
  };
}

export function candidateApprovalUpdatePreservesAuditFields(
  update: ReturnType<typeof buildCandidateApprovalUpdatePayload>
): boolean {
  const keys = Object.keys(update).sort();
  return (
    keys.length === 9 &&
    keys.every((key) =>
      [
        "approved_at",
        "approved_by",
        "category",
        "linked_manual_expense_id",
        "merchant",
        "status",
        "tax_amount",
        "total_amount",
        "transaction_date",
      ].includes(key)
    )
  );
}

export function buildReceiptUploadApprovalUpdatePayload(params: {
  approvedBy: string;
  approvedAt: string;
}): Pick<
  InsertReceiptUpload,
  "approved_for_shared_expense" | "approved_at" | "approved_by"
> {
  return {
    approved_for_shared_expense: true,
    approved_at: params.approvedAt,
    approved_by: params.approvedBy,
  };
}

export function buildApprovedExpenseSummaryLabel(params: {
  description: string;
  amount: number;
  expenseDate: string;
}): string {
  const formattedAmount = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(params.amount);
  return `${params.description} · ${formattedAmount} · ${params.expenseDate}`;
}

export function approvalCopyAvoidsRawUuids(lines: readonly string[]): boolean {
  return lines.every((line) => !UUID_PATTERN.test(line));
}

export function sanitizeApprovalErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not complete receipt approval. Please try again.";
  }
  return message;
}

export function partialApprovalFailureMessage(): string {
  return RECEIPT_APPROVAL_PARTIAL_FAILURE_COPY;
}
