import { useEffect, useMemo, useState } from "react";
import type { Bill, BillInstance } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  billGenerationSummaryMessage,
  planBillInstanceGeneration,
  type BillGenerationPlan,
} from "@/lib/bill-instance-generation";
import { isEligibleBillTemplate } from "@/lib/bill-templates";
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
import { Loader as Loader2, Sparkles } from "lucide-react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type BillGenerationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  templates: Bill[];
  onGenerated: (instances: BillInstance[], summaryMessage: string) => void;
};

export function BillGenerationDialog({
  open,
  onOpenChange,
  year,
  month,
  templates,
  onGenerated,
}: BillGenerationDialogProps) {
  const { household } = useAuth();
  const [existingInstances, setExistingInstances] = useState<
    Pick<BillInstance, "bill_id" | "year" | "month">[]
  >([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [completedPlan, setCompletedPlan] = useState<BillGenerationPlan | null>(
    null
  );

  const eligibleTemplates = useMemo(
    () => templates.filter(isEligibleBillTemplate),
    [templates]
  );

  const previewPlan = useMemo(() => {
    if (!household) {
      return null;
    }

    return planBillInstanceGeneration({
      templates: eligibleTemplates,
      existingInstances,
      householdId: household.id,
      year,
      month,
    });
  }, [eligibleTemplates, existingInstances, household, year, month]);

  useEffect(() => {
    if (!open || !household) {
      return;
    }

    setError(null);
    setResultMessage(null);
    setCompletedPlan(null);
    setLoadingPreview(true);

    void supabase
      .from("bill_instances")
      .select("bill_id, year, month")
      .eq("household_id", household.id)
      .eq("year", year)
      .eq("month", month)
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
          setExistingInstances([]);
        } else {
          setExistingInstances((data ?? []) as Pick<BillInstance, "bill_id" | "year" | "month">[]);
        }
        setLoadingPreview(false);
      });
  }, [open, household, year, month]);

  const handleGenerate = async () => {
    if (!household || !previewPlan) {
      return;
    }

    setGenerating(true);
    setError(null);

    const payloads = previewPlan.items
      .filter((item) => item.status === "create")
      .map((item) => item.payload);

    if (payloads.length === 0) {
      const message = billGenerationSummaryMessage(
        previewPlan.summary,
        MONTHS[month - 1] ?? String(month),
        year
      );
      setResultMessage(message);
      setCompletedPlan(previewPlan);
      setGenerating(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("bill_instances")
      .insert(payloads)
      .select("*");

    setGenerating(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const message = billGenerationSummaryMessage(
      previewPlan.summary,
      MONTHS[month - 1] ?? String(month),
      year
    );
    setResultMessage(message);
    setCompletedPlan(previewPlan);
    onGenerated((data ?? []) as BillInstance[], message);
  };

  const monthLabel = MONTHS[month - 1] ?? String(month);
  const previewSummary = previewPlan?.summary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate monthly bills</DialogTitle>
          <DialogDescription>
            Create bill instances for {monthLabel} {year} from active recurring
            templates. Existing instances for the same template and month are
            skipped — nothing is overwritten.
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

          {loadingPreview ? (
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          ) : previewSummary ? (
            <div className="rounded-lg border p-4 text-sm space-y-2">
              <p className="font-medium">Preview for {monthLabel} {year}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  {previewSummary.toCreate} bill
                  {previewSummary.toCreate === 1 ? "" : "s"} will be created
                </li>
                <li>
                  {previewSummary.skippedExisting} already exist and will be skipped
                </li>
                <li>
                  {previewSummary.skippedInactive +
                    previewSummary.skippedOutOfRange +
                    previewSummary.skippedNotRecurring}{" "}
                  inactive or out-of-range template
                  {previewSummary.skippedInactive +
                    previewSummary.skippedOutOfRange +
                    previewSummary.skippedNotRecurring ===
                  1
                    ? ""
                    : "s"}{" "}
                  skipped
                </li>
                {previewSummary.skippedInvalidDueDay > 0 && (
                  <li>
                    {previewSummary.skippedInvalidDueDay} template
                    {previewSummary.skippedInvalidDueDay === 1 ? "" : "s"} skipped
                    due to invalid due day
                  </li>
                )}
              </ul>
              {previewSummary.errors.length > 0 && (
                <div className="pt-2 text-destructive">
                  {previewSummary.errors.map((entry) => (
                    <p key={entry}>{entry}</p>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {completedPlan && completedPlan.summary.toCreate > 0 && (
            <p className="text-xs text-muted-foreground">
              Generated rows are labeled as "generated from template" in the bill
              list. Run again safely — duplicates are not created.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            {resultMessage ? "Close" : "Cancel"}
          </Button>
          {!resultMessage && (
            <Button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || loadingPreview || !previewPlan}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generating ? "Generating…" : "Generate monthly bills"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
