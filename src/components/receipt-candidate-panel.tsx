import { useState } from "react";
import { Link } from "react-router-dom";
import { buildApprovedExpenseSummaryLabel } from "@/lib/receipt-approval";
import {
  buildCandidateDisplayRow,
  buildCandidateMissingTotalWarnings,
  candidateStatusLabel,
  fieldConfidenceLabel,
  formatCandidateMoney,
  parseStoredFieldConfidence,
  parseStoredLineItems,
  RECEIPT_CANDIDATE_APPROVED_COPY,
  RECEIPT_CANDIDATE_DRAFT_COPY,
  RECEIPT_CANDIDATE_DISMISS_ACTION,
  RECEIPT_CANDIDATE_LIST_EMPTY_COPY,
  RECEIPT_CANDIDATE_NO_EXPENSE_COPY,
  RECEIPT_CANDIDATE_PENDING_REVIEW_COPY,
  RECEIPT_CANDIDATE_PRIVATE_COPY,
  RECEIPT_CANDIDATE_REVIEW_COPY,
  confidencePercentLabel,
  type ReceiptCandidateDisplayRow,
} from "@/lib/receipt-candidates";
import { RECEIPT_CANDIDATE_REVIEW_ACTION } from "@/lib/receipt-candidate-review";
import {
  buildDuplicateWarningLabels,
  findCandidateDataDuplicateMatches,
} from "@/lib/receipt-duplicates";
import type { ReceiptCandidate } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Loader2, Trash2 } from "lucide-react";

type ReceiptCandidatePanelProps = {
  candidates: ReceiptCandidate[];
  receiptFileNames: Record<string, string>;
  receiptUploadedAtById?: Record<string, string>;
  listPhase: "idle" | "loading" | "ready" | "error";
  listError: string | null;
  expandedCandidateId: string | null;
  onToggleExpanded: (candidateId: string) => void;
  dismissTarget: ReceiptCandidate | null;
  dismissPhase: "idle" | "dismissing";
  dismissError: string | null;
  onRequestDismiss: (candidate: ReceiptCandidate) => void;
  onCancelDismiss: () => void;
  onConfirmDismiss: () => void;
  onRequestReview: (candidate: ReceiptCandidate) => void;
};

function formatStoredMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return formatCandidateMoney(Number.isFinite(numeric) ? numeric : null) ?? "—";
}

