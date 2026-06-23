import * as XLSX from "xlsx";
import {
  getFileExtension,
  isAllowedImportExtension,
  sanitizeFileName,
  type ImportFileExtension,
} from "@/lib/import-upload";

export type ImportFileKind = "csv" | "xlsx";

export type ImportParsedCellValue = string | number | boolean | null;

export type ImportParsedRow = {
  id: string;
  sheetName: string;
  rowNumber: number;
  values: ImportParsedCellValue[];
  raw: Record<string, ImportParsedCellValue> | null;
  isEmpty: boolean;
};

export type ImportParsedSheet = {
  name: string;
  rowCount: number;
  nonEmptyRowCount: number;
  headers: string[];
  rows: ImportParsedRow[];
};

export type ImportParseResult = {
  fileName: string;
  fileKind: ImportFileKind;
  sheets: ImportParsedSheet[];
  totalRows: number;
  totalNonEmptyRows: number;
  warnings: string[];
};

export type ImportParseOutcome =
  | { ok: true; result: ImportParseResult }
  | { ok: false; error: string };

const DEFAULT_CSV_SHEET_NAME = "CSV";

export function detectImportFileKind(fileName: string): ImportFileKind | null {
  const extension = getFileExtension(fileName);
  if (extension === ".csv") {
    return "csv";
  }
  if (extension === ".xlsx") {
    return "xlsx";
  }
  return null;
}

export function buildImportRowId(sheetName: string, rowNumber: number): string {
  const slug = sheetName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug.length > 0 ? slug : "sheet";
  return `${safeSlug}:${rowNumber}`;
}

export function normalizeImportCellValue(value: unknown): ImportParsedCellValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return String(value);
}

export function isImportRowEmpty(values: ImportParsedCellValue[]): boolean {
  return values.every((cell) => cell === null);
}

function headerCellLooksLikeLabel(value: ImportParsedCellValue): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return false;
  }
  return true;
}

function rowLooksLikeHeaderRow(values: ImportParsedCellValue[]): boolean {
  if (values.length === 0 || isImportRowEmpty(values)) {
    return false;
  }
  return values.every(headerCellLooksLikeLabel);
}

function buildRawRow(
  headers: string[],
  values: ImportParsedCellValue[]
): Record<string, ImportParsedCellValue> | null {
  if (headers.length === 0) {
    return null;
  }
  const raw: Record<string, ImportParsedCellValue> = {};
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (!header) {
      continue;
    }
    raw[header] = values[index] ?? null;
  }
  return raw;
}

function buildParsedRow(
  sheetName: string,
  rowNumber: number,
  values: ImportParsedCellValue[],
  headers: string[]
): ImportParsedRow {
  const normalizedValues = values.map((value) => normalizeImportCellValue(value));
  const isEmpty = isImportRowEmpty(normalizedValues);
  return {
    id: buildImportRowId(sheetName, rowNumber),
    sheetName,
    rowNumber,
    values: normalizedValues,
    raw: isEmpty ? null : buildRawRow(headers, normalizedValues),
    isEmpty,
  };
}

function buildParsedSheet(
  name: string,
  matrix: ImportParsedCellValue[][],
  options: { treatFirstRowAsHeader: boolean }
): ImportParsedSheet {
  const nonEmptyMatrix = matrix.filter((row) => !isImportRowEmpty(row));
  let headers: string[] = [];
  let dataStartIndex = 0;

  if (options.treatFirstRowAsHeader && nonEmptyMatrix.length > 0) {
    const candidateHeader = nonEmptyMatrix[0].map((cell) =>
      normalizeImportCellValue(cell)
    );
    if (rowLooksLikeHeaderRow(candidateHeader)) {
      headers = candidateHeader.map((cell) => String(cell));
      dataStartIndex = 1;
    }
  }

  const dataRows = nonEmptyMatrix.slice(dataStartIndex);
  const rows = dataRows.map((row, index) =>
    buildParsedRow(name, index + 1, row, headers)
  );

  return {
    name,
    rowCount: rows.length,
    nonEmptyRowCount: rows.filter((row) => !row.isEmpty).length,
    headers,
    rows,
  };
}

