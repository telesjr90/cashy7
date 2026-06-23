import type { ImportParsedCellValue, ImportParsedRow, ImportParsedSheet } from "@/lib/import-parser";
import {
  applyMappingToRow,
  buildImportSourceColumns,
  getImportFieldLabel,
  type ImportColumnMapping,
  type ImportFieldKey,
  type ImportSourceColumn,
} from "@/lib/import-column-mapping";
import type { PeriodBucket } from "@/lib/periods";

export type ImportRowValidationSeverity = "error" | "warning" | "info";

export type ImportRowValidationIssue = {
  field: string;
  severity: ImportRowValidationSeverity;
  message: string;
};

export type ImportRowValidationStatus = "valid" | "warning" | "error" | "skipped";

export type ImportValidatedRowType =
  | "bill"
  | "debt"
  | "expense"
  | "savings"
  | "unknown"
  | "ambiguous";

export type ImportValidatedRow = {
  rowId: string;
  sheetName: string;
  rowNumber: number;
  status: ImportRowValidationStatus;
  rowType: ImportValidatedRowType;
  mappedValues: Record<string, string | number | boolean | null>;
  issues: ImportRowValidationIssue[];
};

export type ImportValidationSummary = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  skippedRows: number;
  canContinue: boolean;
};

export type ImportValidationFilter = "all" | "errors" | "warnings" | "valid" | "skipped";

export type ImportMappingLevelIssue = {
  field: string;
  severity: ImportRowValidationSeverity;
  message: string;
};

export type ImportValidationResult = {
  rows: ImportValidatedRow[];
  summary: ImportValidationSummary;
  mappingIssues: ImportMappingLevelIssue[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FILE_PATH_PATTERN = /(?:[A-Za-z]:\\|\\\\|\/(?:Users|home|tmp|var)\/)/;

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MARKER_FIELDS: ImportFieldKey[] = [
  "billMarker",
  "debtMarker",
  "expenseMarker",
  "savingsMarker",
];

function markerFieldToRowType(
  field: (typeof MARKER_FIELDS)[number]
): Exclude<ImportValidatedRowType, "unknown" | "ambiguous"> {
  switch (field) {
    case "billMarker":
      return "bill";
    case "debtMarker":
      return "debt";
    case "expenseMarker":
      return "expense";
    case "savingsMarker":
      return "savings";
    default:
      return "bill";
  }
}

const SHARE_RECONCILE_TOLERANCE = 0.01;

export function sanitizeImportDisplayText(text: string): string {
  if (UUID_PATTERN.test(text.trim())) {
    return "(hidden id)";
  }
  if (FILE_PATH_PATTERN.test(text)) {
    const segments = text.replace(/\\/g, "/").split("/");
    const fileName = segments[segments.length - 1] ?? text;
    return fileName.length > 0 ? fileName : "(file)";
  }
  return text;
}

export function issueMessageIsUserSafe(message: string): boolean {
  return !UUID_PATTERN.test(message) && !FILE_PATH_PATTERN.test(message);
}

export function normalizeMappedScalar(
  value: ImportParsedCellValue
): string | number | boolean | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mappedFieldsToRecord(
  fields: Record<ImportFieldKey, ImportParsedCellValue>
): Record<string, string | number | boolean | null> {
  const record: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    record[key] = normalizeMappedScalar(value);
  }
  return record;
}

export function isTruthyMarker(value: ImportParsedCellValue): boolean {
  if (value === null) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return !["no", "n", "false", "0", "none"].includes(normalized);
}

export function inferRowType(
  fields: Record<ImportFieldKey, ImportParsedCellValue>
): ImportValidatedRowType {
  const activeMarkers = MARKER_FIELDS.filter((field) => isTruthyMarker(fields[field]));

  if (activeMarkers.length > 1) {
    return "ambiguous";
  }
  if (activeMarkers.length === 1) {
    return markerFieldToRowType(activeMarkers[0]!);
  }
  return "unknown";
}

export type ParsedMonth = {
  year: number;
  month: number;
  normalized: string;
};

export function parseImportMonth(value: ImportParsedCellValue): ParsedMonth | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const asString = String(Math.trunc(value));
    if (/^\d{6}$/.test(asString)) {
      const year = Number.parseInt(asString.slice(0, 4), 10);
      const month = Number.parseInt(asString.slice(4, 6), 10);
      if (month >= 1 && month <= 12) {
        return { year, month, normalized: `${year}-${String(month).padStart(2, "0")}` };
      }
    }
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1]!, 10);
    const month = Number.parseInt(isoMatch[2]!, 10);
    if (month >= 1 && month <= 12) {
      return { year, month, normalized: `${year}-${String(month).padStart(2, "0")}` };
    }
    return null;
  }

  const namedMatch = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (namedMatch) {
    const month = MONTH_NAMES[namedMatch[1]!.toLowerCase()];
    const year = Number.parseInt(namedMatch[2]!, 10);
    if (month && year >= 1900 && year <= 2100) {
      return { year, month, normalized: `${year}-${String(month).padStart(2, "0")}` };
    }
    return null;
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1]!, 10);
    const year = Number.parseInt(slashMatch[2]!, 10);
    if (month >= 1 && month <= 12) {
      return { year, month, normalized: `${year}-${String(month).padStart(2, "0")}` };
    }
  }

  return null;
}

