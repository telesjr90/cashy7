import type { ReceiptExtractionStatus } from "@/lib/receipt-extraction";

export const RECEIPT_UNSUPPORTED_FILE_TITLE = "Unsupported receipt file.";
export const RECEIPT_UNSUPPORTED_FILE_DETAIL = "Upload a JPEG, PNG, WebP, or PDF.";

export const RECEIPT_MISSING_TOTAL_TITLE = "Total amount was not found.";
export const RECEIPT_MISSING_TOTAL_DETAIL = "Review/edit the candidate before approval.";

export const RECEIPT_DUPLICATE_POSSIBLE_TITLE =
  "Possible duplicate of one of your receipts.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const BASE64_PATTERN = /data:[^;]+;base64,|^[A-Za-z0-9+/]{80,}={0,2}$/;

const RETRYABLE_EXTRACTION_STATUSES = new Set<ReceiptExtractionStatus>([
  "not_configured",
  "unreadable",
  "provider_error",
  "unsupported",
]);

const NON_SAVABLE_EXTRACTION_STATUSES = new Set<ReceiptExtractionStatus>([
  "not_configured",
  "unsupported",
  "unreadable",
  "provider_error",
  "unauthorized",
  "not_found",
]);

export function unsupportedFileErrorMessage(): string {
  return `${RECEIPT_UNSUPPORTED_FILE_TITLE} ${RECEIPT_UNSUPPORTED_FILE_DETAIL}`;
}

export function isMissingTotal(total: number | null | undefined): boolean {
  return total === null || total === undefined;
}

export function buildMissingTotalWarnings(
  total: number | null | undefined
): string[] {
  if (!isMissingTotal(total)) {
    return [];
  }
  return [RECEIPT_MISSING_TOTAL_TITLE, RECEIPT_MISSING_TOTAL_DETAIL];
}

export function missingTotalBlocksApproval(totalAmountInput: string): boolean {
  const trimmed = totalAmountInput.trim();
  if (trimmed === "") {
    return true;
  }
  const parsed = Number(trimmed);
  return !Number.isFinite(parsed) || parsed <= 0;
}

export function sanitizeReceiptExtractionError(message: string): string {
  if (UUID_PATTERN.test(message) || BASE64_PATTERN.test(message)) {
    return "Could not extract receipt data. Please try again.";
  }
  if (/api[_-]?key|secret|token|authorization/i.test(message)) {
    return "Receipt extraction failed due to a server configuration issue.";
  }
  if (/edge function|functions\/v1/i.test(message)) {
    return "Receipt extraction is temporarily unavailable. Try again after the server function is deployed.";
  }
  if (/rate limit|429|quota|too many requests/i.test(message)) {
    return "Receipt extraction is temporarily rate-limited. Try again later.";
  }
  if (message.length > 240) {
    return `${message.slice(0, 237)}...`;
  }
  return message;
}

export function extractionUserMessage(params: {
  status: ReceiptExtractionStatus;
  mimeType?: string | null;
  warnings?: string[];
}): string {
  const warningMessage = params.warnings?.find(
    (warning) => typeof warning === "string" && warning.trim().length > 0
  );

  switch (params.status) {
    case "unreadable":
      return (
        warningMessage ??
        "The receipt could not be read. Try a clearer photo or re-scan the receipt."
      );
    case "unsupported":
      if (params.mimeType === "application/pdf") {
        return "PDF extraction is not available yet. Try a JPEG or PNG photo of the receipt.";
      }
      return unsupportedFileErrorMessage();
    case "not_configured":
      return "Receipt extraction is not configured on the server yet.";
    case "provider_error":
      if (
        params.warnings?.some((warning) =>
          /rate limit|429|quota|too many requests/i.test(warning)
        )
      ) {
        return "Receipt extraction is temporarily rate-limited. Try again later.";
      }
      return (
        sanitizeReceiptExtractionError(warningMessage ?? "") ||
        "Receipt extraction failed. Please try again."
      );
    case "unauthorized":
      return "You can only extract your own receipts.";
    case "not_found":
      return "Receipt upload was not found.";
    default:
      return warningMessage ?? "Receipt extraction failed.";
  }
}

export function canRetryExtraction(
  status: ReceiptExtractionStatus | string | null | undefined
): boolean {
  if (!status) {
    return true;
  }
  return RETRYABLE_EXTRACTION_STATUSES.has(status as ReceiptExtractionStatus);
}

export function extractionFailurePreventsCandidate(
  status: ReceiptExtractionStatus
): boolean {
  return NON_SAVABLE_EXTRACTION_STATUSES.has(status);
}

export function persistedExtractionErrorLabel(
  status: string | null | undefined,
  error: string | null | undefined
): string | null {
  if (error?.trim()) {
    return sanitizeReceiptExtractionError(error.trim());
  }
  if (!status || status === "success") {
    return null;
  }
  return extractionUserMessage({
    status: status as ReceiptExtractionStatus,
  });
}

export function errorLabelsAvoidRawUuids(labels: string[]): boolean {
  return labels.every((label) => !UUID_PATTERN.test(label));
}
