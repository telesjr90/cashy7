/**
 * RFC 4180-compatible CSV generation with formula-injection protection.
 * Pure helpers — DOM download is separated for testability.
 */

export const CSV_EXPORT_LINE_ENDING = "\r\n";

export const CSV_EXPORT_COLUMNS = [
  "section",
  "type",
  "date",
  "period",
  "title",
  "status",
  "category",
  "amount",
  "effect",
  "source",
  "notes",
  "warning",
  "privacy_scope",
] as const;

export type CsvExportColumn = (typeof CSV_EXPORT_COLUMNS)[number];
export type CsvExportRow = Record<CsvExportColumn, string>;

const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

const SIMPLE_NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

const CURRENCY_AMOUNT_PATTERN = /^[-−]?\s*(CA\$|[$€£¥])[\d,]+(\.\d{2})?$/;

const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function normalizeCellValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value);
}

/**
 * Prefix spreadsheet-dangerous text cells so Excel/LibreOffice/Sheets do not
 * interpret user-controlled labels as formulas.
 */
export function neutralizeCsvFormulaCell(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const firstChar = value[0];
  if (firstChar === "=" || firstChar === "+" || firstChar === "@" || firstChar === "\t" || firstChar === "\r") {
    return `'${value}`;
  }

  if (firstChar === "-") {
    if (SIMPLE_NUMERIC_PATTERN.test(trimmed)) {
      return value;
    }
    if (CURRENCY_AMOUNT_PATTERN.test(trimmed)) {
      return value;
    }
    return `'${value}`;
  }

  return value;
}

export function csvCellNeedsFormulaNeutralization(value: string): boolean {
  if (!value) {
    return false;
  }

  return neutralizeCsvFormulaCell(value) !== value;
}

function escapeCsvCell(value: unknown): string {
  let normalized = normalizeCellValue(value);
  normalized = neutralizeCsvFormulaCell(normalized);

  const needsQuoting =
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes("\r");

  if (!needsQuoting) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

export function rowsToCsv(
  rows: ReadonlyArray<Partial<CsvExportRow>>,
  options?: { includeBom?: boolean }
): string {
  const includeBom = options?.includeBom ?? true;
  const headerLine = CSV_EXPORT_COLUMNS.map((column) => escapeCsvCell(column)).join(",");
  const dataLines = rows.map((row) =>
    CSV_EXPORT_COLUMNS.map((column) => escapeCsvCell(row[column] ?? "")).join(",")
  );

  const body = [headerLine, ...dataLines].join(CSV_EXPORT_LINE_ENDING);
  return includeBom ? `\uFEFF${body}` : body;
}

export function sanitizeCsvFilename(filename: string): string {
  const sanitized = filename.replace(UNSAFE_FILENAME_CHARS, "").replace(/\s+/g, "-").trim();
  return sanitized || "cashflow-export.csv";
}

export function buildMonthlyReportCsvFilename(year: number, month: number): string {
  const monthPart = String(month).padStart(2, "0");
  return sanitizeCsvFilename(`cashflow-report-${year}-${monthPart}.csv`);
}

export function csvExportLabelsArePrivacySafe(labels: ReadonlyArray<string | null | undefined>): boolean {
  return labels.every((label) => !label || !UUID_PATTERN.test(label));
}

export function downloadCsvFile(filename: string, csvText: string): void {
  const safeFilename = sanitizeCsvFilename(filename);
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeFilename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function isFormulaLikePrefix(value: string): boolean {
  return FORMULA_PREFIX_PATTERN.test(value);
}