function summarizeParseResult(
  fileName: string,
  fileKind: ImportFileKind,
  sheets: ImportParsedSheet[],
  warnings: string[]
): ImportParseResult {
  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);
  const totalNonEmptyRows = sheets.reduce(
    (sum, sheet) => sum + sheet.nonEmptyRowCount,
    0
  );

  if (sheets.length === 0) {
    warnings.push("The workbook contains no readable sheets.");
  }

  for (const sheet of sheets) {
    if (sheet.rowCount === 0) {
      warnings.push(`Sheet "${sheet.name}" is empty.`);
    }
  }

  if (totalRows === 0 && sheets.length > 0) {
    warnings.push("No data rows were found in the selected file.");
  }

  return {
    fileName: sanitizeFileName(fileName),
    fileKind,
    sheets,
    totalRows,
    totalNonEmptyRows,
    warnings,
  };
}

export function parseCsvText(text: string, fileName: string): ImportParseResult {
  const warnings: string[] = [];
  const matrix = parseCsvMatrix(text);
  const sheet = buildParsedSheet(DEFAULT_CSV_SHEET_NAME, matrix, {
    treatFirstRowAsHeader: true,
  });
  return summarizeParseResult(fileName, "csv", [sheet], warnings);
}

export function parseXlsxArrayBuffer(
  buffer: ArrayBuffer,
  fileName: string
): ImportParseResult {
  const warnings: string[] = [];

  const header = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (
    buffer.byteLength < 4 ||
    header[0] !== 0x50 ||
    header[1] !== 0x4b
  ) {
    throw new Error(
      "The selected workbook could not be read. It may be corrupt or unsupported."
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    throw new Error("The selected workbook could not be read. It may be corrupt or unsupported.");
  }

  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    return summarizeParseResult(fileName, "xlsx", [], [
      ...warnings,
      "The workbook contains no sheets.",
    ]);
  }

  const sheets = sheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      warnings.push(`Sheet "${sheetName}" could not be read.`);
      return {
        name: sheetName,
        rowCount: 0,
        nonEmptyRowCount: 0,
        headers: [],
        rows: [],
      };
    }

    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    }) as unknown[][];

    const matrix = rawMatrix.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => normalizeImportCellValue(cell))
    );

    return buildParsedSheet(sheetName, matrix, { treatFirstRowAsHeader: true });
  });

  return summarizeParseResult(fileName, "xlsx", sheets, warnings);
}

export async function parseImportFile(file: File): Promise<ImportParseOutcome> {
  const extension = getFileExtension(file.name);
  if (!extension || !isAllowedImportExtension(extension)) {
    return {
      ok: false,
      error: "Only .csv and .xlsx files can be imported.",
    };
  }

  const safeFileName = sanitizeFileName(file.name);

  try {
    if (extension === ".csv") {
      const text = await file.text();
      return { ok: true, result: parseCsvText(text, safeFileName) };
    }

    const buffer = await file.arrayBuffer();
    return { ok: true, result: parseXlsxArrayBuffer(buffer, safeFileName) };
  } catch (error) {
    const message =
      error instanceof Error
        ? sanitizeParseErrorMessage(error.message)
        : "The selected file could not be parsed.";
    return { ok: false, error: message };
  }
}

export function sanitizeParseErrorMessage(message: string): string {
  const withoutPaths = message
    .replace(/[A-Za-z]:\\[^\s"'<>|]+/g, "[path]")
    .replace(/\/(?:home|Users)\/[^\s"'<>|]+/g, "[path]");
  return withoutPaths.trim() || "The selected file could not be parsed.";
}

export function parseResultExposesLocalPath(result: ImportParseResult): boolean {
  return (
    result.fileName.includes("\\") ||
    result.fileName.includes("/") ||
    result.warnings.some((warning) => warning.includes("\\") || warning.includes(":/"))
  );
}

export function parseCsvMatrix(text: string): ImportParsedCellValue[][] {
  const rows: ImportParsedCellValue[][] = [];
  let row: ImportParsedCellValue[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.length === 0 ? null : field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    const hasContent = row.some((cell) => cell !== null && String(cell).trim() !== "");
    if (hasContent) {
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        const next = text[index + 1];
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushRow();
      continue;
    }

    if (char === "\r") {
      const next = text[index + 1];
      if (next === "\n") {
        index += 1;
      }
      pushRow();
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0 || inQuotes) {
    if (inQuotes) {
      pushField();
    }
    pushRow();
  }

  return rows;
}

export function extensionToFileKind(extension: ImportFileExtension): ImportFileKind {
  return extension === ".csv" ? "csv" : "xlsx";
}
