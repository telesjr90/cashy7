import {
  extractionUserMessage,
  sanitizeReceiptExtractionError,
} from "@/lib/receipt-errors";
import {
  buildExtractionInvokePayload,
  normalizeReceiptExtractionResult,
  type ReceiptExtractionResult,
} from "@/lib/receipt-extraction";
import { supabase } from "@/lib/supabase";

const EXTRACT_RECEIPT_FUNCTION = "extract-receipt";

export type ExtractReceiptParams = {
  receiptId: string;
};

export type ExtractReceiptOutcome =
  | { ok: true; result: ReceiptExtractionResult }
  | { ok: false; error: string; result?: ReceiptExtractionResult };

export type ReceiptExtractionClient = {
  functions: {
    invoke: (
      name: string,
      options: { body: { receiptId: string } }
    ) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
};

export async function extractReceipt(
  params: ExtractReceiptParams,
  client: ReceiptExtractionClient = supabase as unknown as ReceiptExtractionClient
): Promise<ExtractReceiptOutcome> {
  const receiptId = params.receiptId.trim();
  if (!receiptId) {
    return { ok: false, error: "Choose a receipt to extract." };
  }

  const { data, error } = await client.functions.invoke(EXTRACT_RECEIPT_FUNCTION, {
    body: buildExtractionInvokePayload(receiptId),
  });

  if (error) {
    return {
      ok: false,
      error: sanitizeReceiptExtractionError(error.message),
    };
  }

  const result = normalizeReceiptExtractionResult(data);
  if (
    result.status === "unauthorized" ||
    result.status === "not_found" ||
    result.status === "unsupported" ||
    result.status === "unreadable" ||
    result.status === "provider_error"
  ) {
    const message = extractionUserMessage({
      status: result.status,
      warnings: result.warnings,
    });
    return { ok: false, error: message, result };
  }

  return { ok: true, result };
}
