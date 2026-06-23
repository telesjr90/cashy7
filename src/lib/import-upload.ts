/** Maximum spreadsheet upload size for client-side staging (10 MB). */
export const IMPORT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const IMPORT_UPLOAD_MAX_SIZE_LABEL = "10 MB";

export const ALLOWED_IMPORT_EXTENSIONS = [".xlsx", ".csv"] as const;

export type ImportFileExtension = (typeof ALLOWED_IMPORT_EXTENSIONS)[number];

export const IMPORT_FILE_SELECTED_STATUS = "Selected for import";

export const IMPORT_NEXT_STEP_COPY =
  "File selected. Parsing and preview will happen in the next step.";

export const IMPORT_NO_RECORDS_CHANGED_COPY = "No app records have been changed.";

export const IMPORT_REVIEW_BEFORE_SAVE_COPY =
  "You will review mapped rows before anything is saved.";

export const IMPORT_NEXT_PARSE_PREVIEW_LABEL = "Next: preview and map columns";

export const IMPORT_PARSED_CANDIDATES_COPY = "Parsed rows are candidates only.";

export const IMPORT_COLUMN_MAPPING_NEXT_COPY = "Column mapping happens next.";

export const IMPORT_MAPPED_CANDIDATES_COPY = "Mapped rows are still candidates only.";

export const IMPORT_VALIDATION_NEXT_COPY = "Validation happens next.";

export const IMPORT_NEXT_VALIDATE_ROWS_LABEL = "Next: validate rows";

export const IMPORT_PARSE_FILE_LABEL = "Parse file";

export const IMPORT_UPLOAD_HELP_COPY =
  "Choose a spreadsheet to stage locally in your browser. Nothing is uploaded or saved until you confirm in a later step.";

export type ImportUploadValidationResult =
  | { ok: true; extension: ImportFileExtension }
  | { ok: false; error: string };

export interface ImportFileMetadata {
  fileName: string;
  extensionLabel: string;
  mimeTypeLabel: string;
  sizeLabel: string;
  modifiedDateLabel: string;
  statusLabel: string;
}

const EXTENSION_MIME_HINTS: Record<ImportFileExtension, string[]> = {
  ".csv": ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
};

export function getFileExtension(fileName: string): string | null {
  const safeName = sanitizeFileName(fileName);
  const lastDot = safeName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === safeName.length - 1) {
    return null;
  }
  return safeName.slice(lastDot).toLowerCase();
}

export function isAllowedImportExtension(extension: string): extension is ImportFileExtension {
  return ALLOWED_IMPORT_EXTENSIONS.includes(extension as ImportFileExtension);
}

export function sanitizeFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? fileName;
}

export function formatImportFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown size";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kilobytes = bytes / 1024;
    return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

export function formatImportModifiedDate(timestampMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return "Not available";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestampMs));
}

export function describeImportMimeType(
  mimeType: string,
  extension: ImportFileExtension | null
): string {
  const trimmed = mimeType.trim();
  if (trimmed) {
    return trimmed;
  }
  if (extension === ".csv") {
    return "CSV spreadsheet";
  }
  if (extension === ".xlsx") {
    return "Excel spreadsheet (.xlsx)";
  }
  return "Unknown type";
}

export function validateImportFile(file: Pick<File, "name" | "size" | "type">): ImportUploadValidationResult {
  const extension = getFileExtension(file.name);

  if (!extension) {
    return {
      ok: false,
      error: "Choose a file with a .csv or .xlsx extension.",
    };
  }

  if (!isAllowedImportExtension(extension)) {
    return {
      ok: false,
      error: "Only .csv and .xlsx files can be imported.",
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      error: "The selected file is empty. Choose a spreadsheet that contains data.",
    };
  }

  if (file.size > IMPORT_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `The selected file is too large. Maximum size is ${IMPORT_UPLOAD_MAX_SIZE_LABEL}.`,
    };
  }

  return { ok: true, extension };
}

export function importMimeTypeMatchesExtension(
  mimeType: string,
  extension: ImportFileExtension
): boolean {
  const trimmed = mimeType.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }
  const hints = EXTENSION_MIME_HINTS[extension].map((value) => value.toLowerCase());
  return hints.includes(trimmed);
}

export function buildImportFileMetadata(
  file: Pick<File, "name" | "size" | "type" | "lastModified">
): ImportFileMetadata {
  const extension = getFileExtension(file.name);
  const safeName = sanitizeFileName(file.name);

  return {
    fileName: safeName,
    extensionLabel: extension ?? "Unknown",
    mimeTypeLabel: describeImportMimeType(
      file.type,
      extension && isAllowedImportExtension(extension) ? extension : null
    ),
    sizeLabel: formatImportFileSize(file.size),
    modifiedDateLabel: formatImportModifiedDate(file.lastModified),
    statusLabel: IMPORT_FILE_SELECTED_STATUS,
  };
}

export function metadataExposesLocalPath(metadata: ImportFileMetadata): boolean {
  return metadata.fileName.includes("\\") || metadata.fileName.includes("/");
}
