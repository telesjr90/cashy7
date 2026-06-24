import { formatCurrency } from "@/lib/format";
import {
  type DebtAccountProgress,
  type DebtProgressTotals,
  formatDebtProgressDate,
  formatDebtProgressPayoffLabel,
} from "@/lib/debt-progress";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingDown } from "lucide-react";
import { ResponsiveListCard } from "@/components/responsive-list-card";

type DebtProgressDashboardProps = {
  activeTotals: DebtProgressTotals;
  activeAccountProgress: DebtAccountProgress[];
  archivedAccountProgress?: DebtAccountProgress[];
  loading?: boolean;
};

function SummaryMetric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function formatNextPaymentLabel(
  totals: DebtProgressTotals
): { value: string; description?: string } {
  if (!totals.nextPayment) {
    return { value: "None scheduled" };
  }

  const dateLabel = formatDebtProgressDate(totals.nextPayment.payment_date);
  const amountLabel = formatCurrency(totals.nextPayment.total_payment);
  const accountLabel = totals.nextPaymentAccountName;

  return {
    value: dateLabel ?? totals.nextPayment.payment_date,
    description: accountLabel
      ? `${accountLabel} · ${amountLabel}`
      : amountLabel,
  };
}

function AccountProgressCard({ progress }: { progress: DebtAccountProgress }) {
  const nextPaymentDate = progress.nextPayment
    ? formatDebtProgressDate(progress.nextPayment.payment_date)
    : null;
  const nextPaymentAmount = progress.nextPayment
    ? formatCurrency(progress.nextPayment.total_payment)
    : null;

  return (
    <ResponsiveListCard testId="debt-progress-mobile-card">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-medium">{progress.accountName}</h3>
        {progress.archivedBadgeLabel ? (
          <Badge variant="secondary">{progress.archivedBadgeLabel}</Badge>
        ) : null}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatCurrency(progress.totalPaid)} paid of{" "}
            {formatCurrency(progress.originalAmount)}
          </span>
          <span>{progress.progressPercentage}%</span>
        </div>
        <Progress
          value={progress.progressPercentage}
          aria-label={`${progress.accountName} payoff progress`}
          aria-valuenow={progress.progressPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Remaining</dt>
          <dd className="font-medium tabular-nums">
            {formatCurrency(progress.remainingBalance)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Unpaid scheduled</dt>
          <dd className="tabular-nums">{progress.remainingUnpaidCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Next payment</dt>
          <dd>
            {nextPaymentDate ? (
              <span>
                {nextPaymentDate}
                {nextPaymentAmount ? (
                  <span className="block text-xs text-muted-foreground">
                    {nextPaymentAmount}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Est. payoff</dt>
          <dd>{formatDebtProgressPayoffLabel(progress.payoffLabel)}</dd>
        </div>
      </dl>
    </ResponsiveListCard>
  );
}

function AccountProgressRow({ progress }: { progress: DebtAccountProgress }) {
  const nextPaymentDate = progress.nextPayment
    ? formatDebtProgressDate(progress.nextPayment.payment_date)
    : null;
  const nextPaymentAmount = progress.nextPayment
    ? formatCurrency(progress.nextPayment.total_payment)
    : null;

  return (
    <TableRow>
      <TableCell>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{progress.accountName}</span>
            {progress.archivedBadgeLabel ? (
              <Badge variant="secondary">{progress.archivedBadgeLabel}</Badge>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {formatCurrency(progress.totalPaid)} paid of{" "}
                {formatCurrency(progress.originalAmount)}
              </span>
              <span>{progress.progressPercentage}%</span>
            </div>
            <Progress
              value={progress.progressPercentage}
              aria-label={`${progress.accountName} payoff progress`}
              aria-valuenow={progress.progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(progress.remainingBalance)}
      </TableCell>
      <TableCell>
        {nextPaymentDate ? (
          <div>
            <div>{nextPaymentDate}</div>
            {nextPaymentAmount ? (
              <div className="text-xs text-muted-foreground">{nextPaymentAmount}</div>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {progress.remainingUnpaidCount}
      </TableCell>
      <TableCell>
        {formatDebtProgressPayoffLabel(progress.payoffLabel)}
      </TableCell>
    </TableRow>
  );
}

export function DebtProgressDashboard({
  activeTotals,
  activeAccountProgress,
  archivedAccountProgress = [],
  loading = false,
}: DebtProgressDashboardProps) {
  const nextPayment = formatNextPaymentLabel(activeTotals);

  if (loading) {
    return (
      <Card>
        <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-base font-semibold leading-none">Debt Progress</h2>
        </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading progress…</p>
        </CardContent>
      </Card>
    );
  }

  if (activeTotals.accountCount === 0 && archivedAccountProgress.length === 0) {
    return (
      <Card>
        <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-base font-semibold leading-none">Debt Progress</h2>
        </CardTitle>
          <CardDescription>
            Payoff summaries appear here once you add debt accounts and scheduled
            payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No debt accounts yet. Create an account below to track original balance,
            paid progress, and scheduled payoff dates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="debt-progress-dashboard">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-base font-semibold leading-none">Debt Progress</h2>
        </CardTitle>
        <CardDescription>
          Read-only payoff summary for active debt accounts. Totals reconcile to
          paid payment rows and scheduled unpaid payments below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {activeTotals.accountCount > 0 ? (
          <>
            <section aria-labelledby="debt-progress-active-summary">
              <h3 id="debt-progress-active-summary" className="sr-only">
                Active debt summary
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryMetric
                  label="Total original (active)"
                  value={formatCurrency(activeTotals.totalOriginal)}
                />
                <SummaryMetric
                  label="Total paid (active)"
                  value={formatCurrency(activeTotals.totalPaid)}
                />
                <SummaryMetric
                  label="Total remaining (active)"
                  value={formatCurrency(activeTotals.totalRemaining)}
                />
                <SummaryMetric
                  label="Overall progress (active)"
                  value={`${activeTotals.progressPercentage}%`}
                  description={`${formatCurrency(activeTotals.totalPaid)} of ${formatCurrency(activeTotals.totalOriginal)}`}
                />
                <SummaryMetric
                  label="Next payment due"
                  value={nextPayment.value}
                  description={nextPayment.description}
                />
                <SummaryMetric
                  label="Estimated payoff (active)"
                  value={formatDebtProgressPayoffLabel(activeTotals.payoffLabel)}
                  description={
                    activeTotals.accountCount > 1
                      ? "Latest active account payoff date"
                      : undefined
                  }
                />
              </div>
            </section>

            <section aria-labelledby="debt-progress-by-account">
              <h3 id="debt-progress-by-account" className="mb-3 text-sm font-medium">
                Progress by account
              </h3>
              <div
                className="space-y-3 md:hidden"
                data-testid="debt-progress-mobile-list"
              >
                {activeAccountProgress.map((progress) => (
                  <AccountProgressCard
                    key={progress.accountId}
                    progress={progress}
                  />
                ))}
              </div>
              <div className="hidden md:block" data-testid="debt-progress-desktop-list">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Next payment</TableHead>
                    <TableHead className="text-right">Unpaid scheduled</TableHead>
                    <TableHead>Est. payoff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeAccountProgress.map((progress) => (
                    <AccountProgressRow key={progress.accountId} progress={progress} />
                  ))}
                </TableBody>
              </Table>
              </div>
            </section>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active debt accounts. Enable “Show archived/closed accounts” to
            review archived payoff history.
          </p>
        )}

        {archivedAccountProgress.length > 0 ? (
          <section aria-labelledby="debt-progress-archived">
            <h3 id="debt-progress-archived" className="mb-3 text-sm font-medium">
              Archived / closed progress (not included in active totals)
            </h3>
            <div className="space-y-3 md:hidden">
              {archivedAccountProgress.map((progress) => (
                <AccountProgressCard key={progress.accountId} progress={progress} />
              ))}
            </div>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Next payment</TableHead>
                  <TableHead className="text-right">Unpaid scheduled</TableHead>
                  <TableHead>Est. payoff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedAccountProgress.map((progress) => (
                  <AccountProgressRow key={progress.accountId} progress={progress} />
                ))}
              </TableBody>
            </Table>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
