import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseCsvText, parseXlsxArrayBuffer } from "./import-parser";
import {
  applyImportMappingSelection,
  applyMappingToRow,
  buildImportSourceColumns,
  buildMappedPreviewRows,
  buildRequiredFieldWarnings,
  clearImportFieldMapping,
  columnIndexToLabel,
  detectMappingConflicts,
  formatMappedCellValue,
  getImportFieldLabel,
  mappingUsesReadableLabels,
  resetImportColumnMapping,
  suggestImportColumnMapping,
} from "./import-column-mapping";

describe("import column mapping", () => {
  it("builds source column options from CSV headers", () => {
    const result = parseCsvText("month,amount,name\n2026-01,1200,Rent\n", "budget.csv");
    const sheet = result.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);

    expect(columns).toHaveLength(3);
    expect(columns[0]).toMatchObject({ id: "col:0", label: "month", index: 0 });
    expect(columns[1]).toMatchObject({ id: "col:1", label: "amount", index: 1 });
    expect(columns[2]).toMatchObject({ id: "col:2", label: "name", index: 2 });
  });

  it("builds source column options from XLSX sheet headers", () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["period", "category"],
      ["P1", "Utilities"],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bills");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const result = parseXlsxArrayBuffer(buffer, "workbook.xlsx");
    const sheet = result.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);

    expect(columns).toHaveLength(2);
    expect(columns[0]?.label).toBe("period");
    expect(columns[1]?.label).toBe("category");
  });

  it("falls back to Column A/B/C labels when no headers are present", () => {
    const result = parseCsvText("Rent,1200\nWater,45\n", "no-header.csv");
    const sheet = result.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);

    expect(sheet.headers).toEqual([]);
    expect(columns[0]?.label).toBe(columnIndexToLabel(0));
    expect(columns[1]?.label).toBe(columnIndexToLabel(1));
  });

  it("auto-detects common English headers", () => {
    const result = parseCsvText(
      "month,period,due date,name,amount,teles share,nicole share,category,notes\n",
      "english.csv"
    );
    const columns = buildImportSourceColumns(result.sheets[0]!);
    const mapping = suggestImportColumnMapping(columns);

    expect(mapping.month).toBe("col:0");
    expect(mapping.period).toBe("col:1");
    expect(mapping.dueDate).toBe("col:2");
    expect(mapping.name).toBe("col:3");
    expect(mapping.amount).toBe("col:4");
    expect(mapping.telesShare).toBe("col:5");
    expect(mapping.nicoleShare).toBe("col:6");
    expect(mapping.category).toBe("col:7");
    expect(mapping.notes).toBe("col:8");
  });

  it("auto-detects common Portuguese headers where listed", () => {
    const result = parseCsvText("mes,vencimento,categoria\n", "portuguese.csv");
    const columns = buildImportSourceColumns(result.sheets[0]!);
    const mapping = suggestImportColumnMapping(columns);

    expect(mapping.month).toBe("col:0");
    expect(mapping.dueDate).toBe("col:1");
    expect(mapping.category).toBe("col:2");
  });

  it("lets user mapping override suggested mapping", () => {
    const result = parseCsvText("month,amount\n2026-01,100\n", "override.csv");
    const columns = buildImportSourceColumns(result.sheets[0]!);
    const suggested = suggestImportColumnMapping(columns);

    const overridden = applyImportMappingSelection(suggested, "amount", "col:0");

    expect(overridden.amount).toBe("col:0");
    expect(overridden.month).toBeUndefined();
  });

  it("clears one mapping field", () => {
    const mapping = { month: "col:0", amount: "col:1" };
    const cleared = clearImportFieldMapping(mapping, "month");

    expect(cleared.month).toBeUndefined();
    expect(cleared.amount).toBe("col:1");
  });

  it("resets mapping to empty or suggested state", () => {
    const result = parseCsvText("month,amount\n", "reset.csv");
    const columns = buildImportSourceColumns(result.sheets[0]!);

    expect(resetImportColumnMapping(columns, "empty")).toEqual({});
    expect(resetImportColumnMapping(columns, "suggested")).toMatchObject({
      month: "col:0",
      amount: "col:1",
    });
  });

  it("prevents duplicate source-column mapping conflicts", () => {
    const mapping = applyImportMappingSelection(
      { month: "col:0" },
      "amount",
      "col:0"
    );

    expect(mapping.month).toBeUndefined();
    expect(mapping.amount).toBe("col:0");
    expect(detectMappingConflicts(mapping)).toEqual([]);
  });

  it("detects duplicate source-column mapping conflicts when present", () => {
    const conflicts = detectMappingConflicts({
      month: "col:0",
      amount: "col:0",
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.sourceColumnId).toBe("col:0");
    expect(conflicts[0]?.fields).toEqual(expect.arrayContaining(["month", "amount"]));
  });

  it("includes source row number in mapped preview rows", () => {
    const result = parseCsvText("month,amount\n2026-01,1200\n2026-02,900\n", "rows.csv");
    const sheet = result.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);
    const mapping = suggestImportColumnMapping(columns);
    const preview = buildMappedPreviewRows(sheet, mapping, columns, 2);

    expect(preview[0]?.sourceRowNumber).toBe(1);
    expect(preview[1]?.sourceRowNumber).toBe(2);
  });

  it("includes mapped core fields in preview rows", () => {
    const result = parseCsvText(
      "month,period,name,amount,teles share,nicole share,category\n2026-01,P1,Rent,1200,600,600,Home\n",
      "mapped.csv"
    );
    const sheet = result.sheets[0]!;
    const columns = buildImportSourceColumns(sheet);
    const mapping = suggestImportColumnMapping(columns);
    const preview = buildMappedPreviewRows(sheet, mapping, columns, 1)[0]!;

    expect(preview.fields.month).toBe("2026-01");
    expect(preview.fields.period).toBe("P1");
    expect(preview.fields.name).toBe("Rent");
    expect(preview.fields.amount).toBe("1200");
    expect(preview.fields.telesShare).toBe("600");
    expect(preview.fields.nicoleShare).toBe("600");
    expect(preview.fields.category).toBe("Home");
  });

  it("keeps optional unmapped fields null", () => {
    const result = parseCsvText("month,amount\n2026-01,100\n", "optional.csv");
    const sheet = result.sheets[0]!;
    const row = sheet.rows[0]!;
    const columns = buildImportSourceColumns(sheet);
    const mapping = suggestImportColumnMapping(columns);
    const fields = applyMappingToRow(row, mapping, columns);

    expect(fields.notes).toBeNull();
    expect(fields.billMarker).toBeNull();
    expect(formatMappedCellValue(fields.notes)).toBe("—");
  });

  it("produces required-field warnings for missing core fields", () => {
    const warnings = buildRequiredFieldWarnings({ month: "col:0" });

    expect(warnings).toContain(`${getImportFieldLabel("period")} is not mapped yet.`);
    expect(warnings).toContain(`${getImportFieldLabel("dueDate")} is not mapped yet.`);
    expect(warnings).toContain(`${getImportFieldLabel("name")} is not mapped yet.`);
    expect(warnings).toContain(`${getImportFieldLabel("amount")} is not mapped yet.`);
    expect(warnings.some((warning) => warning.includes("month"))).toBe(false);
  });

  it("uses readable field labels without raw UUIDs", () => {
    const mapping = {
      month: "col:0",
      amount: "col:1",
    };

    expect(mappingUsesReadableLabels(mapping)).toBe(true);
    expect(getImportFieldLabel("month")).toBe("Month");
    expect(getImportFieldLabel("amount")).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
