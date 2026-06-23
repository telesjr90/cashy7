import type { SavingsGoalDetailView } from "@/lib/savings-detail";
import { SHARED_GOAL_METADATA_ONLY_COPY } from "@/lib/savings-edit";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type SavingsDetailPanelProps = {
  detail: SavingsGoalDetailView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditGoal?: () => void;
  onEditTarget?: () => void;
};

function DetailRow({
  label,
  value,
  align = "right",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={align === "right" ? "text-right" : undefined}>{value}</dd>
    </div>
  );
}

export function SavingsDetailPanel({
  detail,
  open,
  onOpenChange,
  onEditGoal,
  onEditTarget,
}: SavingsDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {detail ? (
          <>
            <SheetHeader>
              <SheetTitle>{detail.title}</SheetTitle>
              <SheetDescription>{detail.subtitle}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              {detail.isSharedGoal && (
                <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {detail.sharedPrivacyCopy && <p>{detail.sharedPrivacyCopy}</p>}
                  {detail.otherUserPrivacyLabel && (
                    <p>{detail.otherUserPrivacyLabel}</p>
                  )}
                </div>
              )}

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Goal metadata</h3>
                  {detail.isSharedGoal && (
                    <p className="text-xs text-muted-foreground">
                      {SHARED_GOAL_METADATA_ONLY_COPY}
                    </p>
                  )}
                </div>
                <dl className="grid gap-2 text-sm">
                  <DetailRow label="Goal name" value={detail.goalName} />
                  <DetailRow label="Type" value={detail.goalTypeLabel} />
                  <DetailRow
                    label={
                      detail.isSharedGoal ? "Household target" : "Target amount"
                    }
                    value={detail.householdTargetAmountLabel}
                  />
                  <DetailRow label="Start date" value={detail.startDateLabel} />
                  <DetailRow label="End date" value={detail.endDateLabel} />
                  <DetailRow label="Owner" value={detail.ownerLabel} />
                </dl>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Current period</h3>
                {detail.hasOwnTarget && detail.currentPeriodLabel ? (
                  <>
                    <dl className="grid gap-2 text-sm">
                      <DetailRow
                        label="Period"
                        value={detail.currentPeriodLabel}
                      />
                      {detail.contributionPeriodLabel && (
                        <DetailRow
                          label="Contribution period"
                          value={detail.contributionPeriodLabel}
                        />
                      )}
                      {detail.periodStartLabel && (
                        <DetailRow
                          label="Period start"
                          value={detail.periodStartLabel}
                        />
                      )}
                      {detail.periodEndLabel && (
                        <DetailRow
                          label="Period end"
                          value={detail.periodEndLabel}
                        />
                      )}
                    </dl>
                    {detail.periodSummaryHint && (
                      <p className="text-xs text-muted-foreground">
                        {detail.periodSummaryHint}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {detail.noOwnTargetFallback ??
                      "Set your contribution target to see the current period summary."}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Your target</h3>
                {detail.hasOwnTarget ? (
                  <dl className="grid gap-2 text-sm">
                    {detail.ownTargetAmountLabel && (
                      <DetailRow
                        label="Target contribution"
                        value={detail.ownTargetAmountLabel}
                      />
                    )}
                    {detail.ownTargetPeriodLabel && (
                      <DetailRow
                        label="Target period"
                        value={detail.ownTargetPeriodLabel}
                      />
                    )}
                    {detail.ownRemainingObligationLabel && (
                      <DetailRow
                        label="Remaining obligation"
                        value={detail.ownRemainingObligationLabel}
                      />
                    )}
                    {detail.ownProgressPercentLabel && (
                      <DetailRow
                        label="Progress this period"
                        value={detail.ownProgressPercentLabel}
                      />
                    )}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {detail.noOwnTargetFallback}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Your contributions</h3>
                {detail.cashflowStartExcludesPreStartNotice && (
                  <p className="text-xs text-muted-foreground">
                    {detail.cashflowStartExcludesPreStartNotice}
                  </p>
                )}
                {detail.contributions.length > 0 ? (
                  <>
                    <dl className="grid gap-2 text-sm">
                      {detail.periodContributionsTotalLabel && (
                        <DetailRow
                          label="Total this period"
                          value={detail.periodContributionsTotalLabel}
                        />
                      )}
                      {detail.activeContributionsTotalLabel && (
                        <DetailRow
                          label="Total (active planning)"
                          value={detail.activeContributionsTotalLabel}
                        />
                      )}
                      {detail.preStartContributionsTotalLabel && (
                        <DetailRow
                          label="Total (before cashflow start)"
                          value={detail.preStartContributionsTotalLabel}
                        />
                      )}
                      {detail.allTimeContributionsTotalLabel && (
                        <DetailRow
                          label="Total all time"
                          value={detail.allTimeContributionsTotalLabel}
                        />
                      )}
                    </dl>
                    <ul className="space-y-2 text-sm">
                      {detail.contributions.map((contribution, index) => (
                        <li
                          key={`${contribution.dateLabel}-${contribution.amountLabel}-${index}`}
                          className={`rounded-md border px-3 py-2 ${
                            contribution.beforeCashflowStartLabel
                              ? "border-dashed bg-muted/20"
                              : ""
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">
                              {contribution.amountLabel}
                            </span>
                            <span className="text-muted-foreground">
                              {contribution.dateLabel}
                            </span>
                          </div>
                          {contribution.beforeCashflowStartLabel && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {contribution.beforeCashflowStartLabel}
                            </p>
                          )}
                          {contribution.notes && (
                            <p className="mt-1 text-muted-foreground">
                              {contribution.notes}
                            </p>
                          )}
                          {contribution.cashDeductionLabel && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {contribution.cashDeductionLabel}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {detail.noContributionsFallback}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Edit actions</h3>
                <p className="text-sm text-muted-foreground">{detail.editGoalHint}</p>
                <p className="text-sm text-muted-foreground">{detail.editTargetHint}</p>
                <p className="text-sm text-muted-foreground">
                  {detail.editContributionHint}
                </p>
                <div className="flex flex-wrap gap-2">
                  {detail.canEditGoal && onEditGoal && (
                    <Button type="button" variant="outline" size="sm" onClick={onEditGoal}>
                      Edit goal
                    </Button>
                  )}
                  {onEditTarget && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onEditTarget}
                    >
                      Edit my target
                    </Button>
                  )}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
