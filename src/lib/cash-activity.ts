import {
  buildManualExpenseDescriptionLookup as buildAdjustmentManualExpenseDescriptionLookup,
  mapCashAdjustmentCreditsForDisplay,
} from "@/lib/cash-adjustments";
import { formatCurrency } from "@/lib/format";
import { mapCashPaymentDeductionsForDisplay } from "@/lib/payments";
import type {
  CashAdjustmentTransaction,
  CashPaymentTransaction,
} from "@/lib/types";

export const RECENT_CASH_ACTIVITY_FETCH_LIMIT = 10;
export const RECENT_CASH_ACTIVITY_DISPLAY_LIMIT = 5;

export interface RecentCashActivityDisplayRow {
  id: string;
  kind: "deduction" | "credit";
  date: string;
  amountLabel: string;
  typeLabel: "Deduction" | "Credit";
  sourceLabel: string;
  description: string;
  notes: string | null;
}

export interface RecentCashActivityLookups {
  billInstanceNameById: ReadonlyMap<string, string>;
  debtPaymentDescriptionById: ReadonlyMap<string, string>;
  manualExpenseDescriptionById: ReadonlyMap<string, string>;
  adjustmentManualExpenseDescriptionById: ReadonlyMap<string, string>;
}

export function mapRecentCashActivityForDisplay({
  deductions,
  credits,
  lookups,
  limit = RECENT_CASH_ACTIVITY_DISPLAY_LIMIT,
}: {
  deductions: CashPaymentTransaction[];
  credits: CashAdjustmentTransaction[];
  lookups: RecentCashActivityLookups;
  limit?: number;
}): RecentCashActivityDisplayRow[] {
  const deductionRows = mapCashPaymentDeductionsForDisplay(deductions, {
    billInstanceNameById: lookups.billInstanceNameById,
    debtPaymentDescriptionById: lookups.debtPaymentDescriptionById,
    manualExpenseDescriptionById: lookups.manualExpenseDescriptionById,
  });

  const creditRows = mapCashAdjustmentCreditsForDisplay(
    credits,
    lookups.adjustmentManualExpenseDescriptionById
  );

  const unified: RecentCashActivityDisplayRow[] = [
    ...deductionRows.map((row) => ({
      id: row.id,
      kind: "deduction" as const,
      date: row.paidAt,
      amountLabel: row.formattedAmount,
      typeLabel: "Deduction" as const,
      sourceLabel: row.sourceTypeLabel,
      description: row.sourceDescription,
      notes: row.notes,
    })),
    ...creditRows.map((row) => ({
      id: row.id,
      kind: "credit" as const,
      date: row.creditedAt,
      amountLabel: formatCurrency(row.amount),
      typeLabel: "Credit" as const,
      sourceLabel: "Adjustment",
      description: row.adjustmentDescription,
      notes: row.notes,
    })),
  ];

  return unified
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit);
}

export { buildAdjustmentManualExpenseDescriptionLookup };
