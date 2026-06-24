import { useEffect, useState } from "react";
import type {
  SavingsContributionPeriod,
  SavingsGoalParticipant,
} from "@/lib/types";
import {
  buildOwnParticipantDeleteId,
  buildOwnTargetUpdatePayload,
  canUserEditParticipant,
  ownTargetEditFormFromParticipant,
  validateOwnTargetEditForm,
  type OwnTargetEditFormValues,
} from "@/lib/savings-edit";
import {
  deleteMySavingsGoalParticipant,
  upsertMySavingsGoalParticipant,
} from "@/lib/savings";
import { MOBILE_FORM_GRID_TWO_COL } from "@/lib/mobile-form-layout";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader as Loader2 } from "lucide-react";

const CONTRIBUTION_PERIOD_LABELS: Record<SavingsContributionPeriod, string> = {
  "1_14": "1st–14th of month",
  "15_eom": "15th–end of month",
  monthly: "Monthly",
};

type SavingsTargetEditDialogProps = {
  participant: SavingsGoalParticipant | null;
  savingsGoalId: string;
  householdId: string;
  userId: string;
  personId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
};

export function SavingsTargetEditDialog({
  participant,
  savingsGoalId,
  householdId,
  userId,
  personId,
  open,
  onOpenChange,
  onSaved,
}: SavingsTargetEditDialogProps) {
  const [form, setForm] = useState<OwnTargetEditFormValues>({
    targetAmount: "",
    contributionPeriod: "",
    periodStart: "",
    periodEnd: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const isEditingExisting =
    participant !== null && canUserEditParticipant(participant, userId);

  useEffect(() => {
    if (open) {
      if (participant) {
        setForm(ownTargetEditFormFromParticipant(participant));
      } else {
        setForm({
          targetAmount: "",
          contributionPeriod: "",
          periodStart: "",
          periodEnd: "",
        });
      }
      setError(null);
      setResetError(null);
    }
  }, [participant, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
      setResetConfirmOpen(false);
      setResetError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    const validated = validateOwnTargetEditForm(form);
    if (validated.error || !validated.values) {
      setError(validated.error);
      return;
    }

    setSaving(true);
    setError(null);

    const payload = buildOwnTargetUpdatePayload(validated.values);
    const { error: saveError } = await upsertMySavingsGoalParticipant(
      householdId,
      userId,
      {
        savingsGoalId,
        targetContributionAmount: Number(payload.target_contribution_amount),
        contributionPeriod: payload.contribution_period!,
        personId,
        periodStart: payload.period_start ?? null,
        periodEnd: payload.period_end ?? null,
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

  const handleReset = async () => {
    if (!participant) {
      return;
    }

    const deletePayload = buildOwnParticipantDeleteId(participant, userId);
    if ("error" in deletePayload) {
      setResetError(deletePayload.error);
      return;
    }

    setResetting(true);
    setResetError(null);

    const { error: removeError } = await deleteMySavingsGoalParticipant(
      householdId,
      userId,
      deletePayload.participantId
    );

    setResetting(false);

    if (removeError) {
      setResetError(removeError);
      return;
    }

    setResetConfirmOpen(false);
    handleOpenChange(false);
    await onSaved();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit my target</DialogTitle>
            <DialogDescription>
              Update only your contribution target. The other member&apos;s target
              stays private.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-target-amount">Target contribution amount</Label>
              <Input
                id="edit-target-amount"
                type="number"
                min="0"
                step="0.01"
                value={form.targetAmount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetAmount: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-target-period">Contribution period</Label>
              <Select
                value={form.contributionPeriod || undefined}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    contributionPeriod: value as SavingsContributionPeriod,
                  }))
                }
              >
                <SelectTrigger id="edit-target-period" className="w-full">
                  <SelectValue placeholder="Select contribution period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1_14">
                    {CONTRIBUTION_PERIOD_LABELS["1_14"]}
                  </SelectItem>
                  <SelectItem value="15_eom">
                    {CONTRIBUTION_PERIOD_LABELS["15_eom"]}
                  </SelectItem>
                  <SelectItem value="monthly">
                    {CONTRIBUTION_PERIOD_LABELS.monthly}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={MOBILE_FORM_GRID_TWO_COL}>
              <div className="space-y-2">
                <Label htmlFor="edit-target-start">Period start (optional)</Label>
                <Input
                  id="edit-target-start"
                  type="date"
                  value={form.periodStart}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      periodStart: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-target-end">Period end (optional)</Label>
                <Input
                  id="edit-target-end"
                  type="date"
                  value={form.periodEnd}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      periodEnd: event.target.value,
                    }))
                  }
                />
              </div>
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
              Save my target
            </Button>

            {isEditingExisting && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetConfirmOpen(true)}
                disabled={saving}
              >
                Reset my target
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset my target?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your saved target for this goal. Your logged contributions
              are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {resetError && (
            <Alert variant="destructive">
              <AlertDescription>{resetError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset my target
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
