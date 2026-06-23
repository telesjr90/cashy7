import {
  BILL_DETAIL_MARKED_PAID_ONLY_LABEL,
  BILL_DETAIL_PAY_AND_DEDUCT_LABEL,
  formatBillPeriodBucketLabel,
} from "@/lib/bill-detail";
import { getDebtPaymentPreStartLabel } from "@/lib/debt-cashflow-start";
import {
  BILL_DETAIL_DEBT_ACCOUNT_ARCHIVED_MESSAGE,
  getDebtAccountArchivedBadgeLabel,
  isDebtAccountArchived,
  isDebtScheduleActionAllowed,
} from "@/lib/debt-accounts";
import {
  computeRemainingBalance,
  computeTotalPaidFromPayments,
  filterPaidDebtPayments,
  isDebtPaymentPaid,
} from "@/lib/debt-progress";
import {
  protectionReasonLabel,
  getDebtPaymentProtectionReason,
} from "@/lib/debt-schedule-replacement";
import { formatCurrency } from "@/lib/format";
import {
  cashDeductionStatusLabel,
  getCashDeductionStatus,
  mapCashPaymentDeductionsForDisplay,
} from "@/lib/payments";
import { DEBT_LINKED_BILL_EDIT_MESSAGE } from "@/lib/sync-bill-paid-status";
import type {
  BillInstance,
  CashPaymentTransaction,
  DebtAccount,
  DebtPayment,
} from "@/lib/types";
import { format, parseISO } from "date-fns";

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

export const DEBT_PAYMENT_DETAIL_DEBT_MANAGED_BILL_MESSAGE =
  "Debt-linked bills are managed from the Debt page to keep balances in sync.";

export const DEBT_PAYMENT_DETAIL_PAID_HISTORY_MESSAGE =
  "Paid payment history is preserved and is not removed from this audit view.";

export const DEBT_PAYMENT_DETAIL_CASH_DEDUCTED_HISTORY_MESSAGE =
  "Cash-deducted payments are preserved and protected from schedule replacement.";

export const DEBT_PAYMENT_DETAIL_NO_CASH_RECORD_VISIBLE =
  "No cash deduction record visible for your user";

export const DEBT_PAYMENT_DETAIL_BALANCE_FALLBACK =
  "Exact running balance before this payment cannot be verified from loaded history alone.";

export const DEBT_PAYMENT_DETAIL_REMAINING_PROJECTED_LABEL =
  "Projected remaining after payment (from schedule)";

export type DebtPaymentDetailActionKey = "edit" | "delete" | "replace";

export interface DebtPaymentDetailActionGuard {
  action: DebtPaymentDetailActionKey;
  label: string;
  available: boolean;
  explanation: string;
}

export interface DebtPaymentLinkedBillContext {
  hasLinkedBill: boolean;
  billNameLabel: string | null;
  dueDateLabel: string | null;
  paidStatusLabel: string | null;
  cashDeductionStatusLabel: string | null;
  managedFromDebtExplanation: string;
}

export interface DebtPaymentCashAuditContext {
  paidStatusLabel: string;
  cashDeductionStatusLabel: string;
  paymentMethodLabel: string | null;
  hasVisiblePaymentTransaction: boolean;
  paymentAmountLabel: string | null;
  paymentDateLabel: string | null;
  paymentSourceLabel: string | null;
  paymentNotes: string | null;
  privacyFallbackLabel: string | null;
}

export interface DebtPaymentBalanceImpact {
  originalAmountLabel: string;
  totalPaidBeforeLabel: string | null;
  totalPaidThroughLabel: string | null;
  remainingAfterLabel: string | null;
  remainingAfterCaption: string | null;
  balanceFallbackExplanation: string | null;
}

