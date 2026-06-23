import {
  filterBillInstancesByCashflowStart,
  isBillInstanceOnOrAfterCashflowStart,
} from "@/lib/cashflow-filter";
import type { BillInstance } from "@/lib/types";

export const BILL_PRE_START_LABEL = "Before cashflow start";

export const BILLS_PRE_START_HIDDEN_NOTICE =
  "Bills before the cashflow start date are hidden from the active list.";

export const SHOW_PRE_START_BILLS_LABEL = "Show pre-start bills";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function isBillInstancePreStart(
  bill: BillInstance,
  cashflowStartDate: string | null | undefined
): boolean {
  if (!cashflowStartDate) {
    return false;
  }

  return !isBillInstanceOnOrAfterCashflowStart(bill, cashflowStartDate);
}

export function getBillInstancePreStartLabel(
  bill: BillInstance,
  cashflowStartDate: string | null | undefined
): string | null {
  return isBillInstancePreStart(bill, cashflowStartDate)
    ? BILL_PRE_START_LABEL
    : null;
}

export function splitBillInstancesByCashflowStart(
  bills: BillInstance[],
  cashflowStartDate: string | null | undefined
): { activeBills: BillInstance[]; preStartBills: BillInstance[] } {
  if (!cashflowStartDate) {
    return { activeBills: bills, preStartBills: [] };
  }

  const activeBills: BillInstance[] = [];
  const preStartBills: BillInstance[] = [];

  for (const bill of bills) {
    if (isBillInstanceOnOrAfterCashflowStart(bill, cashflowStartDate)) {
      activeBills.push(bill);
    } else {
      preStartBills.push(bill);
    }
  }

  return { activeBills, preStartBills };
}

/** Bills eligible for C070 filters and the default active list. */
export function getBillsPageVisibleInstances(
  bills: BillInstance[],
  cashflowStartDate: string | null | undefined,
  showPreStartBills: boolean
): BillInstance[] {
  if (!cashflowStartDate || showPreStartBills) {
    return bills;
  }

  return filterBillInstancesByCashflowStart(bills, cashflowStartDate);
}

export function billCashflowStartLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}
