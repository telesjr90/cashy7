import { split5149 } from "@/lib/format";
import {
  GENERATED_BILL_INSTANCE_NOTE_PREFIX,
  isEligibleBillTemplate,
  validateDueDay,
} from "@/lib/bill-templates";
import type { Bill, BillInstance, InsertTables } from "@/lib/types";

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

export type BillGenerationSkipReason =
  | "not_recurring"
  | "inactive"
  | "out_of_range"
  | "invalid_due_day"
  | "already_exists";

export type BillGenerationPlanCreateItem = {
  status: "create";
  template: Bill;
  payload: InsertTables<"bill_instances">;
};

export type BillGenerationPlanSkipItem = {
  status: "skip";
  template: Bill;
  reason: BillGenerationSkipReason;
};

export type BillGenerationPlanItem =
  | BillGenerationPlanCreateItem
  | BillGenerationPlanSkipItem;

export type BillGenerationSummary = {
  toCreate: number;
  skippedExisting: number;
  skippedInactive: number;
  skippedOutOfRange: number;
  skippedNotRecurring: number;
  skippedInvalidDueDay: number;
  errors: string[];
};

export type BillGenerationPlan = {
  items: BillGenerationPlanItem[];
  summary: BillGenerationSummary;
};

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthDateRange(year: number, month: number): {
  firstDay: string;
  lastDay: string;
} {
  const paddedMonth = String(month).padStart(2, "0");
  const lastDayNumber = getDaysInMonth(year, month);
  return {
    firstDay: `${year}-${paddedMonth}-01`,
    lastDay: `${year}-${paddedMonth}-${String(lastDayNumber).padStart(2, "0")}`,
  };
}

export function calculateDueDateForMonth(
  year: number,
  month: number,
  dueDay: number
): string {
  const safeDay = Math.min(Math.max(1, dueDay), getDaysInMonth(year, month));
  const paddedMonth = String(month).padStart(2, "0");
  return `${year}-${paddedMonth}-${String(safeDay).padStart(2, "0")}`;
}

export function isBillTemplateActiveForMonth(
  template: Pick<Bill, "is_active" | "recurring" | "active_from" | "active_until">,
  year: number,
  month: number
): boolean {
  if (!template.recurring || !template.is_active) {
    return false;
  }

  const { firstDay, lastDay } = monthDateRange(year, month);

  if (template.active_from > lastDay) {
    return false;
  }

  if (template.active_until && template.active_until < firstDay) {
    return false;
  }

  return true;
}

export function billInstanceDuplicateKey(
  billId: string,
  year: number,
  month: number
): string {
  return `${billId}:${year}:${month}`;
}

export function findExistingGeneratedInstance(
  existingInstances: Pick<BillInstance, "bill_id" | "year" | "month">[],
  billId: string,
  year: number,
  month: number
): boolean {
  return existingInstances.some(
    (instance) =>
      instance.bill_id === billId &&
      instance.year === year &&
      instance.month === month
  );
}

export function buildGeneratedInstanceNotes(
  templateNotes: string | null,
  year: number,
  month: number
): string {
  const monthLabel = MONTH_NAMES[month - 1] ?? String(month);
  const prefix = `${GENERATED_BILL_INSTANCE_NOTE_PREFIX}${monthLabel} ${year}]`;

  if (templateNotes?.trim()) {
    return `${prefix}\n${templateNotes.trim()}`;
  }

  return prefix;
}

export function resolveGeneratedInstanceAmount(template: Pick<Bill, "is_variable" | "default_amount">): number {
  if (template.is_variable && template.default_amount == null) {
    return 0;
  }

  return Number(template.default_amount ?? 0);
}

export function buildBillInstanceInsertFromTemplate(
  template: Bill,
  householdId: string,
  year: number,
  month: number
): { payload: InsertTables<"bill_instances"> } | { error: string } {
  const dueDayResult = validateDueDay(template.due_day ?? "");
  if (dueDayResult.error || !dueDayResult.dueDay) {
    return {
      error: `${template.name}: ${dueDayResult.error ?? "Invalid due day."}`,
    };
  }

  const dueDay = Number(dueDayResult.dueDay);
  const amount = resolveGeneratedInstanceAmount(template);
  const { teles, nicole } = split5149(amount);

  return {
    payload: {
      household_id: householdId,
      bill_id: template.id,
      year,
      month,
      period_bucket: template.period_bucket,
      name: template.name,
      amount,
      teles_amount: teles,
      nicole_amount: nicole,
      due_date: calculateDueDateForMonth(year, month, dueDay),
      is_paid: false,
      paid_status: "unpaid",
      notes: buildGeneratedInstanceNotes(template.notes, year, month),
    },
  };
}