export interface DebtPaymentDetailView {
  title: string;
  subtitle: string;
  accountName: string;
  paymentDateLabel: string;
  monthYearLabel: string;
  periodBucketLabel: string;
  amountLabel: string;
  telesAmountLabel: string;
  nicoleAmountLabel: string;
  sourceLabel: string;
  isAccountArchived: boolean;
  archivedAccountLabel: string | null;
  linkedBill: DebtPaymentLinkedBillContext;
  cashAudit: DebtPaymentCashAuditContext;
  balanceImpact: DebtPaymentBalanceImpact;
  actionGuards: DebtPaymentDetailActionGuard[];
  informationalGuards: string[];
  beforeCashflowStartLabel: string | null;
}

export type BuildDebtPaymentDetailViewInput = {
  payment: DebtPayment;
  account: DebtAccount;
  linkedBill: BillInstance | null;
  paymentTransaction: CashPaymentTransaction | null;
  accountPayments: readonly DebtPayment[];
  cashDeductedPaymentIds: ReadonlySet<string>;
  replacementStartDate?: string;
  cashflowStartDate?: string | null;
};

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

function formatDisplayDateTime(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy 'at' h:mm a");
}

function comparePaymentsChronologically(
  left: Pick<DebtPayment, "payment_date" | "created_at" | "id">,
  right: Pick<DebtPayment, "payment_date" | "created_at" | "id">
): number {
  const byDate = left.payment_date.localeCompare(right.payment_date);
  if (byDate !== 0) {
    return byDate;
  }

  const byCreated = left.created_at.localeCompare(right.created_at);
  if (byCreated !== 0) {
    return byCreated;
  }

  return left.id.localeCompare(right.id);
}

export function resolveDebtPaymentSourceLabel(
  payment: Pick<DebtPayment, "linked_bill_instance_id">,
  linkedBill: Pick<BillInstance, "name"> | null
): string {
  if (!payment.linked_bill_instance_id) {
    return "Manual payment";
  }

  if (linkedBill?.name.startsWith("Debt:")) {
    return "Scheduled payment with linked bill";
  }

  return "Linked bill payment";
}

export function buildDebtPaymentBalanceImpact(
  account: Pick<DebtAccount, "original_amount">,
  payment: Pick<
    DebtPayment,
    | "id"
    | "debt_account_id"
    | "payment_date"
    | "created_at"
    | "total_payment"
    | "paid_status"
    | "remaining_balance_after_payment"
  >,
  accountPayments: readonly Pick<
    DebtPayment,
    | "id"
    | "debt_account_id"
    | "payment_date"
    | "created_at"
    | "total_payment"
    | "paid_status"
  >[]
): DebtPaymentBalanceImpact {
  const originalAmountLabel = formatCurrency(account.original_amount);
  const sameAccountPayments = accountPayments.filter(
    (row) => row.debt_account_id === payment.debt_account_id
  );

  if (sameAccountPayments.length === 0) {
    return {
      originalAmountLabel,
      totalPaidBeforeLabel: null,
      totalPaidThroughLabel: null,
      remainingAfterLabel:
        payment.remaining_balance_after_payment !== null
          ? formatCurrency(payment.remaining_balance_after_payment)
          : null,
      remainingAfterCaption:
        payment.remaining_balance_after_payment !== null
          ? DEBT_PAYMENT_DETAIL_REMAINING_PROJECTED_LABEL
          : null,
      balanceFallbackExplanation: DEBT_PAYMENT_DETAIL_BALANCE_FALLBACK,
    };
  }

  const sorted = [...sameAccountPayments].sort(comparePaymentsChronologically);
  const paymentIndex = sorted.findIndex((row) => row.id === payment.id);
  const paymentsBefore =
    paymentIndex >= 0 ? sorted.slice(0, paymentIndex) : sorted;

  const totalPaidBefore = computeTotalPaidFromPayments(paymentsBefore);
  const totalPaidBeforeLabel = formatCurrency(totalPaidBefore);

  let totalPaidThroughLabel: string | null = null;
  let remainingAfterLabel: string | null = null;
  let remainingAfterCaption: string | null = null;
  let balanceFallbackExplanation: string | null = null;

  if (isDebtPaymentPaid(payment)) {
    const totalPaidThrough = computeTotalPaidFromPayments([
      ...filterPaidDebtPayments(paymentsBefore),
      payment,
    ]);
    totalPaidThroughLabel = formatCurrency(totalPaidThrough);

    if (payment.remaining_balance_after_payment !== null) {
      remainingAfterLabel = formatCurrency(payment.remaining_balance_after_payment);
      remainingAfterCaption = "Remaining after this payment";
    } else {
      remainingAfterLabel = formatCurrency(
        computeRemainingBalance(account.original_amount, totalPaidThrough)
      );
      remainingAfterCaption = "Remaining after this payment (derived from paid history)";
    }
  } else if (payment.remaining_balance_after_payment !== null) {
    remainingAfterLabel = formatCurrency(payment.remaining_balance_after_payment);
    remainingAfterCaption = DEBT_PAYMENT_DETAIL_REMAINING_PROJECTED_LABEL;
  } else {
    balanceFallbackExplanation = DEBT_PAYMENT_DETAIL_BALANCE_FALLBACK;
  }

  if (paymentIndex < 0) {
    balanceFallbackExplanation = DEBT_PAYMENT_DETAIL_BALANCE_FALLBACK;
  }

  return {
    originalAmountLabel,
    totalPaidBeforeLabel,
    totalPaidThroughLabel,
    remainingAfterLabel,
    remainingAfterCaption,
    balanceFallbackExplanation,
  };
}

