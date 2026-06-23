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
  fetchImportDuplicateContext,
} from "@/lib/import-apply-service";
import {
  buildImportStrategyPlan,
  strategyPlanHasWritableActions,
  type ImportDuplicateStrategy,
  type ImportStrategyPlan,
} from "@/lib/import-duplicates";
import { IMPORT_NO_RECORDS_CHANGED_COPY } from "@/lib/import-upload";
import { ImportDuplicateStrategyPanel } from "@/components/import-duplicate-strategy-panel";
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

function formatScopeLabel(year: number | null, month: number | null): string | null {
  if (year === null || month === null) {
    return null;
  }
  return `${month}/${year}`;
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
  const [strategy, setStrategy] = useState<ImportDuplicateStrategy>("create_new_only");
  const [planBuild, setPlanBuild] = useState<ReturnType<typeof buildImportCreatePlans> | null>(
    null
  );
  const [duplicateContext, setDuplicateContext] = useState<
    Awaited<ReturnType<typeof fetchImportDuplicateContext>>["context"] | null
  >(null);

  const isOwner = canUserApplyImport(membership);
  const canConfirm = validation.summary.canContinue && isOwner && applyPhase !== "applying";

  const strategyPlan = useMemo<ImportStrategyPlan | null>(() => {
    if (!planBuild || !duplicateContext) {
      return null;
    }
    return buildImportStrategyPlan({
      strategy,
      createPlans: planBuild.plans,
      skippedFromBuild: planBuild.skipped,
      excludedFromBuild: planBuild.excluded,
      context: duplicateContext,
      userId,
    });
  }, [duplicateContext, planBuild, strategy, userId]);

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
    const { context, applyContext, error } = await fetchImportDuplicateContext(
      householdId,
      userId
    );
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
      context: { ...applyContext, allowDuplicates: true },
    });
    setDuplicateContext(context);
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
    if (built && strategyPlan && strategyPlanHasWritableActions(strategyPlan)) {
      setConfirmOpen(true);
    } else if (built && strategyPlan) {
      setApplyError("No records are eligible to apply with the selected duplicate strategy.");
    }
  };

  const handleApply = async () => {
    const currentBuild = planBuild ?? (await preparePlans());
    if (!currentBuild || !strategyPlan) {
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
      strategyPlan,
    });

    setApplyResult(result);
    setApplyPhase("done");

    if (result.success || result.partial) {
      onApplied?.();
    }
  };

  const summary = confirmationSummary;
  const isBusy = applyPhase === "loading-context" || applyPhase === "applying";
  const scopeLabel = formatScopeLabel(
    strategyPlan?.scopeYear ?? null,
    strategyPlan?.scopeMonth ?? null
  );

  return (
    <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Confirm import</h4>
        <p className="text-sm text-muted-foreground">
          Choose how duplicates are handled, review the plan, then apply only when you are
          ready. Nothing is written until you confirm.
        </p>
      </div>

      {!isOwner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{IMPORT_OWNER_ONLY_COPY}</AlertDescription>
        </Alert>
      )}

      {isOwner && strategyPlan && (
        <ImportDuplicateStrategyPanel
          strategy={strategy}
          onStrategyChange={setStrategy}
          strategyPlan={strategyPlan}
          scopeLabel={scopeLabel}
        />
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
            <dt className="text-muted-foreground">Candidate rows</dt>
            <dd className="font-medium">{summary.rowsToCreate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Validation skipped</dt>
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
          {strategyPlan && (
            <>
              <div>
                <dt className="text-muted-foreground">Planned creates</dt>
                <dd className="font-medium">{strategyPlan.summary.toCreate}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Planned updates</dt>
                <dd className="font-medium">{strategyPlan.summary.toUpdate}</dd>
              </div>
            </>
          )}
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
                <li>Bill templates created: {applyResult.counts.billTemplates}</li>
              )}
              {applyResult.counts.billInstances > 0 && (
                <li>Bill instances created: {applyResult.counts.billInstances}</li>
              )}
              {applyResult.counts.updated > 0 && (
                <li>Records updated: {applyResult.counts.updated}</li>
              )}
              {applyResult.counts.replacedDeleted > 0 && (
                <li>Records replaced/deleted: {applyResult.counts.replacedDeleted}</li>
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
              {applyResult.counts.skippedDuplicate > 0 && (
                <li>Duplicates skipped: {applyResult.counts.skippedDuplicate}</li>
              )}
              {applyResult.counts.skippedProtected > 0 && (
                <li>Protected skipped: {applyResult.counts.skippedProtected}</li>
              )}
              {applyResult.counts.skippedAmbiguous > 0 && (
                <li>Ambiguous skipped: {applyResult.counts.skippedAmbiguous}</li>
              )}
              {applyResult.counts.skipped > 0 && (
                <li>Total skipped: {applyResult.counts.skipped}</li>
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
                {strategyPlan && (
                  <p>
                    Strategy: {strategy.replaceAll("_", " ")}. This import will create{" "}
                    {strategyPlan.summary.toCreate}, update {strategyPlan.summary.toUpdate},
                    and replace/delete {strategyPlan.summary.toReplaceDelete} record
                    {strategyPlan.summary.toReplaceDelete === 1 ? "" : "s"} from {summary?.fileName}.
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
