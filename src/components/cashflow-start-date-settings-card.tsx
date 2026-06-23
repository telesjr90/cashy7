import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  buildCashflowStartChangeConfirmationCopy,
  buildCashflowStartImpactPreview,
  canUserEditCashflowStartDate,
  CASHFLOW_START_FIRST_TIME_SETUP_COPY,
  CASHFLOW_START_READ_ONLY_COPY,
  formatImpactPreviewCount,
  getCashflowStartSaveBlockedReason,
  isFirstTimeCashflowStartSetup,
  requiresCashflowStartChangeConfirmation,
  validateCashflowStartDateInput,
} from "@/lib/cashflow-start-admin";
import { loadCashflowStartImpactPreviewData, upsertHouseholdCashflowStartDate } from "@/lib/cashflow-settings";
import type { HouseholdMember, HouseholdSettings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader as Loader2 } from "lucide-react";

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

interface CashflowStartDateSettingsCardProps {
  householdId: string;
  userId: string;
  membership: HouseholdMember | null;
  settings: HouseholdSettings | null;
  settingsLoading: boolean;
  settingsError: string | null;
  onSettingsSaved: (settings: HouseholdSettings) => void;
}

export function CashflowStartDateSettingsCard({
  householdId,
  userId,
  membership,
  settings,
  settingsLoading,
  settingsError,
  onSettingsSaved,
}: CashflowStartDateSettingsCardProps) {
  const [cashflowStartDateInput, setCashflowStartDateInput] = useState("");
  const [cashflowSaving, setCashflowSaving] = useState(false);
  const [cashflowSaveError, setCashflowSaveError] = useState<string | null>(null);
  const [cashflowSuccess, setCashflowSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [impactPreview, setImpactPreview] = useState<ReturnType<
    typeof buildCashflowStartImpactPreview
  > | null>(null);

  const currentStartDate = settings?.cashflow_start_date ?? null;
  const canEdit = canUserEditCashflowStartDate(membership);
  const isFirstTimeSetup = isFirstTimeCashflowStartSetup(currentStartDate);
  const validation = useMemo(
    () => validateCashflowStartDateInput(cashflowStartDateInput),
    [cashflowStartDateInput]
  );
  const confirmationCopy = useMemo(
    () => buildCashflowStartChangeConfirmationCopy(),
    []
  );

  useEffect(() => {
    if (currentStartDate) {
      setCashflowStartDateInput(currentStartDate);
    }
  }, [currentStartDate]);

  const saveBlockedReason = getCashflowStartSaveBlockedReason({
    canEdit,
    validation,
    currentStartDate,
    proposedStartDate: cashflowStartDateInput,
  });

  const loadImpactPreview = async (proposedStartDate: string) => {
    setImpactLoading(true);
    setImpactError(null);

    const { data, error } = await loadCashflowStartImpactPreviewData(
      householdId,
      userId
    );

    setImpactLoading(false);

    if (error || !data || !currentStartDate) {
      setImpactError(error ?? "Could not load impact preview.");
      setImpactPreview(null);
      return;
    }

    setImpactPreview(
      buildCashflowStartImpactPreview({
        billInstances: data.billInstances,
        manualExpenses: data.manualExpenses,
        debtPayments: data.debtPayments,
        savingsContributions: data.savingsContributions,
        signedInUserId: userId,
        currentStartDate,
        proposedStartDate,
      })
    );
  };

  const performSave = async (proposedStartDate: string) => {
    setCashflowSaveError(null);
    setCashflowSuccess(null);
    setCashflowSaving(true);

    const { settings: updated, error } = await upsertHouseholdCashflowStartDate(
      householdId,
      proposedStartDate
    );

    setCashflowSaving(false);

    if (error) {
      setCashflowSaveError(error);
      return false;
    }

    if (updated) {
      onSettingsSaved(updated);
      setCashflowStartDateInput(updated.cashflow_start_date);
    }

    setCashflowSuccess(
      isFirstTimeSetup
        ? "Cashflow start date saved."
        : "Cashflow start date updated."
    );
    return true;
  };

  const handleSaveClick = async () => {
    setCashflowSaveError(null);
    setCashflowSuccess(null);

    if (saveBlockedReason) {
      setCashflowSaveError(saveBlockedReason);
      return;
    }

    const proposedStartDate = cashflowStartDateInput.trim();

    if (
      requiresCashflowStartChangeConfirmation(currentStartDate, proposedStartDate)
    ) {
      setConfirmOpen(true);
      await loadImpactPreview(proposedStartDate);
      return;
    }

    await performSave(proposedStartDate);
  };

  const handleConfirmSave = async () => {
    const proposedStartDate = cashflowStartDateInput.trim();
    const saved = await performSave(proposedStartDate);
    if (saved) {
      setConfirmOpen(false);
      setImpactPreview(null);
      setImpactError(null);
    }
  };

  const handleConfirmOpenChange = (open: boolean) => {
    setConfirmOpen(open);
    if (!open) {
      setImpactPreview(null);
      setImpactError(null);
      setImpactLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cashflow start date</CardTitle>
        <CardDescription>
          The household date when cashflow tracking begins. Shared for all members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settingsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings...
          </div>
        ) : settingsError ? (
          <Alert variant="destructive">
            <AlertDescription>{settingsError}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              {currentStartDate ? (
                <p>
                  Current start date:{" "}
                  <span className="font-medium">
                    {formatDisplayDate(currentStartDate)}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  No cashflow start date set yet.
                </p>
              )}

              {!canEdit && (
                <p className="text-muted-foreground">{CASHFLOW_START_READ_ONLY_COPY}</p>
              )}

              {canEdit && isFirstTimeSetup && (
                <p className="text-muted-foreground">
                  {CASHFLOW_START_FIRST_TIME_SETUP_COPY}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cashflow-start-date">Start date</Label>
              <Input
                id="cashflow-start-date"
                type="date"
                value={cashflowStartDateInput}
                onChange={(event) => setCashflowStartDateInput(event.target.value)}
                disabled={!canEdit || cashflowSaving}
                readOnly={!canEdit}
              />
            </div>

            {cashflowSaveError && (
              <Alert variant="destructive">
                <AlertDescription>{cashflowSaveError}</AlertDescription>
              </Alert>
            )}
            {cashflowSuccess && (
              <Alert>
                <AlertDescription>{cashflowSuccess}</AlertDescription>
              </Alert>
            )}

            {canEdit && (
              <Button onClick={handleSaveClick} disabled={cashflowSaving}>
                {cashflowSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isFirstTimeSetup ? "Save start date" : "Change start date"}
              </Button>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationCopy.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>{confirmationCopy.intro}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {confirmationCopy.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 rounded-md border px-3 py-3 text-sm">
            <p className="font-medium text-foreground">Impact preview</p>
            {impactLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculating impact...
              </div>
            ) : impactError ? (
              <p className="text-destructive">{impactError}</p>
            ) : impactPreview ? (
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  {impactPreview.labels.bills}:{" "}
                  {formatImpactPreviewCount(impactPreview.bills)}
                </li>
                <li>
                  {impactPreview.labels.expenses}:{" "}
                  {formatImpactPreviewCount(impactPreview.expenses)}
                </li>
                <li>
                  {impactPreview.labels.debtPayments}:{" "}
                  {formatImpactPreviewCount(impactPreview.debtPayments)}
                </li>
                <li>
                  {impactPreview.labels.savingsContributions}:{" "}
                  {formatImpactPreviewCount(impactPreview.savingsContributions)}
                </li>
              </ul>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cashflowSaving}>Cancel</AlertDialogCancel>
            <Button onClick={handleConfirmSave} disabled={cashflowSaving}>
              {cashflowSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm change
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
