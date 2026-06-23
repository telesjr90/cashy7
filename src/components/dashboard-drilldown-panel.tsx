import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCurrency, formatDeductionAmount } from "@/lib/format";
import type {
  DashboardBillDrilldownRow,
  DashboardSavingsDrilldownRow,
} from "@/lib/dashboard-drilldowns";
import type {
  DashboardUnpaidBillDrilldownReconciliation,
  DashboardUnpaidBillDrilldownRow,
} from "@/lib/dashboard-bill-drilldown";
import {
  UNPAID_BILL_CASH_CONTEXT_UNAVAILABLE_MESSAGE,
  UNPAID_BILL_DRILLDOWN_EMPTY_MESSAGE,
} from "@/lib/dashboard-bill-drilldown";
import type {
  DashboardExpenseDrilldownReconciliation,
  DashboardExpenseDrilldownRow,
} from "@/lib/dashboard-expense-drilldown";
import {
  DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS,
  EXPENSE_DRILLDOWN_EMPTY_MESSAGE,
  filterExpenseDrilldownRowsLocally,
  getExpenseDrilldownCategoryOptions,
  hasActiveExpenseDrilldownFilters,
} from "@/lib/dashboard-expense-drilldown";
import { formatExpensePeriodBucket } from "@/lib/expenses";

export type DashboardDrilldownKind =
  | "bills"
  | "unpaid-bills"
  | "expenses"
  | "savings"
  | "safe-to-spend-before"
  | "safe-to-spend-after";

export interface SafeToSpendBreakdown {
  currentAmount: number;
  unpaidBillTotal: number;
  manualExpenseTotal: number;
  safeToSpendBeforeSavings: number;
  savingsTarget: number;
  savingsContributions: number;
  remainingSavingsObligation: number;
  safeToSpendAfterSavings: number;
}

interface DashboardDrilldownPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DashboardDrilldownKind | null;
  viewLabel: string;
  billRows?: DashboardBillDrilldownRow[];
  unpaidBillRows?: DashboardUnpaidBillDrilldownRow[];
  unpaidBillReconciliation?: DashboardUnpaidBillDrilldownReconciliation | null;
  expenseRows?: DashboardExpenseDrilldownRow[];
  expenseReconciliation?: DashboardExpenseDrilldownReconciliation | null;
  savingsRows?: DashboardSavingsDrilldownRow[];
  safeToSpendBreakdown?: SafeToSpendBreakdown | null;
  loading?: boolean;
  emptyMessage?: string;
  cashDeductionContextAvailable?: boolean;
}

function drilldownTitle(kind: DashboardDrilldownKind | null): string {
  switch (kind) {
    case "bills":
      return "Bill details";
    case "unpaid-bills":
      return "Unpaid bill details";
    case "expenses":
      return "Manual expense details";
    case "savings":
      return "My savings details";
    case "safe-to-spend-before":
      return "Safe to spend before savings";
    case "safe-to-spend-after":
      return "Safe to spend after savings";
    default:
      return "Dashboard details";
  }
}

function drilldownDescription(
  kind: DashboardDrilldownKind | null,
  viewLabel: string
): string {
  switch (kind) {
    case "bills":
      return `Bills included in ${viewLabel}.`;
    case "unpaid-bills":
      return `Unpaid bills included in ${viewLabel}.`;
    case "expenses":
      return `Manual expenses counted in ${viewLabel} after your latest current-amount snapshot.`;
    case "savings":
      return `Your savings targets and contributions for ${viewLabel}. Other users' private savings are not shown.`;
    case "safe-to-spend-before":
      return `How safe to spend before savings was calculated for ${viewLabel}.`;
    case "safe-to-spend-after":
      return `How safe to spend after savings was calculated for ${viewLabel}.`;
    default:
      return viewLabel;
  }
}

function formatBillDueDate(dueDate: string | null): string {
  if (!dueDate) {
    return "No due date";
  }

  return format(parseISO(dueDate), "MMM d, yyyy");
}

function formatExpenseDate(expenseDate: string): string {
  return format(parseISO(expenseDate), "MMM d, yyyy");
}