export function parseImportDate(value: ImportParsedCellValue): Date | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 86_400_000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function normalizeImportPeriod(value: ImportParsedCellValue): PeriodBucket | null {
  if (value === null) {
    return null;
  }

  const text = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) {
    return null;
  }

  if (text === "1_14" || text === "1-14" || text === "1 14") {
    return "1_14";
  }
  if (text === "15_eom" || text === "15-eom") {
    return "15_eom";
  }

  if (
    /^1(st)?(\s*[-–]\s*)?14(th)?$/.test(text) ||
    /^1st\s*-\s*14th$/.test(text) ||
    text.includes("1st") && text.includes("14") ||
    text === "p1" ||
    text === "first half" ||
    text === "first period"
  ) {
    return "1_14";
  }

  if (
    /^15(th)?(\s*[-–]\s*)?(eom|end)$/.test(text) ||
    text.includes("15") && (text.includes("eom") || text.includes("end")) ||
    text === "p2" ||
    text === "second half" ||
    text === "second period"
  ) {
    return "15_eom";
  }

  return null;
}

export function parseImportAmount(value: ImportParsedCellValue): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return null;
  }

  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasMappedAmount(fields: Record<ImportFieldKey, ImportParsedCellValue>): boolean {
  return (
    parseImportAmount(fields.amount) !== null ||
    parseImportAmount(fields.telesShare) !== null ||
    parseImportAmount(fields.nicoleShare) !== null
  );
}

function hasMappedDateContext(fields: Record<ImportFieldKey, ImportParsedCellValue>): boolean {
  return (
    parseImportDate(fields.dueDate) !== null ||
    parseImportMonth(fields.month) !== null
  );
}

function addIssue(
  issues: ImportRowValidationIssue[],
  field: ImportFieldKey | "rowType" | "mapping",
  severity: ImportRowValidationSeverity,
  message: string
): void {
  issues.push({
    field,
    severity,
    message: sanitizeImportDisplayText(message),
  });
}

function deriveRowStatus(issues: ImportRowValidationIssue[]): ImportRowValidationStatus {
  if (issues.some((issue) => issue.severity === "error")) {
    return "error";
  }
  if (issues.some((issue) => issue.severity === "warning")) {
    return "warning";
  }
  return "valid";
}

export function validateMappingLevel(
  mapping: ImportColumnMapping
): ImportMappingLevelIssue[] {
  const issues: ImportMappingLevelIssue[] = [];

  if (!mapping.name) {
    issues.push({
      field: "name",
      severity: "error",
      message: `${getImportFieldLabel("name")} is not mapped. Row names cannot be validated.`,
    });
  }

  const hasAmount = Boolean(mapping.amount);
  const hasShares = Boolean(mapping.telesShare) || Boolean(mapping.nicoleShare);
  if (!hasAmount && !hasShares) {
    issues.push({
      field: "amount",
      severity: "error",
      message:
        "Map Amount or at least one share column so amounts can be validated.",
    });
  }

  if (!mapping.dueDate && !mapping.month) {
    issues.push({
      field: "dueDate",
      severity: "warning",
      message:
        "Map Due date or Month so date and period checks can run on each row.",
    });
  }

  const hasTypeMarker = MARKER_FIELDS.some((field) => Boolean(mapping[field]));
  if (!hasTypeMarker) {
    issues.push({
      field: "billMarker",
      severity: "warning",
      message:
        "No type marker column is mapped. Rows without markers will be treated as unknown type.",
    });
  }

  return issues;
}

