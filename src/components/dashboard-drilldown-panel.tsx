import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
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
  DashboardExpenseDrilldownRow,
  DashboardSavingsDrilldownRow,
} from "@/lib/dashboard-drilldowns";
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
  expenseRows?: DashboardExpenseDrilldownRow[];
  savingsRows?: DashboardSavingsDrilldownRow[];
  safeToSpendBreakdown?: SafeToSpendBreakdown | null;
  loading?: boolean;
  emptyMessage?: string;
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

function BillRowsList({ rows }: { rows: DashboardBillDrilldownRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No bills match this view.</p>
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
            {row.isDebtLinked && (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <Badge variant="outline">Debt-linked</Badge>
                <Link to="/debt" className="underline underline-offset-2">
                  View on Debt page
                </Link>
              </div>
            )}
            {row.myShareAmount !== null && (
              <span className="text-xs text-muted-foreground">
                Your share {formatCurrency(row.myShareAmount)}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ExpenseRowsList({ rows }: { rows: DashboardExpenseDrilldownRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No manual expenses are counted in this view.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
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
          <p className="mt-2 text-xs text-muted-foreground">
            Split: {row.splitLabel} · Teles {formatCurrency(row.telesAmount)} /
            Nicole {formatCurrency(row.nicoleAmount)}
          </p>
        </li>
      ))}
    </ul>
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
  expenseRows = [],
  savingsRows = [],
  safeToSpendBreakdown = null,
  loading = false,
  emptyMessage,
}: DashboardDrilldownPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{drilldownTitle(kind)}</SheetTitle>
          <SheetDescription>{drilldownDescription(kind, viewLabel)}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6 pt-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading details…</p>
          ) : emptyMessage ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : kind === "bills" || kind === "unpaid-bills" ? (
            <BillRowsList rows={billRows} />
          ) : kind === "expenses" ? (
            <ExpenseRowsList rows={expenseRows} />
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
