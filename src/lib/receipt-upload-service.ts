import {
  buildReceiptUploadInsert,
  RECEIPT_NO_EXPENSE_CREATED_COPY,
  RECEIPT_STORAGE_BUCKET,
  validateReceiptFile,
  type AllowedReceiptMimeType,
} from "@/lib/receipt-upload";
import {
  buildDuplicateWarningLabels,
  computeFileSha256FromBlob,
  findExactFileDuplicateUploadId,
  findFileDuplicateMatches,
  type FileSelectionDuplicateInput,
  type ReceiptUploadDuplicateInput,
} from "@/lib/receipt-duplicates";
import {
  extractionUserMessage,
  sanitizeReceiptExtractionError,
} from "@/lib/receipt-errors";
import type { ReceiptExtractionStatus } from "@/lib/receipt-extraction";
import { supabase } from "@/lib/supabase";
import type { ReceiptUpload } from "@/lib/types";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sanitizeReceiptErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not complete the receipt upload. Please try again.";
  }
  return message;
}

type StorageUploadResult = {
  error: { message: string } | null;
};

type StorageRemoveResult = {
  error: { message: string } | null;
};

export type ReceiptUploadClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File,
        options: { contentType: string; upsert: boolean }
      ) => Promise<StorageUploadResult>;
      remove: (paths: string[]) => Promise<StorageRemoveResult>;
    };
  };
  from: (table: "receipt_uploads") => {
    insert: (row: ReturnType<typeof buildReceiptUploadInsert>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: ReceiptUpload | null;
          error: { message: string } | null;
        }>;
      };
    };
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        neq: (
          column: string,
          value: string
        ) => {
          order: (
            column: string,
            options: { ascending: boolean }
          ) => Promise<{
            data: ReceiptUpload[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string
      ) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: ReceiptUpload | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    delete: () => {
      eq: (
        column: string,
        value: string
      ) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

export type UploadReceiptParams = {
  file: File;
  householdId: string;
  userId: string;
  receiptId?: string;
  existingUploads?: ReceiptUploadDuplicateInput[];
};

export type UploadReceiptResult =
  | { ok: true; receipt: ReceiptUpload; successCopy: string; duplicateWarnings: string[] }
  | { ok: false; error: string };

export async function uploadReceipt(
  params: UploadReceiptParams,
  client: ReceiptUploadClient = supabase as unknown as ReceiptUploadClient
): Promise<UploadReceiptResult> {
  const validation = validateReceiptFile(params.file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const fileSha256 = await computeFileSha256FromBlob(params.file);
  const fileSelection: FileSelectionDuplicateInput = {
    fileName: params.file.name,
    mimeType: validation.mimeType,
    sizeBytes: params.file.size,
    fileSha256,
  };
  const existingUploads = params.existingUploads ?? [];
  const duplicateMatches = findFileDuplicateMatches(
    fileSelection,
    existingUploads,
    params.userId
  );
  const duplicateOfReceiptUploadId = findExactFileDuplicateUploadId(
    fileSelection,
    existingUploads,
    params.userId
  );

  const receiptId = params.receiptId ?? crypto.randomUUID();
  const insertRow = buildReceiptUploadInsert({
    receiptId,
    householdId: params.householdId,
    userId: params.userId,
    fileName: params.file.name,
    mimeType: validation.mimeType,
    sizeBytes: params.file.size,
    fileSha256,
    duplicateOfReceiptUploadId,
  });

  const { error: storageError } = await client.storage
    .from(RECEIPT_STORAGE_BUCKET)
    .upload(insertRow.storage_path, params.file, {
      contentType: validation.mimeType,
      upsert: false,
    });

  if (storageError) {
    return {
      ok: false,
      error: sanitizeReceiptErrorMessage(storageError.message),
    };
  }

  const { data, error: insertError } = await client
    .from("receipt_uploads")
    .insert(insertRow)
    .select("*")
    .single();

  if (insertError || !data) {
    await client.storage
      .from(RECEIPT_STORAGE_BUCKET)
      .remove([insertRow.storage_path]);
    return {
      ok: false,
      error: sanitizeReceiptErrorMessage(
        insertError?.message ?? "Could not save receipt metadata."
      ),
    };
  }

  const duplicateWarnings = duplicateMatches.length
    ? buildDuplicateWarningLabels(duplicateMatches)
    : [];

  return {
    ok: true,
    receipt: data,
    successCopy: `${RECEIPT_NO_EXPENSE_CREATED_COPY}`,
    duplicateWarnings,
  };
}


export async function listMyReceiptUploads(
  userId: string,
  client: ReceiptUploadClient = supabase as unknown as ReceiptUploadClient
): Promise<{ receipts: ReceiptUpload[]; error: string | null }> {
  const { data, error } = await client
    .from("receipt_uploads")
    .select("*")
    .eq("uploaded_by", userId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      receipts: [],
      error: sanitizeReceiptErrorMessage(error.message),
    };
  }

  return { receipts: data ?? [], error: null };
}

export type UpdateReceiptExtractionStatusParams = {
  receiptId: string;
  userId: string;
  status: ReceiptExtractionStatus;
  errorMessage?: string | null;
  mimeType?: string | null;
  warnings?: string[];
};

export async function updateReceiptExtractionStatus(
  params: UpdateReceiptExtractionStatusParams,
  client: ReceiptUploadClient = supabase as unknown as ReceiptUploadClient
): Promise<{ ok: true; receipt: ReceiptUpload } | { ok: false; error: string }> {
  const sanitizedError =
    params.status === "success"
      ? null
      : sanitizeReceiptExtractionError(
          params.errorMessage ??
            extractionUserMessage({
              status: params.status,
              mimeType: params.mimeType,
              warnings: params.warnings,
            })
        );

  const { data, error } = await client
    .from("receipt_uploads")
    .update({
      last_extraction_status: params.status,
      last_extraction_error: sanitizedError,
      last_extraction_at: new Date().toISOString(),
    })
    .eq("id", params.receiptId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeReceiptErrorMessage(error?.message ?? "Could not update receipt status."),
    };
  }

  if (data.uploaded_by !== params.userId) {
    return { ok: false, error: "You can only update your own receipt uploads." };
  }

  return { ok: true, receipt: data };
}

export type DeleteReceiptUploadParams = {
  receipt: Pick<
    ReceiptUpload,
    "id" | "uploaded_by" | "storage_bucket" | "storage_path"
  >;
  userId: string;
};

export async function deleteReceiptUpload(
  params: DeleteReceiptUploadParams,
  client: ReceiptUploadClient = supabase as unknown as ReceiptUploadClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.receipt.uploaded_by !== params.userId) {
    return { ok: false, error: "You can only delete your own receipt uploads." };
  }

  const { error: storageError } = await client.storage
    .from(params.receipt.storage_bucket)
    .remove([params.receipt.storage_path]);

  if (storageError) {
    return {
      ok: false,
      error: sanitizeReceiptErrorMessage(storageError.message),
    };
  }

  const { error: deleteError } = await client
    .from("receipt_uploads")
    .delete()
    .eq("id", params.receipt.id);

  if (deleteError) {
    return {
      ok: false,
      error: sanitizeReceiptErrorMessage(deleteError.message),
    };
  }

  return { ok: true };
}

export function buildReceiptListQueryFilters(userId: string): {
  uploadedBy: string;
  excludeStatus: "deleted";
} {
  return {
    uploadedBy: userId,
    excludeStatus: "deleted",
  };
}

export function receiptUploadUsesUploaderScope(
  insertRow: ReturnType<typeof buildReceiptUploadInsert>,
  userId: string
): boolean {
  return (
    insertRow.uploaded_by === userId &&
    insertRow.storage_path.startsWith(`${userId}/`)
  );
}

export function receiptUploadMimeType(
  file: Pick<File, "name" | "size" | "type">
): AllowedReceiptMimeType | null {
  const validation = validateReceiptFile(file);
  return validation.ok ? validation.mimeType : null;
}

export async function detectSelectedFileDuplicates(
  file: File,
  existingUploads: ReceiptUploadDuplicateInput[],
  userId: string
): Promise<{
  fileSha256: string;
  matches: ReturnType<typeof findFileDuplicateMatches>;
}> {
  const validation = validateReceiptFile(file);
  if (!validation.ok) {
    return { fileSha256: "", matches: [] };
  }

  const fileSha256 = await computeFileSha256FromBlob(file);
  const matches = findFileDuplicateMatches(
    {
      fileName: file.name,
      mimeType: validation.mimeType,
      sizeBytes: file.size,
      fileSha256,
    },
    existingUploads,
    userId
  );

  return { fileSha256, matches };
}
