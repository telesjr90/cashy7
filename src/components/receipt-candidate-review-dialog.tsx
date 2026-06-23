import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildApprovedExpenseSummaryLabel,
  RECEIPT_APPROVAL_ACTION,
  RECEIPT_APPROVAL_ALREADY_APPROVED_COPY,
  RECEIPT_APPROVAL_CONFIRMATION_LINES,
  RECEIPT_APPROVAL_CONFIRMATION_TITLE,
  RECEIPT_APPROVAL_SUCCESS_LINES,
  validateCandidateApprovalForm,
} from "@/lib/receipt-approval";
import { approveReceiptCandidate } from "@/lib/receipt-approval-service";
import {
  candidateReviewFormFromCandidate,
  formatReviewLineItemLabel,
  RECEIPT_CANDIDATE_SAVE_DRAFT_ACTION,
  validateCandidateReviewForm,
  type CandidateReviewFormValues,
  type CandidateReviewSourceContext,
} from "@/lib/receipt-candidate-review";
import { updateReceiptCandidateDraft } from "@/lib/receipt-candidate-service";
import {
  RECEIPT_CANDIDATE_DRAFT_COPY,
  RECEIPT_CANDIDATE_NO_EXPENSE_COPY,
  RECEIPT_CANDIDATE_PRIVATE_COPY,
} from "@/lib/receipt-candidates";
import type { ReceiptCandidate, ReceiptUpload } from "@/lib/types";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type ReceiptCandidateReviewDialogProps = {
  candidate: ReceiptCandidate | null;
  receiptUpload: Pick<ReceiptUpload, "id" | "uploaded_by"> | null;
  receiptFileName?: string | null;
  receiptUploadedAt?: string | null;
  householdId: string;
  userId: string;
  personId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  onApproved: () => Promise<void>;
};

const EMPTY_SOURCE: CandidateReviewSourceContext = {
  receiptFileName: null,
  receiptUploadDateLabel: null,
  extractionStatusLabel: "Unknown",
  confidenceLabel: null,
  warnings: [],
  lineItems: [],
  fieldConfidenceLabels: [],
};

