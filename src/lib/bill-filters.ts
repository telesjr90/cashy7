import { getBillInstanceSourceLabel } from "@/lib/bill-templates";
import {
  isDebtLinkedBillInstance,
  isRegularVariableBillInstance,
  needsVariableAmountConfirmation,
  type VariableBillContext,
} from "@/lib/variable-bills";
import type { Bill, BillInstance } from "@/lib/types";

export type BillPeriodBucketFilter = BillInstance["period_bucket"] | "all";

export type BillPaidStatusFilter = "all" | "paid" | "unpaid";

export type BillCashDeductedFilter =
  | "all"
  | "cash_deducted"
  | "not_cash_deducted";

export type BillDebtLinkedFilter = "all" | "debt_linked" | "regular_only";

export type BillSourceFilter =
  | "all"
  | "generated_from_template"
  | "manual_instance";

export type BillVariableFilter =
  | "all"
  | "variable"
  | "fixed"
  | "needs_confirmation";

export interface BillInstanceFilters {
  searchText: string;
  periodBucket: BillPeriodBucketFilter;
  paidStatus: BillPaidStatusFilter;
  cashDeducted: BillCashDeductedFilter;
  debtLinked: BillDebtLinkedFilter;
  source: BillSourceFilter;
  variable: BillVariableFilter;
  category: string;
}

export const DEFAULT_BILL_INSTANCE_FILTERS: BillInstanceFilters = {
  searchText: "",
  periodBucket: "all",
  paidStatus: "all",
  cashDeducted: "all",
  debtLinked: "all",
  source: "all",
  variable: "all",
  category: "",
};

