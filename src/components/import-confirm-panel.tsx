import { useEffect, useMemo, useState } from "react";
import type { ImportValidationResult } from "@/lib/import-validation";
import {
  buildImportConfirmationSummary,
  buildImportCreatePlans,
  canUserApplyImport,
  IMPORT_APPLY_BUTTON_LABEL,
  IMPORT_APPLIED_COPY,
  IMPORT_CONFIRM_INTRO_COPY,
  IMPORT_CONFIRM_NO_CASH_COPY,
  IMPORT_CONFIRM_REVIEW_COPY,
  IMPORT_NO_CASH_DEDUCTED_COPY,
  IMPORT_OWNER_ONLY_COPY,
  IMPORT_ROLLBACK_LATER_COPY,
  type ImportApplyResultSummary,
} from "@/lib/import-apply";
import {
  applyImport,
  fetchImportApplyContext,
} from "@/lib/import-apply-service";
import { IMPORT_NO_RECORDS_CHANGED_COPY } from "@/lib/import-upload";
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
import { Button } from "@/components/ui/button";
import type { HouseholdMember } from "@/lib/types";
import { Loader2 } from "lucide-react";

type ImportConfirmPanelProps = {
  validation: ImportValidationResult;
  fileName: string;
  fileKind: string;
  sheetName: string;
  sheetCount: number;
  householdId: string;
  userId: string;
  personId: string | null;
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined;
  onApplied?: () => void;
};

type ApplyPhase = "idle" | "loading-context" | "applying" | "done";

function formatKindLabel(kind: string, count: number): string | null {
  if (count <= 0) {
    return null;
  }
  switch (kind) {
    case "bill_template":
      return `${count} bill template${count === 1 ? "" : "s"}`;
    case "bill_instance":
      return `${count} bill instance${count === 1 ? "" : "s"}`;
    case "debt_payment_with_bill":
      return `${count} debt payment${count === 1 ? "" : "s"} with linked bill${count === 1 ? "" : "s"}`;
    case "manual_expense":
      return `${count} manual expense${count === 1 ? "" : "s"}`;
    case "savings_contribution":
      return `${count} savings contribution${count === 1 ? "" : "s"}`;
    default:
      return `${count} ${kind}`;
  }
}

