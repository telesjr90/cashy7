import { describe, expect, it, vi } from "vitest";
import {
  buildCandidateListQueryFilters,
  candidateInsertUsesUploaderScope,
  dismissReceiptCandidate,
  findPendingCandidateForReceipt,
  listMyReceiptCandidates,
  saveCandidateDoesNotInsertManualExpense,
  saveReceiptCandidate,
  sanitizeCandidateErrorMessage,
  updateCandidateDoesNotInsertManualExpense,
  updateReceiptCandidateDraft,
  type ReceiptCandidateClient,
} from "./receipt-candidate-service";
import { buildCandidateInsertPayload } from "./receipt-candidates";
import type { ReceiptExtractionResult } from "./receipt-extraction";
import type { ReceiptCandidate, ReceiptUpload } from "./types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const HOUSEHOLD_ID = "33333333-3333-4333-8333-333333333333";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";

function successExtraction(
  overrides: Partial<ReceiptExtractionResult> = {}
): ReceiptExtractionResult {
  return {
    status: "success",
    merchant: "Cafe",
    date: "2026-06-01",
    total: 8.5,
    tax: 0.5,
    category: "Food",
    lineItems: [],
    confidence: 0.9,
    fieldConfidence: {},
    warnings: [],
    rawProviderName: "openai",
    providerConfigured: true,
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<ReceiptUpload> = {}): ReceiptUpload {
  return {
    id: RECEIPT_ID,
    household_id: HOUSEHOLD_ID,
    uploaded_by: USER_ID,
    storage_bucket: "receipt-uploads",
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

function makeCandidate(overrides: Partial<ReceiptCandidate> = {}): ReceiptCandidate {
  return {
    id: CANDIDATE_ID,
    household_id: HOUSEHOLD_ID,
    receipt_upload_id: RECEIPT_ID,
    created_by: USER_ID,
    status: "pending",
    merchant: "Cafe",
    transaction_date: "2026-06-01",
    total_amount: 8.5,
    tax_amount: 0.5,
    category: "Food",
    line_items: [],
    confidence: 0.9,
    field_confidence: {},
    warnings: [],
    source_status: "success",
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    ...overrides,
  };
}

function createMockClient(handlers: {
  insert?: () => Promise<{ data: ReceiptCandidate | null; error: { message: string; code?: string } | null }>;
  findPending?: () => Promise<{ data: ReceiptCandidate | null; error: { message: string } | null }>;
  list?: () => Promise<{ data: ReceiptCandidate[] | null; error: { message: string } | null }>;
  update?: () => Promise<{ data: ReceiptCandidate | null; error: { message: string } | null }>;
  delete?: () => Promise<{ error: { message: string } | null }>;
}): ReceiptCandidateClient {
  return {
    from: (table) => {
      if (table !== "receipt_candidates") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        insert: () => ({
          select: () => ({
            single: handlers.insert ?? (async () => ({ data: makeCandidate(), error: null })),
          }),
        }),
        select: () => ({
          eq: (column: string, value: string) => {
            const chain = {
              eq: (_column2: string, _value2: string) => ({
                maybeSingle:
                  handlers.findPending ??
                  (async () => ({ data: null, error: null })),
                order:
                  handlers.list ??
                  (async () => ({ data: [makeCandidate()], error: null })),
              }),
              maybeSingle:
                handlers.findPending ??
                (async () => ({ data: null, error: null })),
              order:
                handlers.list ??
                (async () => ({ data: [makeCandidate()], error: null })),
            };

            if (column === "created_by" && value === USER_ID && handlers.list) {
              return chain;
            }
            if (column === "receipt_upload_id") {
              return chain;
            }
            return chain;
          },
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single:
                  handlers.update ??
                  (async () => ({ data: makeCandidate(), error: null })),
              }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: handlers.delete ?? (async () => ({ error: null })),
          }),
        }),
      };
    },
  };
}