function isUnpaidBillDrilldownRow(
  row: DashboardBillDrilldownRow
): row is DashboardUnpaidBillDrilldownRow {
  return "sourceLabel" in row;
}

function BillRowsList({
  rows,
  kind,
}: {
  rows: DashboardBillDrilldownRow[];
  kind: DashboardDrilldownKind | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {kind === "unpaid-bills"
          ? UNPAID_BILL_DRILLDOWN_EMPTY_MESSAGE
          : "No bills match this view."}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{row.name}</p>
              <p className="text-muted-foreground">
                Due {formatBillDueDate(row.dueDate)} ·{" "}
                {formatExpensePeriodBucket(row.periodBucket)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">
                {formatCurrency(row.totalAmount)}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                Teles {formatCurrency(row.telesAmount)} / Nicole{" "}
                {formatCurrency(row.nicoleAmount)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={row.isPaid ? "secondary" : "outline"}>
              {row.isPaid ? "Paid" : "Unpaid"}
            </Badge>
            {isUnpaidBillDrilldownRow(row) && (
              <Badge variant="outline">{row.sourceLabel}</Badge>
            )}
            {row.isDebtLinked && (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <Badge variant="outline">Debt-linked</Badge>
                <Link to="/debt" className="underline underline-offset-2">
                  View on Debt page
                </Link>
              </div>
            )}
            {isUnpaidBillDrilldownRow(row) && row.variableAmountWarningLabel && (
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-950 dark:text-amber-100"
              >
                Variable amount needs confirmation
              </Badge>
            )}
            {isUnpaidBillDrilldownRow(row) && row.cashDeductionStatusLabel && (
              <span className="text-xs text-muted-foreground">
                {row.cashDeductionStatusLabel}
              </span>
            )}
            {row.myShareAmount !== null && (
              <span className="text-xs text-muted-foreground">
                Your share {formatCurrency(row.myShareAmount)}
              </span>
            )}
          </div>
          {isUnpaidBillDrilldownRow(row) && row.variableAmountWarningLabel && (
            <p className="mt-2 text-xs text-amber-950 dark:text-amber-100">
              {row.variableAmountWarningLabel}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function DrilldownReconciliation({
  reconciliation,
}: {
  reconciliation:
    | DashboardUnpaidBillDrilldownReconciliation
    | DashboardExpenseDrilldownReconciliation;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="mb-2 font-medium">Reconciliation</p>
      <dl className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{reconciliation.cardTotalLabel}</dt>
          <dd className="font-medium tabular-nums">
            {formatDeductionAmount(reconciliation.cardTotal)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{reconciliation.rowTotalLabel}</dt>
          <dd className="font-medium tabular-nums">
            {formatDeductionAmount(reconciliation.displayedRowTotal)}
          </dd>
        </div>
        {reconciliation.matchLabel && (
          <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
            <dt className="font-medium text-green-700 dark:text-green-400">
              {reconciliation.matchLabel}
            </dt>
            <dd aria-hidden="true" />
          </div>
        )}
      </dl>
      {reconciliation.mismatchExplanation && (
        <p className="mt-2 text-xs text-muted-foreground">
          {reconciliation.mismatchExplanation}
        </p>
      )}
    </div>
  );
}

function ExpenseDrilldownSection({
  rows,
  reconciliation,
  viewLabel,
}: {
  rows: DashboardExpenseDrilldownRow[];
  reconciliation: DashboardExpenseDrilldownReconciliation | null;
  viewLabel: string;
}) {
  const [filters, setFilters] = useState(DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS);
  const categoryOptions = useMemo(
    () => getExpenseDrilldownCategoryOptions(rows),
    [rows]
  );
  const filteredRows = useMemo(
    () => filterExpenseDrilldownRowsLocally(rows, filters),
    [rows, filters]
  );
  const filtersActive = hasActiveExpenseDrilldownFilters(filters);

  useEffect(() => {
    setFilters(DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {EXPENSE_DRILLDOWN_EMPTY_MESSAGE}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Viewing {viewLabel}. This drilldown is read-only — add, edit, or delete
        expenses on the{" "}
        <Link to="/expenses" className="font-medium underline underline-offset-4">
          Expenses page
        </Link>
        .
      </p>

      {rows.length > 1 && (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">Filter listed rows</p>
          <Input
            value={filters.searchText}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                searchText: event.target.value,
              }))
            }
            placeholder="Search description, category, notes, source…"
            aria-label="Search manual expense drilldown rows"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={filters.category || "all"}
              onValueChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  category: value === "all" ? "" : value,
                }))
              }
            >
              <SelectTrigger aria-label="Filter by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.rowKind}
              onValueChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  rowKind:
                    value === "all" || value === "expense" || value === "adjustment"
                      ? value
                      : "all",
                }))
              }
            >
              <SelectTrigger aria-label="Filter by row type">
                <SelectValue placeholder="All row types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All row types</SelectItem>
                <SelectItem value="expense">Manual expenses</SelectItem>
                <SelectItem value="adjustment">Adjustments</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtersActive && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Showing {filteredRows.length} of {rows.length} included rows
              </span>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() =>
                  setFilters(DEFAULT_DASHBOARD_EXPENSE_DRILLDOWN_FILTERS)
                }
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rows match the current filters.
        </p>
      ) : (
        <ul className="space-y-3">
          {filteredRows.map((row) => (
            <li key={row.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{row.description}</p>
                  <p className="text-muted-foreground">
                    {formatExpenseDate(row.date)}
                    {row.category ? ` · ${row.category}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(row.amount)}
                  </p>
                  {row.myShareAmount !== null && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Your share {formatDeductionAmount(row.myShareAmount)}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{row.rowTypeLabel}</Badge>
                <Badge variant="outline">{row.sourceLabel}</Badge>
                {row.adjustmentDirectionLabel && (
                  <Badge variant="outline">{row.adjustmentDirectionLabel}</Badge>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Split: {row.splitLabel} · Teles {formatCurrency(row.telesAmount)} /
                Nicole {formatCurrency(row.nicoleAmount)}
              </p>
              {row.paidByLabel && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Paid by {row.paidByLabel}
                </p>
              )}
              {row.linkedOriginalDescription && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Adjusts {row.linkedOriginalDescription}
                </p>
              )}
              {row.adjustmentReason && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Reason: {row.adjustmentReason}
                </p>
              )}
              {row.notes && (
                <p className="mt-1 text-xs text-muted-foreground">Notes: {row.notes}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {reconciliation && <DrilldownReconciliation reconciliation={reconciliation} />}
      {filtersActive && reconciliation && (
        <p className="text-xs text-muted-foreground">
          Reconciliation totals include all rows in this view, not just filtered
          rows.
        </p>
      )}
    </div>
  );
}

function SavingsRowsList({ rows }: { rows: DashboardSavingsDrilldownRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No savings targets apply to this view.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.savingsGoalId} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{row.goalLabel}</p>
              <p className="text-muted-foreground">
                {row.contributionPeriodLabel}
                {row.isSharedGoal ? " · Shared goal" : " · Private goal"}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Target {formatCurrency(row.targetAmount)}</p>
              <p>Contributed {formatCurrency(row.contributedAmount)}</p>
              <p>Remaining {formatDeductionAmount(row.remainingObligation)}</p>
            </div>
          </div>
          {row.contributions.length > 0 ? (
            <ul className="mt-3 space-y-2 border-t pt-3">
              {row.contributions.map((contribution) => (
                <li
                  key={contribution.id}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span className="text-muted-foreground">
                    {formatExpenseDate(contribution.date)}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(contribution.amount)}
                  </span>
                  {contribution.notes && (
                    <span className="w-full text-xs text-muted-foreground">
                      {contribution.notes}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              No contributions recorded in this view yet.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function SafeToSpendBeforeBreakdown({
  breakdown,
}: {
  breakdown: SafeToSpendBreakdown;
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">Current available amount</dt>
        <dd className="font-medium tabular-nums">
          {formatCurrency(breakdown.currentAmount)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">Your unpaid bills in this view</dt>
        <dd className="font-medium tabular-nums">
          {formatDeductionAmount(breakdown.unpaidBillTotal)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">Your manual expenses in this view</dt>
        <dd className="font-medium tabular-nums">
          {formatDeductionAmount(breakdown.manualExpenseTotal)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
        <dt className="font-medium">Safe to spend before savings</dt>
        <dd className="font-semibold tabular-nums">
          {formatCurrency(breakdown.safeToSpendBeforeSavings)}
        </dd>
      </div>
    </dl>
  );
}

function SafeToSpendAfterBreakdown({
  breakdown,
}: {
  breakdown: SafeToSpendBreakdown;
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">Safe to spend before savings</dt>
        <dd className="font-medium tabular-nums">
          {formatCurrency(breakdown.safeToSpendBeforeSavings)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">Your savings target in this view</dt>
        <dd className="font-medium tabular-nums">
          {formatCurrency(breakdown.savingsTarget)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">
          Your contributions counted in this view
        </dt>
        <dd className="font-medium tabular-nums">
          {formatCurrency(breakdown.savingsContributions)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted-foreground">
          Remaining savings obligation in this view
        </dt>
        <dd className="font-medium tabular-nums">
          {formatDeductionAmount(breakdown.remainingSavingsObligation)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
        <dt className="font-medium">Safe to spend after savings</dt>
        <dd className="font-semibold tabular-nums">
          {formatCurrency(breakdown.safeToSpendAfterSavings)}
        </dd>
      </div>
    </dl>
  );
}

export function DashboardDrilldownPanel({
  open,
  onOpenChange,
  kind,
  viewLabel,
  billRows = [],
  unpaidBillRows = [],
  unpaidBillReconciliation = null,
  expenseRows = [],
  expenseReconciliation = null,
  savingsRows = [],
  safeToSpendBreakdown = null,
  loading = false,
  emptyMessage,
  cashDeductionContextAvailable = true,
}: DashboardDrilldownPanelProps) {
  const billRowsForKind =
    kind === "unpaid-bills" ? unpaidBillRows : billRows;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{drilldownTitle(kind)}</SheetTitle>
          <SheetDescription>{drilldownDescription(kind, viewLabel)}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6 pt-2">
          {kind === "unpaid-bills" && !loading && !emptyMessage && (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Viewing {viewLabel}. This drilldown is read-only — pay or edit bills on the{" "}
              <Link to="/bills" className="font-medium underline underline-offset-4">
                Bills page
              </Link>
              .
            </p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading details…</p>
          ) : emptyMessage ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : kind === "bills" || kind === "unpaid-bills" ? (
            <>
              <BillRowsList rows={billRowsForKind} kind={kind} />
              {kind === "unpaid-bills" && unpaidBillReconciliation && (
                <DrilldownReconciliation reconciliation={unpaidBillReconciliation} />
              )}
              {kind === "unpaid-bills" && !cashDeductionContextAvailable && (
                <p className="text-xs text-muted-foreground">
                  {UNPAID_BILL_CASH_CONTEXT_UNAVAILABLE_MESSAGE}
                </p>
              )}
            </>
          ) : kind === "expenses" ? (
            <ExpenseDrilldownSection
              rows={expenseRows}
              reconciliation={expenseReconciliation}
              viewLabel={viewLabel}
            />
          ) : kind === "savings" ? (
            <SavingsRowsList rows={savingsRows} />
          ) : kind === "safe-to-spend-before" && safeToSpendBreakdown ? (
            <>
              <SafeToSpendBeforeBreakdown breakdown={safeToSpendBreakdown} />
              <p className="text-xs text-muted-foreground">
                Only expenses after your latest current-amount snapshot are counted,
                to avoid double-counting. Expenses paid through the app are not
                counted again.
              </p>
            </>
          ) : kind === "safe-to-spend-after" && safeToSpendBreakdown ? (
            <SafeToSpendAfterBreakdown breakdown={safeToSpendBreakdown} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Details are not available for this view yet.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
