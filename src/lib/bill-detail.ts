import { billUsesDefault5149Split } from "@/lib/bill-edit";
import {
  billTemplateActiveStatusLabel,
  getBillInstanceSourceLabel,
  getBillTemplateActiveStatus,
  isGeneratedBillInstanceNotes,
  type BillInstanceSourceLabel,
} from "@/lib/bill-templates";
import { formatCurrency } from "@/lib/format";
import {
  buildBillInstanceNameLookup,
  cashDeductionStatusLabel,
  getCashDeductionStatus,
  mapCashPaymentDeductionsForDisplay,
} from "@/lib/payments";
import { requiresRecurringEditBranching } from "@/lib/recurring-bill-edits";
import {
  DEBT_LINKED_BILL_DELETE_MESSAGE,
  DEBT_LINKED_BILL_EDIT_MESSAGE,
} from "@/lib/sync-bill-paid-status";
import { BILL_DETAIL_DEBT_ACCOUNT_ARCHIVED_MESSAGE } from "@/lib/debt-accounts";
import type { Bill, BillInstance, CashPaymentTransaction } from "@/lib/types";
import {
  isGeneratedVariableBillInstance,
  isRegularVariableBillInstance,
  needsVariableAmountConfirmation,
  VARIABLE_AMOUNT_CONFIRMATION_MESSAGE,
  type VariableBillContext,
} from "@/lib/variable-bills";
import { format, parseISO } from "date-fns";

export const BILL_DETAIL_RECURRING_EDIT_SCOPE_MESSAGE =
  "This bill was generated from a recurring template. Editing opens a choice to change this month only or update the template for future bills.";

export const BILL_DETAIL_PAID_BULK_PROTECTED_MESSAGE =
  "Paid bills are protected from bulk template updates.";

export const BILL_DETAIL_CASH_DEDUCTED_BULK_PROTECTED_MESSAGE =
  "Cash-deducted bills are protected from bulk template updates and from deletion through recurring bulk flows.";

export const BILL_DETAIL_DEBT_MANAGED_MESSAGE =
  "Debt-linked bills are managed from the Debt page to keep balances in sync.";

export const BILL_DETAIL_EDIT_AVAILABLE_MESSAGE =
  "Edit is available for this bill from the row actions or Confirm amount when needed.";

export const BILL_DETAIL_DELETE_AVAILABLE_MESSAGE =
  "Delete is available from the row actions when this bill is not debt-linked.";

export const BILL_DETAIL_VARIABLE_CONFIRM_EDIT_MESSAGE =
  "Confirm the amount on this variable bill to complete the forecast.";

export const BILL_DETAIL_MARKED_PAID_ONLY_LABEL = "Marked paid only — cash not deducted";

export const BILL_DETAIL_PAY_AND_DEDUCT_LABEL = "Pay & deduct cash";

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

export type BillInstanceDetailActionKey = "edit" | "delete";

export interface BillInstanceDetailActionGuard {
  action: BillInstanceDetailActionKey;
  label: string;
  available: boolean;
  explanation: string;
}

export interface BillInstanceDetailPaymentAudit {
  paidStatusLabel: string;
  paidAtLabel: string | null;
  cashDeductionStatusLabel: string;
  paymentMethodLabel: string | null;
  hasPaymentTransaction: boolean;
  paymentAmountLabel: string | null;
  paymentDateLabel: string | null;
  paymentSourceLabel: string | null;
  paymentNotes: string | null;
}

