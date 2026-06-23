import {
  buildReceiptUploadInsert,
  RECEIPT_NO_EXPENSE_CREATED_COPY,
  RECEIPT_STORAGE_BUCKET,
  validateReceiptFile,
  type AllowedReceiptMimeType,
} from "@/lib/receipt-upload";
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
};

export type UploadReceiptResult =
  | { ok: true; receipt: ReceiptUpload; successCopy: string }
  | { ok: false; error: string };

export async function uploadReceipt(
  params: UploadReceiptParams,
  client: ReceiptUploadClient = supabase as unknown as ReceiptUploadClient
): Promise<UploadReceiptResult> {
  const validation = validateReceiptFile(params.file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const receiptId = params.receiptId ?? crypto.randomUUID();
  const insertRow = buildReceiptUploadInsert({
    receiptId,
    householdId: params.householdId,
    userId: params.userId,
    fileName: params.file.name,
    mimeType: validation.mimeType,
    sizeBytes: params.file.size,
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

  return {
    ok: true,
    receipt: data,
    successCopy: `${RECEIPT_NO_EXPENSE_CREATED_COPY}`,
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
