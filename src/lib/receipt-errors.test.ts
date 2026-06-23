import { describe, expect, it } from "vitest";
import {
  buildMissingTotalWarnings,
  canRetryExtraction,
  errorLabelsAvoidRawUuids,
  extractionFailurePreventsCandidate,
  extractionUserMessage,
  missingTotalBlocksApproval,
  persistedExtractionErrorLabel,
  RECEIPT_MISSING_TOTAL_DETAIL,
  RECEIPT_MISSING_TOTAL_TITLE,
  sanitizeReceiptExtractionError,
  unsupportedFileErrorMessage,
} from "./receipt-errors";

describe("receipt error helpers", () => {
  it("returns unsupported file copy", () => {
    expect(unsupportedFileErrorMessage()).toMatch(/Unsupported receipt file/i);
    expect(unsupportedFileErrorMessage()).toMatch(/JPEG, PNG, WebP, or PDF/i);
  });

  it("labels unreadable extraction status", () => {
    expect(
      extractionUserMessage({ status: "unreadable" })
    ).toMatch(/could not be read/i);
  });

  it("labels PDF unsupported extraction distinctly", () => {
    expect(
      extractionUserMessage({ status: "unsupported", mimeType: "application/pdf" })
    ).toMatch(/PDF extraction is not available yet/i);
  });

  it("sanitizes provider errors and rate limits", () => {
    expect(
      sanitizeReceiptExtractionError("429 too many requests")
    ).toMatch(/rate-limited/i);
    expect(
      sanitizeReceiptExtractionError("secret token leaked in response")
    ).toMatch(/configuration issue/i);
  });

  it("builds missing total warnings", () => {
    expect(buildMissingTotalWarnings(null)).toEqual([
      RECEIPT_MISSING_TOTAL_TITLE,
      RECEIPT_MISSING_TOTAL_DETAIL,
    ]);
  });

  it("blocks approval readiness for missing total", () => {
    expect(missingTotalBlocksApproval("")).toBe(true);
    expect(missingTotalBlocksApproval("0")).toBe(true);
    expect(missingTotalBlocksApproval("12.50")).toBe(false);
  });

  it("allows retry for unreadable and provider errors", () => {
    expect(canRetryExtraction("unreadable")).toBe(true);
    expect(canRetryExtraction("provider_error")).toBe(true);
    expect(canRetryExtraction("success")).toBe(false);
  });

  it("prevents candidate save for failed extraction statuses", () => {
    expect(extractionFailurePreventsCandidate("unreadable")).toBe(true);
    expect(extractionFailurePreventsCandidate("success")).toBe(false);
  });

  it("reads persisted extraction error labels safely", () => {
    const label = persistedExtractionErrorLabel(
      "provider_error",
      "Receipt extraction failed. Please try again."
    );
    expect(label).toMatch(/failed/i);
    expect(errorLabelsAvoidRawUuids([label!])).toBe(true);
  });

  it("avoids raw UUIDs in error labels", () => {
    const sanitized = sanitizeReceiptExtractionError(
      "failed for 44444444-4444-4444-8444-444444444444"
    );
    expect(errorLabelsAvoidRawUuids([sanitized])).toBe(true);
  });
});