export function ReceiptCandidateReviewDialog({
  candidate,
  receiptUpload,
  receiptFileName = null,
  receiptUploadedAt = null,
  householdId,
  userId,
  personId = null,
  open,
  onOpenChange,
  onSaved,
  onApproved,
}: ReceiptCandidateReviewDialogProps) {
  const [form, setForm] = useState<CandidateReviewFormValues>({
    merchant: "",
    transactionDate: "",
    totalAmount: "",
    taxAmount: "",
    category: "",
  });
  const [sourceContext, setSourceContext] = useState<CandidateReviewSourceContext>(EMPTY_SOURCE);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [approvalSuccessLines, setApprovalSuccessLines] = useState<string[]>([]);
  const [approvedExpenseSummary, setApprovedExpenseSummary] = useState<string | null>(null);
  const [locallyApproved, setLocallyApproved] = useState(false);

  const isApproved = candidate?.status === "approved" || locallyApproved;
  const isReadOnly = isApproved;

  useEffect(() => {
    if (candidate && open) {
      const model = candidateReviewFormFromCandidate(candidate, {
        fileName: receiptFileName,
        uploadedAt: receiptUploadedAt,
      });
      setForm(model.form);
      setSourceContext(model.source);
      setError(null);
      setValidationWarnings([]);
      setSuccessMessage(null);
      setApprovalSuccessLines([]);
      setApprovedExpenseSummary(
        candidate.status === "approved" &&
          candidate.merchant &&
          candidate.total_amount &&
          candidate.transaction_date
          ? buildApprovedExpenseSummaryLabel({
              description: candidate.merchant,
              amount:
                typeof candidate.total_amount === "number"
                  ? candidate.total_amount
                  : Number(candidate.total_amount),
              expenseDate: candidate.transaction_date,
            })
          : candidate.status === "approved"
            ? "Expense created from this receipt."
            : null
      );
      setLocallyApproved(false);
    }
  }, [candidate, open, receiptFileName, receiptUploadedAt]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
      setValidationWarnings([]);
      setSuccessMessage(null);
      setApprovalSuccessLines([]);
      setConfirmOpen(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!candidate || isReadOnly) {
      return;
    }

    const validated = validateCandidateReviewForm(form);
    setValidationWarnings(validated.warnings);
    if (validated.error || !validated.values) {
      setError(validated.error);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const result = await updateReceiptCandidateDraft({
      candidate,
      userId,
      draft: validated.values,
    });

    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }

    setSuccessMessage(result.successCopy);
    setSaving(false);
    await onSaved();
  };

  const handleRequestApprove = () => {
    if (!candidate || isReadOnly) {
      return;
    }

    const validated = validateCandidateApprovalForm(form);
    setValidationWarnings(validated.warnings);
    if (validated.error || !validated.values) {
      setError(validated.error);
      return;
    }

    setError(null);
    setConfirmOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!candidate || !receiptUpload || isReadOnly) {
      return;
    }

    const validated = validateCandidateApprovalForm(form);
    if (validated.error || !validated.values) {
      setError(validated.error);
      setConfirmOpen(false);
      return;
    }

    setApproving(true);
    setError(null);
    setSuccessMessage(null);
    setApprovalSuccessLines([]);

    const result = await approveReceiptCandidate({
      householdId,
      userId,
      personId,
      candidate,
      receiptUpload,
      draft: validated.values,
      receiptFileName,
    });

    setApproving(false);
    setConfirmOpen(false);

    if (!result.ok) {
      setError(result.error);
      if (result.partial && result.expense) {
        setApprovedExpenseSummary(
          buildApprovedExpenseSummaryLabel({
            description: result.expense.description,
            amount: result.expense.amount,
            expenseDate: result.expense.expense_date,
          })
        );
      }
      return;
    }

    setApprovalSuccessLines([...result.successLines]);
    setApprovedExpenseSummary(result.expenseSummaryLabel);
    setLocallyApproved(true);
    await onApproved();
  };

  const updateField = (field: keyof CandidateReviewFormValues, value: string) => {
    if (isReadOnly) {
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccessMessage(null);
    setApprovalSuccessLines([]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isApproved ? "Approved receipt candidate" : "Review receipt candidate"}
            </DialogTitle>
            <DialogDescription className="space-y-1">
              {isApproved ? (
                <>
                  <p>{RECEIPT_APPROVAL_ALREADY_APPROVED_COPY}</p>
                  <p>{RECEIPT_CANDIDATE_PRIVATE_COPY}</p>
                </>
              ) : (
                <>
                  <p>{RECEIPT_CANDIDATE_DRAFT_COPY}</p>
                  <p>{RECEIPT_CANDIDATE_NO_EXPENSE_COPY}</p>
                  <p>{RECEIPT_CANDIDATE_PRIVATE_COPY}</p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {isApproved ? (
              <Alert>
                <AlertDescription className="space-y-2">
                  {approvalSuccessLines.length > 0
                    ? approvalSuccessLines.map((line) => <p key={line}>{line}</p>)
                    : RECEIPT_APPROVAL_SUCCESS_LINES.map((line) => <p key={line}>{line}</p>)}
                  {approvedExpenseSummary ? (
                    <p className="font-medium">{approvedExpenseSummary}</p>
                  ) : null}
                  <Link to="/expenses" className="font-medium underline underline-offset-4">
                    View in Expenses
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="font-medium">Source receipt</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">File name</dt>
                  <dd>{sourceContext.receiptFileName ?? "Unknown file"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Uploaded</dt>
                  <dd>{sourceContext.receiptUploadDateLabel ?? "Unknown date"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Extraction status</dt>
                  <dd>
                    <Badge variant="secondary">{sourceContext.extractionStatusLabel}</Badge>
                  </dd>
                </div>
                {sourceContext.confidenceLabel ? (
                  <div>
                    <dt className="text-muted-foreground">Confidence</dt>
                    <dd>{sourceContext.confidenceLabel}</dd>
                  </div>
                ) : null}
              </dl>

              {sourceContext.lineItems.length > 0 ? (
                <div className="space-y-1">
                  <p className="font-medium">Line items (read-only)</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {sourceContext.lineItems.map((item, index) => (
                      <li key={`${item.description}-${index}`}>
                        {formatReviewLineItemLabel(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {sourceContext.fieldConfidenceLabels.length > 0 ? (
                <div className="space-y-1">
                  <p className="font-medium">Field confidence (read-only)</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {sourceContext.fieldConfidenceLabels.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {sourceContext.warnings.length > 0 ? (
                <div className="space-y-1">
                  <p className="font-medium">Extraction warnings (read-only)</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {sourceContext.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <p className="font-medium">
                {isApproved ? "Approved draft fields" : "Edit draft fields"}
              </p>
              <div className="space-y-2">
                <Label htmlFor="candidate-merchant">Merchant / description</Label>
                <Input
                  id="candidate-merchant"
                  value={form.merchant}
                  disabled={isReadOnly}
                  onChange={(event) => updateField("merchant", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="candidate-date">Transaction date</Label>
                <Input
                  id="candidate-date"
                  type="date"
                  value={form.transactionDate}
                  disabled={isReadOnly}
                  onChange={(event) => updateField("transactionDate", event.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="candidate-total">Total amount</Label>
                  <Input
                    id="candidate-total"
                    inputMode="decimal"
                    value={form.totalAmount}
                    disabled={isReadOnly}
                    onChange={(event) => updateField("totalAmount", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="candidate-tax">Tax amount</Label>
                  <Input
                    id="candidate-tax"
                    inputMode="decimal"
                    value={form.taxAmount}
                    disabled={isReadOnly}
                    onChange={(event) => updateField("taxAmount", event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="candidate-category">Category</Label>
                <Input
                  id="candidate-category"
                  value={form.category}
                  disabled={isReadOnly}
                  onChange={(event) => updateField("category", event.target.value)}
                />
              </div>
            </div>

            {validationWarnings.length > 0 ? (
              <Alert>
                <AlertDescription className="space-y-1">
                  {validationWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {successMessage ? (
              <Alert>
                <AlertDescription className="space-y-1">
                  <p>{successMessage}</p>
                  <p>{RECEIPT_CANDIDATE_NO_EXPENSE_COPY}</p>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            {!isApproved ? (
              <>
                <Button
                  type="button"
                  disabled={saving || approving || !candidate}
                  onClick={() => void handleSave()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    RECEIPT_CANDIDATE_SAVE_DRAFT_ACTION
                  )}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  disabled={saving || approving || !candidate || !receiptUpload}
                  onClick={handleRequestApprove}
                >
                  {approving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Approving…
                    </>
                  ) : (
                    RECEIPT_APPROVAL_ACTION
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Approval uses the current form values and creates a shared manual expense. No cash
                  is deducted.
                </p>
              </>
            ) : (
              <Button type="button" variant="secondary" asChild>
                <Link to="/expenses">View in Expenses</Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{RECEIPT_APPROVAL_CONFIRMATION_TITLE}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {RECEIPT_APPROVAL_CONFIRMATION_LINES.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {form.merchant.trim() ? (
                <p className="font-medium">{form.merchant.trim()}</p>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={approving}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmApprove();
              }}
            >
              {approving ? "Creating expense…" : RECEIPT_APPROVAL_ACTION}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