export interface BillInstanceDetailView {
  title: string;
  subtitle: string;
  name: string;
  dueDateLabel: string;
  monthYearLabel: string;
  periodBucketLabel: string;
  categoryLabel: string | null;
  notes: string | null;
  userNotes: string | null;
  sourceLabel: string;
  amountLabel: string;
  telesAmountLabel: string;
  nicoleAmountLabel: string;
  splitSummaryLabel: string;
  variableAmountStatusLabel: string | null;
  needsAmountConfirmation: boolean;
  needsConfirmationMessage: string | null;
  isDebtLinked: boolean;
  debtLinkedLabel: string | null;
  debtManagedExplanation: string | null;
  isDebtAccountArchived: boolean;
  debtAccountArchivedLabel: string | null;
  isGeneratedFromTemplate: boolean;
  templateName: string | null;
  templateStatusLabel: string | null;
  generatedNoteLabel: string | null;
  recurringEditExplanation: string | null;
  isVariableBill: boolean;
  variableContextExplanation: string | null;
  paymentAudit: BillInstanceDetailPaymentAudit;
  actionGuards: BillInstanceDetailActionGuard[];
  informationalGuards: string[];
}

export type BuildBillInstanceDetailViewInput = {
  bill: BillInstance;
  template: Bill | null;
  templateCategory: string | null;
  isDebtLinked: boolean;
  hasCashDeduction: boolean;
  paymentTransaction: CashPaymentTransaction | null;
  debtPaymentId: string | null;
  isDebtAccountArchived?: boolean;
  variableBillContext: VariableBillContext;
  referenceDate?: Date;
};

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

function formatDisplayDateTime(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy 'at' h:mm a");
}

export function formatBillPeriodBucketLabel(
  periodBucket: BillInstance["period_bucket"]
): string {
  return periodBucket === "1_14" ? "1st–14th" : "15th–end of month";
}

export function formatBillInstanceSourceDisplayLabel(
  source: BillInstanceSourceLabel
): string {
  switch (source) {
    case "manual instance":
      return "Manual instance";
    case "generated from template":
      return "Generated from template";
    case "template":
      return "Template instance";
    case "debt":
      return "Debt-linked";
  }
}

export function formatBillSplitSummary(
  amount: number,
  telesAmount: number,
  nicoleAmount: number
): string {
  if (billUsesDefault5149Split(amount, telesAmount, nicoleAmount)) {
    return "Default 51% Teles / 49% Nicole split";
  }

  if (amount <= 0) {
    return "Custom split";
  }

  const telesPct = ((telesAmount / amount) * 100).toFixed(1);
  const nicolePct = ((nicoleAmount / amount) * 100).toFixed(1);
  return `Custom split: ${telesPct}% Teles / ${nicolePct}% Nicole`;
}

export function extractGeneratedNoteLabel(notes: string | null): string | null {
  if (!isGeneratedBillInstanceNotes(notes)) {
    return null;
  }

  const newlineIndex = notes!.indexOf("\n");
  const prefixLine =
    newlineIndex === -1 ? notes!.trim() : notes!.slice(0, newlineIndex).trim();

  return prefixLine.replace(/^\[/, "").replace(/\]$/, "") || null;
}

export function resolveDebtLinkedLabel(
  bill: Pick<BillInstance, "name">
): string | null {
  if (!bill.name.startsWith("Debt:")) {
    return bill.name.trim() || null;
  }

  const accountName = bill.name.slice("Debt:".length).trim();
  return accountName || bill.name;
}

export function resolveBillPaymentTransaction(
  billId: string,
  paymentByBillId: ReadonlyMap<string, CashPaymentTransaction>,
  debtPaymentIdByBillId: ReadonlyMap<string, string>,
  paymentByDebtPaymentId: ReadonlyMap<string, CashPaymentTransaction>
): CashPaymentTransaction | null {
  const direct = paymentByBillId.get(billId);
  if (direct) {
    return direct;
  }

  const debtPaymentId = debtPaymentIdByBillId.get(billId);
  if (!debtPaymentId) {
    return null;
  }

  return paymentByDebtPaymentId.get(debtPaymentId) ?? null;
}

function buildVariableAmountStatusLabel(input: {
  isVariableBill: boolean;
  needsAmountConfirmation: boolean;
}): string | null {
  if (!input.isVariableBill) {
    return "Fixed amount";
  }

  if (input.needsAmountConfirmation) {
    return "Needs confirmation";
  }

  return "Variable amount confirmed";
}

