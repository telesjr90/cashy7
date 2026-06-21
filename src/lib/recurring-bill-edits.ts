import { split5149 } from "@/lib/format";
import type { BillInstanceEditUpdate } from "@/lib/bill-edit";
import {
  buildGeneratedInstanceNotes,
  calculateDueDateForMonth,
} from "@/lib/bill-instance-generation";
import {
  GENERATED_BILL_INSTANCE_NOTE_PREFIX,
  isGeneratedBillInstanceNotes,
  type BillTemplateUpdate,
} from "@/lib/bill-templates";
import type { Bill, BillInstance } from "@/lib/types";

export type RecurringEditScope = "instance_only" | "template_and_future";

export type RecurringBulkUpdateContext = {
  debtLinkedBillIds: ReadonlySet<string>;
  cashDeductedBillIds: ReadonlySet<string>;
};

export function requiresRecurringEditBranching(
  instance: Pick<BillInstance, "bill_id" | "notes">,
  isDebtLinked: boolean
): boolean {
  if (isDebtLinked) {
    return false;
  }

  if (!instance.bill_id) {
    return false;
  }

  return isGeneratedBillInstanceNotes(instance.notes);
}

export function extractDueDayFromDate(dueDate: string | null): string | null {
  if (!dueDate?.trim()) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate.trim());
  if (!match) {
    return null;
  }

  const day = Number(match[3]);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  return String(day);
}

export function stripGeneratedBillInstanceNotePrefix(notes: string | null): string | null {
  if (!notes?.trim()) {
    return null;
  }

  if (!notes.startsWith(GENERATED_BILL_INSTANCE_NOTE_PREFIX)) {
    return notes.trim() || null;
  }

  const newlineIndex = notes.indexOf("\n");
  if (newlineIndex === -1) {
    return null;
  }

  const remainder = notes.slice(newlineIndex + 1).trim();
  return remainder || null;
}

function instanceMonthKey(year: number, month: number): number {
  return year * 12 + month;
}

export function isSameOrAfterBillMonth(
  instance: Pick<BillInstance, "year" | "month">,
  reference: Pick<BillInstance, "year" | "month">
): boolean {
  return (
    instanceMonthKey(instance.year, instance.month) >=
    instanceMonthKey(reference.year, reference.month)
  );
}

export function isEligibleForRecurringBulkInstanceUpdate(
  instance: BillInstance,
  editingInstance: BillInstance,
  templateId: string,
  context: RecurringBulkUpdateContext
): boolean {
  if (instance.bill_id !== templateId) {
    return false;
  }

  if (!isGeneratedBillInstanceNotes(instance.notes)) {
    return false;
  }

  if (instance.paid_status === "paid" || instance.is_paid) {
    return false;
  }

  if (context.debtLinkedBillIds.has(instance.id)) {
    return false;
  }

  if (context.cashDeductedBillIds.has(instance.id)) {
    return false;
  }

  return isSameOrAfterBillMonth(instance, editingInstance);
}

export function selectRecurringBulkInstanceUpdateCandidates(
  instances: BillInstance[],
  editingInstance: BillInstance,
  templateId: string,
  context: RecurringBulkUpdateContext
): BillInstance[] {
  return instances.filter((instance) =>
    isEligibleForRecurringBulkInstanceUpdate(
      instance,
      editingInstance,
      templateId,
      context
    )
  );
}

export function buildBillTemplateUpdateFromInstanceEdit(
  validated: {
    name: string;
    amount: number;
    periodBucket: "1_14" | "15_eom";
    dueDate: string | null;
    notes: string | null;
  },
  existingTemplate: Pick<
    Bill,
    | "category"
    | "active_from"
    | "active_until"
    | "is_variable"
    | "due_day"
    | "notes"
  >
): BillTemplateUpdate {
  const extractedDueDay = extractDueDayFromDate(validated.dueDate);
  const dueDay = extractedDueDay ?? existingTemplate.due_day ?? null;
  const templateNotes =
    stripGeneratedBillInstanceNotePrefix(validated.notes) ??
    existingTemplate.notes ??
    null;

  return {
    name: validated.name,
    category: existingTemplate.category,
    default_amount: validated.amount,
    due_day: dueDay,
    period_bucket: validated.periodBucket,
    active_from: existingTemplate.active_from,
    active_until: existingTemplate.active_until,
    notes: templateNotes,
    is_variable: existingTemplate.is_variable,
  };
}

export function buildBulkGeneratedInstanceUpdate(
  validated: {
    name: string;
    amount: number;
    periodBucket: "1_14" | "15_eom";
  },
  instance: Pick<BillInstance, "year" | "month">,
  templateDueDay: string,
  templateNotes: string | null
): BillInstanceEditUpdate {
  const { teles, nicole } = split5149(validated.amount);
  const dueDayNumber = Number(templateDueDay);

  return {
    name: validated.name,
    amount: validated.amount,
    teles_amount: teles,
    nicole_amount: nicole,
    period_bucket: validated.periodBucket,
    due_date: calculateDueDateForMonth(
      instance.year,
      instance.month,
      dueDayNumber
    ),
    notes: buildGeneratedInstanceNotes(
      templateNotes,
      instance.year,
      instance.month
    ),
  };
}

export function buildInstanceOnlyEditPlan(
  instanceUpdate: BillInstanceEditUpdate
): { scope: "instance_only"; instanceUpdate: BillInstanceEditUpdate } {
  return {
    scope: "instance_only",
    instanceUpdate,
  };
}

export function buildTemplateAndFutureEditPlan(input: {
  validated: {
    name: string;
    amount: number;
    periodBucket: "1_14" | "15_eom";
    dueDate: string | null;
    notes: string | null;
  };
  template: Pick<
    Bill,
    | "id"
    | "category"
    | "active_from"
    | "active_until"
    | "is_variable"
    | "due_day"
    | "notes"
  >;
  editingInstance: BillInstance;
  instances: BillInstance[];
  context: RecurringBulkUpdateContext;
}): {
  scope: "template_and_future";
  templateUpdate: BillTemplateUpdate;
  instanceUpdates: Array<{ id: string; update: BillInstanceEditUpdate }>;
} {
  const templateUpdate = buildBillTemplateUpdateFromInstanceEdit(
    input.validated,
    input.template
  );
  const dueDay = templateUpdate.due_day ?? input.template.due_day ?? "1";
  const templateNotes = templateUpdate.notes ?? null;

  const candidates = selectRecurringBulkInstanceUpdateCandidates(
    input.instances,
    input.editingInstance,
    input.template.id,
    input.context
  );

  return {
    scope: "template_and_future",
    templateUpdate,
    instanceUpdates: candidates.map((instance) => ({
      id: instance.id,
      update: buildBulkGeneratedInstanceUpdate(
        input.validated,
        instance,
        dueDay,
        templateNotes
      ),
    })),
  };
}
