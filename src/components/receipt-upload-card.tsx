import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  buildReceiptFileMetadata,
  buildReceiptUploadDisplayRow,
  RECEIPT_EXTRACTION_APPROVAL_LATER_COPY,
  RECEIPT_EXTRACT_ACTION_LABEL,
  RECEIPT_LIST_EMPTY_COPY,
  RECEIPT_NO_EXPENSE_CREATED_COPY,
  RECEIPT_PRIVATE_UNTIL_APPROVAL_COPY,
  RECEIPT_REVIEW_BEFORE_EXPENSE_COPY,
  RECEIPT_UPLOAD_HELP_COPY,
  RECEIPT_UPLOAD_MAX_SIZE_LABEL,
  RECEIPT_UPLOAD_SUCCESS_COPY,
  type ReceiptFileMetadata,
  validateReceiptFile,
} from "@/lib/receipt-upload";
import {
  buildDuplicateWarningLabels,
  findCandidateDataDuplicateMatches,
} from "@/lib/receipt-duplicates";
import { canRetryExtraction } from "@/lib/receipt-errors";
import {
  isCandidateSavable,
  RECEIPT_CANDIDATE_EXISTS_COPY,
  RECEIPT_CANDIDATE_NO_EXPENSE_COPY,
  RECEIPT_CANDIDATE_PRIVATE_COPY,
  RECEIPT_REPLACE_CANDIDATE_ACTION,
  RECEIPT_SAVE_CANDIDATE_ACTION,
} from "@/lib/receipt-candidates";
import {
  dismissReceiptCandidate,
  listMyReceiptCandidates,
  saveReceiptCandidate,
} from "@/lib/receipt-candidate-service";
import {
  ReceiptCandidatePanel,
  useReceiptCandidatePanelState,
} from "@/components/receipt-candidate-panel";
import { ReceiptCandidateReviewDialog } from "@/components/receipt-candidate-review-dialog";
import {
  RECEIPT_EXTRACTION_DRAFT_COPY,
  RECEIPT_EXTRACTION_NOT_CONFIGURED_COPY,
  RECEIPT_EXTRACTION_REVIEW_COPY,
  extractionStatusLabel,
  type ReceiptExtractionResult,
} from "@/lib/receipt-extraction";
import { extractReceipt } from "@/lib/receipt-extraction-service";
import {
  deleteReceiptUpload,
  detectSelectedFileDuplicates,
  listMyReceiptUploads,
  updateReceiptExtractionStatus,
  uploadReceipt,
} from "@/lib/receipt-upload-service";
import type { ReceiptCandidate, ReceiptUpload } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileImage, Loader2, ScanLine, Trash2, Upload, X } from "lucide-react";

type LoadPhase = "idle" | "loading" | "ready" | "error";
type UploadPhase = "idle" | "uploading" | "success" | "error";