function buildPaymentAudit(
  bill: BillInstance,
  paymentTransaction: CashPaymentTransaction | null,
  debtPaymentId: string | null
): BillInstanceDetailPaymentAudit {
  const hasPaymentTransaction = paymentTransaction != null;
  const cashStatus = getCashDeductionStatus({
    isMarkedPaid: bill.is_paid,
    hasPaymentTransaction,
  });

  let paymentAmountLabel: string | null = null;
  let paymentDateLabel: string | null = null;
  let paymentSourceLabel: string | null = null;
  let paymentNotes: string | null = null;

  if (paymentTransaction) {
    const debtPaymentDescriptionById = new Map<string, string>();
    if (debtPaymentId) {
      const debtLabel = resolveDebtLinkedLabel(bill);
      if (debtLabel) {
        debtPaymentDescriptionById.set(debtPaymentId, debtLabel);
      }
    }

    const paymentRow = mapCashPaymentDeductionsForDisplay(
      [paymentTransaction],
      {
        billInstanceNameById: buildBillInstanceNameLookup([bill]),
        debtPaymentDescriptionById,
        manualExpenseDescriptionById: new Map(),
      }
    )[0];

    if (paymentRow) {
      paymentAmountLabel = paymentRow.formattedAmount;
      paymentDateLabel = formatDisplayDateTime(paymentRow.paidAt);
      paymentSourceLabel = `${paymentRow.sourceTypeLabel}: ${paymentRow.sourceDescription}`;
      paymentNotes = paymentRow.notes;
    }
  }

  let paymentMethodLabel: string | null = null;
  if (hasPaymentTransaction) {
    paymentMethodLabel = BILL_DETAIL_PAY_AND_DEDUCT_LABEL;
  } else if (bill.is_paid) {
    paymentMethodLabel = BILL_DETAIL_MARKED_PAID_ONLY_LABEL;
  }

  return {
    paidStatusLabel: bill.is_paid ? "Paid" : "Unpaid",
    paidAtLabel: bill.paid_at ? formatDisplayDateTime(bill.paid_at) : null,
    cashDeductionStatusLabel: cashDeductionStatusLabel(cashStatus),
    paymentMethodLabel,
    hasPaymentTransaction,
    paymentAmountLabel,
    paymentDateLabel,
    paymentSourceLabel,
    paymentNotes,
  };
}

function buildInformationalGuards(input: {
  isDebtLinked: boolean;
  isDebtAccountArchived: boolean;
  hasCashDeduction: boolean;
  isPaid: boolean;
  needsRecurringBranching: boolean;
  needsAmountConfirmation: boolean;
}): string[] {
  const guards: string[] = [];

  if (input.isDebtLinked) {
    guards.push(BILL_DETAIL_DEBT_MANAGED_MESSAGE);
    if (input.isDebtAccountArchived) {
      guards.push(BILL_DETAIL_DEBT_ACCOUNT_ARCHIVED_MESSAGE);
    }
    guards.push(DEBT_LINKED_BILL_EDIT_MESSAGE);
    guards.push(DEBT_LINKED_BILL_DELETE_MESSAGE);
  }

  if (input.needsAmountConfirmation) {
    guards.push(VARIABLE_AMOUNT_CONFIRMATION_MESSAGE);
    guards.push(BILL_DETAIL_VARIABLE_CONFIRM_EDIT_MESSAGE);
  }

  if (input.needsRecurringBranching) {
    guards.push(BILL_DETAIL_RECURRING_EDIT_SCOPE_MESSAGE);
    if (input.isPaid) {
      guards.push(BILL_DETAIL_PAID_BULK_PROTECTED_MESSAGE);
    }
    if (input.hasCashDeduction) {
      guards.push(BILL_DETAIL_CASH_DEDUCTED_BULK_PROTECTED_MESSAGE);
    }
  } else if (input.hasCashDeduction) {
    guards.push(BILL_DETAIL_CASH_DEDUCTED_BULK_PROTECTED_MESSAGE);
  } else if (input.isPaid) {
    guards.push(BILL_DETAIL_PAID_BULK_PROTECTED_MESSAGE);
  }

  return guards;
}

