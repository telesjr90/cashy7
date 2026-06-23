import { useCallback, useId, useRef, useState } from "react";
import {
  buildImportFileMetadata,
  IMPORT_COLUMN_MAPPING_NEXT_COPY,
  IMPORT_NEXT_PARSE_PREVIEW_LABEL,
  IMPORT_NO_RECORDS_CHANGED_COPY,
  IMPORT_PARSED_CANDIDATES_COPY,
  IMPORT_PARSE_FILE_LABEL,
  IMPORT_REVIEW_BEFORE_SAVE_COPY,
  IMPORT_UPLOAD_HELP_COPY,
  IMPORT_UPLOAD_MAX_SIZE_LABEL,
  type ImportFileMetadata,
  validateImportFile,
} from "@/lib/import-upload";
import {
  parseImportFile,
  type ImportParseResult,
  type ImportParsedRow,
} from "@/lib/import-parser";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

const PREVIEW_ROW_LIMIT = 5;

type ParseStatus = "idle" | "ready" | "parsing" | "parsed" | "error";

function formatParseStatusLabel(status: ParseStatus): string {
  switch (status) {
    case "ready":
      return "Ready to parse";
    case "parsing":
      return "Parsing…";
    case "parsed":
      return "Parsed";
    case "error":
      return "Parse error";
    default:
      return "Awaiting file";
  }
}