function formatMoney(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function ReceiptExtractionPreview({
  result,
  canSave,
  saveLabel,
  savePhase,
  saveError,
  saveSuccess,
  duplicateWarnings,
  onSave,
}: {
  result: ReceiptExtractionResult;
  canSave: boolean;
  saveLabel: string;
  savePhase: "idle" | "saving" | "success" | "error";
  saveError: string | null;
  saveSuccess: string | null;
  duplicateWarnings: string[];
  onSave: () => void;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.status === "success" ? "default" : "secondary"}>
          {extractionStatusLabel(result.status)}
        </Badge>
        {result.confidence !== null ? (
          <span className="text-muted-foreground">
            Confidence {Math.round(result.confidence * 100)}%
          </span>
        ) : null}
      </div>

      {result.status === "not_configured" ? (
        <p>{RECEIPT_EXTRACTION_NOT_CONFIGURED_COPY}</p>
      ) : null}

      {result.status === "success" ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Merchant</dt>
            <dd className="font-medium">{result.merchant ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{result.date ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd>{formatMoney(result.total)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tax</dt>
            <dd>{formatMoney(result.tax)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Category</dt>
            <dd>{result.category ?? "—"}</dd>
          </div>
        </dl>
      ) : null}

      {result.lineItems.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium">Line items</p>
          <ul className="space-y-1">
            {result.lineItems.map((item, index) => (
              <li key={`${item.description}-${index}`}>
                {item.description}
                {item.total !== null ? ` · ${formatMoney(item.total)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.warnings.length > 0 ? (
        <ul className="space-y-1 text-muted-foreground">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {duplicateWarnings.length > 0 ? (
        <Alert>
          <AlertDescription className="space-y-1">
            {duplicateWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1 text-muted-foreground">
        <p>{RECEIPT_EXTRACTION_DRAFT_COPY}</p>
        <p>{RECEIPT_NO_EXPENSE_CREATED_COPY}</p>
        <p>{RECEIPT_CANDIDATE_PRIVATE_COPY}</p>
        <p>{RECEIPT_EXTRACTION_REVIEW_COPY}</p>
      </div>

      {canSave ? (
        <Button type="button" size="sm" disabled={savePhase === "saving"} onClick={onSave}>
          {savePhase === "saving" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            saveLabel
          )}
        </Button>
      ) : null}

      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      {saveSuccess ? (
        <Alert>
          <AlertDescription className="space-y-1">
            <p>{saveSuccess}</p>
            <p>{RECEIPT_CANDIDATE_NO_EXPENSE_COPY}</p>
            <p>{RECEIPT_CANDIDATE_PRIVATE_COPY}</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

const ACCEPTED_RECEIPT_TYPES =
  "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

export function ReceiptUploadCard() {
  const { user, household, usablePersonId } = useAuth();
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ReceiptFileMetadata | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedDuplicateWarnings, setSelectedDuplicateWarnings] = useState<string[]>([]);
  const [uploadDuplicateWarnings, setUploadDuplicateWarnings] = useState<string[]>([]);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [listPhase, setListPhase] = useState<LoadPhase>("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ReceiptUpload[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ReceiptUpload | null>(null);
  const [deletePhase, setDeletePhase] = useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [extractingReceiptId, setExtractingReceiptId] = useState<string | null>(null);
  const [extractionResults, setExtractionResults] = useState<
    Record<string, ReceiptExtractionResult>
  >({});
  const [extractionErrors, setExtractionErrors] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<ReceiptCandidate[]>([]);
  const [candidateListPhase, setCandidateListPhase] = useState<LoadPhase>("idle");
  const [candidateListError, setCandidateListError] = useState<string | null>(null);
  const [savingReceiptId, setSavingReceiptId] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [saveSuccesses, setSaveSuccesses] = useState<Record<string, string>>({});
  const [reviewTarget, setReviewTarget] = useState<ReceiptCandidate | null>(null);
  const {
    expandedCandidateId,
    setExpandedCandidateId,
    dismissTarget,
    setDismissTarget,
    dismissPhase,
    setDismissPhase,
    dismissError,
    setDismissError,
  } = useReceiptCandidatePanelState();

  const loadCandidates = useCallback(async () => {
    if (!user) {
      return;
    }
    setCandidateListPhase("loading");
    setCandidateListError(null);
    const { candidates: rows, error } = await listMyReceiptCandidates(user.id);
    if (error) {
      setCandidateListPhase("error");
      setCandidateListError(error);
      return;
    }
    setCandidates(rows);
    setCandidateListPhase("ready");
  }, [user]);

  const loadReceipts = useCallback(async () => {
    if (!user) {
      return;
    }
    setListPhase("loading");
    setListError(null);
    const { receipts: rows, error } = await listMyReceiptUploads(user.id);
    if (error) {
      setListPhase("error");
      setListError(error);
      return;
    }
    setReceipts(rows);
    setListPhase("ready");
  }, [user]);

  useEffect(() => {
    void loadReceipts();
    void loadCandidates();
  }, [loadReceipts, loadCandidates]);

  const processFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) {
        return;
      }

      const validation = validateReceiptFile(file);
      if (!validation.ok) {
        setSelectedFile(null);
        setMetadata(null);
        setValidationError(validation.error);
        setSelectedDuplicateWarnings([]);
        setUploadPhase("idle");
        setUploadError(null);
        setSuccessMessage(null);
        return;
      }

      setValidationError(null);
      setSelectedFile(file);
      setMetadata(buildReceiptFileMetadata(file));
      setUploadPhase("idle");
      setUploadError(null);
      setSuccessMessage(null);

      if (user) {
        const { matches } = await detectSelectedFileDuplicates(file, receipts, user.id);
        setSelectedDuplicateWarnings(buildDuplicateWarningLabels(matches));
      } else {
        setSelectedDuplicateWarnings([]);
      }
    },
    [receipts, user]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void processFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleRemoveSelection = () => {
    setSelectedFile(null);
    setMetadata(null);
    setValidationError(null);
    setSelectedDuplicateWarnings([]);
    setUploadPhase("idle");
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !user || !household) {
      return;
    }

    setUploadPhase("uploading");
    setUploadError(null);
    setSuccessMessage(null);
    setUploadDuplicateWarnings([]);

    const result = await uploadReceipt({
      file: selectedFile,
      householdId: household.id,
      userId: user.id,
      existingUploads: receipts,
    });

    if (!result.ok) {
      setUploadPhase("error");
      setUploadError(result.error);
      return;
    }

    setUploadPhase("success");
    setSuccessMessage(RECEIPT_UPLOAD_SUCCESS_COPY);
    setUploadDuplicateWarnings(result.duplicateWarnings);
    handleRemoveSelection();
    await loadReceipts();
  };

  const handleExtractReceipt = async (receipt: ReceiptUpload) => {
    if (!user) {
      return;
    }

    setExtractingReceiptId(receipt.id);
    setExtractionErrors((current) => {
      const next = { ...current };
      delete next[receipt.id];
      return next;
    });

    const outcome = await extractReceipt({ receiptId: receipt.id });

    if (outcome.ok) {
      setExtractionResults((current) => ({
        ...current,
        [receipt.id]: outcome.result,
      }));
      await updateReceiptExtractionStatus({
        receiptId: receipt.id,
        userId: user.id,
        status: outcome.result.status,
      });
    } else {
      if (outcome.result) {
        setExtractionResults((current) => ({
          ...current,
          [receipt.id]: outcome.result!,
        }));
        await updateReceiptExtractionStatus({
          receiptId: receipt.id,
          userId: user.id,
          status: outcome.result.status,
          errorMessage: outcome.error,
          mimeType: receipt.mime_type,
          warnings: outcome.result.warnings,
        });
      } else {
        await updateReceiptExtractionStatus({
          receiptId: receipt.id,
          userId: user.id,
          status: "provider_error",
          errorMessage: outcome.error,
          mimeType: receipt.mime_type,
        });
      }
      setExtractionErrors((current) => ({
        ...current,
        [receipt.id]: outcome.error,
      }));
    }

    setExtractingReceiptId(null);
    await loadReceipts();
  };

  const handleSaveCandidate = async (
    receipt: ReceiptUpload,
    result: ReceiptExtractionResult,
    mode: "create" | "replace"
  ) => {
    if (!user || !household) {
      return;
    }

    setSavingReceiptId(receipt.id);
    setSaveErrors((current) => {
      const next = { ...current };
      delete next[receipt.id];
      return next;
    });
    setSaveSuccesses((current) => {
      const next = { ...current };
      delete next[receipt.id];
      return next;
    });

    const outcome = await saveReceiptCandidate({
      householdId: household.id,
      userId: user.id,
      receiptUpload: receipt,
      extraction: result,
      mode,
    });

    if (!outcome.ok) {
      setSaveErrors((current) => ({
        ...current,
        [receipt.id]: outcome.error,
      }));
      setSavingReceiptId(null);
      return;
    }

    setSaveSuccesses((current) => ({
      ...current,
      [receipt.id]: "Pending receipt candidate saved.",
    }));
    setSavingReceiptId(null);
    await loadCandidates();
  };

  const handleConfirmDismissCandidate = async () => {
    if (!dismissTarget || !user) {
      return;
    }

    setDismissPhase("dismissing");
    setDismissError(null);

    const result = await dismissReceiptCandidate({
      candidate: dismissTarget,
      userId: user.id,
    });

    if (!result.ok) {
      setDismissPhase("idle");
      setDismissError(result.error);
      return;
    }

    setDismissTarget(null);
    setDismissPhase("idle");
    await loadCandidates();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !user) {
      return;
    }

    setDeletePhase("deleting");
    setDeleteError(null);

    const result = await deleteReceiptUpload({
      receipt: deleteTarget,
      userId: user.id,
    });

    if (!result.ok) {
      setDeletePhase("idle");
      setDeleteError(result.error);
      return;
    }

    setDeleteTarget(null);
    setDeletePhase("idle");
    await loadReceipts();
  };

  const displayRows = receipts.map(buildReceiptUploadDisplayRow);
  const pendingCandidateByReceiptId = new Map(
    candidates.map((candidate) => [candidate.receipt_upload_id, candidate])
  );
  const receiptFileNames = Object.fromEntries(
    receipts.map((receipt) => [receipt.id, receipt.original_file_name])
  );
  const receiptUploadedAtById = Object.fromEntries(
    receipts.map((receipt) => [receipt.id, receipt.created_at])
  );
  const canUpload =
    selectedFile !== null && uploadPhase !== "uploading" && user !== null && household !== null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Receipt upload storage</CardTitle>
          <CardDescription>
            Store receipt files privately until you review and approve them in later steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription className="space-y-1">
              <p>{RECEIPT_UPLOAD_HELP_COPY}</p>
              <p>{RECEIPT_NO_EXPENSE_CREATED_COPY}</p>
              <p>{RECEIPT_REVIEW_BEFORE_EXPENSE_COPY}</p>
              <p>{RECEIPT_PRIVATE_UNTIL_APPROVAL_COPY}</p>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor={inputId}>Choose receipt file</Label>
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept={ACCEPTED_RECEIPT_TYPES}
              className="sr-only"
              aria-describedby={helpId}
              onChange={handleInputChange}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Select receipt
              </Button>
              {selectedFile ? (
                <Button type="button" variant="ghost" size="sm" onClick={handleRemoveSelection}>
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              ) : null}
            </div>
            <p id={helpId} className="text-sm text-muted-foreground">
              JPEG, PNG, WebP, or PDF up to {RECEIPT_UPLOAD_MAX_SIZE_LABEL}.
            </p>
          </div>

          {validationError ? (
            <Alert variant="destructive" id={errorId}>
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          ) : null}

          {metadata ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-start gap-3">
                <FileImage className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <dl className="grid gap-1 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">File name</dt>
                    <dd className="font-medium">{metadata.fileName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{metadata.mimeTypeLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Size</dt>
                    <dd>{metadata.sizeLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{metadata.statusLabel}</dd>
                  </div>
                </dl>
              </div>
              {selectedDuplicateWarnings.length > 0 ? (
                <Alert className="mt-3">
                  <AlertDescription className="space-y-1">
                    {selectedDuplicateWarnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          <Button type="button" disabled={!canUpload} onClick={() => void handleUpload()}>
            {uploadPhase === "uploading" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload receipt
              </>
            )}
          </Button>

          {uploadError ? (
            <Alert variant="destructive">
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          ) : null}

          {successMessage ? (
            <Alert>
              <AlertDescription className="space-y-1">
                <p>{successMessage}</p>
                <p>{RECEIPT_NO_EXPENSE_CREATED_COPY}</p>
                <p>{RECEIPT_EXTRACTION_APPROVAL_LATER_COPY}</p>
                {uploadDuplicateWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Your uploaded receipts</h3>
            <p className="text-sm text-muted-foreground">
              Only you can see these receipts until approval in a later step.
            </p>

            {listPhase === "loading" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading receipts…
              </div>
            ) : listPhase === "error" ? (
              <Alert variant="destructive">
                <AlertDescription>{listError}</AlertDescription>
              </Alert>
            ) : displayRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{RECEIPT_LIST_EMPTY_COPY}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type / size</TableHead>
                    <TableHead>Next step</TableHead>
                    <TableHead className="w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((row) => {
                    const source = receipts.find((receipt) => receipt.id === row.id);
                    const extraction = extractionResults[row.id];
                    const extractionDuplicateWarnings =
                      extraction && user
                        ? buildDuplicateWarningLabels(
                            findCandidateDataDuplicateMatches(
                              {
                                merchant: extraction.merchant,
                                transactionDate: extraction.date,
                                totalAmount: extraction.total,
                              },
                              candidates,
                              user.id,
                              { excludeReceiptUploadId: row.id }
                            )
                          )
                        : [];
                    const persistedError =
                      extractionErrors[row.id] ?? row.extractionErrorLabel;
                    const showRetryExtract =
                      persistedError !== null &&
                      canRetryExtraction(source?.last_extraction_status);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.fileName}</TableCell>
                        <TableCell>{row.uploadedAtLabel}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.statusLabel}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.mimeTypeLabel} · {row.sizeLabel}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div>{row.pendingCopy}</div>
                          {extractionResults[row.id] ? (
                            <ReceiptExtractionPreview
                              result={extractionResults[row.id]!}
                              duplicateWarnings={extractionDuplicateWarnings}
                              canSave={
                                isCandidateSavable(extractionResults[row.id]!) &&
                                savingReceiptId !== row.id
                              }
                              saveLabel={
                                pendingCandidateByReceiptId.has(row.id)
                                  ? RECEIPT_REPLACE_CANDIDATE_ACTION
                                  : RECEIPT_SAVE_CANDIDATE_ACTION
                              }
                              savePhase={
                                savingReceiptId === row.id
                                  ? "saving"
                                  : saveSuccesses[row.id]
                                    ? "success"
                                    : saveErrors[row.id]
                                      ? "error"
                                      : "idle"
                              }
                              saveError={saveErrors[row.id] ?? null}
                              saveSuccess={saveSuccesses[row.id] ?? null}
                              onSave={() => {
                                const sourceReceipt = receipts.find(
                                  (receipt) => receipt.id === row.id
                                );
                                const extraction = extractionResults[row.id];
                                if (!sourceReceipt || !extraction) {
                                  return;
                                }
                                void handleSaveCandidate(
                                  sourceReceipt,
                                  extraction,
                                  pendingCandidateByReceiptId.has(row.id) ? "replace" : "create"
                                );
                              }}
                            />
                          ) : null}
                          {pendingCandidateByReceiptId.has(row.id) &&
                          !extractionResults[row.id] ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {RECEIPT_CANDIDATE_EXISTS_COPY}
                            </p>
                          ) : null}
                          {extractionErrors[row.id] || row.extractionErrorLabel ? (
                            <div className="mt-2 space-y-2">
                              <Alert variant="destructive">
                                <AlertDescription>{persistedError}</AlertDescription>
                              </Alert>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p>{RECEIPT_EXTRACTION_DRAFT_COPY}</p>
                                <p>{RECEIPT_NO_EXPENSE_CREATED_COPY}</p>
                                <p>{RECEIPT_EXTRACTION_REVIEW_COPY}</p>
                              </div>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {source ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={extractingReceiptId === source.id}
                                onClick={() => void handleExtractReceipt(source)}
                              >
                                {extractingReceiptId === source.id ? (
                                  <>
                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                    Extracting…
                                  </>
                                ) : (
                                  <>
                                    <ScanLine className="mr-1 h-4 w-4" />
                                    {showRetryExtract ? "Retry extraction" : RECEIPT_EXTRACT_ACTION_LABEL}
                                  </>
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${row.fileName}`}
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteTarget(source);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {deleteError ? (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <ReceiptCandidatePanel
            candidates={candidates}
            receiptFileNames={receiptFileNames}
            receiptUploadedAtById={receiptUploadedAtById}
            listPhase={candidateListPhase}
            listError={candidateListError}
            expandedCandidateId={expandedCandidateId}
            onToggleExpanded={(candidateId) =>
              setExpandedCandidateId((current) =>
                current === candidateId ? null : candidateId
              )
            }
            dismissTarget={dismissTarget}
            dismissPhase={dismissPhase}
            dismissError={dismissError}
            onRequestDismiss={(candidate) => {
              setDismissError(null);
              setDismissTarget(candidate);
            }}
            onCancelDismiss={() => setDismissTarget(null)}
            onConfirmDismiss={() => void handleConfirmDismissCandidate()}
            onRequestReview={(candidate) => setReviewTarget(candidate)}
          />
        </CardContent>
      </Card>

      {user && household ? (
        <ReceiptCandidateReviewDialog
          candidate={reviewTarget}
          receiptUpload={
            reviewTarget
              ? (receipts.find((receipt) => receipt.id === reviewTarget.receipt_upload_id) ??
                null)
              : null
          }
          receiptFileName={
            reviewTarget ? (receiptFileNames[reviewTarget.receipt_upload_id] ?? null) : null
          }
          receiptUploadedAt={
            reviewTarget ? (receiptUploadedAtById[reviewTarget.receipt_upload_id] ?? null) : null
          }
          allCandidates={candidates}
          receiptFileNames={receiptFileNames}
          receiptUploadedAtById={receiptUploadedAtById}
          householdId={household.id}
          userId={user.id}
          personId={usablePersonId}
          open={reviewTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setReviewTarget(null);
            }
          }}
          onSaved={loadCandidates}
          onApproved={async () => {
            await loadCandidates();
            await loadReceipts();
          }}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && deletePhase !== "deleting") {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete receipt upload?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This removes the stored receipt file and its upload record. No expense will be
                deleted because none was created.
              </p>
              {deleteTarget ? (
                <p className="font-medium">{deleteTarget.original_file_name}</p>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePhase === "deleting"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePhase === "deleting"}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deletePhase === "deleting" ? "Deleting…" : "Delete receipt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