function validateCommonFields(
  fields: Record<ImportFieldKey, ImportParsedCellValue>,
  issues: ImportRowValidationIssue[]
): void {
  const name = fields.name;
  const nameText =
    name === null ? "" : typeof name === "string" ? name.trim() : String(name).trim();
  if (!nameText) {
    addIssue(issues, "name", "error", "Name or description is required.");
  } else if (UUID_PATTERN.test(nameText)) {
    addIssue(issues, "name", "error", "Name looks like a hidden id, not a readable label.");
  }

  const amount = parseImportAmount(fields.amount);
  if (fields.amount !== null && amount === null) {
    addIssue(issues, "amount", "error", "Amount must be a valid number.");
  } else if (amount !== null && amount < 0) {
    addIssue(issues, "amount", "error", "Amount cannot be negative.");
  }

  const teles = parseImportAmount(fields.telesShare);
  if (fields.telesShare !== null && teles === null) {
    addIssue(issues, "telesShare", "error", "Teles share must be a valid number.");
  } else if (teles !== null && teles < 0) {
    addIssue(issues, "telesShare", "error", "Teles share cannot be negative.");
  }

  const nicole = parseImportAmount(fields.nicoleShare);
  if (fields.nicoleShare !== null && nicole === null) {
    addIssue(issues, "nicoleShare", "error", "Nicole share must be a valid number.");
  } else if (nicole !== null && nicole < 0) {
    addIssue(issues, "nicoleShare", "error", "Nicole share cannot be negative.");
  }

  if (amount !== null && teles !== null && nicole !== null) {
    const delta = Math.abs(amount - (teles + nicole));
    if (delta > SHARE_RECONCILE_TOLERANCE) {
      addIssue(
        issues,
        "amount",
        "error",
        "Amount does not match Teles share plus Nicole share within one cent."
      );
    }
  }

  if (fields.category !== null) {
    const category =
      typeof fields.category === "string"
        ? fields.category.trim()
        : String(fields.category).trim();
    if (!category) {
      addIssue(issues, "category", "info", "Category is empty.");
    }
  }

  if (fields.notes !== null) {
    const notes =
      typeof fields.notes === "string" ? fields.notes.trim() : String(fields.notes).trim();
    if (!notes) {
      addIssue(issues, "notes", "info", "Notes are empty.");
    }
  }
}

function validateDateMonthPeriod(
  fields: Record<ImportFieldKey, ImportParsedCellValue>,
  issues: ImportRowValidationIssue[],
  requirePeriod: boolean
): void {
  const dueDate = parseImportDate(fields.dueDate);
  if (fields.dueDate !== null && dueDate === null) {
    addIssue(issues, "dueDate", "error", "Due date is not a recognizable date.");
  }

  const month = parseImportMonth(fields.month);
  if (fields.month !== null && month === null) {
    addIssue(issues, "month", "error", "Month is not a recognizable month value.");
  }

  const period = normalizeImportPeriod(fields.period);
  if (fields.period !== null && period === null) {
    addIssue(
      issues,
      "period",
      requirePeriod ? "error" : "warning",
      "Pay period is not a recognized app bucket (1st–14th or 15th–EOM)."
    );
  }

  if (!dueDate && !month) {
    addIssue(
      issues,
      "dueDate",
      "error",
      "A due date or month is required for this row type."
    );
  }
}

