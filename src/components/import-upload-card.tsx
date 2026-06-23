import { useCallback, useId, useRef, useState } from "react";
import {
  buildImportFileMetadata,
  IMPORT_NEXT_PARSE_PREVIEW_LABEL,
  IMPORT_NEXT_STEP_COPY,
  IMPORT_NO_RECORDS_CHANGED_COPY,
  IMPORT_REVIEW_BEFORE_SAVE_COPY,
  IMPORT_UPLOAD_HELP_COPY,
  IMPORT_UPLOAD_MAX_SIZE_LABEL,
  type ImportFileMetadata,
  validateImportFile,
} from "@/lib/import-upload";
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
import { FileSpreadsheet, Upload, X } from "lucide-react";

export function ImportUploadCard() {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ImportFileMetadata | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback((file: File | null | undefined) => {
    if (!file) {
      return;
    }

    const validation = validateImportFile(file);
    if (!validation.ok) {
      setSelectedFile(null);
      setMetadata(null);
      setValidationError(validation.error);
      return;
    }

    setValidationError(null);
    setSelectedFile(file);
    setMetadata(buildImportFileMetadata(file));
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setMetadata(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">{metadata.statusLabel}</dd>
              </div>
            </dl>

            <div className="space-y-1 rounded-md bg-background px-3 py-2 text-sm">
              <p>{IMPORT_NEXT_STEP_COPY}</p>
              <p className="text-muted-foreground">{IMPORT_NO_RECORDS_CHANGED_COPY}</p>
              <p className="text-muted-foreground">{IMPORT_REVIEW_BEFORE_SAVE_COPY}</p>
            </div>

            <Button type="button" disabled aria-disabled="true">
              {IMPORT_NEXT_PARSE_PREVIEW_LABEL}
            </Button>
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
