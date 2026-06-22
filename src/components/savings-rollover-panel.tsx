import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SavingsContribution, SavingsGoalParticipant } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { upsertMySavingsGoalParticipant } from "@/lib/savings";
import {
  buildContinuePeriodPayload,
  buildNextPeriodPreview,
  buildRolloverInfo,
  type SavingsRolloverDisplayView,
} from "@/lib/savings-rollover";
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
import { Loader as Loader2 } from "lucide-react";

type SavingsContinuePeriodDialogProps = {
  participant: SavingsGoalParticipant;
  contributions: SavingsContribution[];
  householdId: string;
  userId: string;
  personId: string | null;
  display: SavingsRolloverDisplayView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
};

export function SavingsContinuePeriodDialog({
  participant,
  contributions,
  householdId,
  userId,
  personId,
  display,
  open,
  onOpenChange,
  onSaved,
}: SavingsContinuePeriodDialogProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () => buildNextPeriodPreview(participant, contributions, userId, new Date(), true),
    [participant, contributions, userId]
  );
  const rollover = useMemo(
    () => buildRolloverInfo(participant, contributions, userId),
    [participant, contributions, userId]
  );

  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
      setError(null);
    }
  }, [open]);

  const handleContinueClick = () => {
    setError(null);
    if (!preview) {
      setError("Next period preview is not available yet.");
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!preview) {
      return;
    }

    const payload = buildContinuePeriodPayload(participant, preview, userId);
    if ("error" in payload) {
      setError(payload.error);
      return;
    }

    setSaving(true);
    setError(null);

    const { error: saveError } = await upsertMySavingsGoalParticipant(
      householdId,
      userId,
      {
        savingsGoalId: payload.savingsGoalId,
        targetContributionAmount: payload.targetContributionAmount,
        contributionPeriod: payload.contributionPeriod,
        personId,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
      }
    );

    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    setConfirmOpen(false);
    onOpenChange(false);
    await onSaved();
  };

  if (!display.canContinue) {
    return null;
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        {display.continueActionLabel}
      </Button>

      <AlertDialog
        open={open && !confirmOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onOpenChange(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Continue to next period</AlertDialogTitle>
            <AlertDialogDescription>
              This updates only your contribution target period fields. The other
              member&apos;s target stays private.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {preview ? (
            <div className="space-y-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <p>
                Next period:{" "}
                <span className="font-medium">{preview.periodLabel}</span>
              </p>
              <p>
                Period dates:{" "}
                <span className="font-medium">
                  {preview.periodStart} – {preview.periodEnd}
                </span>
              </p>
              <p>
                Base target:{" "}
                <span className="font-medium">
                  {formatCurrency(preview.baseTargetAmount)}
                </span>
              </p>
              {preview.includeRollover && (
                <p>
                  Rollover shortfall:{" "}
                  <span className="font-medium">
                    {formatCurrency(preview.rolloverAmount)}
                  </span>
                </p>
              )}
              <p>
                New target amount:{" "}
                <span className="font-medium">
                  {formatCurrency(preview.suggestedTargetAmount)}
                </span>
              </p>
              {!preview.includeRollover && rollover.configured && (
                <p className="text-muted-foreground">{rollover.statusLabel}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Next period preview is not available.
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handleContinueClick} disabled={!preview}>
              Review and confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update my period target?</AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites your current period start, period end, and target amount
              for this goal. Your logged contributions are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {preview && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
              <p>
                New target:{" "}
                <span className="font-medium">
                  {formatCurrency(preview.suggestedTargetAmount)}
                </span>
              </p>
              <p>
                New period:{" "}
                <span className="font-medium">
                  {preview.periodStart} – {preview.periodEnd}
                </span>
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button onClick={handleConfirm} disabled={saving || !preview}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm update
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type SavingsRolloverPanelProps = {
  display: SavingsRolloverDisplayView;
  continueDialog: ReactNode;
};

export function SavingsRolloverPanel({
  display,
  continueDialog,
}: SavingsRolloverPanelProps) {
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-medium">{display.sectionTitle}</h4>
        {display.canContinue && continueDialog}
      </div>

      {display.isSharedGoal && (
        <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {display.privacyCopy && <p>{display.privacyCopy}</p>}
          {display.otherUserPrivacyLabel && <p>{display.otherUserPrivacyLabel}</p>}
          {display.sharedMetadataCopy && <p>{display.sharedMetadataCopy}</p>}
        </div>
      )}

      <div className="grid gap-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
        <p>
          Status: <span className="font-medium">{display.statusLabel}</span>
        </p>
        <p>
          Current period:{" "}
          <span className="font-medium">{display.currentPeriodLabel}</span>
        </p>
        <p>
          Period start:{" "}
          <span className="font-medium">{display.periodStartLabel}</span>
        </p>
        <p>
          Period end:{" "}
          <span className="font-medium">{display.periodEndLabel}</span>
        </p>
        <p>
          Contribution period:{" "}
          <span className="font-medium">{display.contributionPeriodLabel}</span>
        </p>
        <p>
          Your target: <span className="font-medium">{display.ownTargetLabel}</span>
        </p>
        <p>
          Your contributions this period:{" "}
          <span className="font-medium">{display.ownContributedLabel}</span>
        </p>
        <p>
          Remaining obligation:{" "}
          <span className="font-medium">{display.ownRemainingLabel}</span>
        </p>
        <p>
          Rollover:{" "}
          <span className="font-medium">{display.rolloverStatusLabel}</span>
        </p>
        <p className="text-xs text-muted-foreground">{display.rolloverExplanation}</p>
        {display.nextPeriodPreviewLabel && (
          <p>
            Next period preview:{" "}
            <span className="font-medium">{display.nextPeriodPreviewLabel}</span>
          </p>
        )}
      </div>
    </div>
  );
}
