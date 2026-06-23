import { describe, expect, it } from "vitest";
import {
  applyMappingToRow,
  buildImportSourceColumns,
  resetImportColumnMapping,
  createEmptyMappedFields,
  type ImportFieldKey,
} from "./import-column-mapping";
import { parseCsvText, type ImportParsedRow } from "./import-parser";
import {
  buildImportValidationResult,
  buildValidationSummary,
  filterValidatedRows,
  inferRowType,
  isTruthyMarker,
  issueMessageIsUserSafe,
  normalizeImportPeriod,
  parseImportAmount,
  parseImportDate,
  parseImportMonth,
  sanitizeImportDisplayText,
  validateMappedRow,
  validateMappingLevel,
} from "./import-validation";

function makeFields(
  overrides: Partial<Record<ImportFieldKey, string | number | boolean | null>>
): Record<ImportFieldKey, string | number | boolean | null> {
  const fields = createEmptyMappedFields();
  for (const [key, value] of Object.entries(overrides)) {
    fields[key as ImportFieldKey] = value;
  }
  return fields;
}

function makeRow(overrides: Partial<ImportParsedRow> = {}): ImportParsedRow {
  return {
    id: "csv:2",
    sheetName: "CSV",
    rowNumber: 2,
    values: [],
    raw: null,
    isEmpty: false,
    ...overrides,
  };
}