describe("receipt candidate service", () => {
  it("sanitizes raw UUID database errors", () => {
    expect(
      sanitizeCandidateErrorMessage(
        "insert failed for id 00000000-0000-4000-8000-000000000001"
      )
    ).not.toMatch(/00000000-0000-4000-8000-000000000001/);
  });

  it("create candidate inserts only for signed-in user scope", async () => {
    const insert = vi.fn(async () => ({ data: makeCandidate(), error: null }));
    const client = createMockClient({ insert });

    const receipt = makeReceipt();
    const insertRow = buildCandidateInsertPayload({
      householdId: HOUSEHOLD_ID,
      userId: USER_ID,
      receiptUploadId: receipt.id,
      extraction: successExtraction(),
    });
    expect(candidateInsertUsesUploaderScope(insertRow, USER_ID, receipt)).toBe(true);

    const result = await saveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        receiptUpload: receipt,
        extraction: successExtraction(),
      },
      client
    );

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("rejects create candidate for another user's receipt upload", async () => {
    const insert = vi.fn();
    const result = await saveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        receiptUpload: makeReceipt({ uploaded_by: OTHER_USER_ID }),
        extraction: successExtraction(),
      },
      createMockClient({ insert })
    );

    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("blocks duplicate pending candidate on create", async () => {
    const insert = vi.fn();
    const result = await saveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        receiptUpload: makeReceipt(),
        extraction: successExtraction(),
        mode: "create",
      },
      createMockClient({
        insert,
        findPending: async () => ({ data: makeCandidate(), error: null }),
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.duplicate).toBe(true);
      expect(result.error).toMatch(/already exists/i);
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it("updates existing pending candidate on replace", async () => {
    const update = vi.fn(async () => ({ data: makeCandidate({ merchant: "Updated Cafe" }), error: null }));
    const result = await saveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        receiptUpload: makeReceipt(),
        extraction: successExtraction({ merchant: "Updated Cafe" }),
        mode: "replace",
      },
      createMockClient({
        findPending: async () => ({ data: makeCandidate(), error: null }),
        update,
      })
    );

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("list candidates returns own pending rows via query filters", async () => {
    const list = vi.fn(async () => ({ data: [makeCandidate()], error: null }));
    const { candidates, error } = await listMyReceiptCandidates(
      USER_ID,
      createMockClient({ list })
    );

    expect(error).toBeNull();
    expect(candidates).toHaveLength(1);
    expect(buildCandidateListQueryFilters(USER_ID)).toEqual({
      createdBy: USER_ID,
      status: "pending",
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("dismiss candidate affects own pending candidate only", async () => {
    const deleteHandler = vi.fn(async () => ({ error: null }));
    const ownResult = await dismissReceiptCandidate(
      {
        candidate: makeCandidate(),
        userId: USER_ID,
      },
      createMockClient({ delete: deleteHandler })
    );
    expect(ownResult.ok).toBe(true);
    expect(deleteHandler).toHaveBeenCalledTimes(1);

    const otherResult = await dismissReceiptCandidate({
      candidate: makeCandidate({ created_by: OTHER_USER_ID }),
      userId: USER_ID,
    });
    expect(otherResult.ok).toBe(false);
  });

  it("finds pending candidate for receipt upload", async () => {
    const candidate = await findPendingCandidateForReceipt(
      RECEIPT_ID,
      createMockClient({
        findPending: async () => ({ data: makeCandidate(), error: null }),
      })
    );
    expect(candidate?.id).toBe(CANDIDATE_ID);
  });

  it("does not insert manual expense rows", () => {
    expect(saveCandidateDoesNotInsertManualExpense()).toBe(true);
    expect(updateCandidateDoesNotInsertManualExpense()).toBe(true);
  });

  it("update candidate draft calls only receipt_candidates for own pending row", async () => {
    const update = vi.fn(async () => ({
      data: makeCandidate({ merchant: "Edited Cafe" }),
      error: null,
    }));
    const result = await updateReceiptCandidateDraft(
      {
        candidate: makeCandidate(),
        userId: USER_ID,
        draft: {
          merchant: "Edited Cafe",
          transaction_date: "2026-06-02",
          total_amount: 12,
          tax_amount: 1,
          category: "Food",
        },
      },
      createMockClient({ update })
    );

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects draft update for another user's candidate", async () => {
    const update = vi.fn();
    const result = await updateReceiptCandidateDraft(
      {
        candidate: makeCandidate({ created_by: OTHER_USER_ID }),
        userId: USER_ID,
        draft: {
          merchant: "Edited Cafe",
          transaction_date: "2026-06-02",
          total_amount: 12,
          tax_amount: 1,
          category: "Food",
        },
      },
      createMockClient({ update })
    );

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns safe error when draft update fails", async () => {
    const result = await updateReceiptCandidateDraft(
      {
        candidate: makeCandidate(),
        userId: USER_ID,
        draft: {
          merchant: "Edited Cafe",
          transaction_date: "2026-06-02",
          total_amount: 12,
          tax_amount: 1,
          category: "Food",
        },
      },
      createMockClient({
        update: async () => ({
          data: null,
          error: { message: "failed for id 00000000-0000-4000-8000-000000000001" },
        }),
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/00000000-0000-4000-8000-000000000001/);
    }
  });
});