function validateBillRow(
  fields: Record<ImportFieldKey, ImportParsedCellValue>,
  issues: ImportRowValidationIssue[]
): void {
  validateDateMonthPeriod(fields, issues, true);

  const dueDate = parseImportDate(fields.dueDate);
  const month = parseImportMonth(fields.month);
  const period = normalizeImportPeriod(fields.period);
  if (!dueDate && month && !period) {
    addIssue(
      issues,
      "period",
      "error",
      "Bill rows with Month also need a mapped Pay period."
    );
  }

  if (!hasMappedAmount(fields)) {
    addIssue(issues, "amount", "error", "Bill rows need Amount or share columns filled in.");
  }

  if (fields.variableMarker !== null && !isTruthyMarker(fields.variableMarker)) {
    const text = String(fields.variableMarker).trim().toLowerCase();
    if (text && !["fixed", "no", "false", "0"].includes(text)) {
      addIssue(
        issues,
        "variableMarker",
        "warning",
        "Variable marker value is not recognized; treated as informational only."
      );
    }
  }

  if (fields.paidStatus !== null) {
    const text = String(fields.paidStatus).trim().toLowerCase();
    if (text && !["paid", "unpaid", "yes", "no", "true", "false", "1", "0"].includes(text)) {
      addIssue(
        issues,
        "paidStatus",
        "warning",
        "Paid status value is not recognized; import will decide later."
      );
    }
  }
}

function validateDebtRow(
  fields: Record<ImportFieldKey, ImportParsedCellValue>,
  issues: ImportRowValidationIssue[]
): void {
  validateDateMonthPeriod(fields, issues, true);

  if (!hasMappedAmount(fields)) {
    addIssue(issues, "amount", "error", "Debt payment rows need Amount or share columns filled in.");
  }

  if (!isTruthyMarker(fields.debtMarker)) {
    addIssue(issues, "debtMarker", "error", "Debt marker must be set for debt rows.");
  }
}

function validateExpenseRow(
  fields: Record<ImportFieldKey, ImportParsedCellValue>,
  issues: ImportRowValidationIssue[]
): void {
  validateDateMonthPeriod(fields, issues, true);

  const amount = parseImportAmount(fields.amount);
  if (amount === null) {
    addIssue(issues, "amount", "error", "Expense rows require a valid Amount.");
  }

  if (!isTruthyMarker(fields.expenseMarker)) {
    addIssue(issues, "expenseMarker", "error", "Expense marker must be set for expense rows.");
  }
}

function validateSavingsRow(
  fields: Record<ImportFieldKey, ImportParsedCellValue>,
  issues: ImportRowValidationIssue[]
): void {
  validateDateMonthPeriod(fields, issues, true);

  const amount = parseImportAmount(fields.amount);
  if (amount === null) {
    addIssue(
      issues,
      "amount",
      "error",
      "Savings rows require a valid contribution or target Amount."
    );
  }

  if (!isTruthyMarker(fields.savingsMarker)) {
    addIssue(issues, "savingsMarker", "error", "Savings marker must be set for savings rows.");
  }
}

function validateUnknownRow(issues: ImportRowValidationIssue[]): void {
  addIssue(
    issues,
    "rowType",
    "error",
    "Row type is unknown. Map a single bill, debt, expense, or savings marker."
  );
}

function validateAmbiguousRow(issues: ImportRowValidationIssue[]): void {
  addIssue(
    issues,
    "rowType",
    "error",
    "Multiple type markers are set. Each row must map to one import type."
  );
}

export function validateMappedRow(
  row: ImportParsedRow,
  fields: Record<ImportFieldKey, ImportParsedCellValue>
): ImportValidatedRow {
  if (row.isEmpty) {
    return {
      rowId: row.id,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      status: "skipped",
      rowType: "unknown",
      mappedValues: mappedFieldsToRecord(fields),
      issues: [],
    };
  }

  const issues: ImportRowValidationIssue[] = [];
  const rowType = inferRowType(fields);

  if (rowType === "ambiguous") {
    validateAmbiguousRow(issues);
    validateCommonFields(fields, issues);
  } else if (rowType === "unknown") {
    validateUnknownRow(issues);
    validateCommonFields(fields, issues);
  } else {
    validateCommonFields(fields, issues);

    if (rowType === "bill") {
      validateBillRow(fields, issues);
    } else if (rowType === "debt") {
      validateDebtRow(fields, issues);
      if (
        isTruthyMarker(fields.billMarker) ||
        isTruthyMarker(fields.expenseMarker) ||
        isTruthyMarker(fields.savingsMarker)
      ) {
        addIssue(
          issues,
          "rowType",
          "error",
          "Debt row is also marked as another import type."
        );
      }
    } else if (rowType === "expense") {
      validateExpenseRow(fields, issues);
      if (
        isTruthyMarker(fields.billMarker) ||
        isTruthyMarker(fields.debtMarker) ||
        isTruthyMarker(fields.savingsMarker)
      ) {
        addIssue(
          issues,
          "rowType",
          "error",
          "Expense row is also marked as another import type."
        );
      }
    } else if (rowType === "savings") {
      validateSavingsRow(fields, issues);
      if (
        isTruthyMarker(fields.billMarker) ||
        isTruthyMarker(fields.debtMarker) ||
        isTruthyMarker(fields.expenseMarker)
      ) {
        addIssue(
          issues,
          "rowType",
          "error",
          "Savings row is also marked as another import type."
        );
      }
    }
  }

  return {
    rowId: row.id,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    status: deriveRowStatus(issues),
    rowType,
    mappedValues: mappedFieldsToRecord(fields),
    issues,
  };
}