function buildLinkedBillContext(
  payment: Pick<DebtPayment, "linked_bill_instance_id" | "paid_status">,
  linkedBill: BillInstance | null,
  hasCashDeductionForLinkedBill: boolean
): DebtPaymentLinkedBillContext {
  if (!payment.linked_bill_instance_id || !linkedBill) {
    return {
      hasLinkedBill: false,
      billNameLabel: null,
      dueDateLabel: null,
      paidStatusLabel: null,
      cashDeductionStatusLabel: null,
      managedFromDebtExplanation: DEBT_PAYMENT_DETAIL_DEBT_MANAGED_BILL_MESSAGE,
    };
  }

  const billCashStatus = getCashDeductionStatus({
    isMarkedPaid: linkedBill.is_paid,
    hasPaymentTransaction: hasCashDeductionForLinkedBill,
  });

  return {
    hasLinkedBill: true,
    billNameLabel: linkedBill.name,
    dueDateLabel: linkedBill.due_date
      ? formatDisplayDate(linkedBill.due_date)
      : "Not set",
    paidStatusLabel: linkedBill.is_paid ? "Paid" : "Unpaid",
    cashDeductionStatusLabel: cashDeductionStatusLabel(billCashStatus),
    managedFromDebtExplanation: DEBT_PAYMENT_DETAIL_DEBT_MANAGED_BILL_MESSAGE,
  };
}

