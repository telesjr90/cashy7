import {
  buildMissingTotalWarnings,
  extractionFailurePreventsCandidate,
} from "@/lib/receipt-errors";
import type { ReceiptExtractionResult, ReceiptLineItem } from "@/lib/receipt-extraction";
import type { InsertReceiptCandidate, ReceiptCandidate, ReceiptCandidateStatus } from "@/lib/types";

export const RECEIPT_CANDIDATE_DRAFT_COPY = "This is a draft candidate.";

export const RECEIPT_CANDIDATE_NO_EXPENSE_COPY = "No expense has been created.";

export const RECEIPT_CANDIDATE_PRIVATE_COPY =
  "Only you can see this candidate until you approve it.";

export const RECEIPT_CANDIDATE_REVIEW_COPY =
  "You will review and approve before saving an expense.";

export const RECEIPT_CANDIDATE_PENDING_REVIEW_COPY = "Pending review.";

export const RECEIPT_SAVE_CANDIDATE_ACTION = "Save as pending candidate";

export const RECEIPT_REPLACE_CANDIDATE_ACTION = "Update pending candidate";

export const RECEIPT_CANDIDATE_EXISTS_COPY =
  "A pending candidate already exists for this receipt.";

export const RECEIPT_CANDIDATE_DISMISS_ACTION = "Dismiss candidate";

export const RECEIPT_CANDIDATE_LIST_EMPTY_COPY = "No receipt candidates yet.";

export const RECEIPT_CANDIDATE_APPROVED_COPY =
  "Expense created. Receipt audit remains private to you.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type ReceiptCandidateSavability =
  | { savable: true }
  | { savable: false; reason: string };

export interface ReceiptCandidateDisplayRow {
  id: string;
  titleLabel: string;
  dateLabel: string | null;
  totalLabel: string | null;
  categoryLabel: string | null;
  confidenceLabel: string | null;
  statusLabel: string;
  receiptFileName: string | null;
  pendingReviewCopy: string;
  privacyCopy: string;
  noExpenseCopy: string;
}

export function extractionHasUsefulFields(result: ReceiptExtractionResult): boolean {
  return (
    Boolean(result.merchant) ||
    Boolean(result.date) ||
    result.total !== null ||
    result.tax !== null ||
    Boolean(result.category) ||
    result.lineItems.length > 0
  );
}

export function assessCandidateSavability(
  result: ReceiptExtractionResult
): ReceiptCandidateSavability {
  if (result.status === "not_configured") {
    return {
      savable: false,
      reason: "Receipt extraction is not configured on the server yet.",
    };
  }
  if (result.status !== "success") {
    return {
      savable: false,
      reason: extractionFailurePreventsCandidate(result.status)
        ? "Save a candidate only after a successful extraction with useful fields."
        : "Save a candidate only after a successful extraction with useful fields.",
    };
  }
  if (!extractionHasUsefulFields(result)) {
    return {
      savable: false,
      reason: "Extraction did not include enough receipt details to save a candidate.",
    };
  }
  return { savable: true };
}

export function isCandidateSavable(result: ReceiptExtractionResult): boolean {
  return assessCandidateSavability(result).savable;
}

export function normalizeLineItemsForStorage(
  lineItems: ReceiptLineItem[]
): ReceiptLineItem[] {
  return lineItems.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
    confidence: item.confidence,
  }));
}

export function buildCandidateInsertPayload(params: {
  householdId: string;
  userId: string;
  receiptUploadId: string;
  extraction: ReceiptExtractionResult;
}): InsertReceiptCandidate {
  return {
    household_id: params.householdId,
    receipt_upload_id: params.receiptUploadId,
    created_by: params.userId,
    status: "pending",
    merchant: params.extraction.merchant,
    transaction_date: params.extraction.date,
    total_amount: params.extraction.total,
    tax_amount: params.extraction.tax,
    category: params.extraction.category,
    line_items: normalizeLineItemsForStorage(params.extraction.lineItems),
    confidence: params.extraction.confidence,
    field_confidence: params.extraction.fieldConfidence,
    warnings: params.extraction.warnings,
    source_status: params.extraction.status,
  };
}

export function buildCandidateUpdatePayload(
  extraction: ReceiptExtractionResult
): Pick<
  InsertReceiptCandidate,
  | "merchant"
  | "transaction_date"
  | "total_amount"
  | "tax_amount"
  | "category"
  | "line_items"
  | "confidence"
  | "field_confidence"
  | "warnings"
  | "source_status"
  | "status"
> {
  return {
    status: "pending",
    merchant: extraction.merchant,
    transaction_date: extraction.date,
    total_amount: extraction.total,
    tax_amount: extraction.tax,
    category: extraction.category,
    line_items: normalizeLineItemsForStorage(extraction.lineItems),
    confidence: extraction.confidence,
    field_confidence: extraction.fieldConfidence,
    warnings: extraction.warnings,
    source_status: extraction.status,
  };
}

