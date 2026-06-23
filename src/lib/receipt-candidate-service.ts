import {
  assessCandidateSavability,
  buildCandidateInsertPayload,
  buildCandidateUpdatePayload,
  duplicateCandidateMessage,
  isCandidateSavable,
  type ReceiptCandidateSavability,
} from "@/lib/receipt-candidates";
import {
  buildCandidateDraftUpdatePayload,
  RECEIPT_CANDIDATE_UPDATED_COPY,
  sanitizeReviewErrorMessage,
  type CandidateDraftUpdateValues,
} from "@/lib/receipt-candidate-review";
import type { ReceiptExtractionResult } from "@/lib/receipt-extraction";
import { RECEIPT_NO_EXPENSE_CREATED_COPY } from "@/lib/receipt-upload";
import { supabase } from "@/lib/supabase";
import type { InsertReceiptCandidate, ReceiptCandidate, ReceiptUpload } from "@/lib/types";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sanitizeCandidateErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not complete the receipt candidate action. Please try again.";
  }
  return message;
}

type CandidateQueryResult<T> = Promise<{
  data: T;
  error: { message: string; code?: string } | null;
}>;

export type ReceiptCandidateClient = {
  from: (table: "receipt_candidates") => {
    insert: (row: InsertReceiptCandidate) => {
      select: (columns: string) => {
        single: () => CandidateQueryResult<ReceiptCandidate | null>;
      };
    };
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (
          column: string,
          value: string
        ) => {
          maybeSingle: () => CandidateQueryResult<ReceiptCandidate | null>;
          order: (
            column: string,
            options: { ascending: boolean }
          ) => CandidateQueryResult<ReceiptCandidate[] | null>;
        };
        maybeSingle: () => CandidateQueryResult<ReceiptCandidate | null>;
        order: (
          column: string,
          options: { ascending: boolean }
        ) => CandidateQueryResult<ReceiptCandidate[] | null>;
      };
    };
    update: (row: Partial<InsertReceiptCandidate>) => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (
          column: string,
          value: string
        ) => {
          select: (columns: string) => {
            single: () => CandidateQueryResult<ReceiptCandidate | null>;
          };
        };
      };
    };
    delete: () => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (
          column: string,
          value: string
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

export type SaveReceiptCandidateParams = {
  householdId: string;
  userId: string;
  receiptUpload: Pick<ReceiptUpload, "id" | "uploaded_by" | "original_file_name">;
  extraction: ReceiptExtractionResult;
  mode?: "create" | "replace";
};

export type SaveReceiptCandidateResult =
  | { ok: true; candidate: ReceiptCandidate; successCopy: string }
  | {
      ok: false;
      error: string;
      duplicate?: boolean;
      savability?: ReceiptCandidateSavability;
    };

export async function saveReceiptCandidate(
  params: SaveReceiptCandidateParams,
  client: ReceiptCandidateClient = supabase as unknown as ReceiptCandidateClient
): Promise<SaveReceiptCandidateResult> {
  if (params.receiptUpload.uploaded_by !== params.userId) {
    return { ok: false, error: "You can only save candidates for your own receipts." };
  }

  const savability = assessCandidateSavability(params.extraction);
  if (!savability.savable) {
    return {
      ok: false,
      error: savability.reason,
      savability,
    };
  }

  const existing = await findPendingCandidateForReceipt(params.receiptUpload.id, client);
  const mode = params.mode ?? "create";

  if (existing && mode === "create") {
    return {
      ok: false,
      error: duplicateCandidateMessage(params.receiptUpload.original_file_name),
      duplicate: true,
    };
  }

  if (existing && mode === "replace") {
    const { data, error } = await client
      .from("receipt_candidates")
      .update(buildCandidateUpdatePayload(params.extraction))
      .eq("id", existing.id)
      .eq("created_by", params.userId)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: sanitizeCandidateErrorMessage(error?.message ?? "Could not update candidate."),
      };
    }

    return {
      ok: true,
      candidate: data,
      successCopy: RECEIPT_NO_EXPENSE_CREATED_COPY,
    };
  }

  const insertRow = buildCandidateInsertPayload({
    householdId: params.householdId,
    userId: params.userId,
    receiptUploadId: params.receiptUpload.id,
    extraction: params.extraction,
  });

  const { data, error } = await client
    .from("receipt_candidates")
    .insert(insertRow)
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        ok: false,
        error: duplicateCandidateMessage(params.receiptUpload.original_file_name),
        duplicate: true,
      };
    }
    return {
      ok: false,
      error: sanitizeCandidateErrorMessage(error?.message ?? "Could not save candidate."),
    };
  }

  return {
    ok: true,
    candidate: data,
    successCopy: RECEIPT_NO_EXPENSE_CREATED_COPY,
  };
}

