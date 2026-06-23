import {
  assessCandidateApprovalReadiness,
  buildApprovedExpenseSummaryLabel,
  buildCandidateApprovalUpdatePayload,
  buildManualExpensePayloadFromApproval,
  buildReceiptUploadApprovalUpdatePayload,
  partialApprovalFailureMessage,
  RECEIPT_APPROVAL_SUCCESS_LINES,
} from "@/lib/receipt-approval";
import type { CandidateDraftUpdateValues } from "@/lib/receipt-candidate-review";
import { supabase } from "@/lib/supabase";
import type {
  InsertManualExpense,
  ManualExpense,
  ReceiptCandidate,
  ReceiptUpload,
} from "@/lib/types";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sanitizeApprovalServiceErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not complete receipt approval. Please try again.";
  }
  return message;
}

type QueryResult<T> = Promise<{
  data: T;
  error: { message: string; code?: string } | null;
}>;

export type ReceiptApprovalClient = {
  from(table: "manual_expenses"): {
    insert: (row: InsertManualExpense) => {
      select: (columns: string) => {
        single: () => QueryResult<ManualExpense | null>;
      };
    };
  };
  from(table: "receipt_candidates"): {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (
          column: string,
          value: string
        ) => {
          select: (columns: string) => {
            single: () => QueryResult<ReceiptCandidate | null>;
          };
        };
      };
    };
  };
  from(table: "receipt_uploads"): {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string
      ) => {
        select: (columns: string) => {
          single: () => QueryResult<ReceiptUpload | null>;
        };
      };
    };
  };
};

export type ApproveReceiptCandidateParams = {
  householdId: string;
  userId: string;
  personId?: string | null;
  candidate: ReceiptCandidate;
  receiptUpload: Pick<ReceiptUpload, "id" | "uploaded_by">;
  draft: CandidateDraftUpdateValues;
  receiptFileName?: string | null;
  duplicateCandidates?: import("@/lib/receipt-duplicates").ReceiptCandidateDuplicateInput[];
  receiptFileNames?: Record<string, string>;
  receiptUploadedAtById?: Record<string, string>;
};

export type ApproveReceiptCandidateResult =
  | {
      ok: true;
      expense: ManualExpense;
      candidate: ReceiptCandidate;
      successLines: readonly string[];
      expenseSummaryLabel: string;
    }
  | {
      ok: false;
      error: string;
      partial?: boolean;
      expense?: ManualExpense;
    };

export async function approveReceiptCandidate(
  params: ApproveReceiptCandidateParams,
  client: ReceiptApprovalClient = supabase as unknown as ReceiptApprovalClient
): Promise<ApproveReceiptCandidateResult> {
  if (params.candidate.created_by !== params.userId) {
    return { ok: false, error: "You can only approve your own receipt candidates." };
  }
  if (params.receiptUpload.uploaded_by !== params.userId) {
    return { ok: false, error: "You can only approve candidates for your own receipts." };
  }
  if (params.candidate.receipt_upload_id !== params.receiptUpload.id) {
    return { ok: false, error: "Receipt upload does not match this candidate." };
  }

  const readiness = assessCandidateApprovalReadiness(params.candidate, {
    merchant: params.draft.merchant ?? "",
    transactionDate: params.draft.transaction_date ?? "",
    totalAmount:
      params.draft.total_amount === null ? "" : String(params.draft.total_amount),
    taxAmount: params.draft.tax_amount === null ? "" : String(params.draft.tax_amount),
    category: params.draft.category ?? "",
  }, {
    currentUserId: params.userId,
    duplicateCandidates: params.duplicateCandidates,
    receiptFileNames: params.receiptFileNames,
    receiptUploadedAtById: params.receiptUploadedAtById,
  });

  if (!readiness.ready) {
    return { ok: false, error: readiness.error };
  }

  const expenseBuild = buildManualExpensePayloadFromApproval({
    householdId: params.householdId,
    userId: params.userId,
    personId: params.personId,
    draft: readiness.values,
    receiptFileName: params.receiptFileName,
  });

  if (expenseBuild.error || !expenseBuild.payload) {
    return {
      ok: false,
      error: expenseBuild.error ?? "Could not build the manual expense.",
    };
  }

  const { data: expense, error: expenseError } = await client
    .from("manual_expenses")
    .insert(expenseBuild.payload)
    .select("*")
    .single();

  if (expenseError || !expense) {
    return {
      ok: false,
      error: sanitizeApprovalServiceErrorMessage(
        expenseError?.message ?? "Could not create the manual expense."
      ),
    };
  }

  const approvedAt = new Date().toISOString();
  const candidateUpdate = buildCandidateApprovalUpdatePayload({
    draft: readiness.values,
    manualExpenseId: expense.id,
    approvedBy: params.userId,
    approvedAt,
  });

  const { data: updatedCandidate, error: candidateError } = await client
    .from("receipt_candidates")
    .update(candidateUpdate)
    .eq("id", params.candidate.id)
    .eq("created_by", params.userId)
    .select("*")
    .single();

  if (candidateError || !updatedCandidate) {
    return {
      ok: false,
      partial: true,
      expense,
      error: partialApprovalFailureMessage(),
    };
  }

  const uploadUpdate = buildReceiptUploadApprovalUpdatePayload({
    approvedBy: params.userId,
    approvedAt,
  });

  await client
    .from("receipt_uploads")
    .update(uploadUpdate)
    .eq("id", params.receiptUpload.id)
    .select("*")
    .single();

  return {
    ok: true,
    expense,
    candidate: updatedCandidate,
    successLines: RECEIPT_APPROVAL_SUCCESS_LINES,
    expenseSummaryLabel: buildApprovedExpenseSummaryLabel({
      description: expense.description,
      amount: expense.amount,
      expenseDate: expense.expense_date,
    }),
  };
}

export function approvalServiceDoesNotInsertCashPayment(): boolean {
  return true;
}