export function ImportConfirmPanel({
  validation,
  fileName,
  fileKind,
  sheetName,
  sheetCount,
  householdId,
  userId,
  personId,
  membership,
  onApplied,
}: ImportConfirmPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ImportApplyResultSummary | null>(null);
  const [planContextReady, setPlanContextReady] = useState(false);
  const [planBuild, setPlanBuild] = useState<ReturnType<typeof buildImportCreatePlans> | null>(
    null
  );

  const isOwner = canUserApplyImport(membership);
  const canConfirm = validation.summary.canContinue && isOwner && applyPhase !== "applying";

  const confirmationSummary = useMemo(() => {
    if (!planBuild) {
      return null;
    }
    return buildImportConfirmationSummary({
      fileName,
      sheetName,
      sheetCount,
      validationRows: validation.rows,
      planBuild,
    });
  }, [fileName, planBuild, sheetCount, sheetName, validation.rows]);

  const preparePlans = async (): Promise<ReturnType<typeof buildImportCreatePlans> | null> => {
    setApplyError(null);
    setApplyPhase("loading-context");
    const { context, error } = await fetchImportApplyContext(householdId, userId);
    if (error) {
      setApplyError(error);
      setApplyPhase("idle");
      return null;
    }

    const built = buildImportCreatePlans({
      rows: validation.rows,
      householdId,
      userId,
      personId,
      fileName,
      context,
    });
    setPlanBuild(built);
    setPlanContextReady(true);
    setApplyPhase("idle");
    return built;
  };

  useEffect(() => {
    if (!validation.summary.canContinue || !isOwner || planContextReady) {
      return;
    }
    void preparePlans();
  }, [validation.summary.canContinue, isOwner, householdId, userId, fileName]);

  const handleOpenConfirm = async () => {
    const built = planBuild ?? (await preparePlans());
    if (built) {
      setConfirmOpen(true);
    }
  };

  const handleApply = async () => {
    const currentBuild = planBuild ?? (await preparePlans());
    if (!currentBuild) {
      return;
    }

    setApplyPhase("applying");
    setApplyError(null);
    setConfirmOpen(false);

    const result = await applyImport({
      householdId,
      userId,
      membership,
      fileName,
      fileKind,
      plans: currentBuild.plans,
      skippedCount: currentBuild.skipped.length + currentBuild.excluded.length,
    });

    setApplyResult(result);
    setApplyPhase("done");

    if (result.success || result.partial) {
      onApplied?.();
    }
  };

  const summary = confirmationSummary;
  const isBusy = applyPhase === "loading-context" || applyPhase === "applying";

  return (
    <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Confirm import</h4>
        <p className="text-sm text-muted-foreground">
          Review what will be created, then apply only when you are ready. Nothing is
          written until you confirm.
        </p>
      </div>

      {!isOwner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{IMPORT_OWNER_ONLY_COPY}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">File</dt>
            <dd className="font-medium">{summary.fileName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sheet</dt>
            <dd className="font-medium">{summary.sheetSummary}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rows to create</dt>
            <dd className="font-medium">{summary.rowsToCreate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Skipped rows</dt>
            <dd className="font-medium">{summary.skippedRows}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Warning rows</dt>
            <dd className="font-medium">{summary.warningRows}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Error rows</dt>
            <dd className="font-medium">{summary.errorRows}</dd>
          </div>
        </dl>
      )}

      {summary && summary.rowsToCreate > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-sm">
          {Object.entries(summary.countsByKind)
            .map(([kind, count]) => formatKindLabel(kind, count))
            .filter((label): label is string => Boolean(label))
            .map((label) => (
              <li key={label}>{label}</li>
            ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">{IMPORT_NO_RECORDS_CHANGED_COPY}</p>

      {applyResult && (
        <Alert role="status" aria-live="polite">
          <AlertDescription className="space-y-1">
            <p className="font-medium">{applyResult.userMessage || IMPORT_APPLIED_COPY}</p>
            <p>{IMPORT_NO_CASH_DEDUCTED_COPY}</p>
            <p>{IMPORT_ROLLBACK_LATER_COPY}</p>
            <ul className="list-disc space-y-0.5 pl-4 text-sm">
              {applyResult.counts.billTemplates > 0 && (
                <li>Bill templates: {applyResult.counts.billTemplates}</li>
              )}
              {applyResult.counts.billInstances > 0 && (
                <li>Bill instances: {applyResult.counts.billInstances}</li>
              )}
              {applyResult.counts.debtPayments > 0 && (
                <li>Debt payments: {applyResult.counts.debtPayments}</li>
              )}
              {applyResult.counts.linkedDebtBills > 0 && (
                <li>Linked debt bills: {applyResult.counts.linkedDebtBills}</li>
              )}
              {applyResult.counts.manualExpenses > 0 && (
                <li>Manual expenses: {applyResult.counts.manualExpenses}</li>
              )}
              {applyResult.counts.savingsContributions > 0 && (
                <li>Savings contributions: {applyResult.counts.savingsContributions}</li>
              )}
              {applyResult.counts.skipped > 0 && (
                <li>Skipped: {applyResult.counts.skipped}</li>
              )}
              {applyResult.counts.failed > 0 && <li>Failed: {applyResult.counts.failed}</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {applyError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{applyError}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        disabled={!canConfirm || isBusy || applyPhase === "done"}
        onClick={handleOpenConfirm}
      >
        {isBusy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
        {IMPORT_APPLY_BUTTON_LABEL}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{IMPORT_APPLY_BUTTON_LABEL}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{IMPORT_CONFIRM_INTRO_COPY}</p>
                <p>{IMPORT_CONFIRM_NO_CASH_COPY}</p>
                <p>{IMPORT_CONFIRM_REVIEW_COPY}</p>
                {summary && (
                  <p>
                    This import will create {summary.rowsToCreate} record
                    {summary.rowsToCreate === 1 ? "" : "s"} from {summary.fileName}.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={handleApply}>
              {IMPORT_APPLY_BUTTON_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