function buildActionGuards(input: {
  isDebtLinked: boolean;
  needsAmountConfirmation: boolean;
  needsRecurringBranching: boolean;
}): BillInstanceDetailActionGuard[] {
  const editAvailable = !input.isDebtLinked;
  const deleteAvailable = !input.isDebtLinked;

  let editExplanation = BILL_DETAIL_EDIT_AVAILABLE_MESSAGE;
  if (input.isDebtLinked) {
    editExplanation = DEBT_LINKED_BILL_EDIT_MESSAGE;
  } else if (input.needsAmountConfirmation) {
    editExplanation = BILL_DETAIL_VARIABLE_CONFIRM_EDIT_MESSAGE;
  } else if (input.needsRecurringBranching) {
    editExplanation = BILL_DETAIL_RECURRING_EDIT_SCOPE_MESSAGE;
  }

  const deleteExplanation = input.isDebtLinked
    ? DEBT_LINKED_BILL_DELETE_MESSAGE
    : BILL_DETAIL_DELETE_AVAILABLE_MESSAGE;

  return [
    {
      action: "edit",
      label: "Edit bill",
      available: editAvailable,
      explanation: editExplanation,
    },
    {
      action: "delete",
      label: "Delete bill",
      available: deleteAvailable,
      explanation: deleteExplanation,
    },
  ];
}

