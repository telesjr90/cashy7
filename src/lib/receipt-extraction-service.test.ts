import { describe, expect, it, vi } from "vitest";
import {
  extractReceipt,
  type ReceiptExtractionClient,
} from "./receipt-extraction-service";

const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

function createMockClient(
  invoke: ReceiptExtractionClient["functions"]["invoke"]
): ReceiptExtractionClient {
  return {
    functions: {
      invoke,
    },
  };
}

describe("receipt extraction service", () => {
  it("rejects missing receipt id", async () => {
    const invoke = vi.fn();
    const result = await extractReceipt({ receiptId: "  " }, createMockClient(invoke));
    expect(result.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invoke payload includes receipt id only", async () => {
    const invoke = vi.fn(async () => ({
      data: {
        status: "not_configured",
        providerConfigured: false,
        warnings: ["Receipt extraction provider is not configured on the server."],
      },
      error: null,
    }));

    await extractReceipt({ receiptId: RECEIPT_ID }, createMockClient(invoke));

    expect(invoke).toHaveBeenCalledWith("extract-receipt", {
      body: { receiptId: RECEIPT_ID },
    });
  });

  it("returns not_configured result without faking success extraction", async () => {
    const result = await extractReceipt(
      { receiptId: RECEIPT_ID },
      createMockClient(async () => ({
        data: {
          status: "not_configured",
          providerConfigured: false,
          warnings: ["Receipt extraction provider is not configured on the server."],
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.status).toBe("not_configured");
      expect(result.result.providerConfigured).toBe(false);
      expect(result.result.merchant).toBeNull();
    }
  });

  it("returns unauthorized for another user's receipt", async () => {
    const result = await extractReceipt(
      { receiptId: RECEIPT_ID },
      createMockClient(async () => ({
        data: {
          status: "unauthorized",
          warnings: ["You can only extract your own receipts."],
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/own receipts/i);
    }
  });

  it("returns not_found when storage object is missing", async () => {
    const result = await extractReceipt(
      { receiptId: RECEIPT_ID },
      createMockClient(async () => ({
        data: {
          status: "not_found",
          warnings: ["Receipt file could not be loaded."],
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not found|could not be loaded/i);
    }
  });

  it("sanitizes invoke transport errors", async () => {
    const result = await extractReceipt(
      { receiptId: RECEIPT_ID },
      createMockClient(async () => ({
        data: null,
        error: {
          message:
            "Edge Function returned 500 for receipt 00000000-0000-4000-8000-000000000001",
        },
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/00000000-0000-4000-8000-000000000001/);
    }
  });

  it("does not create expense or candidate rows", async () => {
    const invoke: ReceiptExtractionClient["functions"]["invoke"] = vi.fn(async () => ({
      data: {
        status: "success",
        merchant: "Cafe",
        date: "2026-06-01",
        total: 8.5,
        tax: 0.5,
        category: "Food",
        lineItems: [],
        providerConfigured: true,
      },
      error: null,
    }));

    const result = await extractReceipt({ receiptId: RECEIPT_ID }, createMockClient(invoke));
    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(invoke).mock.calls[0];
    expect(firstCall?.[0]).toBe("extract-receipt");
  });
});
