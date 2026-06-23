import { formatCandidateMoney } from "@/lib/receipt-candidates";
import { RECEIPT_DUPLICATE_POSSIBLE_TITLE } from "@/lib/receipt-errors";
import {
  formatReceiptUploadedAt,
  sanitizeReceiptFileName,
} from "@/lib/receipt-upload";
import type { ReceiptCandidate, ReceiptUpload } from "@/lib/types";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type ReceiptDuplicateMatchKind =
  | "exact_file_hash"
  | "fallback_file_metadata"
  | "candidate_data"
  | "approved_candidate";

export type ReceiptDuplicateSeverity = "exact" | "possible";

export type ReceiptMatchStatus = "uploaded" | "pending" | "approved" | "dismissed";

export type ReceiptDuplicateMatch = {
  kind: ReceiptDuplicateMatchKind;
  severity: ReceiptDuplicateSeverity;
  matchStatus: ReceiptMatchStatus;
  fileName: string | null;
  uploadedAtLabel: string | null;
  merchant: string | null;
  transactionDate: string | null;
  totalLabel: string | null;
};

export type ReceiptUploadDuplicateInput = Pick<
  ReceiptUpload,
  | "id"
  | "uploaded_by"
  | "original_file_name"
  | "mime_type"
  | "size_bytes"
  | "file_sha256"
  | "created_at"
  | "status"
>;

export type ReceiptCandidateDuplicateInput = Pick<
  ReceiptCandidate,
  | "id"
  | "created_by"
  | "receipt_upload_id"
  | "status"
  | "merchant"
  | "transaction_date"
  | "total_amount"
  | "linked_manual_expense_id"
>;

export type FileSelectionDuplicateInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileSha256: string | null;
};

export type CandidateDataDuplicateInput = {
  merchant: string | null;
  transactionDate: string | null;
  totalAmount: number | null;
};

export type ApprovalDuplicateGuard = {
  warnings: string[];
  requireConfirmation: boolean;
  blockApproval: boolean;
};

export function normalizeFileMetadataKey(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): string {
  return [
    sanitizeReceiptFileName(params.fileName).toLowerCase(),
    params.mimeType.trim().toLowerCase(),
    String(params.sizeBytes),
  ].join("|");
}

