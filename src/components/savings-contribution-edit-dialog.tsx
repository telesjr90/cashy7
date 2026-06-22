import { useEffect, useState } from "react";
import type { SavingsContribution } from "@/lib/types";
import {
  buildOwnContributionDeleteId,
  buildOwnContributionUpdatePayload,
  canUserEditContribution,
  ownContributionEditFormFromContribution,
  validateOwnContributionEditForm,
  type OwnContributionEditFormValues,
} from "@/lib/savings-edit";
import {
  SAVINGS_CONTRIBUTION_CASH_DEDUCTION_SEPARATE_LABEL,
  SAVINGS_CONTRIBUTION_EDIT_NO_CASH_ADJUST_LABEL,
} from "@/lib/savings-cash-actions";
import {
  deleteMySavingsContribution,
  updateMySavingsContribution,
} from "@/lib/savings";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader as Loader2 } from "lucide-react";

type SavingsContributionEditDialogProps = {
  contribution: SavingsContribution | null;
  hasCashDeduction?: boolean;
  householdId: string;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
};

export function SavingsContributionEditDialog({
  contribution,
  hasCashDeduction = false,
  householdId,
  userId,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: SavingsContributionEditDialogProps) {
  const [form, setForm] = useState<OwnContributionEditFormValues>({
    amount: "",
    contributionDate: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canEdit =
    contribution !== null && canUserEditContribution(contribution, userId);

  useEffect(() => {
    if (contribution && open) {
      setForm(ownContributionEditFormFromContribution(contribution));
      setError(null);
      setDeleteError(null);
    }
  }, [contribution, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
      setDeleteConfirmOpen(false);
      setDeleteError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!contribution) {
      return;
    }

    const validated = validateOwnContributionEditForm(form);
    if (validated.error || !validated.values) {
      setError(validated.error);
      return;
    }

    setSaving(true);
    setError(null);

    const payload = buildOwnContributionUpdatePayload(validated.values);
    const { error: saveError } = await updateMySavingsContribution(
      householdId,
      userId,
      contribution.id,
      {
        amount: Number(payload.amount),
        contributionDate: payload.contribution_date!,
        notes: payload.notes,
      }
    );

    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    await onSaved();
    handleOpenChange(false);
  };

  const handleDelete = async () => {
    if (!contribution) {
      return;
    }

    const deletePayload = buildOwnContributionDeleteId(contribution, userId);
    if ("error" in deletePayload) {
      setDeleteError(deletePayload.error);
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const { error: removeError } = await deleteMySavingsContribution(
      householdId,
      userId,
      deletePayload.contributionId
    );

    setDeleting(false);

    if (removeError) {
      setDeleteError(removeError);
      return;
    }

    setDeleteConfirmOpen(false);
    handleOpenChange(false);
    await onDeleted();
  };

  if (!contribution || !canEdit) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit contribution</DialogTitle>
            <DialogDescription>
              Update your contribution details. This does not change current cash.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {hasCashDeduction && (
              <Alert>
                <AlertDescription>
                  {SAVINGS_CONTRIBUTION_CASH_DEDUCTION_SEPARATE_LABEL}{" "}
                  {SAVINGS_CONTRIBUTION_EDIT_NO_CASH_ADJUST_LABEL}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-contribution-amount">Amount</Label>
              <Input
                id="edit-contribution-amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, amount: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-contribution-date">Contribution date</Label>
              <Input
                id="edit-contribution-date"
                type="date"
                value={form.contributionDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    contributionDate: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-contribution-notes">Notes (optional)</Label>
              <Textarea
                id="edit-contribution-notes"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows={2}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save contribution
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={saving}
            >
              Delete contribution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contribution?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your contribution record. Current cash is not
              adjusted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete contribution
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
