import { useEffect, useState } from "react";
import {
  candidateReviewFormFromCandidate,
  formatReviewLineItemLabel,
  RECEIPT_CANDIDATE_APPROVAL_NEXT_STEP_COPY,
  RECEIPT_CANDIDATE_APPROVAL_PLACEHOLDER_COPY,
  RECEIPT_CANDIDATE_APPROVAL_PLACEHOLDER_LABEL,
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
import type { ReceiptCandidate } from "@/lib/types";
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
  receiptFileName?: string | null;
  receiptUploadedAt?: string | null;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
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
  receiptFileName = null,
  receiptUploadedAt = null,
  userId,
  open,
  onOpenChange,
  onSaved,
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
  const [error, setError] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    }
  }, [candidate, open, receiptFileName, receiptUploadedAt]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
      setValidationWarnings([]);
      setSuccessMessage(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!candidate) {
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

  const updateField = (field: keyof CandidateReviewFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review receipt candidate</DialogTitle>
          <DialogDescription className="space-y-1">
            <p>{RECEIPT_CANDIDATE_DRAFT_COPY}</p>
            <p>{RECEIPT_CANDIDATE_NO_EXPENSE_COPY}</p>
            <p>{RECEIPT_CANDIDATE_PRIVATE_COPY}</p>
            <p>{RECEIPT_CANDIDATE_APPROVAL_NEXT_STEP_COPY}</p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
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
            <p className="font-medium">Edit draft fields</p>
            <div className="space-y-2">
              <Label htmlFor="candidate-merchant">Merchant / description</Label>
              <Input
                id="candidate-merchant"
                value={form.merchant}
                onChange={(event) => updateField("merchant", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="candidate-date">Transaction date</Label>
              <Input
                id="candidate-date"
                type="date"
                value={form.transactionDate}
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
                  onChange={(event) => updateField("totalAmount", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="candidate-tax">Tax amount</Label>
                <Input
                  id="candidate-tax"
                  inputMode="decimal"
                  value={form.taxAmount}
                  onChange={(event) => updateField("taxAmount", event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="candidate-category">Category</Label>
              <Input
                id="candidate-category"
                value={form.category}
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
          <Button type="button" disabled={saving || !candidate} onClick={() => void handleSave()}>
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
            variant="secondary"
            disabled
            title={RECEIPT_CANDIDATE_APPROVAL_PLACEHOLDER_COPY}
          >
            {RECEIPT_CANDIDATE_APPROVAL_PLACEHOLDER_LABEL}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {RECEIPT_CANDIDATE_APPROVAL_PLACEHOLDER_COPY}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