export async function computeFileSha256(bytes: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeFileSha256FromBlob(blob: Blob): Promise<string> {
  return computeFileSha256(await blob.arrayBuffer());
}

function normalizeMerchant(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeTotal(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric * 100) / 100;
}

function candidateDataKey(input: CandidateDataDuplicateInput): string | null {
  const merchant = normalizeMerchant(input.merchant);
  const date = input.transactionDate?.trim() || null;
  const total = normalizeTotal(input.totalAmount);
  if (!merchant || !date || total === null) {
    return null;
  }
  return `${merchant}|${date}|${total.toFixed(2)}`;
}

function isOwnUpload(
  upload: ReceiptUploadDuplicateInput,
  currentUserId: string
): boolean {
  return upload.uploaded_by === currentUserId;
}

function isOwnCandidate(
  candidate: ReceiptCandidateDuplicateInput,
  currentUserId: string
): boolean {
  return candidate.created_by === currentUserId;
}

function uploadMatchStatus(
  upload: ReceiptUploadDuplicateInput
): ReceiptMatchStatus {
  return upload.status === "deleted" ? "uploaded" : "uploaded";
}

function candidateMatchStatus(
  candidate: ReceiptCandidateDuplicateInput
): ReceiptMatchStatus {
  if (candidate.status === "approved") {
    return "approved";
  }
  if (candidate.status === "dismissed") {
    return "dismissed";
  }
  return "pending";
}

function buildFileDuplicateMatch(params: {
  kind: ReceiptDuplicateMatchKind;
  severity: ReceiptDuplicateSeverity;
  upload: ReceiptUploadDuplicateInput;
}): ReceiptDuplicateMatch {
  return {
    kind: params.kind,
    severity: params.severity,
    matchStatus: uploadMatchStatus(params.upload),
    fileName: params.upload.original_file_name,
    uploadedAtLabel: formatReceiptUploadedAt(params.upload.created_at),
    merchant: null,
    transactionDate: null,
    totalLabel: null,
  };
}

function buildCandidateDuplicateMatch(params: {
  kind: ReceiptDuplicateMatchKind;
  severity: ReceiptDuplicateSeverity;
  candidate: ReceiptCandidateDuplicateInput;
  receiptFileName?: string | null;
  receiptUploadedAt?: string | null;
}): ReceiptDuplicateMatch {
  const total =
    typeof params.candidate.total_amount === "number"
      ? params.candidate.total_amount
      : params.candidate.total_amount === null
        ? null
        : Number(params.candidate.total_amount);

  return {
    kind: params.kind,
    severity: params.severity,
    matchStatus: candidateMatchStatus(params.candidate),
    fileName: params.receiptFileName ?? null,
    uploadedAtLabel: params.receiptUploadedAt
      ? formatReceiptUploadedAt(params.receiptUploadedAt)
      : null,
    merchant: params.candidate.merchant,
    transactionDate: params.candidate.transaction_date,
    totalLabel: formatCandidateMoney(Number.isFinite(total!) ? total : null),
  };
}

export function findFileDuplicateMatches(
  input: FileSelectionDuplicateInput,
  existingUploads: ReceiptUploadDuplicateInput[],
  currentUserId: string,
  excludeReceiptId?: string
): ReceiptDuplicateMatch[] {
  const matches: ReceiptDuplicateMatch[] = [];
  const metadataKey = normalizeFileMetadataKey(input);

  for (const upload of existingUploads) {
    if (!isOwnUpload(upload, currentUserId)) {
      continue;
    }
    if (excludeReceiptId && upload.id === excludeReceiptId) {
      continue;
    }
    if (upload.status === "deleted") {
      continue;
    }

    if (
      input.fileSha256 &&
      upload.file_sha256 &&
      input.fileSha256 === upload.file_sha256
    ) {
      matches.push(
        buildFileDuplicateMatch({
          kind: "exact_file_hash",
          severity: "exact",
          upload,
        })
      );
      continue;
    }

    const uploadMetadataKey = normalizeFileMetadataKey({
      fileName: upload.original_file_name,
      mimeType: upload.mime_type,
      sizeBytes: upload.size_bytes,
    });

    if (metadataKey === uploadMetadataKey) {
      matches.push(
        buildFileDuplicateMatch({
          kind: "fallback_file_metadata",
          severity: "possible",
          upload,
        })
      );
    }
  }

  return matches;
}

export function findCandidateDataDuplicateMatches(
  input: CandidateDataDuplicateInput,
  candidates: ReceiptCandidateDuplicateInput[],
  currentUserId: string,
  options?: {
    excludeCandidateId?: string;
    excludeReceiptUploadId?: string;
    receiptFileNames?: Record<string, string>;
    receiptUploadedAtById?: Record<string, string>;
  }
): ReceiptDuplicateMatch[] {
  const key = candidateDataKey(input);
  if (!key) {
    return [];
  }

  const matches: ReceiptDuplicateMatch[] = [];

  for (const candidate of candidates) {
    if (!isOwnCandidate(candidate, currentUserId)) {
      continue;
    }
    if (options?.excludeCandidateId && candidate.id === options.excludeCandidateId) {
      continue;
    }
    if (
      options?.excludeReceiptUploadId &&
      candidate.receipt_upload_id === options.excludeReceiptUploadId
    ) {
      continue;
    }

    const candidateKey = candidateDataKey({
      merchant: candidate.merchant,
      transactionDate: candidate.transaction_date,
      totalAmount:
        typeof candidate.total_amount === "number"
          ? candidate.total_amount
          : candidate.total_amount === null
            ? null
            : Number(candidate.total_amount),
    });

    if (candidateKey !== key) {
      continue;
    }

    const kind: ReceiptDuplicateMatchKind =
      candidate.status === "approved" ? "approved_candidate" : "candidate_data";
    const severity: ReceiptDuplicateSeverity =
      candidate.status === "approved" ? "exact" : "possible";

    matches.push(
      buildCandidateDuplicateMatch({
        kind,
        severity,
        candidate,
        receiptFileName: options?.receiptFileNames?.[candidate.receipt_upload_id] ?? null,
        receiptUploadedAt:
          options?.receiptUploadedAtById?.[candidate.receipt_upload_id] ?? null,
      })
    );
  }

  return matches;
}

export function findApprovalDuplicateMatches(
  draft: CandidateDataDuplicateInput,
  candidates: ReceiptCandidateDuplicateInput[],
  currentUserId: string,
  excludeCandidateId: string,
  options?: {
    receiptFileNames?: Record<string, string>;
    receiptUploadedAtById?: Record<string, string>;
  }
): ReceiptDuplicateMatch[] {
  return findCandidateDataDuplicateMatches(draft, candidates, currentUserId, {
    excludeCandidateId,
    receiptFileNames: options?.receiptFileNames,
    receiptUploadedAtById: options?.receiptUploadedAtById,
  }).filter((match) => match.matchStatus === "approved");
}

export function buildDuplicateWarningLabels(
  matches: ReceiptDuplicateMatch[]
): string[] {
  if (matches.length === 0) {
    return [];
  }

  const labels = [RECEIPT_DUPLICATE_POSSIBLE_TITLE];

  for (const match of matches) {
    const contextParts: string[] = [];

    if (match.fileName) {
      contextParts.push(`File: ${match.fileName}`);
    }
    if (match.uploadedAtLabel) {
      contextParts.push(`Uploaded: ${match.uploadedAtLabel}`);
    }
    if (match.merchant) {
      contextParts.push(`Merchant: ${match.merchant}`);
    }
    if (match.transactionDate) {
      contextParts.push(`Date: ${match.transactionDate}`);
    }
    if (match.totalLabel) {
      contextParts.push(`Total: ${match.totalLabel}`);
    }

    const statusLabel =
      match.matchStatus === "approved"
        ? "Status: approved"
        : match.matchStatus === "pending"
          ? "Status: pending review"
          : match.matchStatus === "dismissed"
            ? "Status: dismissed"
            : "Status: uploaded";

    contextParts.push(statusLabel);

    if (match.severity === "exact") {
      contextParts.push("Match: exact duplicate");
    } else {
      contextParts.push("Match: possible duplicate");
    }

    labels.push(contextParts.join(" · "));
  }

  return labels;
}

export function assessApprovalDuplicateGuard(
  matches: ReceiptDuplicateMatch[]
): ApprovalDuplicateGuard {
  const approvedExact = matches.some(
    (match) =>
      match.matchStatus === "approved" &&
      (match.kind === "approved_candidate" || match.severity === "exact")
  );
  const warnings = buildDuplicateWarningLabels(matches);

  if (approvedExact) {
    return {
      warnings: [
        ...warnings,
        "An approved receipt with the same merchant, date, and total already exists. Confirm before creating another expense.",
      ],
      requireConfirmation: true,
      blockApproval: false,
    };
  }

  if (matches.length > 0) {
    return {
      warnings,
      requireConfirmation: true,
      blockApproval: false,
    };
  }

  return {
    warnings: [],
    requireConfirmation: false,
    blockApproval: false,
  };
}

export function duplicateLabelsAvoidRawUuids(labels: string[]): boolean {
  return labels.every((label) => !UUID_PATTERN.test(label));
}

export function findExactFileDuplicateUploadId(
  input: FileSelectionDuplicateInput,
  existingUploads: ReceiptUploadDuplicateInput[],
  currentUserId: string,
  excludeReceiptId?: string
): string | null {
  if (!input.fileSha256) {
    return null;
  }

  for (const upload of existingUploads) {
    if (!isOwnUpload(upload, currentUserId)) {
      continue;
    }
    if (excludeReceiptId && upload.id === excludeReceiptId) {
      continue;
    }
    if (upload.status === "deleted") {
      continue;
    }
    if (upload.file_sha256 === input.fileSha256) {
      return upload.id;
    }
  }

  return null;
}
