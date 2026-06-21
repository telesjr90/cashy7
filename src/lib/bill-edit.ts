import { split5149 } from "@/lib/format";
import type { UpdateTables } from "@/lib/types";

export type BillEditFormValues = {
  name: string;
  amount: string;
  telesAmount: string;
  nicoleAmount: string;
  periodBucket: "1_14" | "15_eom";
  dueDate: string;
  notes: string;
};

export function canEditRegularBill(isDebtLinked: boolean): boolean {
  return !isDebtLinked;
}

export function billUsesDefault5149Split(
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

export function billEditFormFromInstance(bill: {
  name: string;
  amount: number;
  teles_amount: number;
  nicole_amount: number;
  period_bucket: "1_14" | "15_eom";
  due_date: string | null;
  notes: string | null;
}): BillEditFormValues {
  return {
    name: bill.name,
    amount: String(bill.amount),
    telesAmount: String(bill.teles_amount),
    nicoleAmount: String(bill.nicole_amount),
    periodBucket: bill.period_bucket,
    dueDate: bill.due_date ?? "",
    notes: bill.notes ?? "",
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

export function validateBillEditForm(form: BillEditFormValues): {
  error: string | null;
  values: {
    name: string;
    amount: number;
    telesAmount: number;
    nicoleAmount: number;
    periodBucket: "1_14" | "15_eom";
    dueDate: string | null;
    notes: string | null;
  } | null;
} {
  const name = form.name.trim();
  if (!name) {
    return { error: "Bill name is required.", values: null };
  }

  const amount = parseAmountField(form.amount);
  if (amount === null || amount <= 0) {
    return { error: "Please enter a valid total amount.", values: null };
  }

  const telesAmount = parseAmountField(form.telesAmount);
  if (telesAmount === null) {
    return { error: "Please enter a valid Teles amount.", values: null };
  }

  const nicoleAmount = parseAmountField(form.nicoleAmount);
  if (nicoleAmount === null) {
    return { error: "Please enter a valid Nicole amount.", values: null };
  }

  if (Math.abs(telesAmount + nicoleAmount - amount) > 0.01) {
    return {
      error: "Teles and Nicole amounts must add up to the total amount.",
      values: null,
    };
  }

  return {
    error: null,
    values: {
      name,
      amount,
      telesAmount,
      nicoleAmount,
      periodBucket: form.periodBucket,
      dueDate: form.dueDate.trim() || null,
      notes: form.notes.trim() || null,
    },
  };
}

export function apply5149SplitToBillEditForm(totalAmount: number): Pick<
  BillEditFormValues,
  "telesAmount" | "nicoleAmount"
> {
  const { teles, nicole } = split5149(totalAmount);
  return {
    telesAmount: teles.toFixed(2),
    nicoleAmount: nicole.toFixed(2),
  };
}

export function handleBillEditAmountChange(
  form: BillEditFormValues,
  amountValue: string,
  usesDefaultSplit: boolean
): BillEditFormValues {
  const next: BillEditFormValues = { ...form, amount: amountValue };
  if (!usesDefaultSplit) {
    return next;
  }

  const amount = parseAmountField(amountValue);
  if (amount === null) {
    return next;
  }

  return {
    ...next,
    ...apply5149SplitToBillEditForm(amount),
  };
}

export type BillInstanceEditUpdate = Pick<
  UpdateTables<"bill_instances">,
  "name" | "amount" | "teles_amount" | "nicole_amount" | "period_bucket" | "due_date" | "notes"
>;

export function buildBillInstanceEditUpdate(
  validated: NonNullable<ReturnType<typeof validateBillEditForm>["values"]>
): BillInstanceEditUpdate {
  return {
    name: validated.name,
    amount: validated.amount,
    teles_amount: validated.telesAmount,
    nicole_amount: validated.nicoleAmount,
    period_bucket: validated.periodBucket,
    due_date: validated.dueDate,
    notes: validated.notes,
  };
}
