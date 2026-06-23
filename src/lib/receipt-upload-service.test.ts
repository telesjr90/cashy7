import { describe, expect, it, vi } from "vitest";
import {
  buildReceiptListQueryFilters,
  deleteReceiptUpload,
  listMyReceiptUploads,
  receiptUploadUsesUploaderScope,
  sanitizeReceiptErrorMessage,
  uploadReceipt,
  type ReceiptUploadClient,
} from "./receipt-upload-service";
import { buildReceiptUploadInsert, RECEIPT_STORAGE_BUCKET } from "./receipt-upload";
import type { ReceiptUpload } from "./types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_ID = "33333333-3333-4333-8333-333333333333";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

function makeReceipt(overrides: Partial<ReceiptUpload> = {}): ReceiptUpload {
  return {
    id: RECEIPT_ID,
    household_id: HOUSEHOLD_ID,
    uploaded_by: USER_ID,
    storage_bucket: RECEIPT_STORAGE_BUCKET,
    storage_path: `${USER_ID}/${RECEIPT_ID}/receipt.jpg`,
    original_file_name: "receipt.jpg",
    mime_type: "image/jpeg",
    size_bytes: 1024,
    status: "uploaded",
    approved_for_shared_expense: false,
    approved_at: null,
    approved_by: null,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    ...overrides,
  };
}

function makeFile(name = "receipt.jpg", type = "image/jpeg", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function createMockClient(handlers: {
  upload?: () => Promise<{ error: { message: string } | null }>;
  remove?: (paths: string[]) => Promise<{ error: { message: string } | null }>;
  insert?: () => Promise<{ data: ReceiptUpload | null; error: { message: string } | null }>;
  select?: () => Promise<{ data: ReceiptUpload[] | null; error: { message: string } | null }>;
  delete?: () => Promise<{ error: { message: string } | null }>;
}): ReceiptUploadClient {
  return {
    storage: {
      from: () => ({
        upload: handlers.upload ?? (async () => ({ error: null })),
        remove: handlers.remove ?? (async () => ({ error: null })),
      }),
    },
    from: (table) => {
      if (table !== "receipt_uploads") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        insert: () => ({
          select: () => ({
            single: handlers.insert ?? (async () => ({ data: makeReceipt(), error: null })),
          }),
        }),
        select: () => ({
          eq: () => ({
            neq: () => ({
              order: handlers.select ?? (async () => ({ data: [makeReceipt()], error: null })),
            }),
          }),
        }),
        delete: () => ({
          eq: handlers.delete ?? (async () => ({ error: null })),
        }),
      };
    },
  };
}

describe("receipt upload service", () => {
  it("sanitizes raw UUID database errors", () => {
    const message = sanitizeReceiptErrorMessage(
      "insert failed for id 00000000-0000-4000-8000-000000000001"
    );
    expect(message).not.toMatch(/00000000-0000-4000-8000-000000000001/);
  });

  it("upload calls storage bucket with expected path", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const client = createMockClient({ upload });

    const result = await uploadReceipt(
      {
        file: makeFile(),
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        receiptId: RECEIPT_ID,
      },
      client
    );

    expect(result.ok).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      `${USER_ID}/${RECEIPT_ID}/receipt.jpg`,
      expect.any(File),
      { contentType: "image/jpeg", upsert: false }
    );
  });

  it("metadata insert includes correct uploader and household id", async () => {
    const insertRow = buildReceiptUploadInsert({
      receiptId: RECEIPT_ID,
      householdId: HOUSEHOLD_ID,
      userId: USER_ID,
      fileName: "receipt.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });
    expect(receiptUploadUsesUploaderScope(insertRow, USER_ID)).toBe(true);
    expect(insertRow.household_id).toBe(HOUSEHOLD_ID);
  });

  it("does not insert metadata when storage upload fails", async () => {
    const insert = vi.fn(async () => ({ data: makeReceipt(), error: null }));
    const client = createMockClient({
      upload: async () => ({ error: { message: "storage failed" } }),
      insert,
    });

    const result = await uploadReceipt(
      { file: makeFile(), householdId: HOUSEHOLD_ID, userId: USER_ID, receiptId: RECEIPT_ID },
      client
    );

    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("cleans up storage object when metadata insert fails", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const client = createMockClient({
      remove,
      insert: async () => ({ data: null, error: { message: "insert failed" } }),
    });

    const result = await uploadReceipt(
      { file: makeFile(), householdId: HOUSEHOLD_ID, userId: USER_ID, receiptId: RECEIPT_ID },
      client
    );

    expect(result.ok).toBe(false);
    expect(remove).toHaveBeenCalledWith([`${USER_ID}/${RECEIPT_ID}/receipt.jpg`]);
  });

  it("list receipts query filters own rows only", async () => {
    const filters = buildReceiptListQueryFilters(USER_ID);
    expect(filters.uploadedBy).toBe(USER_ID);
    expect(filters.excludeStatus).toBe("deleted");

    const client = createMockClient({
      select: async () => ({ data: [makeReceipt()], error: null }),
    });
    const { receipts, error } = await listMyReceiptUploads(USER_ID, client);
    expect(error).toBeNull();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.uploaded_by).toBe(USER_ID);
  });

  it("delete removes own storage object and metadata", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const del = vi.fn(async () => ({ error: null }));
    const client = createMockClient({ remove, delete: del });

    const result = await deleteReceiptUpload(
      { receipt: makeReceipt(), userId: USER_ID },
      client
    );

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith([`${USER_ID}/${RECEIPT_ID}/receipt.jpg`]);
    expect(del).toHaveBeenCalled();
  });

  it("blocks delete for another user's receipt", async () => {
    const result = await deleteReceiptUpload({
      receipt: makeReceipt({ uploaded_by: "99999999-9999-4999-8999-999999999999" }),
      userId: USER_ID,
    });
    expect(result.ok).toBe(false);
  });
});
