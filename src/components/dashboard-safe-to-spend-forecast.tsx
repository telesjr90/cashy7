import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, LineChart } from "lucide-react";
import { formatCurrency, formatDeductionAmount } from "@/lib/format";
import {
  buildForecastPaycheckDateDisplay,
  PAYCHECK_DATE_ADJUSTMENT_COPY,
} from "@/lib/paycheck-schedule";
import {
  buildSafeToSpendForecast,
  FORECAST_WINDOW_OPTIONS,
  formatForecastEventTypeLabel,
  type ForecastWindowKind,
  type SafeToSpendForecastResult,
} from "@/lib/safe-to-spend-forecast";
import type { BuildSafeToSpendForecastInput } from "@/lib/safe-to-spend-forecast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardSafeToSpendForecastProps = {
  forecastInput: BuildSafeToSpendForecastInput | null;
  loading?: boolean;
};

function formatForecastDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMM d, yyyy");
}

function SummaryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "warning" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ForecastEventRow({
  event,
}: {
  event: SafeToSpendForecastResult["events"][number];
}) {
  const isOutflow =
    event.type !== "starting_balance" &&
    event.type !== "income" &&
    event.signedAmount > 0;
  const amountLabel =
    event.type === "starting_balance" || event.type === "income"
      ? formatCurrency(event.amount)
      : isOutflow
        ? formatDeductionAmount(event.signedAmount)
        : formatCurrency(event.signedAmount);

  return (
    <div
      className={`rounded-lg border p-3 ${
        event.isShortfall ? "border-destructive/50 bg-destructive/5" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{event.label}</p>
            <Badge variant="outline">{formatForecastEventTypeLabel(event.type)}</Badge>
            {event.isShortfall ? (
              <Badge variant="destructive">Shortfall</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{formatForecastDate(event.date)}</p>
          {event.periodLabel ? (
            <p className="text-xs text-muted-foreground">{event.periodLabel}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">{event.sourceLabel}</p>
        </div>
        <div className="text-right">
          <p className="font-medium tabular-nums">{amountLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Balance {formatCurrency(event.projectedBalance)}
          </p>
        </div>
      </div>
      {event.warningLabels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {event.warningLabels.map((warning) => (
            <Badge
              key={warning}
              variant="secondary"
              className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"
            >
              {warning}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardSafeToSpendForecast({
  forecastInput,
  loading = false,
}: DashboardSafeToSpendForecastProps) {
  const [windowKind, setWindowKind] = useState<ForecastWindowKind>("rest_of_month");
  const [showDetails, setShowDetails] = useState(false);

  const forecast = useMemo(() => {
    if (!forecastInput) {
      return null;
    }

    return buildSafeToSpendForecast({
      ...forecastInput,
      windowKind,
    });
  }, [forecastInput, windowKind]);

  const paycheckDateDisplay = useMemo(() => {
    if (!forecastInput || !forecast) {
      return null;
    }

    const incomeEvents = forecast.events
      .filter((event) => event.type === "income")
      .map((event) => ({
        id: event.id,
        userId: forecastInput.signedInUserId,
        date: event.date,
        amount: event.amount,
        label: event.label,
        sourceLabel: event.sourceLabel,
      }));

    return buildForecastPaycheckDateDisplay({
      incomeEvents,
      signedInUserId: forecastInput.signedInUserId,
    });
  }, [forecast, forecastInput]);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="h-4 w-4" aria-hidden="true" />
            Future safe-to-spend forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!forecastInput || !forecast) {
    return null;
  }

  const { summary, events, emptyStateMessage } = forecast;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChart className="h-4 w-4" aria-hidden="true" />
              Future safe-to-spend forecast
            </CardTitle>
            <CardDescription>
              Read-only projection of your available amount after expected income and scheduled
              obligations. {summary.incomeLabel}
            </CardDescription>
          </div>
          <Select
            value={windowKind}
            onValueChange={(value) => setWindowKind(value as ForecastWindowKind)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORECAST_WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option.kind} value={option.kind}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.isIncomplete && summary.incompleteReason ? (
          <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{summary.incompleteReason}</AlertDescription>
          </Alert>
        ) : null}

        {summary.hasShortfall ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Projected balance drops below zero
              {summary.firstShortfallDate
                ? ` on ${formatForecastDate(summary.firstShortfallDate)}`
                : ""}
              . Review upcoming bills, debt payments, savings obligations, and expenses in
              this window.
            </AlertDescription>
          </Alert>
        ) : null}

        {emptyStateMessage && events.length <= 1 ? (
          <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
        ) : null}

        {!summary.isIncomplete || events.length > 1 ? (
          <section aria-labelledby="forecast-summary-metrics">
            <h3 id="forecast-summary-metrics" className="sr-only">
              Forecast summary metrics
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryMetric
                label="Starting available amount"
                value={formatCurrency(summary.startingCash)}
              />
              <SummaryMetric
                label="Projected ending balance"
                value={formatCurrency(summary.projectedEndingBalance)}
                tone={summary.projectedEndingBalance < 0 ? "warning" : "default"}
              />
              <SummaryMetric
                label="Lowest projected balance"
                value={formatCurrency(summary.lowestProjectedBalance)}
                tone={summary.lowestProjectedBalance < 0 ? "warning" : "default"}
              />
              <SummaryMetric
                label="Total projected obligations"
                value={formatDeductionAmount(summary.totalProjectedObligations)}
              />
              <SummaryMetric
                label="Income in forecast"
                value={
                  summary.incomeStatus === "configured"
                    ? formatCurrency(summary.totalProjectedIncome)
                    : "Not configured"
                }
              />
              <SummaryMetric
                label="Forecast window"
                value={summary.windowLabel}
              />
            </div>
          </section>
        ) : null}

        {paycheckDateDisplay ? (
          <section
            aria-labelledby="forecast-paycheck-dates-heading"
            className="rounded-lg border bg-muted/30 p-4 space-y-3"
          >
            <div className="space-y-1">
              <h3 id="forecast-paycheck-dates-heading" className="text-sm font-medium">
                {paycheckDateDisplay.title}
              </h3>
              {paycheckDateDisplay.scheduleLabel ? (
                <p className="text-xs text-muted-foreground">
                  {paycheckDateDisplay.scheduleLabel}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">{PAYCHECK_DATE_ADJUSTMENT_COPY}</p>
            </div>
            {paycheckDateDisplay.incomeConfigured ? (
              <ul className="space-y-2">
                {paycheckDateDisplay.dates.map((entry) => (
                  <li
                    key={entry.date}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span>{entry.formattedDate}</span>
                    {entry.amount !== null ? (
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(entry.amount)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : paycheckDateDisplay.emptyMessage ? (
              <p className="text-sm text-muted-foreground">{paycheckDateDisplay.emptyMessage}</p>
            ) : null}
          </section>
        ) : null}

        {events.length > 0 ? (
          <section aria-labelledby="forecast-event-rows">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="forecast-event-rows" className="text-sm font-medium">
                Forecast events
              </h3>
              {events.length > 4 ? (
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => setShowDetails((current) => !current)}
                >
                  {showDetails ? "Hide details" : "View details"}
                </button>
              ) : null}
            </div>
            <div className="space-y-2">
              {(showDetails ? events : events.slice(0, 4)).map((event) => (
                <ForecastEventRow key={`${event.id}-${event.date}`} event={event} />
              ))}
              {!showDetails && events.length > 4 ? (
                <p className="text-xs text-muted-foreground">
                  {events.length - 4} more event{events.length - 4 === 1 ? "" : "s"} hidden.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
