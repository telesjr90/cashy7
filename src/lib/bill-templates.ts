import { split5149 } from "@/lib/format";
import type { Bill, InsertTables, UpdateTables } from "@/lib/types";

export type BillTemplateFormValues = {
  name: string;
  defaultAmount: string;
  dueDay: string;
  periodBucket: "1_14" | "15_eom";
  telesAmount: string;
  nicoleAmount: string;
  activeFrom: string;
  activeUntil: string;
  isVariable: boolean;
  category: string;
  notes: string;
};

export type BillTemplateActiveStatus = "active" | "inactive" | "scheduled" | "expired";

export type BillInstanceSourceLabel = "template" | "manual instance" | "debt";

export function isEligibleBillTemplate(bill: Pick<Bill, "recurring">): boolean {
  return bill.recurring;
}

export function getBillInstanceSourceLabel(input: {
  billId: string | null;
  name: string;
}): BillInstanceSourceLabel {
  if (input.billId) {
    return "template";
  }

  if (input.name.startsWith("Debt:")) {
    return "debt";
  }

  return "manual instance";
}

export function isBillTemplateCurrentlyActive(
  template: Pick<Bill, "is_active" | "active_from" | "active_until">,
  referenceDate: Date = new Date()
): boolean {
  if (!template.is_active) {
    return false;
  }

  const today = toDateOnlyString(referenceDate);
  if (template.active_from > today) {
    return false;
  }

  if (template.active_until && template.active_until < today) {
    return false;
  }

  return true;
}

export function getBillTemplateActiveStatus(
  template: Pick<Bill, "is_active" | "active_from" | "active_until">,
  referenceDate: Date = new Date()
): BillTemplateActiveStatus {
  if (!template.is_active) {
    return "inactive";
  }

  const today = toDateOnlyString(referenceDate);
  if (template.active_from > today) {
    return "scheduled";
  }

  if (template.active_until && template.active_until < today) {
    return "expired";
  }

  return "active";
}

export function billTemplateActiveStatusLabel(status: BillTemplateActiveStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    case "scheduled":
      return "Scheduled";
    case "expired":
      return "Expired";
  }
}

export function templateUsesDefault5149Split(
  amount: number,
  telesAmount: number,
  nicoleAmount: number
): boolean {
  if (!Number.isFinite(amount) || amount < 0) {
    return false;
  }

  const { teles, nicole } = split5149(amount);
  return (
    Math.abs(teles - telesAmount) < 0.011 &&
    Math.abs(nicole - nicoleAmount) < 0.011
  );
}

export function apply5149SplitToTemplateForm(totalAmount: number): Pick<
  BillTemplateFormValues,
  "telesAmount" | "nicoleAmount"
> {
  const { teles, nicole } = split5149(totalAmount);
  return {
    telesAmount: teles.toFixed(2),
    nicoleAmount: nicole.toFixed(2),
  };
}

export function billTemplateFormFromBill(bill: Bill): BillTemplateFormValues {
  const amount = bill.default_amount ?? 0;
  const split =
    amount > 0
      ? apply5149SplitToTemplateForm(amount)
      : { telesAmount: "0.00", nicoleAmount: "0.00" };

  return {
    name: bill.name,
    defaultAmount: bill.default_amount != null ? String(bill.default_amount) : "",
    dueDay: bill.due_day ?? "",
    periodBucket: bill.period_bucket,
    telesAmount: split.telesAmount,
    nicoleAmount: split.nicoleAmount,
    activeFrom: bill.active_from,
    activeUntil: bill.active_until ?? "",
    isVariable: bill.is_variable,
    category: bill.category ?? "other",
    notes: bill.notes ?? "",
  };
}

export function emptyBillTemplateForm(
  referenceDate: Date = new Date()
): BillTemplateFormValues {
  return {
    name: "",
    defaultAmount: "",
    dueDay: "",
    periodBucket: "1_14",
    telesAmount: "0.00",
    nicoleAmount: "0.00",
    activeFrom: toDateOnlyString(referenceDate),
    activeUntil: "",
    isVariable: false,
    category: "other",
    notes: "",
  };
}

function parseAmountField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }

  return num;
}

export function validateDueDay(value: string): { error: string | null; dueDay: string | null } {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { error: "Due day is required.", dueDay: null };
  }

  const day = Number(trimmed);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { error: "Due day must be between 1 and 31.", dueDay: null };
  }

  return { error: null, dueDay: String(day) };
}

export function validateActiveDateRange(
  activeFrom: string,
  activeUntil: string
): { error: string | null } {
  const from = activeFrom.trim();
  if (!from) {
    return { error: "Active from date is required." };
  }

  const until = activeUntil.trim();
  if (until && until < from) {
    return { error: "Active until cannot be before active from." };
  }

  return { error: null };
}

