import { isGeneratedBillInstanceNotes } from "@/lib/bill-templates";
import { filterBillsForDashboardView } from "@/lib/dashboard-drilldowns";
import type { PeriodView } from "@/lib/periods";
import type { Bill, BillInstance } from "@/lib/types";

export const VARIABLE_AMOUNT_CONFIRMATION_MESSAGE =
  "Forecast is incomplete until this variable bill amount is confirmed.";

export const VARIABLE_AMOUNT_DASHBOARD_WARNING =
  "One or more variable bills in this view still need a confirmed amount. Safe-to-spend and bill totals may be incomplete until you confirm them on the Bills page.";

export type VariableBillContext = {
  templateByBillId: ReadonlyMap<string, Pick<Bill, "is_variable" | "default_amount">>;
  debtLinkedBillIds: ReadonlySet<string>;
};

function isUnpaidBill(
  instance: Pick<BillInstance, "is_paid" | "paid_status">
): boolean {
  return !instance.is_paid && instance.paid_status !== "paid";
}

export function isDebtLinkedBillInstance(
  instance: Pick<BillInstance, "id" | "name">,
  debtLinkedBillIds: ReadonlySet<string>
): boolean {
  if (debtLinkedBillIds.has(instance.id)) {
    return true;
  }

  return instance.name.startsWith("Debt:");
}

export function isRegularVariableBillInstance(
  instance: Pick<BillInstance, "id" | "bill_id" | "name" | "notes">,
  context: VariableBillContext
): boolean {
  if (isDebtLinkedBillInstance(instance, context.debtLinkedBillIds)) {
    return false;
  }

  if (!instance.bill_id) {
    return false;
  }

  const template = context.templateByBillId.get(instance.bill_id);
  return template?.is_variable === true;
}

export function isPlaceholderVariableAmount(
  instance: Pick<BillInstance, "amount">,
  template: Pick<Bill, "is_variable" | "default_amount"> | null | undefined
): boolean {
  if (!template?.is_variable) {
    return false;
  }

  const amount = Number(instance.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return true;
  }

  if (template.default_amount == null) {
    return false;
  }

  return amount === Number(template.default_amount);
}

export function needsVariableAmountConfirmation(
  instance: BillInstance,
  context: VariableBillContext
): boolean {
  if (!isUnpaidBill(instance)) {
    return false;
  }

  if (!isRegularVariableBillInstance(instance, context)) {
    return false;
  }

  const template = instance.bill_id
    ? context.templateByBillId.get(instance.bill_id)
    : null;

  return isPlaceholderVariableAmount(instance, template);
}

export function countVariableBillsNeedingConfirmation(
  instances: BillInstance[],
  context: VariableBillContext
): number {
  return instances.filter((instance) =>
    needsVariableAmountConfirmation(instance, context)
  ).length;
}

export function filterVariableBillsNeedingConfirmation(
  instances: BillInstance[],
  context: VariableBillContext
): BillInstance[] {
  return instances.filter((instance) =>
    needsVariableAmountConfirmation(instance, context)
  );
}

export function countVariableBillsNeedingConfirmationForDashboardView(input: {
  instances: BillInstance[];
  context: VariableBillContext;
  periodView: PeriodView;
  year: number;
  month: number;
}): number {
  const visibleBills = filterBillsForDashboardView(
    input.instances,
    input.periodView
  );

  return countVariableBillsNeedingConfirmation(visibleBills, input.context);
}

export function isGeneratedVariableBillInstance(
  instance: Pick<BillInstance, "bill_id" | "notes">,
  context: VariableBillContext
): boolean {
  if (!instance.bill_id || !isGeneratedBillInstanceNotes(instance.notes)) {
    return false;
  }

  const template = context.templateByBillId.get(instance.bill_id);
  return template?.is_variable === true;
}

export function buildBillTemplateLookup(
  templates: Array<Pick<Bill, "id" | "is_variable" | "default_amount">>
): Map<string, Pick<Bill, "is_variable" | "default_amount">> {
  return new Map(
    templates.map((template) => [
      template.id,
      {
        is_variable: template.is_variable,
        default_amount: template.default_amount,
      },
    ])
  );
}
