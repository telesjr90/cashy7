import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildImportRowId,
  detectImportFileKind,
  normalizeImportCellValue,
  parseCsvMatrix,
  parseCsvText,
  parseImportFile,
  parseResultExposesLocalPath,
  parseXlsxArrayBuffer,
  sanitizeParseErrorMessage,
} from "./import-parser";

function makeXlsxBuffer(
  sheets: Record<string, (string | number | boolean | null)[][]>
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return output;
}

function makeFile(
  name: string,
  contents: BlobPart,
  type = ""
): File {
  return new File([contents], name, { type });
}

describe("import parser", () => {
  it("detects file kind from extension", () => {
    expect(detectImportFileKind("budget.csv")).toBe("csv");
    expect(detectImportFileKind("budget.xlsx")).toBe("xlsx");
    expect(detectImportFileKind("notes.txt")).toBeNull();
  });

  it("parses CSV with headers into one sheet", () => {
    const result = parseCsvText("name,amount\nRent,1200\n", "household.csv");

    expect(result.fileKind).toBe("csv");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]?.name).toBe("CSV");
    expect(result.sheets[0]?.headers).toEqual(["name", "amount"]);
    expect(result.sheets[0]?.rowCount).toBe(1);
    expect(result.sheets[0]?.rows[0]?.values).toEqual(["Rent", "1200"]);
    expect(result.sheets[0]?.rows[0]?.raw).toEqual({ name: "Rent", amount: "1200" });
  });

  it("parses CSV without headers into data rows", () => {
    const result = parseCsvText("Rent,1200\nWater,45\n", "no-header.csv");

    expect(result.sheets[0]?.headers).toEqual([]);
    expect(result.sheets[0]?.rowCount).toBe(2);
    expect(result.sheets[0]?.rows[0]?.values).toEqual(["Rent", "1200"]);
    expect(result.sheets[0]?.rows[0]?.raw).toBeNull();
  });

  it("handles quoted commas in CSV", () => {
    const matrix = parseCsvMatrix('name,note\nRent,"1,200 due Friday"\n');
    expect(matrix[1]?.[1]).toBe("1,200 due Friday");

    const result = parseCsvText('name,note\nRent,"1,200 due Friday"\n', "quoted.csv");
    expect(result.sheets[0]?.rows[0]?.values[1]).toBe("1,200 due Friday");
  });

  it("skips empty CSV rows", () => {
    const result = parseCsvText("name,amount\n\nRent,1200\n,\n", "sparse.csv");
    expect(result.sheets[0]?.rowCount).toBe(1);
    expect(result.totalNonEmptyRows).toBe(1);
  });

  it("parses a single-sheet XLSX workbook", () => {
    const buffer = makeXlsxBuffer({
      Bills: [
        ["name", "amount"],
        ["Rent", 1200],
        ["Water", 45],
      ],
    });

    const result = parseXlsxArrayBuffer(buffer, "bills.xlsx");
    expect(result.fileKind).toBe("xlsx");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]?.name).toBe("Bills");
    expect(result.sheets[0]?.headers).toEqual(["name", "amount"]);
    expect(result.sheets[0]?.rowCount).toBe(2);
    expect(result.sheets[0]?.rows[0]?.values).toEqual(["Rent", 1200]);
  });

  it("preserves multiple XLSX sheet names", () => {
    const buffer = makeXlsxBuffer({
      Bills: [["name"], ["Rent"]],
      Savings: [["goal"], ["Emergency"]],
    });

    const result = parseXlsxArrayBuffer(buffer, "household.xlsx");
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(["Bills", "Savings"]);
    expect(result.totalRows).toBe(2);
  });

  it("skips empty XLSX rows", () => {
    const buffer = makeXlsxBuffer({
      Sheet1: [
        ["name", "amount"],
        ["Rent", 1200],
        [null, null],
        ["", ""],
      ],
    });

    const result = parseXlsxArrayBuffer(buffer, "empty-rows.xlsx");
    expect(result.sheets[0]?.rowCount).toBe(1);
  });

  it("normalizes cell values", () => {
    expect(normalizeImportCellValue("  hello ")).toBe("hello");
    expect(normalizeImportCellValue(42)).toBe(42);
    expect(normalizeImportCellValue(true)).toBe(true);
    expect(normalizeImportCellValue(null)).toBeNull();
    expect(normalizeImportCellValue("")).toBeNull();
    expect(normalizeImportCellValue(new Date("2026-01-15T12:00:00.000Z"))).toBe(
      "2026-01-15T12:00:00.000Z"
    );
  });

  it("warns on empty workbook or sheet", () => {
    const emptySheet = makeXlsxBuffer({ Empty: [] });
    const emptySheetResult = parseXlsxArrayBuffer(emptySheet, "empty-sheet.xlsx");
    expect(emptySheetResult.warnings.some((warning) => /empty/i.test(warning))).toBe(true);
    expect(emptySheetResult.totalRows).toBe(0);
  });

  it("returns a readable error for corrupt XLSX data", async () => {
    const corruptBuffer = new TextEncoder().encode("not-a-workbook").buffer;
    expect(() => parseXlsxArrayBuffer(corruptBuffer, "broken.xlsx")).toThrow(
      /could not be read/i
    );

    const file = makeFile("broken.xlsx", corruptBuffer);
    const outcome = await parseImportFile(file);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/could not be read/i);
      expect(outcome.error).not.toMatch(/\\|\//);
    }
  });

  it("generates stable candidate row ids without UUIDs", () => {
    const id = buildImportRowId("Bills Sheet", 3);
    expect(id).toBe("bills-sheet:3");
    expect(id).toMatch(/^[a-z0-9-]+:\d+$/);
    expect(id).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("does not expose local full paths in metadata or errors", async () => {
    const result = parseCsvText("name\nRent\n", "C:\\Users\\someone\\Downloads\\budget.csv");
    expect(result.fileName).toBe("budget.csv");
    expect(parseResultExposesLocalPath(result)).toBe(false);

    const sanitized = sanitizeParseErrorMessage(
      "Failed at C:\\Users\\someone\\Downloads\\broken.xlsx"
    );
    expect(sanitized).not.toContain("C:\\Users");
    expect(sanitized).toContain("[path]");
  });

  it("parses import files from File objects", async () => {
    const csvOutcome = await parseImportFile(
      makeFile("import.csv", "name,amount\nRent,1200\n", "text/csv")
    );
    expect(csvOutcome.ok).toBe(true);
    if (csvOutcome.ok) {
      expect(csvOutcome.result.totalRows).toBe(1);
    }

    const xlsxOutcome = await parseImportFile(
      makeFile(
        "import.xlsx",
        makeXlsxBuffer({ Data: [["name"], ["Rent"]] }),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    );
    expect(xlsxOutcome.ok).toBe(true);
  });
});
