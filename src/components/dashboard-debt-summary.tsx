import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/format";
import {
  type DashboardDebtSummaryResult,
  formatDashboardDebtNextPaymentLabel,
  formatDashboardDebtPayoffLabel,
} from "@/lib/dashboard-debt-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingDown } from "lucide-react";

type DashboardDebtSummaryProps = {
  summary: DashboardDebtSummaryResult | null;
  loading?: boolean;
  error?: string | null;
};

function SummaryMetric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string | null;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function UpcomingPaymentRow({
  row,
}: {
  row: DashboardDebtSummaryResult["upcomingPayments"][number];
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{row.accountName}</p>
          <p className="text-sm text-muted-foreground">{row.paymentDateLabel}</p>
          {row.periodBucketLabel ? (
            <p className="text-xs text-muted-foreground">{row.periodBucketLabel}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-medium tabular-nums">{row.totalPaymentLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="text-blue-600 dark:text-blue-400">
              {row.telesAmountLabel}
            </span>
            {" · "}
            <span className="text-green-600 dark:text-green-400">
              {row.nicoleAmountLabel}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant={row.paidStatusLabel === "Paid" ? "secondary" : "outline"}>
          {row.paidStatusLabel}
        </Badge>
        {row.linkedBillLabel ? (
          <Badge variant="secondary">{row.linkedBillLabel}</Badge>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardDebtSummary({
  summary,
  loading = false,
  error = null,
}: DashboardDebtSummaryProps) {
  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" aria-hidden="true" />
            Debt summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" aria-hidden="true" />
            Debt summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>Could not load debt summary. ({error})</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const nextPayment = formatDashboardDebtNextPaymentLabel(summary.totals);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4" aria-hidden="true" />
              Debt summary
            </CardTitle>
            <CardDescription>{summary.sourceContextLabel}</CardDescription>
          </div>
          <Button variant="link" className="h-auto shrink-0 p-0 text-sm" asChild>
            <Link to="/debt">View debt details</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!summary.hasActiveDebts ? (
          <p className="text-sm text-muted-foreground">{summary.emptyStateMessage}</p>
        ) : (
          <>
            <section aria-labelledby="dashboard-debt-summary-metrics">
              <h3 id="dashboard-debt-summary-metrics" className="sr-only">
                Active debt summary metrics
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryMetric
                  label="Total original (active)"
                  value={formatCurrency(summary.totals.totalOriginal)}
                />
                <SummaryMetric
                  label="Total paid (active)"
                  value={formatCurrency(summary.totals.totalPaid)}
                />
                <SummaryMetric
                  label="Total remaining (active)"
                  value={formatCurrency(summary.totals.totalRemaining)}
                />
                <SummaryMetric
                  label="Overall progress (active)"
                  value={`${summary.totals.progressPercentage}%`}
                  description={`${formatCurrency(summary.totals.totalPaid)} of ${formatCurrency(summary.totals.totalOriginal)}`}
                />
                <SummaryMetric
                  label="Next payment due"
                  value={nextPayment.value}
                  description={nextPayment.description}
                />
                <SummaryMetric
                  label="Projected payoff (active)"
                  value={formatDashboardDebtPayoffLabel(summary.totals.payoffLabel)}
                  description={
                    summary.totals.accountCount > 1
                      ? "Latest active account payoff date"
                      : null
                  }
                />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Household payoff progress</span>
                  <span>{summary.totals.progressPercentage}%</span>
                </div>
                <Progress
                  value={summary.totals.progressPercentage}
                  aria-label="Active household debt payoff progress"
                  aria-valuenow={summary.totals.progressPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </section>

            {summary.upcomingPayments.length > 0 ? (
              <section aria-labelledby="dashboard-debt-upcoming-payments">
                <h3
                  id="dashboard-debt-upcoming-payments"
                  className="mb-2 text-sm font-medium"
                >
                  Upcoming scheduled payments
                </h3>
                <div className="space-y-2">
                  {summary.upcomingPayments.map((row) => (
                    <UpcomingPaymentRow key={row.rowKey} row={row} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
