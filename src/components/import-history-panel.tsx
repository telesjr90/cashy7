import { useCallback, useEffect, useState } from "react";
import {
  applyImportRollback,
  canUserRollbackImport,
  fetchImportBatches,
  fetchRollbackPreview,
} from "@/lib/import-rollback-service";
import {
  buildImportBatchHistoryDisplay,
  eligibilityLabel,
  IMPORT_ROLLBACK_CONFIRMATION_LINES,
  IMPORT_ROLLBACK_OWNER_ONLY_COPY,
  type ImportBatchHistoryRow,
  type RollbackPreviewGroup,
  type RollbackResultSummary,
} from "@/lib/import-rollback";
import { useAuth } from "@/lib/auth-context";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RotateCcw } from "lucide-react";

type LoadPhase = "idle" | "loading" | "ready" | "error";

function eligibilityBadgeVariant(
  eligibility: RollbackPreviewGroup["items"][number]["eligibility"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (eligibility) {
    case "deletable":
      return "default";
    case "already_removed":
      return "secondary";
    case "protected":
    case "not_visible":
      return "destructive";
    default:
      return "outline";
  }
}

export function ImportHistoryPanel() {
  const { user, household, membership } = useAuth();
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<ImportBatchHistoryRow[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchHistoryRow | null>(null);
  const [previewGroups, setPreviewGroups] = useState<RollbackPreviewGroup[]>([]);
  const [previewPhase, setPreviewPhase] = useState<LoadPhase>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollbackPhase, setRollbackPhase] = useState<"idle" | "applying" | "done">("idle");
  const [rollbackResult, setRollbackResult] = useState<RollbackResultSummary | null>(null);

  const isOwner = canUserRollbackImport(membership);

  const refreshHistory = useCallback(async () => {
    if (!household) {
      return;
    }
    setLoadPhase("loading");
    setLoadError(null);
    const result = await fetchImportBatches(household.id);
    if (result.error) {
      setLoadPhase("error");
      setLoadError(result.error);
      setHistoryRows([]);
      return;
    }
    setHistoryRows(
      buildImportBatchHistoryDisplay({
        batches: result.batches,
        recordsByBatchId: result.recordsByBatchId,
        createdByLabels: result.createdByLabels,
      })
    );
    setLoadPhase("ready");
  }, [household]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const openPreview = async (batch: ImportBatchHistoryRow) => {
    if (!household || !user) {
      return;
    }
    setSelectedBatch(batch);
    setPreviewPhase("loading");
    setPreviewError(null);
    setPreviewGroups([]);
    setRollbackResult(null);
    setRollbackPhase("idle");

    const result = await fetchRollbackPreview({
      householdId: household.id,
      userId: user.id,
      batchId: batch.id,
    });

    if (result.error) {
      setPreviewPhase("error");
      setPreviewError(result.error);
      return;
    }
    setPreviewGroups(result.previewGroups);
    setPreviewPhase("ready");
  };

  const closePreview = () => {
    setSelectedBatch(null);
    setPreviewGroups([]);
    setPreviewError(null);
    setPreviewPhase("idle");
    setConfirmOpen(false);
    setRollbackResult(null);
    setRollbackPhase("idle");
  };

  const handleConfirmRollback = async () => {
    if (!household || !user || !selectedBatch) {
      return;
    }
    setRollbackPhase("applying");
    const result = await applyImportRollback({
      householdId: household.id,
      userId: user.id,
      batchId: selectedBatch.id,
      membership,
    });
    setRollbackResult(result);
    setRollbackPhase("done");
    setConfirmOpen(false);
    await refreshHistory();
    await openPreview({
      ...selectedBatch,
      statusLabel:
        result.batchStatus === "rolled_back"
          ? "Rolled back"
          : result.batchStatus === "rollback_partial"
            ? "Partially rolled back"
            : result.batchStatus === "rollback_failed"
              ? "Rollback failed"
              : selectedBatch.statusLabel,
      rollbackAvailable: result.batchStatus !== "rolled_back",
    });
  };

  const deletableCount = previewGroups.reduce(
    (total, group) =>
      total + group.items.filter((item) => item.eligibility === "deletable").length,
    0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import history</CardTitle>
        <CardDescription>
          Review prior spreadsheet imports and roll back records created by a specific batch.
          Cash history is never changed during rollback.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOwner && (
          <Alert>
            <AlertDescription>{IMPORT_ROLLBACK_OWNER_ONLY_COPY}</AlertDescription>
          </Alert>
        )}

        {loadPhase === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading import history…
          </p>
        )}

        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {loadPhase === "ready" && historyRows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No import batches yet. Confirm a spreadsheet import to create history.
          </p>
        )}

        {historyRows.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead>Rollback</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyRows.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-medium">{batch.fileName}</p>
                        <p className="text-xs text-muted-foreground">{batch.fileKind}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-sm">
                        <p>{batch.createdAtLabel}</p>
                        {batch.createdByLabel && (
                          <p className="text-xs text-muted-foreground">{batch.createdByLabel}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{batch.statusLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-sm">
                        <p>{batch.strategyLabel}</p>
                        {batch.scopeLabel && (
                          <p className="text-xs text-muted-foreground">
                            Scope {batch.scopeLabel}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {batch.actionCounts.created}
                      {batch.actionCounts.updated > 0
                        ? ` · ${batch.actionCounts.updated} updated`
                        : ""}
                      {batch.actionCounts.skipped > 0
                        ? ` · ${batch.actionCounts.skipped} skipped`
                        : ""}
                    </TableCell>
                    <TableCell className="text-sm">{batch.rollbackAvailabilityLabel}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void openPreview(batch)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {selectedBatch && (
          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Rollback preview</h3>
                <p className="text-sm">{selectedBatch.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  Imported {selectedBatch.createdAtLabel}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={closePreview}>
                Close
              </Button>
            </div>

            {previewPhase === "loading" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading linked records…
              </p>
            )}

            {previewError && (
              <Alert variant="destructive">
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            )}

            {previewPhase === "ready" && previewGroups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                This batch has no linked records to preview.
              </p>
            )}

            {previewGroups.map((group) => (
              <div key={group.group} className="space-y-2">
                <h4 className="text-sm font-medium">{group.title}</h4>
                <div className="overflow-x-auto rounded-md border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Record</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => (
                        <TableRow key={item.batchRecordId}>
                          <TableCell className="text-sm">{item.label}</TableCell>
                          <TableCell className="text-sm">
                            {item.dateOrMonthLabel ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">{item.amountLabel ?? "—"}</TableCell>
                          <TableCell className="text-sm">{item.sourceLabel}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant={eligibilityBadgeVariant(item.eligibility)}>
                                {eligibilityLabel(item.eligibility)}
                              </Badge>
                              {item.protectionReason && (
                                <p className="text-xs text-muted-foreground">
                                  {item.protectionReason}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}

            {previewPhase === "ready" && isOwner && selectedBatch.rollbackAvailable && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={rollbackPhase === "applying" || deletableCount === 0}
                  onClick={() => setConfirmOpen(true)}
                >
                  {rollbackPhase === "applying" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Roll back import
                </Button>
                {deletableCount === 0 && (
                  <p className="self-center text-sm text-muted-foreground">
                    No eligible records remain to delete.
                  </p>
                )}
              </div>
            )}

            {rollbackResult && (
              <Alert role="status" aria-live="polite">
                <AlertDescription>{rollbackResult.userMessage}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Roll back this import?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {IMPORT_ROLLBACK_CONFIRMATION_LINES.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rollbackPhase === "applying"}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={rollbackPhase === "applying"}
                onClick={(event) => {
                  event.preventDefault();
                  void handleConfirmRollback();
                }}
              >
                {rollbackPhase === "applying" ? "Rolling back…" : "Confirm rollback"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
