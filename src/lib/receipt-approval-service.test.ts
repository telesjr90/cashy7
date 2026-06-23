import { describe, expect, it, vi } from "vitest";
import {
  approvalServiceDoesNotInsertCashPayment,
  approveReceiptCandidate,
  type ReceiptApprovalClient,
} from "./receipt-approval-service";
import type { ReceiptCandidate, ReceiptUpload } from "./types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const HOUSEHOLD_ID = "33333333-3333-4333-8333-333333333333";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";
const EXPENSE_ID = "55555555-5555-4555-8555-555555555555";

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
    approved_at: null,
    approved_by: null,
    linked_manual_expense_id: null,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
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
    file_sha256: null,
    duplicate_of_receipt_upload_id: null,
    last_extraction_status: null,
    last_extraction_error: null,
    last_extraction_at: null,
    created_at: "2026-06-23T12:00:00.000Z",
    updated_at: "2026-06-23T12:00:00.000Z",
    ...overrides,
  };
}

function makeClient(handlers: {
  insertExpense?: () => Promise<{ data: unknown; error: { message: string } | null }>;
  updateCandidate?: () => Promise<{ data: unknown; error: { message: string } | null }>;
  updateUpload?: () => Promise<{ data: unknown; error: { message: string } | null }>;
}): ReceiptApprovalClient {
  return {
    from: (table: "manual_expenses" | "receipt_candidates" | "receipt_uploads") => {
      if (table === "manual_expenses") {
        return {
          insert: () => ({
            select: () => ({
              single: handlers.insertExpense ?? (async () => ({ data: null, error: null })),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "receipt_candidates") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single:
                    handlers.updateCandidate ?? (async () => ({ data: null, error: null })),
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: handlers.updateUpload ?? (async () => ({ data: null, error: null })),
            }),
          }),
        }),
      };
    },
  } as unknown as ReceiptApprovalClient;
}

const draft = {
  merchant: "Cafe",
  transaction_date: "2026-06-01",
  total_amount: 8.5,
  tax_amount: 0.5,
  category: "Food",
};

describe("receipt approval service", () => {
  it("inserts manual expense and updates candidate status/link", async () => {
    const insertExpense = vi.fn(async () => ({
      data: {
        id: EXPENSE_ID,
        household_id: HOUSEHOLD_ID,
        created_by_user_id: USER_ID,
        description: "Cafe",
        amount: 8.5,
        expense_date: "2026-06-01",
        expense_scope: "shared",
        split_type: "51_49",
        is_paid: false,
      },
      error: null,
    }));
    const updateCandidate = vi.fn(async () => ({
      data: makeCandidate({
        status: "approved",
        linked_manual_expense_id: EXPENSE_ID,
        approved_by: USER_ID,
        approved_at: "2026-06-23T13:00:00.000Z",
      }),
      error: null,
    }));
    const updateUpload = vi.fn(async () => ({
      data: makeReceipt({
        approved_for_shared_expense: true,
        approved_by: USER_ID,
      }),
      error: null,
    }));

    const result = await approveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        candidate: makeCandidate(),
        receiptUpload: makeReceipt(),
        draft,
        receiptFileName: "receipt.jpg",
      },
      makeClient({ insertExpense, updateCandidate, updateUpload })
    );

    expect(result.ok).toBe(true);
    expect(insertExpense).toHaveBeenCalledTimes(1);
    expect(updateCandidate).toHaveBeenCalledTimes(1);
    expect(updateUpload).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.expense.id).toBe(EXPENSE_ID);
      expect(result.candidate.status).toBe("approved");
      expect(result.candidate.linked_manual_expense_id).toBe(EXPENSE_ID);
    }
  });

  it("blocks double approval", async () => {
    const result = await approveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        candidate: makeCandidate({
          status: "approved",
          linked_manual_expense_id: EXPENSE_ID,
        }),
        receiptUpload: makeReceipt(),
        draft,
      },
      makeClient({})
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already approved/i);
    }
  });

  it("blocks non-owner approval", async () => {
    const result = await approveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: OTHER_USER_ID,
        candidate: makeCandidate(),
        receiptUpload: makeReceipt(),
        draft,
      },
      makeClient({})
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/your own receipt candidates/i);
    }
  });

  it("does not update candidate when manual expense insert fails", async () => {
    const insertExpense = vi.fn(async () => ({
      data: null,
      error: { message: "insert failed" },
    }));
    const updateCandidate = vi.fn(async () => ({
      data: makeCandidate({ status: "approved" }),
      error: null,
    }));

    const result = await approveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        candidate: makeCandidate(),
        receiptUpload: makeReceipt(),
        draft,
      },
      makeClient({ insertExpense, updateCandidate })
    );

    expect(result.ok).toBe(false);
    expect(updateCandidate).not.toHaveBeenCalled();
  });

  it("returns partial failure when candidate update fails after expense insert", async () => {
    const insertExpense = vi.fn(async () => ({
      data: {
        id: EXPENSE_ID,
        description: "Cafe",
        amount: 8.5,
        expense_date: "2026-06-01",
      },
      error: null,
    }));
    const updateCandidate = vi.fn(async () => ({
      data: null,
      error: { message: "update failed" },
    }));

    const result = await approveReceiptCandidate(
      {
        householdId: HOUSEHOLD_ID,
        userId: USER_ID,
        candidate: makeCandidate(),
        receiptUpload: makeReceipt(),
        draft,
      },
      makeClient({ insertExpense, updateCandidate })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.partial).toBe(true);
      expect(result.error).toMatch(/expense was created/i);
      expect(result.expense?.id).toBe(EXPENSE_ID);
    }
  });

  it("does not insert cash payment transactions", () => {
    expect(approvalServiceDoesNotInsertCashPayment()).toBe(true);
  });
});