describe("import validation", () => {
  it("validates a valid bill row", () => {
    const fields = makeFields({
      billMarker: "yes",
      name: "Rent",
      amount: 1200,
      dueDate: "2026-06-15",
      period: "1st - 14th",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("valid");
    expect(result.rowType).toBe("bill");
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("validates a valid debt row", () => {
    const fields = makeFields({
      debtMarker: true,
      name: "Visa",
      amount: 250,
      dueDate: "2026-06-20",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("valid");
    expect(result.rowType).toBe("debt");
  });

  it("validates a valid expense row", () => {
    const fields = makeFields({
      expenseMarker: "x",
      name: "Groceries",
      amount: 85.5,
      month: "June 2026",
      period: "15th - EOM",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("valid");
    expect(result.rowType).toBe("expense");
  });

  it("validates a valid savings row", () => {
    const fields = makeFields({
      savingsMarker: 1,
      name: "Emergency fund",
      amount: 200,
      month: "2026-06",
      period: "1-14",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("valid");
    expect(result.rowType).toBe("savings");
  });

  it("flags unknown row type when no marker is present", () => {
    const fields = makeFields({
      name: "Mystery row",
      amount: 10,
      dueDate: "2026-06-01",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.rowType).toBe("unknown");
    expect(result.status).toBe("error");
    expect(result.issues.some((issue) => issue.field === "rowType")).toBe(true);
  });

  it("flags ambiguous row type when multiple markers are set", () => {
    const fields = makeFields({
      billMarker: "yes",
      expenseMarker: "yes",
      name: "Overlap",
      amount: 10,
      dueDate: "2026-06-01",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.rowType).toBe("ambiguous");
    expect(result.status).toBe("error");
  });

  it("flags missing required name/description", () => {
    const fields = makeFields({
      billMarker: "yes",
      name: "",
      amount: 100,
      dueDate: "2026-06-01",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("error");
    expect(result.issues.some((issue) => issue.message.includes("Name or description"))).toBe(
      true
    );
  });

  it("flags invalid amount", () => {
    const fields = makeFields({
      billMarker: "yes",
      name: "Rent",
      amount: "not-a-number",
      dueDate: "2026-06-01",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("error");
    expect(result.issues.some((issue) => issue.field === "amount")).toBe(true);
  });

  it("flags negative amount where not allowed", () => {
    const fields = makeFields({
      expenseMarker: "yes",
      name: "Refund?",
      amount: -20,
      dueDate: "2026-06-01",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("error");
    expect(result.issues.some((issue) => issue.message.includes("negative"))).toBe(true);
  });

  it("flags shares that do not reconcile to total", () => {
    const fields = makeFields({
      billMarker: "yes",
      name: "Rent",
      amount: 100,
      telesShare: 40,
      nicoleShare: 50,
      dueDate: "2026-06-01",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("error");
    expect(result.issues.some((issue) => issue.message.includes("one cent"))).toBe(true);
  });

  it("accepts shares that reconcile to total", () => {
    const fields = makeFields({
      billMarker: "yes",
      name: "Rent",
      amount: 100,
      telesShare: 51,
      nicoleShare: 49,
      dueDate: "2026-06-01",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("valid");
  });

  it("normalizes valid period labels to app buckets", () => {
    expect(normalizeImportPeriod("1st - 14th")).toBe("1_14");
    expect(normalizeImportPeriod("15th - EOM")).toBe("15_eom");
    expect(normalizeImportPeriod("1-14")).toBe("1_14");
    expect(normalizeImportPeriod("15-end")).toBe("15_eom");
  });

  it("reports unknown period issue on bill rows", () => {
    const fields = makeFields({
      billMarker: "yes",
      name: "Rent",
      amount: 100,
      month: "2026-06",
      period: "mid-month",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.status).toBe("error");
    expect(result.issues.some((issue) => issue.field === "period")).toBe(true);
  });

  it("parses valid date strings", () => {
    expect(parseImportDate("2026-06-15")?.getFullYear()).toBe(2026);
    expect(parseImportDate("6/15/2026")?.getMonth()).toBe(5);
  });

  it("reports invalid date issue", () => {
    const fields = makeFields({
      billMarker: "yes",
      name: "Rent",
      amount: 100,
      dueDate: "not-a-date",
    });

    const result = validateMappedRow(makeRow(), fields);

    expect(result.issues.some((issue) => issue.field === "dueDate")).toBe(true);
  });

  it("parses valid month formats", () => {
    expect(parseImportMonth("2026-06")).toEqual({
      year: 2026,
      month: 6,
      normalized: "2026-06",
    });
    expect(parseImportMonth("June 2026")?.month).toBe(6);
    expect(parseImportMonth("Jun 2026")?.month).toBe(6);
  });

  it("skips empty rows", () => {
    const fields = makeFields({ name: "", amount: null });
    const result = validateMappedRow(makeRow({ isEmpty: true }), fields);

    expect(result.status).toBe("skipped");
    expect(result.issues).toHaveLength(0);
  });

  it("builds validation summary counts", () => {
    const summary = buildValidationSummary([
      {
        rowId: "a",
        sheetName: "CSV",
        rowNumber: 1,
        status: "valid",
        rowType: "bill",
        mappedValues: {},
        issues: [],
      },
      {
        rowId: "b",
        sheetName: "CSV",
        rowNumber: 2,
        status: "warning",
        rowType: "bill",
        mappedValues: {},
        issues: [{ field: "paidStatus", severity: "warning", message: "warn" }],
      },
      {
        rowId: "c",
        sheetName: "CSV",
        rowNumber: 3,
        status: "error",
        rowType: "unknown",
        mappedValues: {},
        issues: [{ field: "rowType", severity: "error", message: "err" }],
      },
      {
        rowId: "d",
        sheetName: "CSV",
        rowNumber: 4,
        status: "skipped",
        rowType: "unknown",
        mappedValues: {},
        issues: [],
      },
    ]);

    expect(summary).toEqual({
      totalRows: 4,
      validRows: 1,
      warningRows: 1,
      errorRows: 1,
      skippedRows: 1,
      canContinue: false,
    });
  });

  it("filters validation rows by status", () => {
    const rows = [
      { status: "valid" },
      { status: "error" },
      { status: "warning" },
      { status: "skipped" },
    ] as Parameters<typeof filterValidatedRows>[0];

    expect(filterValidatedRows(rows, "errors")).toHaveLength(1);
    expect(filterValidatedRows(rows, "warnings")).toHaveLength(1);
    expect(filterValidatedRows(rows, "valid")).toHaveLength(1);
    expect(filterValidatedRows(rows, "skipped")).toHaveLength(1);
    expect(filterValidatedRows(rows, "all")).toHaveLength(4);
  });

  it("keeps issue labels free of raw UUIDs and file paths", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const sanitized = sanitizeImportDisplayText(uuid);
    expect(sanitized).toBe("(hidden id)");
    expect(issueMessageIsUserSafe(sanitized)).toBe(true);
    expect(
      issueMessageIsUserSafe("C:\\Users\\secret\\budget.csv has a problem")
    ).toBe(false);
  });

  it("infers row type from markers", () => {
    expect(inferRowType(makeFields({ billMarker: "yes" }))).toBe("bill");
    expect(inferRowType(makeFields({ debtMarker: true }))).toBe("debt");
    expect(inferRowType(makeFields({}))).toBe("unknown");
    expect(inferRowType(makeFields({ billMarker: "yes", debtMarker: "1" }))).toBe(
      "ambiguous"
    );
  });

  it("parses currency-like amounts", () => {
    expect(parseImportAmount("$1,200.50")).toBe(1200.5);
  });

  it("validates mapping-level required fields", () => {
    const issues = validateMappingLevel({});
    expect(issues.some((issue) => issue.field === "name")).toBe(true);
    expect(issues.some((issue) => issue.field === "amount")).toBe(true);
  });

  it("builds sheet validation from mapped CSV rows", () => {
    const csv = [
      "bill,name,amount,due date",
      "yes,Rent,1200,2026-06-01",
      "yes,,100,2026-06-02",
    ].join("\n");
    const parsed = parseCsvText(csv, "bills.csv");
    const sheet = parsed.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);
    const mapping = {
      billMarker: "col:0",
      name: "col:1",
      amount: "col:2",
      dueDate: "col:3",
    };

    const result = buildImportValidationResult(sheet, mapping, columns);

    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.validRows).toBe(1);
    expect(result.summary.errorRows).toBe(1);
    expect(result.summary.skippedRows).toBe(0);
  });

  it("treats marker helper truthy values consistently", () => {
    expect(isTruthyMarker("yes")).toBe(true);
    expect(isTruthyMarker("no")).toBe(false);
    expect(isTruthyMarker(0)).toBe(false);
  });

  it("maps row fields through applyMappingToRow for validation", () => {
    const parsed = parseCsvText("bill,name,amount\nyes,Water,45\n", "one.csv");
    const sheet = parsed.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);
    const row = sheet.rows[0]!;
    const mapping = {
      billMarker: "col:0",
      name: "col:1",
      amount: "col:2",
      dueDate: "col:3",
    };
    const fields = applyMappingToRow(row, mapping, columns);
    const validated = validateMappedRow(row, fields);

    expect(validated.rowType).toBe("bill");
    expect(validated.status).toBe("error");
    expect(fields.name).toBe("Water");
  });

  it("validates smoke import CSV without error rows", () => {
    const text = `bill,debt,expense,savings,recurring,name,amount,due date,period,category
yes,,,,,Rent,1200,2026-06-15,15_eom,
,yes,,,,Visa,250,2026-06-20,1_14,
,,yes,,,Groceries,45.50,2026-06-03,1_14,
,,,yes,,Emergency fund,100,2026-06-05,1_14,Emergency fund
`;
    const parsed = parseCsvText(text, "import-apply.csv");
    const sheet = parsed.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);
    const mapping = resetImportColumnMapping(columns, "suggested");
    const result = buildImportValidationResult(sheet, mapping, columns);

    expect(result.summary.errorRows).toBe(0);
    expect(result.summary.canContinue).toBe(true);
  });
});
