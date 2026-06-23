import {
  confidencePercentLabel,
  fieldConfidenceLabel,
  formatCandidateMoney,
  parseStoredFieldConfidence,
  parseStoredLineItems,
} from "@/lib/receipt-candidates";
import { extractionStatusLabel, type ReceiptLineItem } from "@/lib/receipt-extraction";
import { formatReceiptUploadedAt } from "@/lib/receipt-upload";
import type { InsertReceiptCandidate, ReceiptCandidate } from "@/lib/types";

export const RECEIPT_CANDIDATE_REVIEW_ACTION = "Review candidate";

export const RECEIPT_CANDIDATE_SAVE_DRAFT_ACTION = "Save draft";

export const RECEIPT_CANDIDATE_UPDATED_COPY = "Candidate updated.";

export const RECEIPT_CANDIDATE_APPROVAL_NEXT_STEP_COPY =
  "Approval that creates an expense happens in the next step.";

export const RECEIPT_CANDIDATE_APPROVAL_PLACEHOLDER_LABEL = "Approve and create expense";

export const RECEIPT_CANDIDATE_APPROVAL_PLACEHOLDER_COPY =
  "Approval creates a shared manual expense in the next task.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type CandidateReviewFormValues = {
  merchant: string;
  transactionDate: string;
  totalAmount: string;
  taxAmount: string;
  category: string;
};

export type CandidateDraftUpdateValues = {
  merchant: string | null;
  transaction_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  category: string | null;
};

export type CandidateReviewSourceContext = {
  receiptFileName: string | null;
  receiptUploadDateLabel: string | null;
  extractionStatusLabel: string;
  confidenceLabel: string | null;
  warnings: string[];
  lineItems: ReceiptLineItem[];
  fieldConfidenceLabels: string[];
};

export type CandidateReviewFormModel = {
  form: CandidateReviewFormValues;
  source: CandidateReviewSourceContext;
};

export type CandidateReviewValidationResult = {
  error: string | null;
  warnings: string[];
  values: CandidateDraftUpdateValues | null;
};

function parseStoredMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return String(numeric);
}

function parseRequiredMoney(
  value: string,
  fieldLabel: string
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: false, error: `${fieldLabel} is required.` };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `${fieldLabel} must be a valid number.` };
  }
  if (parsed < 0) {
    return { ok: false, error: `${fieldLabel} must be zero or greater.` };
  }

  return { ok: true, value: Math.round(parsed * 100) / 100 };
}

function parseOptionalMoney(
  value: string,
  fieldLabel: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `${fieldLabel} must be a valid number.` };
  }
  if (parsed < 0) {
    return { ok: false, error: `${fieldLabel} must be zero or greater.` };
  }

  return { ok: true, value: Math.round(parsed * 100) / 100 };
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function candidateReviewFormFromCandidate(
  candidate: ReceiptCandidate,
  receiptContext?: {
    fileName?: string | null;
    uploadedAt?: string | null;
  }
): CandidateReviewFormModel {
  const lineItems = parseStoredLineItems(candidate.line_items);
  const fieldConfidence = parseStoredFieldConfidence(candidate.field_confidence);
  const confidence =
    typeof candidate.confidence === "number"
      ? candidate.confidence
      : candidate.confidence === null
        ? null
        : Number(candidate.confidence);

  const fieldConfidenceLabels = Object.keys(fieldConfidence)
    .map((field) => fieldConfidenceLabel(fieldConfidence, field))
    .filter((label): label is string => label !== null);

  return {
    form: {
      merchant: candidate.merchant?.trim() ?? "",
      transactionDate: candidate.transaction_date ?? "",
      totalAmount: parseStoredMoney(candidate.total_amount),
      taxAmount: parseStoredMoney(candidate.tax_amount),
      category: candidate.category?.trim() ?? "",
    },
    source: {
      receiptFileName: receiptContext?.fileName?.trim() || null,
      receiptUploadDateLabel: receiptContext?.uploadedAt
        ? formatReceiptUploadedAt(receiptContext.uploadedAt)
        : null,
      extractionStatusLabel: extractionStatusLabel(
        candidate.source_status as Parameters<typeof extractionStatusLabel>[0]
      ),
      confidenceLabel: confidencePercentLabel(Number.isFinite(confidence!) ? confidence : null),
      warnings: [...candidate.warnings],
      lineItems,
      fieldConfidenceLabels,
    },
  };
}

export function validateCandidateReviewForm(
  form: CandidateReviewFormValues
): CandidateReviewValidationResult {
  const warnings: string[] = [];
  const merchant = form.merchant.trim();
  if (!merchant) {
    return {
      error: "Merchant or description is required.",
      warnings,
      values: null,
    };
  }

  const transactionDate = form.transactionDate.trim();
  if (transactionDate && !isValidIsoDate(transactionDate)) {
    return {
      error: "Transaction date must be a valid date (YYYY-MM-DD).",
      warnings,
      values: null,
    };
  }

  const totalResult = parseRequiredMoney(form.totalAmount, "Total amount");
  if (!totalResult.ok) {
    return { error: totalResult.error, warnings, values: null };
  }

  const taxResult = parseOptionalMoney(form.taxAmount, "Tax amount");
  if (!taxResult.ok) {
    return { error: taxResult.error, warnings, values: null };
  }

  if (taxResult.value !== null && taxResult.value > totalResult.value) {
    warnings.push("Tax amount is greater than total amount. Review before approving.");
  }

  const category = form.category.trim();
  return {
    error: null,
    warnings,
    values: {
      merchant,
      transaction_date: transactionDate || null,
      total_amount: totalResult.value,
      tax_amount: taxResult.value,
      category: category || null,
    },
  };
}

export function buildCandidateDraftUpdatePayload(
  values: CandidateDraftUpdateValues
): Pick<
  InsertReceiptCandidate,
  "merchant" | "transaction_date" | "total_amount" | "tax_amount" | "category"
> {
  return {
    merchant: values.merchant,
    transaction_date: values.transaction_date,
    total_amount: values.total_amount,
    tax_amount: values.tax_amount,
    category: values.category,
  };
}

export function draftUpdatePayloadIncludesOnlyEditableFields(
  payload: ReturnType<typeof buildCandidateDraftUpdatePayload>
): boolean {
  const keys = Object.keys(payload).sort();
  return (
    keys.length === 5 &&
    keys.every((key) =>
      [
        "merchant",
        "transaction_date",
        "total_amount",
        "tax_amount",
        "category",
      ].includes(key)
    )
  );
}

export function reviewDisplayAvoidsRawUuids(labels: string[]): boolean {
  return labels.every((label) => !UUID_PATTERN.test(label));
}

export function sanitizeReviewErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not update the receipt candidate. Please try again.";
  }
  return message;
}

export function formatReviewLineItemLabel(item: ReceiptLineItem): string {
  const totalLabel =
    item.total !== null ? formatCandidateMoney(item.total) : null;
  return totalLabel ? `${item.description} · ${totalLabel}` : item.description;
}
