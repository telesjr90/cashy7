import { describe, expect, it } from "vitest";
import {
  buildCandidateDraftUpdatePayload,
  candidateReviewFormFromCandidate,
  draftUpdatePayloadIncludesOnlyEditableFields,
  formatReviewLineItemLabel,
  reviewDisplayAvoidsRawUuids,
  sanitizeReviewErrorMessage,
  validateCandidateReviewForm,
} from "./receipt-candidate-review";
import type { ReceiptCandidate } from "./types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_ID = "33333333-3333-4333-8333-333333333333";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";

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
    warnings: ["Low confidence on tax."],
    source_status: "success",
    approved_at: null,
    approved_by: null,
    linked_manual_expense_id: null,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    ...overrides,
  };
}

describe("receipt candidate review helpers", () => {
  it("converts candidate to editable form model", () => {
    const model = candidateReviewFormFromCandidate(makeCandidate(), {
      fileName: "receipt.jpg",
      uploadedAt: "2026-06-23T12:00:00.000Z",
    });

    expect(model.form.merchant).toBe("Corner Store");
    expect(model.form.transactionDate).toBe("2026-06-20");
    expect(model.form.totalAmount).toBe("42.5");
    expect(model.form.taxAmount).toBe("3.2");
    expect(model.form.category).toBe("Groceries");
    expect(model.source.receiptFileName).toBe("receipt.jpg");
    expect(model.source.warnings).toContain("Low confidence on tax.");
    expect(model.source.lineItems).toHaveLength(1);
    expect(model.source.fieldConfidenceLabels.length).toBeGreaterThan(0);
  });

  it("requires merchant or description", () => {
    const result = validateCandidateReviewForm({
      merchant: "   ",
      transactionDate: "2026-06-20",
      totalAmount: "10",
      taxAmount: "",
      category: "",
    });

    expect(result.error).toMatch(/merchant/i);
    expect(result.values).toBeNull();
  });

  it("accepts valid date", () => {
    const result = validateCandidateReviewForm({
      merchant: "Cafe",
      transactionDate: "2026-06-01",
      totalAmount: "8.5",
      taxAmount: "0.5",
      category: "Food",
    });

    expect(result.error).toBeNull();
    expect(result.values?.transaction_date).toBe("2026-06-01");
  });

  it("rejects invalid date", () => {
    const result = validateCandidateReviewForm({
      merchant: "Cafe",
      transactionDate: "2026-13-40",
      totalAmount: "8.5",
      taxAmount: "",
      category: "",
    });

    expect(result.error).toMatch(/valid date/i);
    expect(result.values).toBeNull();
  });

  it("validates total amount", () => {
    const result = validateCandidateReviewForm({
      merchant: "Cafe",
      transactionDate: "",
      totalAmount: "abc",
      taxAmount: "",
      category: "",
    });

    expect(result.error).toMatch(/total amount/i);
  });

  it("rejects negative total", () => {
    const result = validateCandidateReviewForm({
      merchant: "Cafe",
      transactionDate: "",
      totalAmount: "-1",
      taxAmount: "",
      category: "",
    });

    expect(result.error).toMatch(/zero or greater/i);
  });

  it("validates tax amount", () => {
    const result = validateCandidateReviewForm({
      merchant: "Cafe",
      transactionDate: "",
      totalAmount: "10",
      taxAmount: "bad",
      category: "",
    });

    expect(result.error).toMatch(/tax amount/i);
  });

  it("warns when tax exceeds total", () => {
    const result = validateCandidateReviewForm({
      merchant: "Cafe",
      transactionDate: "",
      totalAmount: "10",
      taxAmount: "12",
      category: "",
    });

    expect(result.error).toBeNull();
    expect(result.warnings.some((warning) => /tax amount is greater/i.test(warning))).toBe(true);
  });

  it("trims category and notes-like optional fields", () => {
    const result = validateCandidateReviewForm({
      merchant: "Cafe",
      transactionDate: "",
      totalAmount: "10",
      taxAmount: "",
      category: "  Food  ",
    });

    expect(result.values?.category).toBe("Food");
  });

  it("builds update payload with editable candidate fields only", () => {
    const payload = buildCandidateDraftUpdatePayload({
      merchant: "Updated Cafe",
      transaction_date: "2026-06-02",
      total_amount: 12,
      tax_amount: 1,
      category: "Food",
    });

    expect(payload).toEqual({
      merchant: "Updated Cafe",
      transaction_date: "2026-06-02",
      total_amount: 12,
      tax_amount: 1,
      category: "Food",
    });
    expect(draftUpdatePayloadIncludesOnlyEditableFields(payload)).toBe(true);
  });

  it("keeps confidence and warnings read-only in form model", () => {
    const model = candidateReviewFormFromCandidate(makeCandidate());
    expect(model.source.confidenceLabel).toBe("88% confidence");
    expect(model.source.warnings).toEqual(["Low confidence on tax."]);
    expect(model.source.fieldConfidenceLabels).toContain("merchant 92%");
  });

  it("normalizes line item labels safely", () => {
    expect(
      formatReviewLineItemLabel({
        description: "Bread",
        quantity: 1,
        unitPrice: 3,
        total: 3,
        confidence: 0.8,
      })
    ).toMatch(/Bread/);
  });

  it("avoids raw UUIDs in user-facing labels and errors", () => {
    const model = candidateReviewFormFromCandidate(makeCandidate(), {
      fileName: "receipt.jpg",
      uploadedAt: "2026-06-23T12:00:00.000Z",
    });

    const labels = [
      model.form.merchant,
      model.source.receiptFileName ?? "",
      model.source.extractionStatusLabel,
      model.source.confidenceLabel ?? "",
      ...model.source.warnings,
      ...model.source.fieldConfidenceLabels,
      formatReviewLineItemLabel(model.source.lineItems[0]!),
    ];

    expect(reviewDisplayAvoidsRawUuids(labels)).toBe(true);
    expect(
      sanitizeReviewErrorMessage("update failed for 00000000-0000-4000-8000-000000000001")
    ).not.toMatch(/00000000-0000-4000-8000-000000000001/);
  });
});
