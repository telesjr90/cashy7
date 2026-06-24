import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarDays } from "lucide-react";
import {
  type CashflowCalendarDayCell,
  type CashflowCalendarDaySummary,
  type CashflowCalendarEvent,
  type CashflowCalendarResult,
  formatCalendarEventTypeLabel,
} from "@/lib/cashflow-calendar";
import { formatCurrency, formatDeductionAmount } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CashflowCalendarProps = {
  calendar: CashflowCalendarResult | null;
  loading?: boolean;
  error?: string | null;
};

function formatCalendarDate(isoDate: string): string {
  return format(parseISO(isoDate), "EEEE, MMMM d, yyyy");
}

function eventAmountLabel(event: CashflowCalendarEvent): string | null {
  if (event.amount == null) {
    return null;
  }

  if (event.type === "income") {
    return formatCurrency(event.amount);
  }

  if (event.signedEffect != null && event.signedEffect < 0) {
    return formatDeductionAmount(Math.abs(event.signedEffect));
  }

  return formatCurrency(event.amount);
}

function eventToneClass(event: CashflowCalendarEvent): string {
  switch (event.type) {
    case "income":
      return "border-emerald-500/30 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100";
    case "period_marker":
      return "border-primary/30 bg-primary/5 text-foreground";
    case "remaining_debt":
      return "border-orange-500/30 bg-orange-50/70 text-orange-950 dark:bg-orange-950/20 dark:text-orange-100";
    case "safe_to_spend":
      return "border-sky-500/30 bg-sky-50/70 text-sky-950 dark:bg-sky-950/20 dark:text-sky-100";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

function CalendarEventBadge({ event }: { event: CashflowCalendarEvent }) {
  const amountLabel = eventAmountLabel(event);

  return (
    <div
      className={`rounded border px-1.5 py-0.5 text-[10px] leading-tight ${eventToneClass(event)}`}
      title={[event.title, amountLabel, event.statusLabel].filter(Boolean).join(" · ")}
    >
      <div className="truncate font-medium">{event.title}</div>
      {amountLabel ? <div className="tabular-nums">{amountLabel}</div> : null}
    </div>
  );
}

function CalendarEventRow({ event }: { event: CashflowCalendarEvent }) {
  const amountLabel = eventAmountLabel(event);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{event.title}</p>
            <Badge variant="outline">{formatCalendarEventTypeLabel(event.type)}</Badge>
            {event.statusLabel ? (
              <Badge variant="secondary">{event.statusLabel}</Badge>
            ) : null}
          </div>
          {event.sourceLabel ? (
            <p className="text-xs text-muted-foreground">{event.sourceLabel}</p>
          ) : null}
          {event.periodLabel ? (
            <p className="text-xs text-muted-foreground">{event.periodLabel}</p>
          ) : null}
        </div>
        {amountLabel ? (
          <p className="font-medium tabular-nums">{amountLabel}</p>
        ) : null}
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

function DayCellButton({
  cell,
  onSelect,
}: {
  cell: CashflowCalendarDayCell;
  onSelect: (date: string) => void;
}) {
  if (!cell.date || cell.dayOfMonth == null) {
    return <div className="min-h-28 rounded-lg border border-dashed bg-muted/20" aria-hidden />;
  }

  return (
    <button
      type="button"
      className={`min-h-28 w-full rounded-lg border p-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        cell.isToday ? "border-primary bg-primary/5" : "bg-card"
      }`}
      onClick={() => onSelect(cell.date!)}
      aria-label={`View events for ${formatCalendarDate(cell.date)}`}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className={`text-sm font-semibold ${cell.isToday ? "text-primary" : ""}`}>
          {cell.dayOfMonth}
        </span>
        {cell.periodBucket === "1_14" && cell.dayOfMonth === 1 ? (
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            1–14
          </Badge>
        ) : null}
        {cell.periodBucket === "15_eom" && cell.dayOfMonth === 15 ? (
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            15–EOM
          </Badge>
        ) : null}
      </div>
      <div className="space-y-1">
        {cell.events.map((event) => (
          <CalendarEventBadge key={event.id} event={event} />
        ))}
        {cell.hiddenEventCount > 0 ? (
          <p className="text-[10px] text-muted-foreground">+{cell.hiddenEventCount} more</p>
        ) : null}
      </div>
    </button>
  );
}

function DaySummaryRow({ summary }: { summary: CashflowCalendarDaySummary }) {
  if (summary.events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{formatCalendarDate(summary.date)}</h3>
          <p className="text-sm text-muted-foreground">
            Net {summary.netEffect >= 0 ? "+" : ""}
            {formatCurrency(summary.netEffect)}
            {summary.projectedBalance != null
              ? ` · Forecast balance ${formatCurrency(summary.projectedBalance)}`
              : ""}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-emerald-700 dark:text-emerald-300">
            Income {formatCurrency(summary.incomeTotal)}
          </p>
          <p className="text-destructive">
            Obligations {formatDeductionAmount(summary.obligationTotal)}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {summary.events.map((event) => (
          <CalendarEventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function MonthSummaryCard({ calendar }: { calendar: CashflowCalendarResult }) {
  const { monthSummary } = calendar;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{monthSummary.monthLabel}</CardTitle>
        <CardDescription>
          Household planning events and your forecast effects for the selected month.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Expected income</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatCurrency(monthSummary.totalIncome)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Your obligations</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatDeductionAmount(monthSummary.totalObligations)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Net effect</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {monthSummary.netEffect >= 0 ? "+" : ""}
            {formatCurrency(monthSummary.netEffect)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Remaining debt</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {monthSummary.remainingDebtTotal != null
              ? formatCurrency(monthSummary.remainingDebtTotal)
              : "—"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CashflowCalendar({
  calendar,
  loading = false,
  error = null,
}: CashflowCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selectedDaySummary = useMemo(() => {
    if (!calendar || !selectedDate) {
      return null;
    }

    return (
      calendar.chronologicalDays.find((day) => day.date === selectedDate) ?? null
    );
  }, [calendar, selectedDate]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[420px] w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!calendar) {
    return (
      <Alert>
        <AlertDescription>Calendar data is unavailable.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {calendar.emptyStateMessage ? (
        <Alert>
          <AlertDescription>{calendar.emptyStateMessage}</AlertDescription>
        </Alert>
      ) : null}

      {calendar.monthSummary.forecastIncompleteReason ? (
        <Alert>
          <AlertDescription>{calendar.monthSummary.forecastIncompleteReason}</AlertDescription>
        </Alert>
      ) : null}

      {calendar.monthSummary.paycheckScheduleMessage ? (
        <Alert>
          <AlertDescription>{calendar.monthSummary.paycheckScheduleMessage}</AlertDescription>
        </Alert>
      ) : null}

      {calendar.monthSummary.forecastSummary ? (
        <Alert>
          <AlertDescription>
            Forecast ending balance{" "}
            {formatCurrency(calendar.monthSummary.forecastSummary.projectedEndingBalance)} for
            the full selected month. Per-day projected balances appear in the chronological list
            when forecast events fall on that date.
          </AlertDescription>
        </Alert>
      ) : null}

      <MonthSummaryCard calendar={calendar} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Month grid
          </CardTitle>
          <CardDescription>
            Tap a day to open details. Grid shows up to three events per day; use the list below
            for the full month timeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-2 grid grid-cols-7 gap-2">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-xs font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendar.gridWeeks.flatMap((week) =>
              week.map((cell, index) => (
                <DayCellButton
                  key={cell.date ?? `blank-${index}`}
                  cell={cell}
                  onSelect={setSelectedDate}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chronological list</CardTitle>
          <CardDescription>
            Events grouped by date with income, obligations, net effect, and forecast balance when
            available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {calendar.chronologicalDays.some((day) => day.events.length > 0) ? (
            calendar.chronologicalDays
              .filter((day) => day.events.length > 0)
              .map((summary) => <DaySummaryRow key={summary.date} summary={summary} />)
          ) : (
            <p className="text-sm text-muted-foreground">
              No dated events this month. Period markers and forecast summaries may still apply.
            </p>
          )}
        </CardContent>
      </Card>

      <Sheet open={selectedDate != null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {selectedDate ? formatCalendarDate(selectedDate) : "Day details"}
            </SheetTitle>
            <SheetDescription>
              {selectedDaySummary
                ? `Net ${selectedDaySummary.netEffect >= 0 ? "+" : ""}${formatCurrency(selectedDaySummary.netEffect)}`
                : "Events for the selected day"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selectedDaySummary?.events.length ? (
              selectedDaySummary.events.map((event) => (
                <CalendarEventRow key={event.id} event={event} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No events on this day.</p>
            )}
          </div>
          {selectedDate ? (
            <div className="mt-4">
              <Button variant="outline" onClick={() => setSelectedDate(null)}>
                Close
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
