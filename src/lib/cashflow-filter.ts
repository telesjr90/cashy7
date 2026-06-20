import type { BillInstance } from "@/lib/types";

type BillInstanceDateFields = Pick<
  BillInstance,
  "year" | "month" | "period_bucket"
>;

/** Dashboard date derived from the same fields used for month/period grouping. */
export function billInstanceDashboardDate(
  bill: BillInstanceDateFields
): string {
  const day = bill.period_bucket === "1_14" ? 1 : 15;
  const month = String(bill.month).padStart(2, "0");
  const dayString = String(day).padStart(2, "0");
  return `${bill.year}-${month}-${dayString}`;
}

export function isBillInstanceOnOrAfterCashflowStart(
  bill: BillInstanceDateFields,
  cashflowStartDate: string
): boolean {
  return billInstanceDashboardDate(bill) >= cashflowStartDate;
}

export function filterBillInstancesByCashflowStart(
  bills: BillInstance[],
  cashflowStartDate: string | null | undefined
): BillInstance[] {
  if (!cashflowStartDate) {
    return bills;
  }

  return bills.filter((bill) =>
    isBillInstanceOnOrAfterCashflowStart(bill, cashflowStartDate)
  );
}
