import { describe, expect, it } from "vitest";
import {
  ALLOWED_IMPORT_EXTENSIONS,
  buildImportFileMetadata,
  formatImportFileSize,
  formatImportModifiedDate,
  getFileExtension,
  IMPORT_UPLOAD_MAX_BYTES,
  IMPORT_UPLOAD_MAX_SIZE_LABEL,
  importMimeTypeMatchesExtension,
  isAllowedImportExtension,
  metadataExposesLocalPath,
  sanitizeFileName,
  validateImportFile,
} from "./import-upload";

function makeFile(
  overrides: Partial<Pick<File, "name" | "size" | "type" | "lastModified">> &
    Pick<File, "name">
): Pick<File, "name" | "size" | "type" | "lastModified"> {
  return {
    size: 128,
    type: "",
    lastModified: Date.UTC(2026, 5, 15, 14, 30),
    ...overrides,
  };
}

describe("import upload helpers", () => {
  it("accepts .xlsx extension", () => {
    const result = validateImportFile(makeFile({ name: "budget.xlsx", type: "" }));
    expect(result).toEqual({ ok: true, extension: ".xlsx" });
  });

  it("accepts .csv extension", () => {
    const result = validateImportFile(
      makeFile({ name: "expenses.csv", type: "text/csv" })
    );
    expect(result).toEqual({ ok: true, extension: ".csv" });
  });

  it("accepts uppercase extensions", () => {
    expect(validateImportFile(makeFile({ name: "budget.XLSX" }))).toEqual({
      ok: true,
      extension: ".xlsx",
    });
    expect(validateImportFile(makeFile({ name: "expenses.CSV" }))).toEqual({
      ok: true,
      extension: ".csv",
    });
  });

  it("rejects unsupported extensions", () => {
    const result = validateImportFile(makeFile({ name: "notes.txt" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Only \.csv and \.xlsx/i);
    }
  });

  it("rejects files with no extension", () => {
    const result = validateImportFile(makeFile({ name: "spreadsheet" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\.csv or \.xlsx/i);
    }
  });

  it("rejects empty files", () => {
    const result = validateImportFile(makeFile({ name: "budget.csv", size: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/empty/i);
    }
  });

  it("rejects oversized files", () => {
    const result = validateImportFile(
      makeFile({ name: "budget.xlsx", size: IMPORT_UPLOAD_MAX_BYTES + 1 })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(IMPORT_UPLOAD_MAX_SIZE_LABEL);
    }
  });

  it("handles MIME type mismatch safely when extension is valid", () => {
    const result = validateImportFile(
      makeFile({
        name: "budget.csv",
        type: "application/octet-stream",
      })
    );
    expect(result).toEqual({ ok: true, extension: ".csv" });
    expect(importMimeTypeMatchesExtension("application/octet-stream", ".csv")).toBe(
      false
    );
  });

  it("builds metadata with name, extension, size label, and modified date label", () => {
    const metadata = buildImportFileMetadata(
      makeFile({
        name: "household.csv",
        size: 2048,
        type: "text/csv",
        lastModified: Date.UTC(2026, 0, 10, 9, 0),
      })
    );

    expect(metadata.fileName).toBe("household.csv");
    expect(metadata.extensionLabel).toBe(".csv");
    expect(metadata.sizeLabel).toBe("2.0 KB");
    expect(metadata.modifiedDateLabel).not.toBe("Not available");
    expect(metadata.statusLabel).toMatch(/selected/i);
    expect(metadata.mimeTypeLabel).toBe("text/csv");
  });

  it("does not expose local full paths in metadata", () => {
    const metadata = buildImportFileMetadata(
      makeFile({
        name: "C:\\Users\\someone\\Downloads\\budget.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );

    expect(metadata.fileName).toBe("budget.xlsx");
    expect(metadataExposesLocalPath(metadata)).toBe(false);
  });

  it("sanitizes unix-style paths to basename only", () => {
    expect(sanitizeFileName("/home/user/data/import.csv")).toBe("import.csv");
  });

  it("returns readable error labels", () => {
    const cases = [
      validateImportFile(makeFile({ name: "notes.pdf" })),
      validateImportFile(makeFile({ name: "budget.csv", size: 0 })),
      validateImportFile(
        makeFile({ name: "budget.xlsx", size: IMPORT_UPLOAD_MAX_BYTES + 1 })
      ),
    ];

    for (const result of cases) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.length).toBeGreaterThan(10);
        expect(result.error).not.toMatch(/uuid|stack|undefined/i);
      }
    }
  });

  it("documents allowed extensions and size limit constants", () => {
    expect(ALLOWED_IMPORT_EXTENSIONS).toEqual([".xlsx", ".csv"]);
    expect(getFileExtension("file.XLSX")).toBe(".xlsx");
    expect(isAllowedImportExtension(".csv")).toBe(true);
    expect(formatImportFileSize(IMPORT_UPLOAD_MAX_BYTES)).toMatch(/MB/i);
    expect(formatImportModifiedDate(0)).toBe("Not available");
  });
});