function formatCellPreview(value: ImportParsedRow["values"][number]): string {
  if (value === null) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function getPreviewRows(result: ImportParseResult): ImportParsedRow[] {
  return result.sheets.flatMap((sheet) => sheet.rows).slice(0, PREVIEW_ROW_LIMIT);
}

export function ImportUploadCard() {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const parseErrorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ImportFileMetadata | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const resetParseState = useCallback(() => {
    setParseStatus("idle");
    setParseResult(null);
    setParseError(null);
  }, []);

  const processFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) {
        return;
      }

      const validation = validateImportFile(file);
      if (!validation.ok) {
        setSelectedFile(null);
        setMetadata(null);
        setValidationError(validation.error);
        resetParseState();
        return;
      }

      setValidationError(null);
      setSelectedFile(file);
      setMetadata(buildImportFileMetadata(file));
      setParseStatus("ready");
      setParseResult(null);
      setParseError(null);
    },
    [resetParseState]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setMetadata(null);
    setValidationError(null);
    resetParseState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleParse = async () => {
    if (!selectedFile) {
      return;
    }

    setParseStatus("parsing");
    setParseError(null);
    setParseResult(null);

    const outcome = await parseImportFile(selectedFile);
    if (!outcome.ok) {
      setParseStatus("error");
      setParseError(outcome.error);
      return;
    }

    setParseResult(outcome.result);
    setParseStatus("parsed");
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };

  const previewRows = parseResult ? getPreviewRows(parseResult) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spreadsheet import</CardTitle>
        <CardDescription>
          Upload a household spreadsheet to begin import staging. Files stay on your
          device until you confirm mapped rows in a later step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p id={helpId} className="text-sm text-muted-foreground">
          {IMPORT_UPLOAD_HELP_COPY} Supported formats: .csv and .xlsx. Maximum file
          size: {IMPORT_UPLOAD_MAX_SIZE_LABEL}.
        </p>

        <div className="space-y-2">
          <Label htmlFor={inputId}>Spreadsheet file</Label>
          <div
            role="group"
            aria-labelledby={inputId}
            aria-describedby={helpId}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`rounded-lg border border-dashed p-4 transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
            }`}
          >
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileSpreadsheet
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Select or drop a spreadsheet</p>
                  <p className="text-muted-foreground">
                    Drag a .csv or .xlsx file here, or use the file picker.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Choose file
              </Button>
            </div>
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={handleInputChange}
              aria-describedby={validationError ? `${helpId} ${errorId}` : helpId}
            />
          </div>
        </div>

        {validationError && (
          <Alert variant="destructive" role="alert" aria-live="polite">
            <AlertDescription id={errorId}>{validationError}</AlertDescription>
          </Alert>
        )}

        {metadata && selectedFile && (
          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Selected file</h3>
                <p className="text-sm">{metadata.fileName}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                Remove file
              </Button>
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Extension</dt>
                <dd className="font-medium">{metadata.extensionLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="font-medium">{metadata.mimeTypeLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Size</dt>
                <dd className="font-medium">{metadata.sizeLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last modified</dt>
                <dd className="font-medium">{metadata.modifiedDateLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Parse status</dt>
                <dd className="font-medium">{formatParseStatusLabel(parseStatus)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Upload status</dt>
                <dd className="font-medium">{metadata.statusLabel}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleParse}
                disabled={parseStatus === "parsing"}
              >
                {parseStatus === "parsing" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {IMPORT_PARSE_FILE_LABEL}
              </Button>
              <Button type="button" disabled aria-disabled="true">
                {IMPORT_NEXT_PARSE_PREVIEW_LABEL}
              </Button>
            </div>

            {parseError && (
              <Alert variant="destructive" role="alert" aria-live="polite">
                <AlertDescription id={parseErrorId}>{parseError}</AlertDescription>
              </Alert>
            )}

            {parseResult && parseStatus === "parsed" && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-md bg-background px-3 py-2 text-sm">
                  <h4 className="font-medium">Parsed summary</h4>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">File name</dt>
                      <dd className="font-medium">{parseResult.fileName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">File kind</dt>
                      <dd className="font-medium">{parseResult.fileKind}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sheets</dt>
                      <dd className="font-medium">{parseResult.sheets.length}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total rows</dt>
                      <dd className="font-medium">{parseResult.totalRows}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Non-empty rows</dt>
                      <dd className="font-medium">{parseResult.totalNonEmptyRows}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Warnings</dt>
                      <dd className="font-medium">{parseResult.warnings.length}</dd>
                    </div>
                  </dl>
                </div>

                {parseResult.warnings.length > 0 && (
                  <Alert role="status" aria-live="polite">
                    <AlertDescription>
                      <ul className="list-disc space-y-1 pl-4">
                        {parseResult.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Sheets</h4>
                  <ul className="space-y-1 text-sm">
                    {parseResult.sheets.map((sheet) => (
                      <li
                        key={sheet.name}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
                      >
                        <span className="font-medium">{sheet.name}</span>
                        <span className="text-muted-foreground">
                          {sheet.nonEmptyRowCount} non-empty / {sheet.rowCount} rows
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {previewRows.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Candidate row preview</h4>
                    <div className="overflow-x-auto rounded-md border bg-background">
                      <table className="w-full min-w-[28rem] text-left text-sm">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 font-medium">Sheet</th>
                            <th className="px-3 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Values</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row) => (
                            <tr key={row.id} className="border-b last:border-b-0">
                              <td className="px-3 py-2">{row.sheetName}</td>
                              <td className="px-3 py-2">{row.rowNumber}</td>
                              <td className="px-3 py-2 font-mono text-xs">
                                {row.values.map(formatCellPreview).join(" | ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="space-y-1 rounded-md bg-background px-3 py-2 text-sm">
                  <p>{IMPORT_PARSED_CANDIDATES_COPY}</p>
                  <p className="text-muted-foreground">{IMPORT_NO_RECORDS_CHANGED_COPY}</p>
                  <p className="text-muted-foreground">{IMPORT_COLUMN_MAPPING_NEXT_COPY}</p>
                  <p className="text-muted-foreground">{IMPORT_REVIEW_BEFORE_SAVE_COPY}</p>
                </div>
              </div>
            )}

            {!parseResult && (
              <div className="space-y-1 rounded-md bg-background px-3 py-2 text-sm">
                <p className="text-muted-foreground">{IMPORT_NO_RECORDS_CHANGED_COPY}</p>
                <p className="text-muted-foreground">{IMPORT_COLUMN_MAPPING_NEXT_COPY}</p>
              </div>
            )}
          </div>
        )}

        {!metadata && !validationError && (
          <p className="text-sm text-muted-foreground">
            {IMPORT_NO_RECORDS_CHANGED_COPY}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