export function buildBillInstanceDetailView(
  input: BuildBillInstanceDetailViewInput
): BillInstanceDetailView {
  const { bill, template, templateCategory, isDebtLinked, hasCashDeduction } =
    input;
  const amount = Number(bill.amount);
  const telesAmount = Number(bill.teles_amount);
  const nicoleAmount = Number(bill.nicole_amount);
  const source = getBillInstanceSourceLabel({
    billId: bill.bill_id,
    name: bill.name,
    notes: bill.notes,
  });
  const isGeneratedFromTemplate = source === "generated from template";
  const needsAmountConfirmation = needsVariableAmountConfirmation(
    bill,
    input.variableBillContext
  );
  const isVariableBill = isRegularVariableBillInstance(
    bill,
    input.variableBillContext
  );
  const needsRecurringBranching = requiresRecurringEditBranching(
    bill,
    isDebtLinked
  );
  const generatedNoteLabel = extractGeneratedNoteLabel(bill.notes);
  const userNotes = isGeneratedBillInstanceNotes(bill.notes)
    ? bill.notes?.includes("\n")
      ? bill.notes.slice(bill.notes.indexOf("\n") + 1).trim() || null
      : null
    : bill.notes?.trim() || null;
  const monthLabel = MONTH_NAMES[bill.month - 1] ?? String(bill.month);
  const templateStatus = template
    ? getBillTemplateActiveStatus(template, input.referenceDate)
    : null;

  return {
    title: bill.name,
    subtitle: isDebtLinked
      ? "Bill audit · debt-linked"
      : isGeneratedFromTemplate
        ? "Bill audit · generated from template"
        : "Bill audit · monthly instance",
    name: bill.name,
    dueDateLabel: bill.due_date ? formatDisplayDate(bill.due_date) : "Not set",
    monthYearLabel: `${monthLabel} ${bill.year}`,
    periodBucketLabel: formatBillPeriodBucketLabel(bill.period_bucket),
    categoryLabel: templateCategory ?? template?.category ?? null,
    notes: bill.notes,
    userNotes,
    sourceLabel: formatBillInstanceSourceDisplayLabel(source),
    amountLabel: formatCurrency(amount),
    telesAmountLabel: formatCurrency(telesAmount),
    nicoleAmountLabel: formatCurrency(nicoleAmount),
    splitSummaryLabel: formatBillSplitSummary(amount, telesAmount, nicoleAmount),
    variableAmountStatusLabel: buildVariableAmountStatusLabel({
      isVariableBill,
      needsAmountConfirmation,
    }),
    needsAmountConfirmation,
    needsConfirmationMessage: needsAmountConfirmation
      ? VARIABLE_AMOUNT_CONFIRMATION_MESSAGE
      : null,
    isDebtLinked,
    debtLinkedLabel: isDebtLinked ? resolveDebtLinkedLabel(bill) : null,
    debtManagedExplanation: isDebtLinked ? BILL_DETAIL_DEBT_MANAGED_MESSAGE : null,
    isDebtAccountArchived: Boolean(input.isDebtAccountArchived),
    debtAccountArchivedLabel: isDebtLinked && input.isDebtAccountArchived
      ? "Debt account archived"
      : null,
    isGeneratedFromTemplate,
    templateName: template?.name ?? (bill.bill_id ? bill.name : null),
    templateStatusLabel: templateStatus
      ? billTemplateActiveStatusLabel(templateStatus)
      : null,
    generatedNoteLabel,
    recurringEditExplanation: needsRecurringBranching
      ? BILL_DETAIL_RECURRING_EDIT_SCOPE_MESSAGE
      : null,
    isVariableBill,
    variableContextExplanation:
      isVariableBill || isGeneratedVariableBillInstance(bill, input.variableBillContext)
        ? needsAmountConfirmation
          ? VARIABLE_AMOUNT_CONFIRMATION_MESSAGE
          : "Variable bill amount is confirmed for this month."
        : null,
    paymentAudit: buildPaymentAudit(
      bill,
      input.paymentTransaction,
      input.debtPaymentId
    ),
    actionGuards: buildActionGuards({
      isDebtLinked,
      needsAmountConfirmation,
      needsRecurringBranching,
    }),
    informationalGuards: buildInformationalGuards({
      isDebtLinked,
      isDebtAccountArchived: Boolean(input.isDebtAccountArchived),
      hasCashDeduction,
      isPaid: bill.is_paid,
      needsRecurringBranching,
      needsAmountConfirmation,
    }),
  };
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function collectBillDetailUserFacingStrings(
  detail: BillInstanceDetailView
): string[] {
  const values: string[] = [
    detail.title,
    detail.subtitle,
    detail.name,
    detail.dueDateLabel,
    detail.monthYearLabel,
    detail.periodBucketLabel,
    detail.sourceLabel,
    detail.amountLabel,
    detail.telesAmountLabel,
    detail.nicoleAmountLabel,
    detail.splitSummaryLabel,
    detail.paymentAudit.paidStatusLabel,
    detail.paymentAudit.cashDeductionStatusLabel,
    ...detail.informationalGuards,
    ...detail.actionGuards.flatMap((guard) => [guard.label, guard.explanation]),
  ];

  for (const value of [
    detail.categoryLabel,
    detail.notes,
    detail.userNotes,
    detail.variableAmountStatusLabel,
    detail.needsConfirmationMessage,
    detail.debtLinkedLabel,
    detail.debtManagedExplanation,
    detail.debtAccountArchivedLabel,
    detail.templateName,
    detail.templateStatusLabel,
    detail.generatedNoteLabel,
    detail.recurringEditExplanation,
    detail.variableContextExplanation,
    detail.paymentAudit.paidAtLabel,
    detail.paymentAudit.paymentMethodLabel,
    detail.paymentAudit.paymentAmountLabel,
    detail.paymentAudit.paymentDateLabel,
    detail.paymentAudit.paymentSourceLabel,
    detail.paymentAudit.paymentNotes,
  ]) {
    if (value) {
      values.push(value);
    }
  }

  return values;
}

export function billDetailViewContainsRawUuid(detail: BillInstanceDetailView): boolean {
  return collectBillDetailUserFacingStrings(detail).some((value) =>
    UUID_PATTERN.test(value)
  );
}