export function validateBillTemplateForm(form: BillTemplateFormValues): {
  error: string | null;
  values: {
    name: string;
    defaultAmount: number | null;
    dueDay: string;
    periodBucket: "1_14" | "15_eom";
    activeFrom: string;
    activeUntil: string | null;
    isVariable: boolean;
    category: string;
    notes: string | null;
  } | null;
} {
  const name = form.name.trim();
  if (!name) {
    return { error: "Template name is required.", values: null };
  }

  const dueDayResult = validateDueDay(form.dueDay);
  if (dueDayResult.error || !dueDayResult.dueDay) {
    return { error: dueDayResult.error ?? "Invalid due day.", values: null };
  }

  const dateRangeResult = validateActiveDateRange(form.activeFrom, form.activeUntil);
  if (dateRangeResult.error) {
    return { error: dateRangeResult.error, values: null };
  }

  let defaultAmount: number | null = null;
  if (form.isVariable) {
    const parsed = parseAmountField(form.defaultAmount);
    defaultAmount = parsed;
  } else {
    const parsed = parseAmountField(form.defaultAmount);
    if (parsed === null) {
      return {
        error: "Default amount is required for fixed-amount templates.",
        values: null,
      };
    }
    defaultAmount = parsed;
  }

  if (defaultAmount !== null) {
    const telesAmount = parseAmountField(form.telesAmount);
    if (telesAmount === null) {
      return { error: "Please enter a valid Teles amount.", values: null };
    }

    const nicoleAmount = parseAmountField(form.nicoleAmount);
    if (nicoleAmount === null) {
      return { error: "Please enter a valid Nicole amount.", values: null };
    }

    if (Math.abs(telesAmount + nicoleAmount - defaultAmount) > 0.01) {
      return {
        error: "Teles and Nicole amounts must add up to the default amount.",
        values: null,
      };
    }
  }

  return {
    error: null,
    values: {
      name,
      defaultAmount,
      dueDay: dueDayResult.dueDay,
      periodBucket: form.periodBucket,
      activeFrom: form.activeFrom.trim(),
      activeUntil: form.activeUntil.trim() || null,
      isVariable: form.isVariable,
      category: form.category.trim() || "other",
      notes: form.notes.trim() || null,
    },
  };
}

export function handleBillTemplateAmountChange(
  form: BillTemplateFormValues,
  amountValue: string,
  usesDefaultSplit: boolean
): BillTemplateFormValues {
  const next: BillTemplateFormValues = { ...form, defaultAmount: amountValue };
  if (!usesDefaultSplit || form.isVariable) {
    return next;
  }

  const amount = parseAmountField(amountValue);
  if (amount === null) {
    return next;
  }

  return {
    ...next,
    ...apply5149SplitToTemplateForm(amount),
  };
}

export type BillTemplateInsert = Pick<
  InsertTables<"bills">,
  | "household_id"
  | "name"
  | "category"
  | "default_amount"
  | "due_day"
  | "period_bucket"
  | "recurring"
  | "active_from"
  | "active_until"
  | "notes"
  | "is_variable"
  | "is_active"
>;

export type BillTemplateUpdate = Pick<
  UpdateTables<"bills">,
  | "name"
  | "category"
  | "default_amount"
  | "due_day"
  | "period_bucket"
  | "active_from"
  | "active_until"
  | "notes"
  | "is_variable"
  | "is_active"
>;

export function buildBillTemplateInsert(
  householdId: string,
  validated: NonNullable<ReturnType<typeof validateBillTemplateForm>["values"]>
): BillTemplateInsert {
  return {
    household_id: householdId,
    name: validated.name,
    category: validated.category,
    default_amount: validated.defaultAmount,
    due_day: validated.dueDay,
    period_bucket: validated.periodBucket,
    recurring: true,
    active_from: validated.activeFrom,
    active_until: validated.activeUntil,
    notes: validated.notes,
    is_variable: validated.isVariable,
    is_active: true,
  };
}

export function buildBillTemplateUpdate(
  validated: NonNullable<ReturnType<typeof validateBillTemplateForm>["values"]>
): BillTemplateUpdate {
  return {
    name: validated.name,
    category: validated.category,
    default_amount: validated.defaultAmount,
    due_day: validated.dueDay,
    period_bucket: validated.periodBucket,
    active_from: validated.activeFrom,
    active_until: validated.activeUntil,
    notes: validated.notes,
    is_variable: validated.isVariable,
  };
}

export function buildBillTemplateDeactivateUpdate(): Pick<BillTemplateUpdate, "is_active"> {
  return { is_active: false };
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
