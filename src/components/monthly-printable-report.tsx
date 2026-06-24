import type { ReactNode } from "react";
import type { MonthlyPrintReportResult } from "@/lib/monthly-print-report";
import { formatCurrency } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

type MonthlyPrintableReportProps = {
  report: MonthlyPrintReportResult | null;
  loading?: boolean;
  error?: string | null;
};

function ReportSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="print-section mb-8 break-inside-avoid" data-testid={testId}>
      <h2 className="mb-3 border-b pb-1 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((header) => (
              <th key={header} className="px-2 py-1 text-left font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="border-b border-border/60">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-2 py-1 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyCopy({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-muted-foreground">{message}</p>;
}

export function MonthlyPrintableReport({
  report,
  loading = false,
  error = null,
}: MonthlyPrintableReportProps) {
  if (loading) {
    return (
      <div className="space-y-4" data-testid="monthly-print-report">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" data-testid="monthly-print-report">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!report) {
    return null;
  }

  if (report.loadingBlockedMessage) {
    return (
      <Alert data-testid="monthly-print-report">
        <AlertDescription>{report.loadingBlockedMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <article className="print-report" data-testid="monthly-print-report">
      <header className="print-section mb-8 border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{report.header.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{report.header.monthLabel}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Generated {report.header.generatedAtLabel}
        </p>
        {report.header.householdLabel ? (
          <p className="mt-1 text-sm">Household: {report.header.householdLabel}</p>
        ) : null}
        <p className="mt-3 text-sm text-muted-foreground">{report.header.privateSectionCopy}</p>
      </header>

      <ReportSection title="Cash position" testId="monthly-report-section-cash">
        <MetricRow
          label="Current amount"
          value={
            report.cashPosition.currentAmount == null
              ? "Not recorded"
              : formatCurrency(report.cashPosition.currentAmount)
          }
        />
        {report.cashPosition.snapshotDateLabel ? (
          <MetricRow label="Snapshot date" value={report.cashPosition.snapshotDateLabel} />
        ) : null}
        <MetricRow
          label="Safe-to-spend before savings"
          value={
            report.cashPosition.safeToSpendBeforeSavings == null
              ? "—"
              : formatCurrency(report.cashPosition.safeToSpendBeforeSavings)
          }
        />
        <MetricRow
          label="Safe-to-spend after savings"
          value={
            report.cashPosition.safeToSpendAfterSavings == null
              ? "—"
              : formatCurrency(report.cashPosition.safeToSpendAfterSavings)
          }
        />
        <MetricRow
          label="Projected ending balance"
          value={
            report.cashPosition.projectedEndingBalance == null
              ? "—"
              : formatCurrency(report.cashPosition.projectedEndingBalance)
          }
        />
        <EmptyCopy message={report.cashPosition.missingSnapshotMessage} />
        <EmptyCopy message={report.cashPosition.staleSnapshotMessage} />
      </ReportSection>

      <ReportSection title="Bills" testId="monthly-report-section-bills">
        <MetricRow label="Total bills (your share)" value={report.bills.totalLabel} />
        <MetricRow label="Unpaid bills" value={report.bills.unpaidTotalLabel} />
        <MetricRow label="Paid bills" value={report.bills.paidTotalLabel} />
        <MetricRow
          label="Variable bills needing confirmation"
          value={String(report.bills.variableNeedsConfirmationCount)}
        />
        <div className="mt-3 space-y-1">
          {report.bills.periodBreakdown.map((row) => (
            <MetricRow key={row.periodLabel} label={row.periodLabel} value={row.totalLabel} />
          ))}
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Unpaid bills</h3>
            <SimpleTable
              headers={["Bill", "Due", "Amount", "Period", "Notes"]}
              rows={report.bills.unpaidRows.map((row) => [
                row.name,
                row.dueDateLabel,
                row.amountLabel,
                row.periodLabel ?? "—",
                [row.debtLinkedLabel, row.variableWarningLabel].filter(Boolean).join(" · ") || "—",
              ])}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Paid bills</h3>
            <SimpleTable
              headers={["Bill", "Due", "Amount", "Period"]}
              rows={report.bills.paidRows.map((row) => [
                row.name,
                row.dueDateLabel,
                row.amountLabel,
                row.periodLabel ?? "—",
              ])}
            />
          </div>
        </div>
        <EmptyCopy message={report.bills.emptyStateMessage} />
      </ReportSection>

      <ReportSection title="Debt" testId="monthly-report-section-debt">
        <MetricRow label="Active debts" value={String(report.debt.activeDebtCount)} />
        <MetricRow label="Remaining debt" value={report.debt.remainingDebtLabel} />
        <MetricRow label="Projected payoff" value={report.debt.payoffLabel} />
        <MetricRow label="Next scheduled payment" value={report.debt.nextPaymentLabel} />
        {report.debt.nextPaymentDescription ? (
          <p className="text-sm text-muted-foreground">{report.debt.nextPaymentDescription}</p>
        ) : null}
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium">Upcoming payments</h3>
          <SimpleTable
            headers={["Account", "Date", "Total", "Status", "Notes"]}
            rows={report.debt.upcomingPayments.map((row) => [
              row.accountName,
              row.paymentDateLabel,
              row.totalPaymentLabel,
              row.paidStatusLabel,
              row.linkedBillLabel ?? "—",
            ])}
          />
        </div>
        <EmptyCopy message={report.debt.emptyStateMessage} />
      </ReportSection>

      <ReportSection title="Savings" testId="monthly-report-section-savings">
        <MetricRow label="Your savings target" value={report.savings.targetLabel} />
        <MetricRow label="Your contributions" value={report.savings.contributionsLabel} />
        <MetricRow
          label="Remaining savings obligation"
          value={report.savings.remainingObligationLabel}
        />
        <p className="mt-2 text-sm text-muted-foreground">{report.savings.sharedPrivacyCopy}</p>
        <EmptyCopy message={report.savings.emptyStateMessage} />
      </ReportSection>

      <ReportSection title="Expenses" testId="monthly-report-section-expenses">
        <MetricRow label="Manual expenses and adjustments" value={report.expenses.totalLabel} />
        {report.expenses.categorySummary.length > 0 ? (
          <div className="mt-3 space-y-1">
            {report.expenses.categorySummary.map((row) => (
              <MetricRow key={row.category} label={row.category} value={row.totalLabel} />
            ))}
          </div>
        ) : null}
        <div className="mt-4">
          <SimpleTable
            headers={["Date", "Description", "Amount", "Category", "Type", "Source"]}
            rows={report.expenses.rows.map((row) => [
              row.dateLabel,
              row.description,
              row.amountLabel,
              row.categoryLabel ?? "—",
              row.rowTypeLabel,
              row.sourceLabel,
            ])}
          />
        </div>
        <EmptyCopy message={report.expenses.emptyStateMessage} />
      </ReportSection>

      <ReportSection title="Income" testId="monthly-report-section-income">
        <MetricRow label="Projected paycheck income" value={report.income.projectedTotalLabel} />
        <EmptyCopy message={report.income.scheduleStatusMessage} />
        <div className="mt-4">
          <SimpleTable
            headers={["Date", "Amount", "Schedule"]}
            rows={report.income.rows.map((row) => [
              row.dateLabel,
              row.amountLabel,
              row.scheduleLabel,
            ])}
          />
        </div>
        <EmptyCopy message={report.income.emptyStateMessage} />
      </ReportSection>

      <ReportSection title="Forecast" testId="monthly-report-section-forecast">
        {report.forecast.windowLabel ? (
          <MetricRow label="Forecast window" value={report.forecast.windowLabel} />
        ) : null}
        <MetricRow
          label="Total projected income"
          value={report.forecast.projectedIncomeLabel ?? "—"}
        />
        <MetricRow
          label="Total projected obligations"
          value={report.forecast.projectedObligationsLabel ?? "—"}
        />
        <MetricRow label="Ending balance" value={report.forecast.endingBalanceLabel ?? "—"} />
        <MetricRow label="Lowest balance" value={report.forecast.lowestBalanceLabel ?? "—"} />
        <MetricRow
          label="First shortfall date"
          value={report.forecast.firstShortfallDateLabel ?? "None"}
        />
        <EmptyCopy message={report.forecast.incompleteReason} />
        <EmptyCopy message={report.forecast.emptyStateMessage} />
      </ReportSection>

      <ReportSection title="Warnings" testId="monthly-report-section-warnings">
        {report.warnings.rows.length > 0 ? (
          <ul className="space-y-3">
            {report.warnings.rows.map((warning) => (
              <li key={`${warning.title}-${warning.affectedArea}`} className="rounded border p-3 text-sm">
                <p className="font-medium">
                  {warning.title}
                  <span className="ml-2 text-xs uppercase text-muted-foreground">
                    {warning.severity}
                  </span>
                </p>
                <p className="mt-1 text-muted-foreground">{warning.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">{warning.affectedArea}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyCopy message={report.warnings.emptyStateMessage} />
        )}
      </ReportSection>

      <ReportSection title="Calendar summary" testId="monthly-report-section-calendar">
        <p className="mb-3 text-sm text-muted-foreground">{report.calendar.monthSummaryLabel}</p>
        <div className="space-y-4">
          {report.calendar.days.map((day) => (
            <div key={day.dateLabel} className="break-inside-avoid rounded border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{day.dateLabel}</h3>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Income {day.incomeTotalLabel}</span>
                  <span>Obligations {day.obligationTotalLabel}</span>
                  <span>Net {day.netEffectLabel}</span>
                  {day.projectedBalanceLabel ? (
                    <span>Balance {day.projectedBalanceLabel}</span>
                  ) : null}
                </div>
              </div>
              {day.events.length > 0 ? (
                <SimpleTable
                  headers={["Type", "Event", "Amount", "Status"]}
                  rows={day.events.map((event) => [
                    event.typeLabel,
                    event.title,
                    event.amountLabel ?? "—",
                    event.statusLabel ?? "—",
                  ])}
                />
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No events</p>
              )}
            </div>
          ))}
        </div>
        <EmptyCopy message={report.calendar.emptyStateMessage} />
      </ReportSection>
    </article>
  );
}