function getTemplateSkipReason(
  template: Bill,
  year: number,
  month: number,
  existingInstances: Pick<BillInstance, "bill_id" | "year" | "month">[]
): BillGenerationSkipReason | null {
  if (!isEligibleBillTemplate(template)) {
    return "not_recurring";
  }

  if (!template.is_active) {
    return "inactive";
  }

  if (!isBillTemplateActiveForMonth(template, year, month)) {
    return "out_of_range";
  }

  const dueDayResult = validateDueDay(template.due_day ?? "");
  if (dueDayResult.error || !dueDayResult.dueDay) {
    return "invalid_due_day";
  }

  if (findExistingGeneratedInstance(existingInstances, template.id, year, month)) {
    return "already_exists";
  }

  return null;
}

export function planBillInstanceGeneration(input: {
  templates: Bill[];
  existingInstances: Pick<BillInstance, "bill_id" | "year" | "month">[];
  householdId: string;
  year: number;
  month: number;
}): BillGenerationPlan {
  const items: BillGenerationPlanItem[] = [];
  const summary: BillGenerationSummary = {
    toCreate: 0,
    skippedExisting: 0,
    skippedInactive: 0,
    skippedOutOfRange: 0,
    skippedNotRecurring: 0,
    skippedInvalidDueDay: 0,
    errors: [],
  };

  for (const template of input.templates) {
    const skipReason = getTemplateSkipReason(
      template,
      input.year,
      input.month,
      input.existingInstances
    );

    if (skipReason) {
      items.push({ status: "skip", template, reason: skipReason });

      switch (skipReason) {
        case "already_exists":
          summary.skippedExisting += 1;
          break;
        case "inactive":
          summary.skippedInactive += 1;
          break;
        case "out_of_range":
          summary.skippedOutOfRange += 1;
          break;
        case "not_recurring":
          summary.skippedNotRecurring += 1;
          break;
        case "invalid_due_day":
          summary.skippedInvalidDueDay += 1;
          summary.errors.push(
            `${template.name}: ${validateDueDay(template.due_day ?? "").error ?? "Invalid due day."}`
          );
          break;
      }

      continue;
    }

    const built = buildBillInstanceInsertFromTemplate(
      template,
      input.householdId,
      input.year,
      input.month
    );

    if ("error" in built) {
      summary.skippedInvalidDueDay += 1;
      summary.errors.push(built.error);
      items.push({
        status: "skip",
        template,
        reason: "invalid_due_day",
      });
      continue;
    }

    items.push({
      status: "create",
      template,
      payload: built.payload,
    });
    summary.toCreate += 1;
  }

  return { items, summary };
}

export function billGenerationSummaryMessage(
  summary: BillGenerationSummary,
  monthLabel: string,
  year: number
): string {
  const parts = [
    `Generated ${summary.toCreate} bill${summary.toCreate === 1 ? "" : "s"} for ${monthLabel} ${year}.`,
  ];

  if (summary.skippedExisting > 0) {
    parts.push(
      `${summary.skippedExisting} already existed and ${summary.skippedExisting === 1 ? "was" : "were"} skipped.`
    );
  }

  const skippedInactiveOrRange =
    summary.skippedInactive + summary.skippedOutOfRange + summary.skippedNotRecurring;
  if (skippedInactiveOrRange > 0) {
    parts.push(
      `${skippedInactiveOrRange} template${skippedInactiveOrRange === 1 ? "" : "s"} skipped (inactive or out of range).`
    );
  }

  if (summary.skippedInvalidDueDay > 0) {
    parts.push(
      `${summary.skippedInvalidDueDay} template${summary.skippedInvalidDueDay === 1 ? "" : "s"} skipped due to invalid due day.`
    );
  }

  return parts.join(" ");
}