export function candidateStatusLabel(status: ReceiptCandidateStatus): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "approved":
      return "Approved";
    case "dismissed":
      return "Dismissed";
    default:
      return "Unknown";
  }
}

export function confidencePercentLabel(confidence: number | null): string | null {
  if (confidence === null) {
    return null;
  }
  return `${Math.round(confidence * 100)}% confidence`;
}

export function fieldConfidenceLabel(
  fieldConfidence: Record<string, number | null>,
  field: string
): string | null {
  const value = fieldConfidence[field];
  if (value === null || value === undefined) {
    return null;
  }
  return `${field} ${Math.round(value * 100)}%`;
}

export function formatCandidateMoney(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function buildCandidateTitleLabel(candidate: ReceiptCandidate): string {
  if (candidate.merchant && candidate.merchant.trim().length > 0) {
    return candidate.merchant.trim();
  }
  return "Receipt candidate";
}

export function buildCandidateDisplayRow(params: {
  candidate: ReceiptCandidate;
  receiptFileName?: string | null;
}): ReceiptCandidateDisplayRow {
  const { candidate, receiptFileName = null } = params;
  return {
    id: candidate.id,
    titleLabel: buildCandidateTitleLabel(candidate),
    dateLabel: candidate.transaction_date,
    totalLabel: formatCandidateMoney(
      typeof candidate.total_amount === "number"
        ? candidate.total_amount
        : candidate.total_amount === null
          ? null
          : Number(candidate.total_amount)
    ),
    categoryLabel: candidate.category,
    confidenceLabel: confidencePercentLabel(
      typeof candidate.confidence === "number"
        ? candidate.confidence
        : candidate.confidence === null
          ? null
          : Number(candidate.confidence)
    ),
    statusLabel: candidateStatusLabel(candidate.status),
    receiptFileName,
    pendingReviewCopy: RECEIPT_CANDIDATE_PENDING_REVIEW_COPY,
    privacyCopy: RECEIPT_CANDIDATE_PRIVATE_COPY,
    noExpenseCopy: RECEIPT_CANDIDATE_NO_EXPENSE_COPY,
  };
}

export function displayRowAvoidsRawUuidLabels(row: ReceiptCandidateDisplayRow): boolean {
  const labels = [
    row.titleLabel,
    row.dateLabel,
    row.totalLabel,
    row.categoryLabel,
    row.confidenceLabel,
    row.statusLabel,
    row.receiptFileName,
    row.pendingReviewCopy,
    row.privacyCopy,
    row.noExpenseCopy,
  ].filter((value): value is string => typeof value === "string");

  return labels.every((label) => !UUID_PATTERN.test(label));
}

export function duplicateCandidateMessage(receiptFileName?: string | null): string {
  if (receiptFileName) {
    return `${RECEIPT_CANDIDATE_EXISTS_COPY} (${receiptFileName})`;
  }
  return RECEIPT_CANDIDATE_EXISTS_COPY;
}

export function candidateHasMissingTotal(
  candidate: Pick<ReceiptCandidate, "total_amount">
): boolean {
  const total =
    typeof candidate.total_amount === "number"
      ? candidate.total_amount
      : candidate.total_amount === null
        ? null
        : Number(candidate.total_amount);
  return total === null || !Number.isFinite(total) || total <= 0;
}

export function buildCandidateMissingTotalWarnings(
  candidate: Pick<ReceiptCandidate, "total_amount">
): string[] {
  const total =
    typeof candidate.total_amount === "number"
      ? candidate.total_amount
      : candidate.total_amount === null
        ? null
        : Number(candidate.total_amount);
  return buildMissingTotalWarnings(total);
}

export function candidatePrivacyCopyStates(): string[] {
  return [
    RECEIPT_CANDIDATE_DRAFT_COPY,
    RECEIPT_CANDIDATE_NO_EXPENSE_COPY,
    RECEIPT_CANDIDATE_PRIVATE_COPY,
    RECEIPT_CANDIDATE_REVIEW_COPY,
  ];
}

export function parseStoredLineItems(value: unknown): ReceiptLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      const description =
        typeof row.description === "string" ? row.description.trim() : "";
      if (!description) {
        return null;
      }
      return {
        description,
        quantity:
          typeof row.quantity === "number" && Number.isFinite(row.quantity)
            ? row.quantity
            : null,
        unitPrice:
          typeof row.unitPrice === "number" && Number.isFinite(row.unitPrice)
            ? row.unitPrice
            : null,
        total:
          typeof row.total === "number" && Number.isFinite(row.total)
            ? row.total
            : null,
        confidence:
          typeof row.confidence === "number" && Number.isFinite(row.confidence)
            ? row.confidence
            : null,
      } satisfies ReceiptLineItem;
    })
    .filter((item): item is ReceiptLineItem => item !== null);
}

export function parseStoredFieldConfidence(
  value: unknown
): Record<string, number | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      result[key] = raw;
    } else {
      result[key] = null;
    }
  }
  return result;
}