function ReceiptCandidateDetailPreview({ candidate }: { candidate: ReceiptCandidate }) {
  const lineItems = parseStoredLineItems(candidate.line_items);
  const fieldConfidence = parseStoredFieldConfidence(candidate.field_confidence);
  const confidence =
    typeof candidate.confidence === "number"
      ? candidate.confidence
      : candidate.confidence === null
        ? null
        : Number(candidate.confidence);

  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{candidateStatusLabel(candidate.status)}</Badge>
        {confidencePercentLabel(confidence) ? (
          <span className="text-muted-foreground">{confidencePercentLabel(confidence)}</span>
        ) : null}
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Merchant</dt>
          <dd className="font-medium">{candidate.merchant ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Date</dt>
          <dd>{candidate.transaction_date ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total</dt>
          <dd>{formatStoredMoney(candidate.total_amount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tax</dt>
          <dd>{formatStoredMoney(candidate.tax_amount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Category</dt>
          <dd>{candidate.category ?? "—"}</dd>
        </div>
      </dl>

      {lineItems.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium">Line items</p>
          <ul className="space-y-1">
            {lineItems.map((item, index) => (
              <li key={`${item.description}-${index}`}>
                {item.description}
                {item.total !== null ? ` · ${formatCandidateMoney(item.total)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {Object.keys(fieldConfidence).length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium">Field confidence</p>
          <ul className="space-y-1 text-muted-foreground">
            {Object.keys(fieldConfidence).map((field) => {
              const label = fieldConfidenceLabel(fieldConfidence, field);
              return label ? <li key={field}>{label}</li> : null;
            })}
          </ul>
        </div>
      ) : null}

      {candidate.warnings.length > 0 ? (
        <ul className="space-y-1 text-muted-foreground">
          {candidate.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-1 text-muted-foreground">
        <p>{RECEIPT_CANDIDATE_DRAFT_COPY}</p>
        {candidate.status === "approved" ? (
          <>
            <p>{RECEIPT_CANDIDATE_APPROVED_COPY}</p>
            {candidate.merchant && candidate.total_amount && candidate.transaction_date ? (
              <p className="font-medium text-foreground">
                {buildApprovedExpenseSummaryLabel({
                  description: candidate.merchant,
                  amount:
                    typeof candidate.total_amount === "number"
                      ? candidate.total_amount
                      : Number(candidate.total_amount),
                  expenseDate: candidate.transaction_date,
                })}
              </p>
            ) : null}
            <Link to="/expenses" className="font-medium underline underline-offset-4">
              View in Expenses
            </Link>
          </>
        ) : (
          <>
            <p>{RECEIPT_CANDIDATE_NO_EXPENSE_COPY}</p>
            <p>{RECEIPT_CANDIDATE_PRIVATE_COPY}</p>
            <p>{RECEIPT_CANDIDATE_REVIEW_COPY}</p>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptCandidateListRow({
  row,
  candidate,
  expanded,
  duplicateWarnings,
  missingTotalWarnings,
  onToggleExpanded,
  onRequestDismiss,
  onRequestReview,
}: {
  row: ReceiptCandidateDisplayRow;
  candidate: ReceiptCandidate;
  expanded: boolean;
  duplicateWarnings: string[];
  missingTotalWarnings: string[];
  onToggleExpanded: () => void;
  onRequestDismiss: () => void;
  onRequestReview: () => void;
}) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{row.titleLabel}</p>
            <Badge variant="secondary">{row.statusLabel}</Badge>
          </div>
          <p className="text-muted-foreground">
            {row.dateLabel ?? "Date unavailable"}
            {row.totalLabel ? ` · ${row.totalLabel}` : ""}
            {row.categoryLabel ? ` · ${row.categoryLabel}` : ""}
          </p>
          {row.receiptFileName ? (
            <p className="text-muted-foreground">Receipt file: {row.receiptFileName}</p>
          ) : null}
          {row.confidenceLabel ? (
            <p className="text-muted-foreground">{row.confidenceLabel}</p>
          ) : null}
          {missingTotalWarnings.length > 0 ? (
            <Alert className="mt-2">
              <AlertDescription className="space-y-1">
                {missingTotalWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}
          {duplicateWarnings.length > 0 ? (
            <Alert className="mt-2">
              <AlertDescription className="space-y-1">
                {duplicateWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}
          {candidate.status === "pending" ? (
            <>
              <p className="text-muted-foreground">{RECEIPT_CANDIDATE_PENDING_REVIEW_COPY}</p>
              <p className="text-muted-foreground">{RECEIPT_CANDIDATE_NO_EXPENSE_COPY}</p>
            </>
          ) : (
            <p className="text-muted-foreground">{RECEIPT_CANDIDATE_APPROVED_COPY}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="default" size="sm" onClick={onRequestReview}>
            {candidate.status === "approved" ? "View approved candidate" : RECEIPT_CANDIDATE_REVIEW_ACTION}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onToggleExpanded}>
            {expanded ? "Hide preview" : "View preview"}
          </Button>
          {candidate.status === "pending" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Dismiss ${row.titleLabel}`}
              onClick={onRequestDismiss}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {expanded ? <ReceiptCandidateDetailPreview candidate={candidate} /> : null}
    </div>
  );
}

export function ReceiptCandidatePanel({
  candidates,
  receiptFileNames,
  receiptUploadedAtById = {},
  listPhase,
  listError,
  expandedCandidateId,
  onToggleExpanded,
  dismissTarget,
  dismissPhase,
  dismissError,
  onRequestDismiss,
  onCancelDismiss,
  onConfirmDismiss,
  onRequestReview,
}: ReceiptCandidatePanelProps) {
  const displayRows = candidates.map((candidate) =>
    buildCandidateDisplayRow({
      candidate,
      receiptFileName: receiptFileNames[candidate.receipt_upload_id] ?? null,
    })
  );

  return (
    <>
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Your receipt candidates</h3>
        <p className="text-sm text-muted-foreground">
          Draft and approved candidates stay private to you. Approved candidates create a shared
          manual expense without deducting cash.
        </p>

        {listPhase === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading candidates…
          </div>
        ) : listPhase === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{listError}</AlertDescription>
          </Alert>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{RECEIPT_CANDIDATE_LIST_EMPTY_COPY}</p>
        ) : (
          <div className="space-y-2">
            {displayRows.map((row) => {
              const candidate = candidates.find((item) => item.id === row.id);
              if (!candidate) {
                return null;
              }
              return (
                <ReceiptCandidateListRow
                  key={row.id}
                  row={row}
                  candidate={candidate}
                  expanded={expandedCandidateId === row.id}
                  missingTotalWarnings={buildCandidateMissingTotalWarnings(candidate)}
                  duplicateWarnings={buildDuplicateWarningLabels(
                    findCandidateDataDuplicateMatches(
                      {
                        merchant: candidate.merchant,
                        transactionDate: candidate.transaction_date,
                        totalAmount:
                          typeof candidate.total_amount === "number"
                            ? candidate.total_amount
                            : candidate.total_amount === null
                              ? null
                              : Number(candidate.total_amount),
                      },
                      candidates,
                      candidate.created_by,
                      {
                        excludeCandidateId: candidate.id,
                        receiptFileNames,
                        receiptUploadedAtById,
                      }
                    )
                  )}
                  onToggleExpanded={() => onToggleExpanded(row.id)}
                  onRequestDismiss={() => onRequestDismiss(candidate)}
                  onRequestReview={() => onRequestReview(candidate)}
                />
              );
            })}
          </div>
        )}

        {dismissError ? (
          <Alert variant="destructive">
            <AlertDescription>{dismissError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <AlertDialog
        open={dismissTarget !== null}
        onOpenChange={(open) => {
          if (!open && dismissPhase !== "dismissing") {
            onCancelDismiss();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss pending candidate?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This removes the pending candidate only. The receipt upload and storage file stay
                unchanged. No expense will be deleted because none was created.
              </p>
              {dismissTarget ? (
                <p className="font-medium">
                  {dismissTarget.merchant ?? "Receipt candidate"}
                </p>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissPhase === "dismissing"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={dismissPhase === "dismissing"}
              onClick={(event) => {
                event.preventDefault();
                onConfirmDismiss();
              }}
            >
              {dismissPhase === "dismissing" ? "Dismissing…" : RECEIPT_CANDIDATE_DISMISS_ACTION}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function useReceiptCandidatePanelState() {
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [dismissTarget, setDismissTarget] = useState<ReceiptCandidate | null>(null);
  const [dismissPhase, setDismissPhase] = useState<"idle" | "dismissing">("idle");
  const [dismissError, setDismissError] = useState<string | null>(null);

  return {
    expandedCandidateId,
    setExpandedCandidateId,
    dismissTarget,
    setDismissTarget,
    dismissPhase,
    setDismissPhase,
    dismissError,
    setDismissError,
  };
}