export function buildValidationSummary(rows: ImportValidatedRow[]): ImportValidationSummary {
  let validRows = 0;
  let warningRows = 0;
  let errorRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    switch (row.status) {
      case "valid":
        validRows += 1;
        break;
      case "warning":
        warningRows += 1;
        break;
      case "error":
        errorRows += 1;
        break;
      case "skipped":
        skippedRows += 1;
        break;
      default:
        break;
    }
  }

  return {
    totalRows: rows.length,
    validRows,
    warningRows,
    errorRows,
    skippedRows,
    canContinue: errorRows === 0,
  };
}

export function filterValidatedRows(
  rows: ImportValidatedRow[],
  filter: ImportValidationFilter
): ImportValidatedRow[] {
  if (filter === "all") {
    return rows;
  }
  if (filter === "errors") {
    return rows.filter((row) => row.status === "error");
  }
  if (filter === "warnings") {
    return rows.filter((row) => row.status === "warning");
  }
  if (filter === "valid") {
    return rows.filter((row) => row.status === "valid");
  }
  return rows.filter((row) => row.status === "skipped");
}

export function buildImportValidationResult(
  sheet: ImportParsedSheet,
  mapping: ImportColumnMapping,
  columns: ImportSourceColumn[] = buildImportSourceColumns(sheet)
): ImportValidationResult {
  const rows = sheet.rows.map((row) =>
    validateMappedRow(row, applyMappingToRow(row, mapping, columns))
  );

  return {
    rows,
    summary: buildValidationSummary(rows),
    mappingIssues: validateMappingLevel(mapping),
  };
}

export function formatValidatedRowType(rowType: ImportValidatedRowType): string {
  switch (rowType) {
    case "bill":
      return "Bill";
    case "debt":
      return "Debt";
    case "expense":
      return "Expense";
    case "savings":
      return "Savings";
    case "ambiguous":
      return "Ambiguous";
    default:
      return "Unknown";
  }
}

export function formatValidationStatusLabel(status: ImportRowValidationStatus): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}

export function summarizeRowIssues(row: ImportValidatedRow): string {
  if (row.issues.length === 0) {
    return row.status === "skipped" ? "Empty row skipped" : "No issues";
  }
  const errors = row.issues.filter((issue) => issue.severity === "error").length;
  const warnings = row.issues.filter((issue) => issue.severity === "warning").length;
  const parts: string[] = [];
  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    return row.issues.map((issue) => issue.message).join("; ");
  }
  return parts.join(", ");
}

export function getValidationPreviewFields(
  row: ImportValidatedRow
): { label: string; value: string }[] {
  const priority = ["name", "amount", "dueDate", "month", "period"];
  const fields: { label: string; value: string }[] = [];

  for (const key of priority) {
    const value = row.mappedValues[key];
    if (value === null || value === undefined || value === "") {
      continue;
    }
    fields.push({
      label: getImportFieldLabel(key as ImportFieldKey),
      value: sanitizeImportDisplayText(String(value)),
    });
  }

  return fields.slice(0, 4);
}

export function rowHasDateContext(fields: Record<ImportFieldKey, ImportParsedCellValue>): boolean {
  return hasMappedDateContext(fields);
}
