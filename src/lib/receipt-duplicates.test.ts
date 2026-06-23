import { describe, expect, it } from "vitest";
import {
  assessApprovalDuplicateGuard,
  buildDuplicateWarningLabels,
  computeFileSha256,
  findApprovalDuplicateMatches,
  findCandidateDataDuplicateMatches,
  findFileDuplicateMatches,
  normalizeFileMetadataKey,
  duplicateLabelsAvoidRawUuids,
} from "./receipt-duplicates";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";

const HASH_A = "a".repeat(64);

function makeUpload(
  overrides: Partial<{
    id: string;
    uploaded_by: string;
    original_file_name: string;
    mime_type: string;
    size_bytes: number;
    file_sha256: string | null;
    created_at: string;
    status: "uploaded" | "deleted";
  }> = {}
) {
  return {
    id: overrides.id ?? "22222222-2222-4222-8222-222222222222",
    uploaded_by: overrides.uploaded_by ?? USER_A,
    original_file_name: overrides.original_file_name ?? "tiny-receipt.png",
    mime_type: overrides.mime_type ?? "image/png",
    size_bytes: overrides.size_bytes ?? 1024,
    file_sha256: overrides.file_sha256 ?? HASH_A,
    created_at: overrides.created_at ?? "2026-06-23T12:00:00.000Z",
    status: overrides.status ?? "uploaded",
  };
}

function makeCandidate(
  overrides: Partial<{
    id: string;
    created_by: string;
    receipt_upload_id: string;
    status: "pending" | "approved" | "dismissed";
    merchant: string | null;
    transaction_date: string | null;
    total_amount: number | null;
    linked_manual_expense_id: string | null;
  }> = {}
) {
  return {
    id: overrides.id ?? "44444444-4444-4444-8444-444444444444",
    created_by: overrides.created_by ?? USER_A,
    receipt_upload_id: overrides.receipt_upload_id ?? "22222222-2222-4222-8222-222222222222",
    status: overrides.status ?? "pending",
    merchant: overrides.merchant ?? "Corner Store",
    transaction_date: overrides.transaction_date ?? "2026-06-20",
    total_amount: overrides.total_amount ?? 42.5,
    linked_manual_expense_id: overrides.linked_manual_expense_id ?? null,
  };
}

describe("receipt duplicate helpers", () => {
  it("computes stable file hash metadata keys", () => {
    expect(
      normalizeFileMetadataKey({
        fileName: "Receipt.PNG",
        mimeType: "image/png",
        sizeBytes: 1024,
      })
    ).toBe("receipt.png|image/png|1024");
  });

  it("computes SHA-256 for known bytes", async () => {
    const bytes = new TextEncoder().encode("receipt-test");
    const hash = await computeFileSha256(bytes.buffer);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("detects exact file duplicate by hash for same uploader", () => {
    const matches = findFileDuplicateMatches(
      {
        fileName: "tiny-receipt.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        fileSha256: HASH_A,
      },
      [makeUpload()],
      USER_A
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.kind).toBe("exact_file_hash");
    expect(matches[0]?.severity).toBe("exact");
  });

  it("detects fallback duplicate by name size and type", () => {
    const matches = findFileDuplicateMatches(
      {
        fileName: "tiny-receipt.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        fileSha256: "different-hash",
      },
      [makeUpload({ file_sha256: "other-hash" })],
      USER_A
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.kind).toBe("fallback_file_metadata");
    expect(matches[0]?.severity).toBe("possible");
  });

  it("detects candidate duplicate by merchant date and total", () => {
    const matches = findCandidateDataDuplicateMatches(
      {
        merchant: "Corner Store",
        transactionDate: "2026-06-20",
        totalAmount: 42.5,
      },
      [makeCandidate()],
      USER_A,
      { excludeCandidateId: "55555555-5555-4555-8555-555555555555" }
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.kind).toBe("candidate_data");
  });

  it("detects approved candidate duplicate for approval guard", () => {
    const matches = findApprovalDuplicateMatches(
      {
        merchant: "Corner Store",
        transactionDate: "2026-06-20",
        totalAmount: 42.5,
      },
      [
        makeCandidate({ status: "approved", linked_manual_expense_id: "expense-1" }),
      ],
      USER_A,
      "55555555-5555-4555-8555-555555555555"
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchStatus).toBe("approved");
  });

  it("ignores other-user duplicate candidates", () => {
    const matches = findCandidateDataDuplicateMatches(
      {
        merchant: "Corner Store",
        transactionDate: "2026-06-20",
        totalAmount: 42.5,
      },
      [makeCandidate({ created_by: USER_B })],
      USER_A
    );

    expect(matches).toHaveLength(0);
  });

  it("builds duplicate warning labels with safe context only", () => {
    const labels = buildDuplicateWarningLabels([
      {
        kind: "exact_file_hash",
        severity: "exact",
        matchStatus: "uploaded",
        fileName: "tiny-receipt.png",
        uploadedAtLabel: "Jun 23, 2026, 8:00 AM",
        merchant: null,
        transactionDate: null,
        totalLabel: null,
      },
    ]);

    expect(labels[0]).toMatch(/Possible duplicate/i);
    expect(labels[1]).toMatch(/tiny-receipt.png/i);
    expect(duplicateLabelsAvoidRawUuids(labels)).toBe(true);
  });

  it("requires confirmation for approved duplicate on approval guard", () => {
    const guard = assessApprovalDuplicateGuard([
      {
        kind: "approved_candidate",
        severity: "exact",
        matchStatus: "approved",
        fileName: "tiny-receipt.png",
        uploadedAtLabel: null,
        merchant: "Corner Store",
        transactionDate: "2026-06-20",
        totalLabel: "$42.50",
      },
    ]);

    expect(guard.requireConfirmation).toBe(true);
    expect(guard.blockApproval).toBe(false);
    expect(guard.warnings.some((warning) => warning.includes("approved"))).toBe(true);
  });
});
