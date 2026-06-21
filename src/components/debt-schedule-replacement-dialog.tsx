import { useMemo, useState } from "react";
import type { DebtAccount, DebtPayment } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { debtBillInstanceName } from "@/lib/format";
import {
  debtScheduleReplacementSummaryMessage,
  getDebtScheduleReplacementMutation,
  planDebtScheduleReplacement,
  protectionReasonLabel,
  type DebtScheduleReplacementPlan,
} from "@/lib/debt-schedule-replacement";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader as Loader2, RefreshCw } from "lucide-react";

export type DebtScheduleReplacementParams = {
  paymentsLeft: number;
  firstPaymentDate: string;
  regularPayment: number;
  splitType: "5149" | "custom";
  customTeles?: number;
  customNicole?: number;
};

type DebtScheduleReplacementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: DebtAccount | null;
  accountPayments: DebtPayment[];
  cashDeductedPaymentIds: ReadonlySet<string>;
  scheduleParams: DebtScheduleReplacementParams | null;
  onReplaced: (message: string) => void;
};

export function DebtScheduleReplacementDialog({
  open,
  onOpenChange,
  account,
  accountPayments,
  cashDeductedPaymentIds,
  scheduleParams,
  onReplaced,
}: DebtScheduleReplacementDialogProps) {
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const previewPlan = useMemo((): DebtScheduleReplacementPlan | null => {
    if (!account || !scheduleParams) {
      return null;
    }

    return planDebtScheduleReplacement({
      accountName: account.name,
      currentBalance: account.current_balance,
      existingPayments: accountPayments,
      cashDeductedPaymentIds,
      replacementStartDate: scheduleParams.firstPaymentDate,
      paymentsLeft: scheduleParams.paymentsLeft,
      regularPayment: scheduleParams.regularPayment,
      splitType: scheduleParams.splitType,
      customTeles: scheduleParams.customTeles,
      customNicole: scheduleParams.customNicole,
    });
  }, [account, accountPayments, cashDeductedPaymentIds, scheduleParams]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
      setResultMessage(null);
      setReplacing(false);
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (!account || !previewPlan || previewPlan.errors.length > 0) {
      return;
    }

    const mutation = getDebtScheduleReplacementMutation(previewPlan);
    if (
      mutation.paymentIdsToDelete.length === 0 &&
      mutation.paymentsToCreate.length === 0
    ) {
      setResultMessage("No schedule changes were needed.");
      return;
    }

    setReplacing(true);
    setError(null);

    try {
      if (mutation.billInstanceIdsToDelete.length > 0) {
        const { error: billDeleteError } = await supabase
          .from("bill_instances")
          .delete()
          .in("id", mutation.billInstanceIdsToDelete);

        if (billDeleteError) {
          throw new Error(billDeleteError.message);
        }
      }

      if (mutation.paymentIdsToDelete.length > 0) {
        const { error: paymentDeleteError } = await supabase
          .from("debt_payments")
          .delete()
          .in("id", mutation.paymentIdsToDelete);

        if (paymentDeleteError) {
          throw new Error(paymentDeleteError.message);
        }
      }

      for (const row of mutation.paymentsToCreate) {
        const { data: billData, error: billError } = await supabase
          .from("bill_instances")
          .insert({
            household_id: account.household_id,
            bill_id: null,
            year: row.year,
            month: row.month,
            period_bucket: "1_14",
            name: debtBillInstanceName(account.name),
            amount: row.totalPayment,
            teles_amount: row.telesAmount,
            nicole_amount: row.nicoleAmount,
            due_date: null,
            is_paid: false,
            notes: null,
          })
          .select("id")
          .single();

        if (billError) {
          throw new Error(billError.message);
        }
        if (!billData) {
          throw new Error("Failed to create linked bill instance");
        }

        const { error: paymentError } = await supabase.from("debt_payments").insert({
          household_id: account.household_id,
          debt_account_id: account.id,
          payment_date: row.paymentDate,
          month: row.month,
          year: row.year,
          period_bucket: "1_14",
          total_payment: row.totalPayment,
          teles_amount: row.telesAmount,
          nicole_amount: row.nicoleAmount,
          remaining_balance_after_payment: row.remainingBalance,
          paid_status: false,
          linked_bill_instance_id: billData.id,
        });

        if (paymentError) {
          throw new Error(paymentError.message);
        }
      }

      const message = debtScheduleReplacementSummaryMessage(previewPlan.summary);
      setResultMessage(message);
      onReplaced(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setReplacing(false);
    }
  };

  const replaceableRows =
    previewPlan?.existingRows.filter((row) => row.disposition === "replace") ??
    [];
  const preservedRows =
    previewPlan?.existingRows.filter((row) => row.disposition === "preserve") ??
    [];
  const proposedCreateRows =
    previewPlan?.proposedRows.filter((row) => row.status === "create") ?? [];
  const proposedSkipRows =
    previewPlan?.proposedRows.filter((row) => row.status === "skip_duplicate") ??
    [];

  const canConfirm =
    previewPlan &&
    previewPlan.errors.length === 0 &&
    (previewPlan.summary.toReplace > 0 || previewPlan.summary.toCreate > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Replace future unpaid scheduled payments</DialogTitle>
          <DialogDescription>
            Review affected rows before confirming. Paid payments will not be
            changed. Cash-deducted payments will not be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {resultMessage && (
            <Alert>
              <AlertDescription>{resultMessage}</AlertDescription>
            </Alert>
          )}

          {previewPlan?.errors.length ? (
            <Alert variant="destructive">
              <AlertDescription>{previewPlan.errors.join(" ")}</AlertDescription>
            </Alert>
          ) : null}

          {previewPlan && previewPlan.errors.length === 0 && (
            <>
              <div className="rounded-lg border p-4 text-sm space-y-2">
                <p className="font-medium">Summary</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    {previewPlan.summary.toReplace} existing future unpaid
                    payment{previewPlan.summary.toReplace === 1 ? "" : "s"} will
                    be replaced
                  </li>
                  <li>
                    {previewPlan.summary.toCreate} new scheduled payment
                    {previewPlan.summary.toCreate === 1 ? "" : "s"} will be
                    created
                  </li>
                  <li>
                    {previewPlan.summary.linkedBillsToRemove} linked bill
                    instance
                    {previewPlan.summary.linkedBillsToRemove === 1 ? "" : "s"}{" "}
                    will be removed and recreated
                  </li>
                  <li>
                    {previewPlan.summary.preservedPaid} paid,{" "}
                    {previewPlan.summary.preservedCashDeducted} cash-deducted,{" "}
                    {previewPlan.summary.preservedHistorical} historical payment
                    {previewPlan.summary.preservedPaid +
                      previewPlan.summary.preservedCashDeducted +
                      previewPlan.summary.preservedHistorical ===
                    1
                      ? ""
                      : "s"}{" "}
                    preserved
                  </li>
                  {previewPlan.summary.skippedDuplicates > 0 && (
                    <li>
                      {previewPlan.summary.skippedDuplicates} proposed row
                      {previewPlan.summary.skippedDuplicates === 1 ? "" : "s"}{" "}
                      skipped to avoid duplicates
                    </li>
                  )}
                </ul>
              </div>

              {replaceableRows.length > 0 && (
                <PreviewSection
                  title="Existing rows to replace"
                  description="Generated scheduled payments that will be removed."
                >
                  {replaceableRows.map((row) => (
                    <PreviewRow key={row.id} label={row.label} detail="Existing · scheduled" />
                  ))}
                </PreviewSection>
              )}

              {proposedCreateRows.length > 0 && (
                <PreviewSection
                  title="New scheduled payments"
                  description="These rows will be created after confirmation."
                >
                  {proposedCreateRows.map((row) => (
                    <PreviewRow
                      key={`${row.paymentDate}-${row.totalPayment}`}
                      label={row.label}
                      detail={`New · linked bill: ${row.linkedBillLabel}`}
                    />
                  ))}
                </PreviewSection>
              )}

              {proposedSkipRows.length > 0 && (
                <PreviewSection
                  title="Skipped proposed rows"
                  description="Duplicates prevented because a preserved payment already exists."
                >
                  {proposedSkipRows.map((row) => (
                    <PreviewRow
                      key={`skip-${row.paymentDate}`}
                      label={row.label}
                      detail={row.skipReason ?? "Skipped duplicate"}
                    />
                  ))}
                </PreviewSection>
              )}

              {preservedRows.length > 0 && (
                <PreviewSection
                  title="Preserved payments"
                  description="Paid payments will not be changed. Cash-deducted payments will not be changed."
                >
                  {preservedRows.map((row) => (
                    <PreviewRow
                      key={row.id}
                      label={row.label}
                      detail={
                        row.protectionReason
                          ? protectionReasonLabel(row.protectionReason)
                          : "Preserved"
                      }
                    />
                  ))}
                </PreviewSection>
              )}

              {replaceableRows.some((row) => row.linkedBillLabel) && (
                <PreviewSection
                  title="Linked bill instances affected"
                  description="Replaceable debt payments with linked bills on the Bills page."
                >
                  {replaceableRows
                    .filter((row) => row.linkedBillLabel)
                    .map((row) => (
                      <PreviewRow
                        key={`bill-${row.id}`}
                        label={row.linkedBillLabel ?? row.label}
                        detail="Existing linked bill · will be replaced"
                      />
                    ))}
                </PreviewSection>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={replacing}
          >
            {resultMessage ? "Close" : "Cancel"}
          </Button>
          {!resultMessage && (
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={replacing || !canConfirm}
            >
              {replacing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {replacing ? "Replacing…" : "Confirm replacement"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4 text-sm space-y-2">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function PreviewRow({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="rounded-md bg-muted/40 px-3 py-2">
      <p>{label}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </li>
  );
}
