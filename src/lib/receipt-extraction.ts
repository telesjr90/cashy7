export type ReceiptExtractionStatus =
  | "success"
  | "not_configured"
  | "unsupported"
  | "unreadable"
  | "provider_error"
  | "unauthorized"
  | "not_found";

export type ReceiptLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  confidence: number | null;
};

export type ReceiptExtractionResult = {
  status: ReceiptExtractionStatus;
  merchant: string | null;
  date: string | null;
  total: number | null;
  tax: number | null;
  category: string | null;
  lineItems: ReceiptLineItem[];
  confidence: number | null;
  fieldConfidence: Record<string, number | null>;
  warnings: string[];
  rawProviderName: string | null;
  providerConfigured: boolean;
};

export const RECEIPT_EXTRACTION_DRAFT_COPY = "Extraction is a draft.";

export const RECEIPT_EXTRACTION_NOT_CONFIGURED_COPY =
  "Receipt extraction is not configured on the server yet.";

export const RECEIPT_EXTRACTION_REVIEW_COPY =
  "You will review and approve before saving an expense.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const BASE64_PATTERN = /data:[^;]+;base64,|^[A-Za-z0-9+/]{80,}={0,2}$/;

const EXTRACTABLE_RECEIPT_STATUSES = new Set(["uploaded"]);

export function isReceiptExtractableStatus(status: string): boolean {
  return EXTRACTABLE_RECEIPT_STATUSES.has(status);
}

export function clampConfidence(value: unknown): number | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    value = parsed;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function normalizeMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) {
      return null;
    }
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
  }
  return null;
}

export function normalizeReceiptLineItem(raw: unknown): ReceiptLineItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const description =
    typeof item.description === "string" ? item.description.trim() : "";
  if (!description) {
    return null;
  }
  return {
    description,
    quantity:
      typeof item.quantity === "number" && Number.isFinite(item.quantity)
        ? item.quantity
        : null,
    unitPrice: normalizeMoney(item.unitPrice),
    total: normalizeMoney(item.total),
    confidence: clampConfidence(item.confidence),
  };
}

export function normalizeReceiptExtractionResult(
  raw: unknown
): ReceiptExtractionResult {
  const payload =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const status = isReceiptExtractionStatus(payload.status)
    ? payload.status
    : "provider_error";

  const fieldConfidenceRaw =
    payload.fieldConfidence && typeof payload.fieldConfidence === "object"
      ? (payload.fieldConfidence as Record<string, unknown>)
      : {};

  const fieldConfidence: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(fieldConfidenceRaw)) {
    fieldConfidence[key] = clampConfidence(value);
  }

  const lineItems = Array.isArray(payload.lineItems)
    ? payload.lineItems
        .map(normalizeReceiptLineItem)
        .filter((item): item is ReceiptLineItem => item !== null)
    : [];

  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];

  const result: ReceiptExtractionResult = {
    status,
    merchant:
      typeof payload.merchant === "string" && payload.merchant.trim().length > 0
        ? payload.merchant.trim()
        : null,
    date:
      typeof payload.date === "string" && payload.date.trim().length > 0
        ? payload.date.trim()
        : null,
    total: normalizeMoney(payload.total),
    tax: normalizeMoney(payload.tax),
    category:
      typeof payload.category === "string" && payload.category.trim().length > 0
        ? payload.category.trim()
        : null,
    lineItems,
    confidence: clampConfidence(payload.confidence),
    fieldConfidence,
    warnings,
    rawProviderName:
      typeof payload.rawProviderName === "string" &&
      payload.rawProviderName.trim().length > 0
        ? payload.rawProviderName.trim()
        : null,
    providerConfigured: payload.providerConfigured === true,
  };

  return appendMissingFieldWarnings(result);
}

function isReceiptExtractionStatus(value: unknown): value is ReceiptExtractionStatus {
  return (
    value === "success" ||
    value === "not_configured" ||
    value === "unsupported" ||
    value === "unreadable" ||
    value === "provider_error" ||
    value === "unauthorized" ||
    value === "not_found"
  );
}

export function appendMissingFieldWarnings(
  result: ReceiptExtractionResult
): ReceiptExtractionResult {
  if (result.status !== "success") {
    return result;
  }

  const warnings = [...result.warnings];
  if (!result.merchant) {
    warnings.push("Merchant was not detected.");
  }
  if (!result.date) {
    warnings.push("Purchase date was not detected.");
  }
  if (result.total === null) {
    warnings.push("Total amount was not detected.");
  }

  return { ...result, warnings };
}

export function sanitizeExtractionErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message) || BASE64_PATTERN.test(message)) {
    return "Could not extract receipt data. Please try again.";
  }
  if (/api[_-]?key|secret|token|authorization/i.test(message)) {
    return "Receipt extraction failed due to a server configuration issue.";
  }
  if (/edge function|functions\/v1/i.test(message)) {
    return "Receipt extraction is temporarily unavailable. Try again after the server function is deployed.";
  }
  if (message.length > 240) {
    return `${message.slice(0, 237)}...`;
  }
  return message;
}

export function extractionStatusLabel(status: ReceiptExtractionStatus): string {
  switch (status) {
    case "success":
      return "Extracted";
    case "not_configured":
      return "Provider not configured";
    case "unsupported":
      return "Unsupported file";
    case "unreadable":
      return "Unreadable receipt";
    case "provider_error":
      return "Extraction failed";
    case "unauthorized":
      return "Not allowed";
    case "not_found":
      return "Receipt not found";
    default:
      return "Unknown";
  }
}

export function extractionPreviewAvoidsRawIdentifiers(
  result: ReceiptExtractionResult
): boolean {
  const labels = [
    result.merchant,
    result.category,
    result.date,
    ...result.warnings,
    ...result.lineItems.map((item) => item.description),
  ].filter((value): value is string => typeof value === "string");

  return labels.every((label) => !UUID_PATTERN.test(label));
}

export function buildExtractionInvokePayload(receiptId: string): { receiptId: string } {
  return { receiptId };
}
