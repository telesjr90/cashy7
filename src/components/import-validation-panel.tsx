import { useMemo, useState } from "react";
import type { ImportValidationResult } from "@/lib/import-validation";
import {
  filterValidatedRows,
  formatValidatedRowType,
  formatValidationStatusLabel,
  getValidationPreviewFields,
  summarizeRowIssues,
  type ImportValidationFilter,
} from "@/lib/import-validation";
import {
  IMPORT_NEXT_CONFIRM_WRITES_LABEL,
  IMPORT_NO_RECORDS_CHANGED_COPY,
  IMPORT_VALIDATED_CANDIDATES_COPY,
  IMPORT_VALIDATION_ERRORS_BLOCK_COPY,
  IMPORT_VALIDATION_WARNINGS_COPY,
} from "@/lib/import-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ImportValidationPanelProps = {
  validation: ImportValidationResult;
};

const FILTER_OPTIONS: { value: ImportValidationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "errors", label: "Errors" },
  { value: "warnings", label: "Warnings" },
  { value: "valid", label: "Valid" },
  { value: "skipped", label: "Skipped" },
];

function statusBadgeVariant(
  status: ImportValidationResult["rows"][number]["status"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "valid":
      return "default";
    case "warning":
      return "secondary";
    case "error":
      return "destructive";
    case "skipped":
      return "outline";
    default:
      return "outline";
  }
}

function ValidationRowDetails({
  row,
}: {
  row: ImportValidationResult["rows"][number];
}) {
  const [expanded, setExpanded] = useState(false);

  if (row.issues.length === 0) {
    return (
      <span className="text-muted-foreground">
        {row.status === "skipped" ? "Empty row skipped" : "No issues"}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="text-left text-sm underline-offset-2 hover:underline"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {summarizeRowIssues(row)}
      </button>
      {expanded && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {row.issues.map((issue, index) => (
            <li key={`${row.rowId}-${issue.field}-${index}`}>
              <span className="font-medium capitalize">{issue.severity}</span>: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ImportValidationPanel({ validation }: ImportValidationPanelProps) {
  const [filter, setFilter] = useState<ImportValidationFilter>("all");
  const filteredRows = useMemo(
    () => filterValidatedRows(validation.rows, filter),
    [validation.rows, filter]
  );

  const { summary, mappingIssues } = validation;
  const mappingErrors = mappingIssues.filter((issue) => issue.severity === "error");
  const mappingWarnings = mappingIssues.filter(
    (issue) => issue.severity === "warning" || issue.severity === "info"
  );

  return (
    <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Row validation</h4>
        <p className="text-sm text-muted-foreground">
          Review mapped candidate rows before any import writes. Validation runs in your
          browser only.
        </p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="text-muted-foreground">Total rows</dt>
          <dd className="font-medium">{summary.totalRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Valid</dt>
          <dd className="font-medium">{summary.validRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Warnings</dt>
          <dd className="font-medium">{summary.warningRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Errors</dt>
          <dd className="font-medium">{summary.errorRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Skipped</dt>
          <dd className="font-medium">{summary.skippedRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Can continue</dt>
          <dd className="font-medium">{summary.canContinue ? "Yes" : "No"}</dd>
        </div>
      </dl>

      {mappingErrors.length > 0 && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <p className="mb-1 font-medium">Mapping issues</p>
            <ul className="list-disc space-y-1 pl-4">
              {mappingErrors.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {mappingWarnings.length > 0 && (
        <Alert role="status">
          <AlertDescription>
            <p className="mb-1 font-medium">Mapping reminders</p>
            <ul className="list-disc space-y-1 pl-4">
              {mappingWarnings.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!summary.canContinue && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{IMPORT_VALIDATION_ERRORS_BLOCK_COPY}</AlertDescription>
        </Alert>
      )}

      {summary.canContinue && summary.warningRows > 0 && (
        <Alert role="status">
          <AlertDescription>{IMPORT_VALIDATION_WARNINGS_COPY}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sheet</TableHead>
              <TableHead>Row</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Key values</TableHead>
              <TableHead>Issues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No rows match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => {
                const previewFields = getValidationPreviewFields(row);
                return (
                  <TableRow key={row.rowId}>
                    <TableCell>{row.sheetName}</TableCell>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{formatValidatedRowType(row.rowType)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(row.status)}>
                        {formatValidationStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs text-xs">
                      {previewFields.length > 0 ? (
                        <ul className="space-y-0.5">
                          {previewFields.map((field) => (
                            <li key={`${row.rowId}-${field.label}`}>
                              <span className="text-muted-foreground">{field.label}:</span>{" "}
                              {field.value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <ValidationRowDetails row={row} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-1 rounded-md bg-background px-3 py-2 text-sm">
        <p>{IMPORT_VALIDATED_CANDIDATES_COPY}</p>
        <p className="text-muted-foreground">{IMPORT_NO_RECORDS_CHANGED_COPY}</p>
      </div>

      <Button type="button" disabled aria-disabled="true">
        {IMPORT_NEXT_CONFIRM_WRITES_LABEL}
      </Button>
    </div>
  );
}
