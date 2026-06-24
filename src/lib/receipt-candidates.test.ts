import { describe, expect, it } from "vitest";
import {
  assessCandidateSavability,
  buildCandidateDisplayRow,
  buildCandidateInsertPayload,
  buildCandidateTitleLabel,
  candidatePrivacyCopyStates,
  candidateStatusLabel,
  confidencePercentLabel,
  displayRowAvoidsRawUuidLabels,
  duplicateCandidateMessage,
  fieldConfidenceLabel,
  isCandidateSavable,
  normalizeLineItemsForStorage,
  parseStoredFieldConfidence,
  parseStoredLineItems,
  RECEIPT_CANDIDATE_NO_EXPENSE_COPY,
  RECEIPT_CANDIDATE_PRIVATE_COPY,
} from "./receipt-candidates";
import type { ReceiptExtractionResult } from "./receipt-extraction";
import type { ReceiptCandidate } from "./types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_ID = "33333333-3333-4333-8333-333333333333";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";

function successExtraction(
  overrides: Partial<ReceiptExtractionResult> = {}
): ReceiptExtractionResult {
  return {
    status: "success",
    merchant: "Corner Store",
    date: "2026-06-20",
    total: 42.5,
    tax: 3.2,
    category: "Groceries",
    lineItems: [{ description: "Milk", quantity: 1, unitPrice: 4.99, total: 4.99, confidence: 0.9 }],
    confidence: 0.88,
    fieldConfidence: { merchant: 0.92, total: 0.8 },
    warnings: [],
    rawProviderName: "openai",
    providerConfigured: true,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<ReceiptCandidate> = {}): ReceiptCandidate {
  return {
    id: CANDIDATE_ID,
    household_id: HOUSEHOLD_ID,
    receipt_upload_id: RECEIPT_ID,
    created_by: USER_ID,
    status: "pending",
    merchant: "Corner Store",
    transaction_date: "2026-06-20",
    total_amount: 42.5,
    tax_amount: 3.2,
    category: "Groceries",
    line_items: [{ description: "Milk", quantity: 1, unitPrice: 4.99, total: 4.99, confidence: 0.9 }],
    confidence: 0.88,
    field_confidence: { merchant: 0.92, total: 0.8 },
    warnings: [],
    source_status: "success",
    approved_at: null,
    approved_by: null,
    linked_manual_expense_id: null,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    ...overrides,
  };
}

describe("receipt candidate helpers", () => {
  it("builds candidate payload from successful extraction", () => {
    const payload = buildCandidateInsertPayload({
      householdId: HOUSEHOLD_ID,
      userId: USER_ID,
      receiptUploadId: RECEIPT_ID,
      extraction: successExtraction(),
    });

    expect(payload.created_by).toBe(USER_ID);
    expect(payload.receipt_upload_id).toBe(RECEIPT_ID);
    expect(payload.merchant).toBe("Corner Store");
    expect(payload.transaction_date).toBe("2026-06-20");
    expect(payload.total_amount).toBe(42.5);
    expect(payload.source_status).toBe("success");
    expect(payload.status).toBe("pending");
  });

  it("builds candidate payload from partial extraction with warnings", () => {
    const extraction = successExtraction({
      merchant: null,
      date: "2026-06-20",
      total: 12,
      warnings: ["Merchant was not detected."],
    });

    expect(isCandidateSavable(extraction)).toBe(true);
    const payload = buildCandidateInsertPayload({
      householdId: HOUSEHOLD_ID,
      userId: USER_ID,
      receiptUploadId: RECEIPT_ID,
      extraction,
    });
    expect(payload.merchant).toBeNull();
    expect(payload.warnings).toContain("Merchant was not detected.");
  });

  it("treats not_configured extraction as not savable by default", () => {
    const savability = assessCandidateSavability({
      status: "not_configured",
      merchant: null,
      date: null,
      total: null,
      tax: null,
      category: null,
      lineItems: [],
      confidence: null,
      fieldConfidence: {},
      warnings: ["Receipt extraction provider is not configured on the server."],
      rawProviderName: null,
      providerConfigured: false,
    });

    expect(savability.savable).toBe(false);
    expect(savability).toMatchObject({
      savable: false,
      reason: expect.stringMatching(/not configured/i),
    });
  });

  it("treats success without useful fields as not savable", () => {
    const savability = assessCandidateSavability(
      successExtraction({
        merchant: null,
        date: null,
        total: null,
        tax: null,
        category: null,
        lineItems: [],
      })
    );
    expect(savability.savable).toBe(false);
  });

  it("normalizes line items safely for storage", () => {
    expect(
      normalizeLineItemsForStorage([
        {
          description: "Bread",
          quantity: 2,
          unitPrice: 1.5,
          total: 3,
          confidence: 0.7,
        },
      ])
    ).toEqual([
      {
        description: "Bread",
        quantity: 2,
        unitPrice: 1.5,
        total: 3,
        confidence: 0.7,
      },
    ]);
    expect(parseStoredLineItems([{ description: "  " }])).toEqual([]);
  });

  it("builds readable confidence labels", () => {
    expect(confidencePercentLabel(0.876)).toBe("88% confidence");
    expect(confidencePercentLabel(null)).toBeNull();
    expect(fieldConfidenceLabel({ merchant: 0.92, total: null }, "merchant")).toBe(
      "merchant 92%"
    );
    expect(fieldConfidenceLabel({ merchant: 0.92 }, "total")).toBeNull();
  });

  it("handles missing field confidence entries", () => {
    expect(parseStoredFieldConfidence(null)).toEqual({});
    expect(parseStoredFieldConfidence({ merchant: 0.5, total: "bad" })).toEqual({
      merchant: 0.5,
      total: null,
    });
  });

  it("builds candidate display without raw UUID labels", () => {
    const row = buildCandidateDisplayRow({
      candidate: makeCandidate(),
      receiptFileName: "receipt.jpg",
    });

    expect(row.titleLabel).toBe("Corner Store");
    expect(row.receiptFileName).toBe("receipt.jpg");
    expect(displayRowAvoidsRawUuidLabels(row)).toBe(true);
    expect(buildCandidateTitleLabel(makeCandidate({ merchant: null }))).toBe("Receipt candidate");
  });

  it("warns about duplicate pending candidate for same receipt upload", () => {
    expect(duplicateCandidateMessage("receipt.jpg")).toMatch(/already exists/i);
    expect(duplicateCandidateMessage()).toMatch(/already exists/i);
  });

  it("states privacy and no-expense copy", () => {
    const copy = candidatePrivacyCopyStates();
    expect(copy).toContain(RECEIPT_CANDIDATE_NO_EXPENSE_COPY);
    expect(copy).toContain(RECEIPT_CANDIDATE_PRIVATE_COPY);
    expect(candidateStatusLabel("pending")).toBe("Pending review");
  });
});
