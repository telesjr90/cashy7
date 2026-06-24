import { useMemo } from "react";
import type { ImportParsedSheet } from "@/lib/import-parser";
import {
  IMPORT_CORE_FIELD_KEYS,
  IMPORT_MARKER_FIELD_KEYS,
  IMPORT_OPTIONAL_FIELD_KEYS,
  applyImportMappingSelection,
  buildImportSourceColumns,
  buildMappedPreviewRows,
  buildRequiredFieldWarnings,
  detectMappingConflicts,
  formatMappedCellValue,
  getImportFieldLabel,
  getMappedPreviewColumns,
  resetImportColumnMapping,
  type ImportColumnMapping,
  type ImportFieldKey,
} from "@/lib/import-column-mapping";
import {
  IMPORT_MAPPED_CANDIDATES_COPY,
  IMPORT_NO_RECORDS_CHANGED_COPY,
  IMPORT_VALIDATION_NEXT_COPY,
} from "@/lib/import-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MOBILE_CONTAINED_SCROLL,
  MOBILE_FORM_GRID_TWO_COL,
} from "@/lib/mobile-form-layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const UNMAPPED_VALUE = "__unmapped__";

type ImportColumnMappingPanelProps = {
  sheet: ImportParsedSheet;
  mapping: ImportColumnMapping;
  onMappingChange: (mapping: ImportColumnMapping) => void;
};

function MappingFieldSelect({
  field,
  mapping,
  sourceColumns,
  onMappingChange,
}: {
  field: ImportFieldKey;
  mapping: ImportColumnMapping;
  sourceColumns: ReturnType<typeof buildImportSourceColumns>;
  onMappingChange: (mapping: ImportColumnMapping) => void;
}) {
  const selected = mapping[field] ?? UNMAPPED_VALUE;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`import-map-${field}`} className="text-sm">
        {getImportFieldLabel(field)}
      </Label>
      <Select
        value={selected}
        onValueChange={(value) => {
          onMappingChange(
            applyImportMappingSelection(
              mapping,
              field,
              value === UNMAPPED_VALUE ? null : value
            )
          );
        }}
      >
        <SelectTrigger id={`import-map-${field}`} className="w-full max-w-full">
          <SelectValue placeholder="Not mapped" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNMAPPED_VALUE}>Not mapped</SelectItem>
          {sourceColumns.map((column) => (
            <SelectItem key={column.id} value={column.id}>
              {column.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FieldMappingGroup({
  title,
  fields,
  mapping,
  sourceColumns,
  onMappingChange,
}: {
  title: string;
  fields: ImportFieldKey[];
  mapping: ImportColumnMapping;
  sourceColumns: ReturnType<typeof buildImportSourceColumns>;
  onMappingChange: (mapping: ImportColumnMapping) => void;
}) {
  return (
    <div className="space-y-3">
      <h5 className="text-sm font-medium">{title}</h5>
      <div className={MOBILE_FORM_GRID_TWO_COL}>
        {fields.map((field) => (
          <MappingFieldSelect
            key={field}
            field={field}
            mapping={mapping}
            sourceColumns={sourceColumns}
            onMappingChange={onMappingChange}
          />
        ))}
      </div>
    </div>
  );
}

export function ImportColumnMappingPanel({
  sheet,
  mapping,
  onMappingChange,
}: ImportColumnMappingPanelProps) {
  const sourceColumns = useMemo(() => buildImportSourceColumns(sheet), [sheet]);
  const previewColumns = useMemo(() => getMappedPreviewColumns(mapping), [mapping]);
  const previewRows = useMemo(
    () => buildMappedPreviewRows(sheet, mapping, sourceColumns),
    [sheet, mapping, sourceColumns]
  );
  const requiredWarnings = useMemo(
    () => buildRequiredFieldWarnings(mapping),
    [mapping]
  );
  const conflicts = useMemo(() => detectMappingConflicts(mapping), [mapping]);

  const handleResetSuggested = () => {
    onMappingChange(resetImportColumnMapping(sourceColumns, "suggested"));
  };

  const handleResetEmpty = () => {
    onMappingChange(resetImportColumnMapping(sourceColumns, "empty"));
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Column mapping</h4>
        <p className="text-sm text-muted-foreground">
          Map spreadsheet columns from <span className="font-medium">{sheet.name}</span>{" "}
          to app import fields. Optional fields can stay unmapped.
        </p>
      </div>

      {sourceColumns.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium">Detected columns</h5>
          <ul className="flex flex-wrap gap-2 text-sm">
            {sourceColumns.map((column) => (
              <li
                key={column.id}
                className="rounded-md border bg-background px-2 py-1 text-muted-foreground"
              >
                {column.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FieldMappingGroup
        title="Core fields"
        fields={IMPORT_CORE_FIELD_KEYS}
        mapping={mapping}
        sourceColumns={sourceColumns}
        onMappingChange={onMappingChange}
      />

      <FieldMappingGroup
        title="Type markers"
        fields={IMPORT_MARKER_FIELD_KEYS}
        mapping={mapping}
        sourceColumns={sourceColumns}
        onMappingChange={onMappingChange}
      />

      <FieldMappingGroup
        title="Optional fields"
        fields={IMPORT_OPTIONAL_FIELD_KEYS}
        mapping={mapping}
        sourceColumns={sourceColumns}
        onMappingChange={onMappingChange}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleResetSuggested}>
          Reset to suggested
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleResetEmpty}>
          Clear all mappings
        </Button>
      </div>

      {conflicts.length > 0 && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {conflicts.map((conflict) => (
                <li key={conflict.sourceColumnId}>
                  The same source column is mapped to{" "}
                  {conflict.fields.map((field) => getImportFieldLabel(field)).join(", ")}.
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {requiredWarnings.length > 0 && (
        <Alert role="status">
          <AlertDescription>
            <p className="mb-1 font-medium">Mapping reminders</p>
            <ul className="list-disc space-y-1 pl-4">
              {requiredWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {previewRows.length > 0 && previewColumns.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium">Mapped row preview</h5>
          <div className={`${MOBILE_CONTAINED_SCROLL} rounded-md border bg-background`}>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                {previewColumns.map((field) => (
                  <TableHead key={field}>{getImportFieldLabel(field)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row) => (
                <TableRow key={row.sourceRowId}>
                  <TableCell>{row.sourceRowNumber}</TableCell>
                  {previewColumns.map((field) => (
                    <TableCell key={`${row.sourceRowId}-${field}`}>
                      {formatMappedCellValue(row.fields[field])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </div>
      )}

      {previewColumns.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Map at least one field to preview mapped values.
        </p>
      )}

      <div className="space-y-1 rounded-md bg-background px-3 py-2 text-sm">
        <p>{IMPORT_MAPPED_CANDIDATES_COPY}</p>
        <p className="text-muted-foreground">{IMPORT_NO_RECORDS_CHANGED_COPY}</p>
        <p className="text-muted-foreground">{IMPORT_VALIDATION_NEXT_COPY}</p>
      </div>
    </div>
  );
}