export interface BillInstanceFilterContext {
  debtLinkedBillIds: ReadonlySet<string>;
  cashDeductedBillIds: ReadonlySet<string>;
  templateCategoryByBillId: ReadonlyMap<string, string>;
  variableBillContext: VariableBillContext;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveBillInstanceCategory(
  instance: Pick<BillInstance, "bill_id">,
  templateCategoryByBillId: ReadonlyMap<string, string>
): string {
  if (!instance.bill_id) {
    return "other";
  }

  return templateCategoryByBillId.get(instance.bill_id) ?? "other";
}

function billSearchHaystack(
  instance: BillInstance,
  templateCategoryByBillId: ReadonlyMap<string, string>
): string {
  const category = resolveBillInstanceCategory(instance, templateCategoryByBillId);
  const sourceLabel = getBillInstanceSourceLabel({
    billId: instance.bill_id,
    name: instance.name,
    notes: instance.notes,
  });

  const parts = [instance.name, category, instance.notes, sourceLabel]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");

  return normalizeSearchText(parts);
}

export function matchesBillInstanceSearchText(
  instance: BillInstance,
  searchText: string,
  templateCategoryByBillId: ReadonlyMap<string, string>
): boolean {
  const query = normalizeSearchText(searchText);
  if (!query) {
    return true;
  }

  return billSearchHaystack(instance, templateCategoryByBillId).includes(query);
}

export function matchesBillInstancePeriodBucket(
  instance: Pick<BillInstance, "period_bucket">,
  periodBucket: BillPeriodBucketFilter
): boolean {
  if (periodBucket === "all") {
    return true;
  }

  return instance.period_bucket === periodBucket;
}

export function matchesBillInstancePaidStatus(
  instance: Pick<BillInstance, "is_paid">,
  paidStatus: BillPaidStatusFilter
): boolean {
  if (paidStatus === "all") {
    return true;
  }

  if (paidStatus === "paid") {
    return instance.is_paid;
  }

  return !instance.is_paid;
}

export function matchesBillInstanceCashDeducted(
  instance: Pick<BillInstance, "id">,
  cashDeducted: BillCashDeductedFilter,
  cashDeductedBillIds: ReadonlySet<string>
): boolean {
  if (cashDeducted === "all") {
    return true;
  }

  const hasDeduction = cashDeductedBillIds.has(instance.id);

  if (cashDeducted === "cash_deducted") {
    return hasDeduction;
  }

  return !hasDeduction;
}

export function matchesBillInstanceDebtLinked(
  instance: Pick<BillInstance, "id" | "name">,
  debtLinked: BillDebtLinkedFilter,
  debtLinkedBillIds: ReadonlySet<string>
): boolean {
  if (debtLinked === "all") {
    return true;
  }

  const linked = isDebtLinkedBillInstance(instance, debtLinkedBillIds);

  if (debtLinked === "debt_linked") {
    return linked;
  }

  return !linked;
}

export function matchesBillInstanceSource(
  instance: Pick<BillInstance, "bill_id" | "name" | "notes">,
  source: BillSourceFilter
): boolean {
  if (source === "all") {
    return true;
  }

  const label = getBillInstanceSourceLabel({
    billId: instance.bill_id,
    name: instance.name,
    notes: instance.notes,
  });

  if (source === "generated_from_template") {
    return label === "generated from template";
  }

  return label === "manual instance";
}

export function matchesBillInstanceVariable(
  instance: BillInstance,
  variable: BillVariableFilter,
  context: VariableBillContext
): boolean {
  if (variable === "all") {
    return true;
  }

  if (variable === "needs_confirmation") {
    return needsVariableAmountConfirmation(instance, context);
  }

  const isVariable = isRegularVariableBillInstance(instance, context);

  if (variable === "variable") {
    return isVariable;
  }

  return !isVariable;
}

export function matchesBillInstanceCategory(
  instance: Pick<BillInstance, "bill_id">,
  category: string,
  templateCategoryByBillId: ReadonlyMap<string, string>
): boolean {
  const query = normalizeSearchText(category);
  if (!query) {
    return true;
  }

  const instanceCategory = normalizeSearchText(
    resolveBillInstanceCategory(instance, templateCategoryByBillId)
  );

  return instanceCategory === query || instanceCategory.includes(query);
}

export function extractDistinctBillCategories(
  bills: BillInstance[],
  templateCategoryByBillId: ReadonlyMap<string, string>,
  templates: Array<Pick<Bill, "category">> = []
): string[] {
  const categories = new Set<string>();

  for (const template of templates) {
    const category = template.category?.trim();
    if (category) {
      categories.add(category);
    }
  }

  for (const bill of bills) {
    if (!bill.bill_id) {
      categories.add("other");
      continue;
    }

    const category = templateCategoryByBillId.get(bill.bill_id);
    if (category) {
      categories.add(category);
    }
  }

  return Array.from(categories).sort((left, right) =>
    left.localeCompare(right)
  );
}

export function isBillInstanceFiltersActive(filters: BillInstanceFilters): boolean {
  return (
    filters.searchText.trim() !== "" ||
    filters.periodBucket !== "all" ||
    filters.paidStatus !== "all" ||
    filters.cashDeducted !== "all" ||
    filters.debtLinked !== "all" ||
    filters.source !== "all" ||
    filters.variable !== "all" ||
    filters.category.trim() !== ""
  );
}

export function getActiveBillFilterLabels(
  filters: BillInstanceFilters
): string[] {
  const labels: string[] = [];

  if (filters.searchText.trim()) {
    labels.push(`Search: ${filters.searchText.trim()}`);
  }
  if (filters.periodBucket !== "all") {
    labels.push(
      filters.periodBucket === "1_14" ? "Period: 1st–14th" : "Period: 15th–EOM"
    );
  }
  if (filters.paidStatus !== "all") {
    labels.push(filters.paidStatus === "paid" ? "Paid" : "Unpaid");
  }
  if (filters.cashDeducted !== "all") {
    labels.push(
      filters.cashDeducted === "cash_deducted"
        ? "Cash deducted"
        : "Not cash deducted"
    );
  }
  if (filters.debtLinked !== "all") {
    labels.push(
      filters.debtLinked === "debt_linked" ? "Debt-linked" : "Regular only"
    );
  }
  if (filters.source !== "all") {
    labels.push(
      filters.source === "generated_from_template"
        ? "Generated from template"
        : "Manual instance"
    );
  }
  if (filters.variable !== "all") {
    if (filters.variable === "variable") {
      labels.push("Variable");
    } else if (filters.variable === "fixed") {
      labels.push("Fixed");
    } else {
      labels.push("Needs confirmation");
    }
  }
  if (filters.category.trim()) {
    labels.push(`Category: ${filters.category.trim()}`);
  }

  return labels;
}

export function filterBillInstances(
  bills: BillInstance[],
  filters: BillInstanceFilters,
  context: BillInstanceFilterContext
): BillInstance[] {
  return bills.filter(
    (bill) =>
      matchesBillInstanceSearchText(
        bill,
        filters.searchText,
        context.templateCategoryByBillId
      ) &&
      matchesBillInstancePeriodBucket(bill, filters.periodBucket) &&
      matchesBillInstancePaidStatus(bill, filters.paidStatus) &&
      matchesBillInstanceCashDeducted(
        bill,
        filters.cashDeducted,
        context.cashDeductedBillIds
      ) &&
      matchesBillInstanceDebtLinked(
        bill,
        filters.debtLinked,
        context.debtLinkedBillIds
      ) &&
      matchesBillInstanceSource(bill, filters.source) &&
      matchesBillInstanceVariable(
        bill,
        filters.variable,
        context.variableBillContext
      ) &&
      matchesBillInstanceCategory(
        bill,
        filters.category,
        context.templateCategoryByBillId
      )
  );
}
