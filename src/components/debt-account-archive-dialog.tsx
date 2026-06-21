import { useState } from "react";
import type { DebtAccount } from "@/lib/types";
import {
  DEBT_ACCOUNT_ARCHIVE_UNPAID_WARNING,
  getDebtAccountArchiveStatus,
} from "@/lib/debt-accounts";
import { formatCurrency } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader as Loader2 } from "lucide-react";

type DebtAccountArchiveDialogProps = {
  account: DebtAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (archiveReason: string) => Promise<void>;
};

export function DebtAccountArchiveDialog({
  account,
  open,
  onOpenChange,
  onConfirm,
}: DebtAccountArchiveDialogProps) {
  const [archiveReason, setArchiveReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = account ? getDebtAccountArchiveStatus(account) : null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setArchiveReason("");
      setError(null);
      setSubmitting(false);
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (!account) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onConfirm(archiveReason);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive account");
    } finally {
      setSubmitting(false);
    }
  };

  if (!account || !status) {
    return null;
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{status.closeActionLabel}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{status.closeActionDescription}</p>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-foreground">
                <p className="font-medium">{account.name}</p>
                <p>Original: {formatCurrency(account.original_amount)}</p>
                <p>Remaining balance: {formatCurrency(account.current_balance)}</p>
              </div>
              {!status.isPaidOff && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {DEBT_ACCOUNT_ARCHIVE_UNPAID_WARNING}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="archiveReason">Reason (optional)</Label>
          <Textarea
            id="archiveReason"
            placeholder={
              status.isPaidOff
                ? "e.g., Paid off and no longer tracking"
                : "e.g., Consolidated elsewhere"
            }
            value={archiveReason}
            onChange={(event) => setArchiveReason(event.target.value)}
            disabled={submitting}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {status.confirmButtonLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
