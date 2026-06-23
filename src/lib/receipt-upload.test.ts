import { describe, expect, it } from "vitest";
import {
  ALLOWED_RECEIPT_MIME_TYPES,
  buildReceiptFileMetadata,
  buildReceiptStoragePath,
  buildReceiptUploadDisplayRow,
  buildReceiptUploadInsert,
  describeReceiptMimeType,
  displayRowAvoidsRawUuidLabels,
  formatReceiptFileSize,
  metadataExposesLocalPath,
  RECEIPT_EXTRACTION_APPROVAL_LATER_COPY,
  RECEIPT_NO_EXPENSE_CREATED_COPY,
  RECEIPT_UPLOAD_MAX_BYTES,
  RECEIPT_UPLOAD_MAX_SIZE_LABEL,
  RECEIPT_UPLOAD_SUCCESS_COPY,
  sanitizeReceiptFileName,
  storagePathIncludesUploaderScope,
  validateReceiptFile,
} from "./receipt-upload";

function makeFile(
  overrides: Partial<Pick<File, "name" | "size" | "type">> &
    Pick<File, "name">
): Pick<File, "name" | "size" | "type"> {
  return {
    size: 2048,
    type: "",
    ...overrides,
  };
}

describe("receipt upload helpers", () => {
  it("accepts JPEG files", () => {
    const result = validateReceiptFile(
      makeFile({ name: "receipt.jpg", type: "image/jpeg" })
    );
    expect(result).toEqual({ ok: true, mimeType: "image/jpeg" });
  });

  it("accepts PNG files", () => {
    const result = validateReceiptFile(
      makeFile({ name: "receipt.png", type: "image/png" })
    );
    expect(result).toEqual({ ok: true, mimeType: "image/png" });
  });

  it("accepts PDF files", () => {
    const result = validateReceiptFile(
      makeFile({ name: "receipt.pdf", type: "application/pdf" })
    );
    expect(result).toEqual({ ok: true, mimeType: "application/pdf" });
  });

  it("accepts WebP files", () => {
    const result = validateReceiptFile(
      makeFile({ name: "receipt.webp", type: "image/webp" })
    );
    expect(result).toEqual({ ok: true, mimeType: "image/webp" });
  });

  it("rejects unsupported file types", () => {
    const result = validateReceiptFile(makeFile({ name: "notes.txt", type: "text/plain" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JPEG, PNG, WebP, and PDF/i);
    }
  });

  it("rejects empty files", () => {
    const result = validateReceiptFile(
      makeFile({ name: "receipt.png", type: "image/png", size: 0 })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/empty/i);
    }
  });

  it("rejects oversized files", () => {
    const result = validateReceiptFile(
      makeFile({
        name: "receipt.pdf",
        type: "application/pdf",
        size: RECEIPT_UPLOAD_MAX_BYTES + 1,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(RECEIPT_UPLOAD_MAX_SIZE_LABEL);
    }
  });

  it("sanitizes file names and strips local paths", () => {
    expect(sanitizeReceiptFileName("C:\\Users\\me\\Downloads\\my receipt!.jpg")).toBe(
      "my receipt_.jpg"
    );
    expect(sanitizeReceiptFileName("/tmp/receipt.png")).toBe("receipt.png");
  });

  it("builds uploader-scoped storage paths", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const receiptId = "22222222-2222-4222-8222-222222222222";
    const path = buildReceiptStoragePath(userId, receiptId, "store-receipt.pdf");
    expect(path).toBe(`${userId}/${receiptId}/store-receipt.pdf`);
    expect(storagePathIncludesUploaderScope(path, userId, receiptId)).toBe(true);
    expect(path).not.toMatch(/\\/);
  });

  it("metadata payload uses uploaded_by for signed-in user only", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const householdId = "33333333-3333-4333-8333-333333333333";
    const receiptId = "22222222-2222-4222-8222-222222222222";
    const insert = buildReceiptUploadInsert({
      receiptId,
      householdId,
      userId,
      fileName: "receipt.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });
    expect(insert.uploaded_by).toBe(userId);
    expect(insert.household_id).toBe(householdId);
    expect(insert.approved_for_shared_expense).toBe(false);
  });

  it("does not expose local full paths in metadata", () => {
    const metadata = buildReceiptFileMetadata(
      makeFile({ name: "C:\\Users\\me\\receipt.jpg", type: "image/jpeg" })
    );
    expect(metadataExposesLocalPath(metadata)).toBe(false);
    expect(metadata.fileName).toBe("receipt.jpg");
  });

  it("uses privacy-safe display labels without raw UUIDs", () => {
    const row = buildReceiptUploadDisplayRow({
      id: "22222222-2222-4222-8222-222222222222",
      household_id: "33333333-3333-4333-8333-333333333333",
      uploaded_by: "11111111-1111-4111-8111-111111111111",
      storage_bucket: "receipt-uploads",
      storage_path: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/receipt.jpg",
      original_file_name: "grocery-receipt.jpg",
      mime_type: "image/jpeg",
      size_bytes: 4096,
      status: "uploaded",
      approved_for_shared_expense: false,
      approved_at: null,
      approved_by: null,
      created_at: "2026-06-23T12:00:00.000Z",
      updated_at: "2026-06-23T12:00:00.000Z",
    });
    expect(displayRowAvoidsRawUuidLabels(row)).toBe(true);
    expect(row.fileName).toBe("grocery-receipt.jpg");
    expect(row.mimeTypeLabel).toBe(describeReceiptMimeType("image/jpeg"));
    expect(row.sizeLabel).toBe(formatReceiptFileSize(4096));
  });

  it("success copy states no expense was created", () => {
    expect(RECEIPT_UPLOAD_SUCCESS_COPY).toMatch(/uploaded/i);
    expect(RECEIPT_NO_EXPENSE_CREATED_COPY).toMatch(/No expense has been created/i);
    expect(RECEIPT_EXTRACTION_APPROVAL_LATER_COPY).toMatch(/later steps/i);
  });

  it("covers all allowed mime types", () => {
    expect(ALLOWED_RECEIPT_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
  });
});