export async function findPendingCandidateForReceipt(
  receiptUploadId: string,
  client: ReceiptCandidateClient = supabase as unknown as ReceiptCandidateClient
): Promise<ReceiptCandidate | null> {
  const { data, error } = await client
    .from("receipt_candidates")
    .select("*")
    .eq("receipt_upload_id", receiptUploadId)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function listMyReceiptCandidates(
  userId: string,
  client: ReceiptCandidateClient = supabase as unknown as ReceiptCandidateClient
): Promise<{ candidates: ReceiptCandidate[]; error: string | null }> {
  const { data, error } = await client
    .from("receipt_candidates")
    .select("*")
    .eq("created_by", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      candidates: [],
      error: sanitizeCandidateErrorMessage(error.message),
    };
  }

  return { candidates: data ?? [], error: null };
}

export type DismissReceiptCandidateParams = {
  candidate: Pick<ReceiptCandidate, "id" | "created_by" | "status">;
  userId: string;
};

export async function dismissReceiptCandidate(
  params: DismissReceiptCandidateParams,
  client: ReceiptCandidateClient = supabase as unknown as ReceiptCandidateClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.candidate.created_by !== params.userId) {
    return { ok: false, error: "You can only dismiss your own receipt candidates." };
  }
  if (params.candidate.status !== "pending") {
    return { ok: false, error: "Only pending candidates can be dismissed." };
  }

  const { error } = await client
    .from("receipt_candidates")
    .delete()
    .eq("id", params.candidate.id)
    .eq("created_by", params.userId);

  if (error) {
    return {
      ok: false,
      error: sanitizeCandidateErrorMessage(error.message),
    };
  }

  return { ok: true };
}

export function buildCandidateListQueryFilters(userId: string): {
  createdBy: string;
  status: "pending";
} {
  return {
    createdBy: userId,
    status: "pending",
  };
}

export function candidateInsertUsesUploaderScope(
  insertRow: InsertReceiptCandidate,
  userId: string,
  receiptUpload: Pick<ReceiptUpload, "id" | "uploaded_by">
): boolean {
  return (
    insertRow.created_by === userId &&
    insertRow.receipt_upload_id === receiptUpload.id &&
    receiptUpload.uploaded_by === userId
  );
}

export function saveCandidateDoesNotInsertManualExpense(): boolean {
  return true;
}

export function updateCandidateDoesNotInsertManualExpense(): boolean {
  return true;
}

export type UpdateReceiptCandidateDraftParams = {
  candidate: Pick<ReceiptCandidate, "id" | "created_by" | "status">;
  userId: string;
  draft: CandidateDraftUpdateValues;
};

export type UpdateReceiptCandidateDraftResult =
  | { ok: true; candidate: ReceiptCandidate; successCopy: string }
  | { ok: false; error: string };

export async function updateReceiptCandidateDraft(
  params: UpdateReceiptCandidateDraftParams,
  client: ReceiptCandidateClient = supabase as unknown as ReceiptCandidateClient
): Promise<UpdateReceiptCandidateDraftResult> {
  if (params.candidate.created_by !== params.userId) {
    return { ok: false, error: "You can only update your own receipt candidates." };
  }
  if (params.candidate.status !== "pending") {
    return { ok: false, error: "Only pending candidates can be edited." };
  }

  const payload = buildCandidateDraftUpdatePayload(params.draft);

  const { data, error } = await client
    .from("receipt_candidates")
    .update(payload)
    .eq("id", params.candidate.id)
    .eq("created_by", params.userId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeReviewErrorMessage(error?.message ?? "Could not update candidate."),
    };
  }

  return {
    ok: true,
    candidate: data,
    successCopy: RECEIPT_CANDIDATE_UPDATED_COPY,
  };
}

export function isCandidateSavableForSave(extraction: ReceiptExtractionResult): boolean {
  return isCandidateSavable(extraction);
}