function buildCashAuditContext(
  payment: Pick<DebtPayment, "paid_status">,
  paymentTransaction: CashPaymentTransaction | null,
  accountName: string
): DebtPaymentCashAuditContext {
  const hasVisiblePaymentTransaction = paymentTransaction != null;
  const cashStatus = getCashDeductionStatus({
    isMarkedPaid: payment.paid_status,
    hasPaymentTransaction: hasVisiblePaymentTransaction,
  });

  let paymentAmountLabel: string | null = null;
  let paymentDateLabel: string | null = null;
  let paymentSourceLabel: string | null = null;
  let paymentNotes: string | null = null;

  if (paymentTransaction) {
    const debtPaymentDescriptionById = new Map<string, string>([
      [paymentTransaction.source_id, accountName],
    ]);
    const paymentRow = mapCashPaymentDeductionsForDisplay(
      [paymentTransaction],
      {
        billInstanceNameById: new Map(),
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
  if (hasVisiblePaymentTransaction) {
    paymentMethodLabel = BILL_DETAIL_PAY_AND_DEDUCT_LABEL;
  } else if (payment.paid_status) {
    paymentMethodLabel = BILL_DETAIL_MARKED_PAID_ONLY_LABEL;
  }

  let privacyFallbackLabel: string | null = null;
  if (payment.paid_status && !hasVisiblePaymentTransaction) {
    privacyFallbackLabel = DEBT_PAYMENT_DETAIL_NO_CASH_RECORD_VISIBLE;
  }

  return {
    paidStatusLabel: payment.paid_status ? "Paid" : "Unpaid scheduled payment",
    cashDeductionStatusLabel: cashDeductionStatusLabel(cashStatus),
    paymentMethodLabel,
    hasVisiblePaymentTransaction,
    paymentAmountLabel,
    paymentDateLabel,
    paymentSourceLabel,
    paymentNotes,
    privacyFallbackLabel,
  };
}

function buildActionGuards(input: {
  isAccountArchived: boolean;
  isPaid: boolean;
  isCashDeducted: boolean;
}): DebtPaymentDetailActionGuard[] {
  const replaceAvailable = !input.isAccountArchived;

  let replaceExplanation =
    "Schedule replacement is available from the debt account actions when the account is active.";
  if (input.isAccountArchived) {
    replaceExplanation =
      "Schedule replacement is unavailable while the debt account is archived.";
  } else if (input.isPaid) {
    replaceExplanation =
      "Paid payments are preserved during schedule replacement and will not be changed.";
  } else if (input.isCashDeducted) {
    replaceExplanation =
      "Cash-deducted payments are preserved during schedule replacement and will not be changed.";
  }

  let deleteExplanation =
    "Delete is available from the row actions. The linked bill instance will also be removed.";
  if (input.isPaid) {
    deleteExplanation =
      "Delete is available, but paid history is normally preserved. Deleting removes this payment and its linked bill.";
  }
  if (input.isCashDeducted) {
    deleteExplanation =
      "Delete is available from the row actions. Cash-deducted history should be preserved when possible.";
  }

  return [
    {
      action: "edit",
      label: "Edit payment",
      available: true,
      explanation:
        "Edit payment amounts from the row pencil action. Linked bill amounts stay in sync.",
    },
    {
      action: "delete",
      label: "Delete payment",
      available: true,
      explanation: deleteExplanation,
    },
    {
      action: "replace",
      label: "Schedule replacement",
      available: replaceAvailable,
      explanation: replaceExplanation,
    },
  ];
}

function buildInformationalGuards(input: {
  isAccountArchived: boolean;
  hasLinkedBill: boolean;
  isPaid: boolean;
  isCashDeducted: boolean;
  replacementStartDate?: string;
  payment: Pick<DebtPayment, "id" | "payment_date" | "paid_status">;
  cashDeductedPaymentIds: ReadonlySet<string>;
}): string[] {
  const guards: string[] = [];

  if (input.hasLinkedBill) {
    guards.push(DEBT_PAYMENT_DETAIL_DEBT_MANAGED_BILL_MESSAGE);
    guards.push(DEBT_LINKED_BILL_EDIT_MESSAGE);
  }

  if (input.isAccountArchived) {
    guards.push(BILL_DETAIL_DEBT_ACCOUNT_ARCHIVED_MESSAGE);
  }

  if (input.isPaid) {
    guards.push(DEBT_PAYMENT_DETAIL_PAID_HISTORY_MESSAGE);
  }

  if (input.isCashDeducted) {
    guards.push(DEBT_PAYMENT_DETAIL_CASH_DEDUCTED_HISTORY_MESSAGE);
  }

  if (input.replacementStartDate) {
    const protectionReason = getDebtPaymentProtectionReason(
      input.payment,
      input.replacementStartDate,
      input.cashDeductedPaymentIds
    );
    if (protectionReason) {
      guards.push(protectionReasonLabel(protectionReason));
    }
  }

  return guards;
}

export function buildDebtPaymentDetailView(
  input: BuildDebtPaymentDetailViewInput
): DebtPaymentDetailView {
  const { payment, account, linkedBill, paymentTransaction, accountPayments } =
    input;
  const isCashDeducted = input.cashDeductedPaymentIds.has(payment.id);
  const monthLabel = MONTH_NAMES[payment.month - 1] ?? String(payment.month);
  const isAccountArchived = isDebtAccountArchived(account);
  const hasCashDeductionForLinkedBill =
    isCashDeducted ||
    (linkedBill != null &&
      paymentTransaction != null &&
      paymentTransaction.source_type === "bill_instance" &&
      paymentTransaction.source_id === linkedBill.id);
  const beforeCashflowStartLabel = getDebtPaymentPreStartLabel(
    payment,
    input.cashflowStartDate
  );

  return {
    title: account.name,
    subtitle: payment.paid_status
      ? "Debt payment audit · paid"
      : "Debt payment audit · scheduled",
    accountName: account.name,
    paymentDateLabel: formatDisplayDate(payment.payment_date),
    monthYearLabel: `${monthLabel} ${payment.year}`,
    periodBucketLabel: formatBillPeriodBucketLabel(payment.period_bucket),
    amountLabel: formatCurrency(payment.total_payment),
    telesAmountLabel: formatCurrency(payment.teles_amount),
    nicoleAmountLabel: formatCurrency(payment.nicole_amount),
    sourceLabel: resolveDebtPaymentSourceLabel(payment, linkedBill),
    isAccountArchived,
    archivedAccountLabel: isAccountArchived
      ? getDebtAccountArchivedBadgeLabel(account)
      : null,
    linkedBill: buildLinkedBillContext(
      payment,
      linkedBill,
      hasCashDeductionForLinkedBill
    ),
    cashAudit: buildCashAuditContext(payment, paymentTransaction, account.name),
    balanceImpact: buildDebtPaymentBalanceImpact(
      account,
      payment,
      accountPayments
    ),
    actionGuards: buildActionGuards({
      isAccountArchived: !isDebtScheduleActionAllowed(account),
      isPaid: payment.paid_status,
      isCashDeducted,
    }),
    informationalGuards: buildInformationalGuards({
      isAccountArchived,
      hasLinkedBill: linkedBill != null,
      isPaid: payment.paid_status,
      isCashDeducted,
      replacementStartDate: input.replacementStartDate,
      payment,
      cashDeductedPaymentIds: input.cashDeductedPaymentIds,
    }),
    beforeCashflowStartLabel,
  };
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function collectDebtPaymentDetailUserFacingStrings(
  detail: DebtPaymentDetailView
): string[] {
  const values: string[] = [
    detail.title,
    detail.subtitle,
    detail.accountName,
    detail.paymentDateLabel,
    detail.monthYearLabel,
    detail.periodBucketLabel,
    detail.amountLabel,
    detail.telesAmountLabel,
    detail.nicoleAmountLabel,
    detail.sourceLabel,
    detail.linkedBill.managedFromDebtExplanation,
    detail.cashAudit.paidStatusLabel,
    detail.cashAudit.cashDeductionStatusLabel,
    detail.balanceImpact.originalAmountLabel,
    ...detail.informationalGuards,
    ...detail.actionGuards.flatMap((guard) => [guard.label, guard.explanation]),
  ];

  for (const value of [
    detail.archivedAccountLabel,
    detail.beforeCashflowStartLabel,
    detail.linkedBill.billNameLabel,
    detail.linkedBill.dueDateLabel,
    detail.linkedBill.paidStatusLabel,
    detail.linkedBill.cashDeductionStatusLabel,
    detail.cashAudit.paymentMethodLabel,
    detail.cashAudit.paymentAmountLabel,
    detail.cashAudit.paymentDateLabel,
    detail.cashAudit.paymentSourceLabel,
    detail.cashAudit.paymentNotes,
    detail.cashAudit.privacyFallbackLabel,
    detail.balanceImpact.totalPaidBeforeLabel,
    detail.balanceImpact.totalPaidThroughLabel,
    detail.balanceImpact.remainingAfterLabel,
    detail.balanceImpact.remainingAfterCaption,
    detail.balanceImpact.balanceFallbackExplanation,
  ]) {
    if (value) {
      values.push(value);
    }
  }

  return values;
}

export function debtPaymentDetailViewContainsRawUuid(
  detail: DebtPaymentDetailView
): boolean {
  return collectDebtPaymentDetailUserFacingStrings(detail).some((value) =>
    UUID_PATTERN.test(value)
  );
}
