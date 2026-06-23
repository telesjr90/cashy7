import type { BillShareKey } from "@/lib/bill-share";
import { getMyBillShareAmount } from "@/lib/bill-share";
import { formatBillInstanceSourceDisplayLabel } from "@/lib/bill-detail";
import {
  filterBillsForDashboardView,
  type DashboardBillDrilldownRow,
} from "@/lib/dashboard-drilldowns";
import { getBillInstanceSourceLabel } from "@/lib/bill-templates";
import {
  cashDeductionStatusLabel,
  getCashDeductionStatus,
  hasCashDeductionForBill,
} from "@/lib/payments";
import { PERIOD_LABELS, type PeriodView } from "@/lib/periods";
import type { BillInstance, CashPaymentTransaction } from "@/lib/types";
import {
  needsVariableAmountConfirmation,
  VARIABLE_AMOUNT_CONFIRMATION_MESSAGE,
  type VariableBillContext,
} from "@/lib/variable-bills";

const MONTH_NAMES = [
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

export interface DashboardUnpaidBillDrilldownRow extends DashboardBillDrilldownRow {
  sourceLabel: string;
  variableAmountWarningLabel: string | null;
  cashDeductionStatusLabel: string | null;
}

export interface DashboardBillCashDeductionContext {
  billPaymentSourceIds: ReadonlyMap<string, CashPaymentTransaction>;
  debtPaymentTransactionSourceIds: ReadonlyMap<string, CashPaymentTransaction>;
  debtPaymentIdByBillId: ReadonlyMap<string, string>;
}

export interface DashboardUnpaidBillDrilldownReconciliation {
  cardTotal: number;
  displayedRowTotal: number;
  totalsMatch: boolean;
  cardTotalLabel: string;
  rowTotalLabel: string;
  matchLabel: string | null;
  mismatchExplanation: string | null;
}

export interface BuildUnpaidBillDrilldownInput {
  bills: BillInstance[];
  periodView: PeriodView;
  shareKey: BillShareKey;
  debtLinkedBillIds: ReadonlySet<string>;
  variableBillContext: VariableBillContext;
  cardTotal: number;
  cashDeductionContext: DashboardBillCashDeductionContext | null;
}

export interface UnpaidBillDrilldownResult {
  rows: DashboardUnpaidBillDrilldownRow[];
  reconciliation: DashboardUnpaidBillDrilldownReconciliation;
}

export function buildDashboardBillViewLabel(
  year: number,
  month: number,
  periodView: PeriodView
): string {
  const monthName = MONTH_NAMES[month - 1] ?? String(month);
  const periodLabel =
    periodView === "full" ? "Full month" : PERIOD_LABELS[periodView];
  return `${monthName} ${year} · ${periodLabel}`;
}

function resolveCashDeductionStatusLabel(
  bill: BillInstance,
  cashDeductionContext: DashboardBillCashDeductionContext | null
): string | null {
  if (!cashDeductionContext) {
    return null;
  }

  const hasPaymentTransaction = hasCashDeductionForBill(bill.id, {
    billPaymentSourceIds: cashDeductionContext.billPaymentSourceIds,
    debtPaymentIdByBillId: cashDeductionContext.debtPaymentIdByBillId,
    debtPaymentTransactionSourceIds:
      cashDeductionContext.debtPaymentTransactionSourceIds,
  });

  return cashDeductionStatusLabel(
    getCashDeductionStatus({
      isMarkedPaid: bill.is_paid,
      hasPaymentTransaction,
    })
  );
}

export function buildUnpaidBillDrilldownRows(
  bills: BillInstance[],
  shareKey: BillShareKey,
  debtLinkedBillIds: ReadonlySet<string>,
  variableBillContext: VariableBillContext,
  cashDeductionContext: DashboardBillCashDeductionContext | null
): DashboardUnpaidBillDrilldownRow[] {
  return bills.map((bill) => {
    const source = getBillInstanceSourceLabel({
      billId: bill.bill_id,
      name: bill.name,
      notes: bill.notes,
    });

    return {
      id: bill.id,
      name: bill.name,
      dueDate: bill.due_date,
      periodBucket: bill.period_bucket,
      totalAmount: Number(bill.amount),
      telesAmount: Number(bill.teles_amount),
      nicoleAmount: Number(bill.nicole_amount),
      myShareAmount: getMyBillShareAmount(bill, shareKey),
      isPaid: bill.is_paid,
      isDebtLinked: debtLinkedBillIds.has(bill.id),
      sourceLabel: formatBillInstanceSourceDisplayLabel(source),
      variableAmountWarningLabel: needsVariableAmountConfirmation(
        bill,
        variableBillContext
      )
        ? VARIABLE_AMOUNT_CONFIRMATION_MESSAGE
        : null,
      cashDeductionStatusLabel: resolveCashDeductionStatusLabel(
        bill,
        cashDeductionContext
      ),
    };
  });
}

export function sumUnpaidBillDrilldownRowShares(
  rows: ReadonlyArray<Pick<DashboardUnpaidBillDrilldownRow, "myShareAmount">>
): number {
  return rows.reduce((sum, row) => sum + (row.myShareAmount ?? 0), 0);
}

export function buildUnpaidBillDrilldownReconciliation(
  cardTotal: number,
  displayedRowTotal: number
): DashboardUnpaidBillDrilldownReconciliation {
  const totalsMatch = Math.abs(cardTotal - displayedRowTotal) < 0.005;

  return {
    cardTotal,
    displayedRowTotal,
    totalsMatch,
    cardTotalLabel: "Dashboard card total (your unpaid share)",
    rowTotalLabel: "Sum of your shares in listed rows",
    matchLabel: totalsMatch ? "Totals match" : null,
    mismatchExplanation: totalsMatch
      ? null
      : "These totals use your budget profile share only. Other household members' private cash is not shown. Refresh the dashboard or confirm your budget profile in Settings if something looks off.",
  };
}

export function buildUnpaidBillDrilldown(
  input: BuildUnpaidBillDrilldownInput
): UnpaidBillDrilldownResult {
  const filteredBills = filterBillsForDashboardView(input.bills, input.periodView, {
    unpaidOnly: true,
  });

  const rows = buildUnpaidBillDrilldownRows(
    filteredBills,
    input.shareKey,
    input.debtLinkedBillIds,
    input.variableBillContext,
    input.cashDeductionContext
  );

  const displayedRowTotal = sumUnpaidBillDrilldownRowShares(rows);

  return {
    rows,
    reconciliation: buildUnpaidBillDrilldownReconciliation(
      input.cardTotal,
      displayedRowTotal
    ),
  };
}

export const UNPAID_BILL_DRILLDOWN_EMPTY_MESSAGE =
  "No unpaid bills are included in this view.";

export const UNPAID_BILL_CASH_CONTEXT_UNAVAILABLE_MESSAGE =
  "Cash deduction status is shown only for your own payment history.";
