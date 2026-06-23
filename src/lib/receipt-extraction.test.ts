import { describe, expect, it } from "vitest";
import {
  appendMissingFieldWarnings,
  buildExtractionInvokePayload,
  clampConfidence,
  extractionPreviewAvoidsRawIdentifiers,
  extractionStatusLabel,
  normalizeReceiptExtractionResult,
  normalizeReceiptLineItem,
  sanitizeExtractionErrorMessage,
} from "./receipt-extraction";

describe("receipt extraction helpers", () => {
  it("normalizes successful extraction result", () => {
    const result = normalizeReceiptExtractionResult({
      status: "success",
      merchant: " Corner Store ",
      date: "2026-06-20",
      total: "42.50",
      tax: 3.2,
      category: "Groceries",
      confidence: 1.4,
      fieldConfidence: { merchant: 0.92, total: "0.8" },
      lineItems: [
        {
          description: "Milk",
          quantity: 1,
          unitPrice: "4.99",
          total: 4.99,
          confidence: 0.9,
        },
      ],
      warnings: [],
      rawProviderName: "openai",
      providerConfigured: true,
    });

    expect(result.status).toBe("success");
    expect(result.merchant).toBe("Corner Store");
    expect(result.total).toBe(42.5);
    expect(result.tax).toBe(3.2);
    expect(result.confidence).toBe(1);
    expect(result.fieldConfidence.merchant).toBe(0.92);
    expect(result.fieldConfidence.total).toBe(0.8);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]?.description).toBe("Milk");
    expect(result.providerConfigured).toBe(true);
  });

  it("returns not_configured result unchanged", () => {
    const result = normalizeReceiptExtractionResult({
      status: "not_configured",
      providerConfigured: false,
      warnings: ["Receipt extraction provider is not configured on the server."],
    });

    expect(result.status).toBe("not_configured");
    expect(result.providerConfigured).toBe(false);
    expect(result.merchant).toBeNull();
  });

  it("normalizes unsupported status", () => {
    const result = normalizeReceiptExtractionResult({
      status: "unsupported",
      warnings: ["This receipt file type cannot be extracted."],
    });
    expect(result.status).toBe("unsupported");
    expect(extractionStatusLabel(result.status)).toBe("Unsupported file");
  });

  it("normalizes unreadable status", () => {
    const result = normalizeReceiptExtractionResult({
      status: "unreadable",
      warnings: ["The receipt could not be read."],
    });
    expect(result.status).toBe("unreadable");
  });

  it("sanitizes provider errors with secrets and base64", () => {
    expect(
      sanitizeExtractionErrorMessage("Authorization Bearer sk-secret-token failed")
    ).toMatch(/configuration issue/i);
    expect(
      sanitizeExtractionErrorMessage(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      )
    ).toMatch(/try again/i);
    expect(
      sanitizeExtractionErrorMessage("Failed to send a request to the Edge Function")
    ).toMatch(/temporarily unavailable/i);
    expect(
      sanitizeExtractionErrorMessage("insert failed for id 00000000-0000-4000-8000-000000000001")
    ).toMatch(/try again/i);
  });

  it("clamps confidence between 0 and 1", () => {
    expect(clampConfidence(-0.2)).toBe(0);
    expect(clampConfidence(1.8)).toBe(1);
    expect(clampConfidence("0.5")).toBe(0.5);
  });

  it("adds warnings for missing merchant, date, and total on success", () => {
    const result = appendMissingFieldWarnings({
      status: "success",
      merchant: null,
      date: null,
      total: null,
      tax: null,
      category: null,
      lineItems: [],
      confidence: 0.5,
      fieldConfidence: {},
      warnings: [],
      rawProviderName: "openai",
      providerConfigured: true,
    });

    expect(result.warnings).toEqual([
      "Merchant was not detected.",
      "Purchase date was not detected.",
      "Total amount was not found.",
    ]);
  });

  it("normalizes line items and drops invalid rows", () => {
    expect(
      normalizeReceiptLineItem({
        description: " Bread ",
        quantity: 2,
        unitPrice: 1.5,
        total: 3,
        confidence: 0.7,
      })
    ).toEqual({
      description: "Bread",
      quantity: 2,
      unitPrice: 1.5,
      total: 3,
      confidence: 0.7,
    });
    expect(normalizeReceiptLineItem({ description: "  " })).toBeNull();
  });

  it("avoids raw UUIDs in user-facing preview labels", () => {
    const result = normalizeReceiptExtractionResult({
      status: "success",
      merchant: "Local Market",
      date: "2026-06-01",
      total: 12,
      warnings: [],
      lineItems: [{ description: "Coffee", quantity: 1, unitPrice: 3, total: 3 }],
      providerConfigured: true,
    });
    expect(extractionPreviewAvoidsRawIdentifiers(result)).toBe(true);
  });

  it("invoke payload includes receipt id only", () => {
    expect(buildExtractionInvokePayload("22222222-2222-4222-8222-222222222222")).toEqual({
      receiptId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
