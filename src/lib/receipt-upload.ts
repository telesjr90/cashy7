import type { InsertTables, ReceiptUpload, ReceiptUploadStatus } from "@/lib/types";

/** Maximum receipt upload size (10 MB). */
export const RECEIPT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const RECEIPT_UPLOAD_MAX_SIZE_LABEL = "10 MB";

export const RECEIPT_STORAGE_BUCKET = "receipt-uploads";

export const ALLOWED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedReceiptMimeType = (typeof ALLOWED_RECEIPT_MIME_TYPES)[number];

export const RECEIPT_FILE_SELECTED_STATUS = "Selected for upload";

export const RECEIPT_UPLOAD_HELP_COPY =
  "Upload a receipt image or PDF for private storage. Nothing is extracted and no expense is created yet.";

export const RECEIPT_UPLOAD_SUCCESS_COPY = "Receipt uploaded.";

export const RECEIPT_NO_EXPENSE_CREATED_COPY = "No expense has been created.";

export const RECEIPT_EXTRACTION_APPROVAL_LATER_COPY =
  "Receipt extraction and approval happen in later steps.";

export const RECEIPT_REVIEW_BEFORE_EXPENSE_COPY =
  "You will review extracted receipt data before saving an expense.";

export const RECEIPT_PRIVATE_UNTIL_APPROVAL_COPY =
  "Receipt belongs only to you until approval.";

export const RECEIPT_PENDING_EXTRACTION_COPY =
  "Pending extraction and approval in a later step.";

export const RECEIPT_LIST_EMPTY_COPY = "No receipts uploaded yet.";

export type ReceiptUploadValidationResult =
  | { ok: true; mimeType: AllowedReceiptMimeType }
  | { ok: false; error: string };

export interface ReceiptFileMetadata {
  fileName: string;
  mimeTypeLabel: string;
  sizeLabel: string;
  statusLabel: string;
}

export interface ReceiptUploadDisplayRow {
  id: string;
  fileName: string;
  uploadedAtLabel: string;
  statusLabel: string;
  mimeTypeLabel: string;
  sizeLabel: string;
  pendingCopy: string;
}

const MIME_TYPE_LABELS: Record<AllowedReceiptMimeType, string> = {
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
  "application/pdf": "PDF document",
};

const EXTENSION_MIME_HINTS: Record<string, AllowedReceiptMimeType[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".pdf": ["application/pdf"],
};

export function sanitizeReceiptFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const baseName = segments[segments.length - 1] ?? fileName;
  const sanitized = baseName.replace(/[^\w.\-()+\s]/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "receipt";
}

export function getReceiptFileExtension(fileName: string): string | null {
  const safeName = sanitizeReceiptFileName(fileName);
  const lastDot = safeName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === safeName.length - 1) {
    return null;
  }
  return safeName.slice(lastDot).toLowerCase();
}

export function resolveReceiptMimeType(
  file: Pick<File, "name" | "type">
): AllowedReceiptMimeType | null {
  const trimmedType = file.type.trim().toLowerCase();
  if (trimmedType && isAllowedReceiptMimeType(trimmedType)) {
    return trimmedType;
  }

  const extension = getReceiptFileExtension(file.name);
  if (!extension) {
    return null;
  }

  const hints = EXTENSION_MIME_HINTS[extension];
  return hints?.[0] ?? null;
}

export function isAllowedReceiptMimeType(mimeType: string): mimeType is AllowedReceiptMimeType {
  return ALLOWED_RECEIPT_MIME_TYPES.includes(mimeType as AllowedReceiptMimeType);
}

export function formatReceiptFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown size";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kilobytes = bytes / 1024;
    return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

export function describeReceiptMimeType(mimeType: AllowedReceiptMimeType): string {
  return MIME_TYPE_LABELS[mimeType];
}

export function validateReceiptFile(
  file: Pick<File, "name" | "size" | "type">
): ReceiptUploadValidationResult {
  const mimeType = resolveReceiptMimeType(file);

  if (!mimeType) {
    return {
      ok: false,
      error: "Only JPEG, PNG, WebP, and PDF receipt files are supported.",
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      error: "The selected file is empty. Choose a receipt file that contains data.",
    };
  }

  if (file.size > RECEIPT_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `The selected file is too large. Maximum size is ${RECEIPT_UPLOAD_MAX_SIZE_LABEL}.`,
    };
  }

  return { ok: true, mimeType };
}

export function buildReceiptStoragePath(
  userId: string,
  receiptId: string,
  fileName: string
): string {
  const safeName = sanitizeReceiptFileName(fileName);
  return `${userId}/${receiptId}/${safeName}`;
}

export function buildReceiptUploadInsert(params: {
  receiptId: string;
  householdId: string;
  userId: string;
  fileName: string;
  mimeType: AllowedReceiptMimeType;
  sizeBytes: number;
}): InsertTables<"receipt_uploads"> {
  const storagePath = buildReceiptStoragePath(
    params.userId,
    params.receiptId,
    params.fileName
  );

  return {
    id: params.receiptId,
    household_id: params.householdId,
    uploaded_by: params.userId,
    storage_bucket: RECEIPT_STORAGE_BUCKET,
    storage_path: storagePath,
    original_file_name: sanitizeReceiptFileName(params.fileName),
    mime_type: params.mimeType,
    size_bytes: params.sizeBytes,
    status: "uploaded",
    approved_for_shared_expense: false,
  };
}

export function buildReceiptFileMetadata(
  file: Pick<File, "name" | "size" | "type">
): ReceiptFileMetadata {
  const validation = validateReceiptFile(file);
  const mimeType =
    validation.ok ? validation.mimeType : resolveReceiptMimeType(file) ?? "image/jpeg";

  return {
    fileName: sanitizeReceiptFileName(file.name),
    mimeTypeLabel: describeReceiptMimeType(mimeType),
    sizeLabel: formatReceiptFileSize(file.size),
    statusLabel: RECEIPT_FILE_SELECTED_STATUS,
  };
}

export function receiptStatusLabel(status: ReceiptUploadStatus): string {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "deleted":
      return "Deleted";
    default:
      return "Unknown";
  }
}

export function formatReceiptUploadedAt(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) {
    return "Unknown date";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

export function buildReceiptUploadDisplayRow(receipt: ReceiptUpload): ReceiptUploadDisplayRow {
  const mimeType = isAllowedReceiptMimeType(receipt.mime_type)
    ? receipt.mime_type
    : "application/pdf";

  return {
    id: receipt.id,
    fileName: receipt.original_file_name,
    uploadedAtLabel: formatReceiptUploadedAt(receipt.created_at),
    statusLabel: receiptStatusLabel(receipt.status),
    mimeTypeLabel: describeReceiptMimeType(mimeType),
    sizeLabel: formatReceiptFileSize(receipt.size_bytes),
    pendingCopy: RECEIPT_PENDING_EXTRACTION_COPY,
  };
}

export function metadataExposesLocalPath(metadata: ReceiptFileMetadata): boolean {
  return metadata.fileName.includes("\\") || metadata.fileName.includes("/");
}

export function storagePathIncludesUploaderScope(
  storagePath: string,
  userId: string,
  receiptId: string
): boolean {
  return storagePath.startsWith(`${userId}/${receiptId}/`);
}

export function displayRowAvoidsRawUuidLabels(row: ReceiptUploadDisplayRow): boolean {
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  return (
    !uuidPattern.test(row.fileName) &&
    !uuidPattern.test(row.statusLabel) &&
    !uuidPattern.test(row.uploadedAtLabel)
  );
}
