import { describe, expect, it } from "vitest";
import {
  buildMonthlyReportCsvFilename,
  CSV_EXPORT_LINE_ENDING,
  csvCellNeedsFormulaNeutralization,
  csvExportLabelsArePrivacySafe,
  neutralizeCsvFormulaCell,
  rowsToCsv,
  sanitizeCsvFilename,
} from "@/lib/csv-export";

describe("rowsToCsv", () => {
  it("exports simple row headers and values", () => {
    const csv = rowsToCsv(
      [{ section: "bills", type: "bill", title: "Internet" }],
      { includeBom: false }
    );

    expect(csv).toBe(
      ["section,type,date,period,title,status,category,amount,effect,source,notes,warning,privacy_scope", "bills,bill,,,Internet,,,,,,,,"].join(
        CSV_EXPORT_LINE_ENDING
      )
    );
  });

  it("quotes comma-containing fields", () => {
    const csv = rowsToCsv([{ title: "Rent, utilities" }], { includeBom: false });
    expect(csv).toContain('"Rent, utilities"');
  });

  it("doubles embedded quotes", () => {
    const csv = rowsToCsv([{ title: 'Say "hello"' }], { includeBom: false });
    expect(csv).toContain('"Say ""hello"""');
  });

  it("quotes newline-containing fields", () => {
    const csv = rowsToCsv([{ notes: "Line one\nLine two" }], { includeBom: false });
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("uses CRLF line endings", () => {
    const csv = rowsToCsv(
      [
        { section: "a", title: "One" },
        { section: "b", title: "Two" },
      ],
      { includeBom: false }
    );

    expect(csv.includes("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("exports empty, null, and undefined values as empty cells", () => {
    const csv = rowsToCsv(
      [{ section: "", type: null as unknown as string, title: undefined as unknown as string }],
      { includeBom: false }
    );
    const dataLine = csv.split(CSV_EXPORT_LINE_ENDING)[1];
    expect(dataLine?.split(",")).toHaveLength(13);
    expect(dataLine).toBe(",,,,,,,,,,,,");
  });

  it("includes UTF-8 BOM by default", () => {
    const csv = rowsToCsv([{ section: "metadata" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});

describe("neutralizeCsvFormulaCell", () => {
  it("neutralizes dangerous formula-like strings starting with =", () => {
    expect(neutralizeCsvFormulaCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCellNeedsFormulaNeutralization("=SUM(A1)")).toBe(true);
  });

  it("neutralizes dangerous formula-like strings starting with +", () => {
    expect(neutralizeCsvFormulaCell("+cmd|calc")).toBe("'+cmd|calc");
  });

  it("neutralizes dangerous text starting with -", () => {
    expect(neutralizeCsvFormulaCell("-1+1")).toBe("'-1+1");
  });

  it("neutralizes dangerous formula-like strings starting with @", () => {
    expect(neutralizeCsvFormulaCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
  });

  it("neutralizes tab and carriage-return prefixes", () => {
    expect(neutralizeCsvFormulaCell("\tsecret")).toBe("'\tsecret");
    expect(neutralizeCsvFormulaCell("\rsecret")).toBe("'\rsecret");
  });

  it("does not incorrectly mangle safe numeric amounts", () => {
    expect(neutralizeCsvFormulaCell("-1234.56")).toBe("-1234.56");
    expect(neutralizeCsvFormulaCell("CA$816.00")).toBe("CA$816.00");
    expect(neutralizeCsvFormulaCell("- CA$40.00")).toBe("- CA$40.00");
    expect(neutralizeCsvFormulaCell("− CA$40.00")).toBe("− CA$40.00");
  });
});

describe("sanitizeCsvFilename", () => {
  it("removes unsafe characters", () => {
    expect(sanitizeCsvFilename('cashflow<>:"/\\|?*.csv')).toBe("cashflow.csv");
  });

  it("builds monthly report filename without spaces or ids", () => {
    expect(buildMonthlyReportCsvFilename(2026, 9)).toBe("cashflow-report-2026-09.csv");
  });
});

describe("csvExportLabelsArePrivacySafe", () => {
  it("rejects raw UUID labels", () => {
    expect(
      csvExportLabelsArePrivacySafe(["Internet", "550e8400-e29b-41d4-a716-446655440000"])
    ).toBe(false);
  });

  it("accepts normal labels", () => {
    expect(csvExportLabelsArePrivacySafe(["Internet", "September 2026"])).toBe(true);
  });
});
