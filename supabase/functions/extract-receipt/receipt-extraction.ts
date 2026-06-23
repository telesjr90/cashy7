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

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function emptyResult(
  status: ReceiptExtractionStatus,
  warnings: string[] = []
): ReceiptExtractionResult {
  return {
    status,
    merchant: null,
    date: null,
    total: null,
    tax: null,
    category: null,
    lineItems: [],
    confidence: null,
    fieldConfidence: {},
    warnings,
    rawProviderName: null,
    providerConfigured: false,
  };
}

function clampConfidence(value: unknown): number | null {
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

function normalizeMoney(value: unknown): number | null {
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

function normalizeLineItem(raw: unknown): ReceiptLineItem | null {
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

function appendMissingFieldWarnings(
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

function sanitizeProviderErrorMessage(message: string): string {
  if (/api[_-]?key|secret|token|authorization|bearer/i.test(message)) {
    return "Receipt extraction provider returned an error.";
  }
  if (message.length > 240) {
    return `${message.slice(0, 237)}...`;
  }
  return message;
}

function getProviderApiKey(): string | null {
  const dedicated = Deno.env.get("RECEIPT_EXTRACTION_OPENAI_API_KEY");
  if (dedicated && dedicated.trim().length > 0) {
    return dedicated.trim();
  }
  const fallback = Deno.env.get("OPENAI_API_KEY");
  if (fallback && fallback.trim().length > 0) {
    return fallback.trim();
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function extractWithOpenAI(
  input: { bytes: Uint8Array; mimeType: string; fileName: string },
  apiKey: string
): Promise<ReceiptExtractionResult> {
  if (!IMAGE_MIME_TYPES.has(input.mimeType)) {
    return {
      ...emptyResult("unreadable", [
        "PDF receipt extraction is not available with the current provider.",
      ]),
      providerConfigured: true,
      rawProviderName: "openai",
    };
  }

  const base64 = bytesToBase64(input.bytes);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract receipt fields from the image. Return JSON only with keys: merchant, date (ISO YYYY-MM-DD when possible), total, tax, category, confidence (0-1), fieldConfidence (object of field->0-1), lineItems (array of {description, quantity, unitPrice, total, confidence}). Use null for unknown values.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract structured receipt data from file ${input.fileName}.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const safeMessage = sanitizeProviderErrorMessage(
      `Provider request failed with status ${response.status}`
    );
    return {
      ...emptyResult("provider_error", [safeMessage]),
      providerConfigured: true,
      rawProviderName: "openai",
    };
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return {
      ...emptyResult("unreadable", ["The provider could not read this receipt."]),
      providerConfigured: true,
      rawProviderName: "openai",
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      ...emptyResult("unreadable", ["The provider returned unreadable receipt data."]),
      providerConfigured: true,
      rawProviderName: "openai",
    };
  }

  const fieldConfidenceRaw =
    parsed.fieldConfidence && typeof parsed.fieldConfidence === "object"
      ? (parsed.fieldConfidence as Record<string, unknown>)
      : {};
  const fieldConfidence: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(fieldConfidenceRaw)) {
    fieldConfidence[key] = clampConfidence(value);
  }

  const lineItems = Array.isArray(parsed.lineItems)
    ? parsed.lineItems
        .map(normalizeLineItem)
        .filter((item): item is ReceiptLineItem => item !== null)
    : [];

  const result = appendMissingFieldWarnings({
    status: "success",
    merchant:
      typeof parsed.merchant === "string" && parsed.merchant.trim().length > 0
        ? parsed.merchant.trim()
        : null,
    date:
      typeof parsed.date === "string" && parsed.date.trim().length > 0
        ? parsed.date.trim()
        : null,
    total: normalizeMoney(parsed.total),
    tax: normalizeMoney(parsed.tax),
    category:
      typeof parsed.category === "string" && parsed.category.trim().length > 0
        ? parsed.category.trim()
        : null,
    lineItems,
    confidence: clampConfidence(parsed.confidence),
    fieldConfidence,
    warnings: [],
    rawProviderName: "openai",
    providerConfigured: true,
  });

  if (
    !result.merchant &&
    !result.date &&
    result.total === null &&
    result.lineItems.length === 0
  ) {
    return {
      ...emptyResult("unreadable", ["The receipt image did not contain readable data."]),
      providerConfigured: true,
      rawProviderName: "openai",
    };
  }

  return result;
}

export async function extractReceiptFromBytes(input: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<ReceiptExtractionResult> {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return emptyResult("unsupported", ["This receipt file type cannot be extracted."]);
  }

  if (input.bytes.byteLength === 0) {
    return emptyResult("unreadable", ["The receipt file is empty."]);
  }

  const apiKey = getProviderApiKey();
  if (!apiKey) {
    return {
      ...emptyResult("not_configured", [
        "Receipt extraction provider is not configured on the server.",
      ]),
      providerConfigured: false,
    };
  }

  try {
    return await extractWithOpenAI(input, apiKey);
  } catch {
    return {
      ...emptyResult("provider_error", ["Receipt extraction provider returned an error."]),
      providerConfigured: true,
      rawProviderName: "openai",
    };
  }
}
