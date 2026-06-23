import type { BillShareKey } from "@/lib/bill-share";
import { getManualExpensePreStartLabel } from "@/lib/expense-cashflow-start";
import {
  canShowCashCreditActionForAdjustment,
  isAdjustmentAlreadyCredited,
  isDecreaseManualExpenseAdjustment,
  mapCashAdjustmentCreditsForDisplay,
} from "@/lib/cash-adjustments";
import {
  adjustmentDirectionLabel,
  canDeleteManualExpense,
  canEditManualExpenseFinancialFields,
  expenseScopeLabel,
  expenseSplitTypeLabel,
  formatExpensePeriodBucket,
  getMyExpenseShareAmount,
  isManualExpenseAdjustment,
  isManualExpensePaidThroughApp,
} from "@/lib/expenses";
import { formatCurrency } from "@/lib/format";
import {
  buildManualExpenseDescriptionLookup,
  cashDeductionStatusLabel,
  DUPLICATE_PAYMENT_MESSAGE,
  getCashDeductionStatus,
  mapCashPaymentDeductionsForDisplay,
} from "@/lib/payments";
import type {
  CashAdjustmentTransaction,
  CashPaymentTransaction,
  ManualExpense,
} from "@/lib/types";
import { format, parseISO } from "date-fns";

export const PAID_THROUGH_APP_EDIT_MESSAGE =
  "Already deducted from cash. Create an adjustment instead of editing.";

export const PAID_THROUGH_APP_DELETE_MESSAGE =
  "Already deducted from cash. Create an adjustment instead of deleting.";

export const ADJUSTMENT_PAY_DISABLED_MESSAGE =
  "Adjustment affects planning totals only.";

export const ORIGINAL_EXPENSE_UNAVAILABLE_LABEL = "Original expense unavailable";

export const EXPENSE_DETAIL_EDIT_AVAILABLE_MESSAGE =
  "Editable because this expense has not been deducted from cash.";

export const EXPENSE_DETAIL_DELETE_AVAILABLE_MESSAGE =
  "Delete is available because this expense has not been deducted from cash.";

export const EXPENSE_DETAIL_CREATE_ADJUSTMENT_AVAILABLE_MESSAGE =
  "Create adjustment is available because this expense was deducted from cash.";

export const EXPENSE_DETAIL_PAY_AVAILABLE_MESSAGE =
  "Pay & deduct cash is available because this expense has not been deducted from your current amount.";

export const EXPENSE_DETAIL_CREDIT_AVAILABLE_MESSAGE =
  "Credit current amount is available only for decrease adjustments that have not already been credited.";

export const EXPENSE_DETAIL_NOT_CREATOR_MESSAGE =
  "Only the person who recorded this expense can use this action.";

export const EXPENSE_DETAIL_ADJUSTMENT_MARK_PAID_MESSAGE =
  "Planning only — mark paid not applicable for adjustments.";

export type ManualExpenseDetailActionKey =
  | "edit"
  | "delete"
  | "create_adjustment"
  | "pay"
  | "credit";

export interface ManualExpenseDetailAdjustmentRow {
  id: string;
  directionLabel: string;
  amountLabel: string;
  dateLabel: string;
  reason: string | null;
  description: string;
}

export interface ManualExpenseDetailActionRow {
  action: ManualExpenseDetailActionKey;
  label: string;
  available: boolean;
  explanation: string;
}

export interface ManualExpenseDetailPaymentAudit {
  markPaidLabel: string;
  markPaidAt: string | null;
  cashDeductionStatusLabel: string | null;
  hasPaymentTransaction: boolean;
  paymentAmountLabel: string | null;
  paymentDateLabel: string | null;
  paymentNotes: string | null;
  creditApplied: boolean | null;
  creditAmountLabel: string | null;
  creditDateLabel: string | null;
  creditNotes: string | null;
}

export interface ManualExpenseDetailView {
  description: string;
  beforeCashflowStartLabel: string | null;
  scopeLabel: string;
  amountLabel: string;
  dateLabel: string;
  periodBucketLabel: string;
  splitTypeLabel: string;
  telesAmountLabel: string;
  nicoleAmountLabel: string;
  category: string | null;
  notes: string | null;
  createdAtLabel: string | null;
  updatedAtLabel: string | null;
  isAdjustment: boolean;
  adjustmentDirectionLabel: string | null;
  adjustmentReason: string | null;
  linkedOriginalDescription: string | null;
  linkedOriginalAmountLabel: string | null;
  relatedAdjustments: ManualExpenseDetailAdjustmentRow[];
  paymentAudit: ManualExpenseDetailPaymentAudit;
  actions: ManualExpenseDetailActionRow[];
}

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

function formatDisplayDateTime(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy 'at' h:mm a");
}

function compareExpensesNewestFirst(left: ManualExpense, right: ManualExpense): number {
  const dateCompare = right.expense_date.localeCompare(left.expense_date);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return right.created_at.localeCompare(left.created_at);
}

export function getRelatedAdjustmentsForOriginal(
  visibleExpenses: ReadonlyArray<ManualExpense>,
  originalExpenseId: string
): ManualExpense[] {
  return visibleExpenses
    .filter(
      (row) =>
        row.adjusts_manual_expense_id === originalExpenseId &&
        isManualExpenseAdjustment(row)
    )
    .sort(compareExpensesNewestFirst);
}

export function getSiblingAdjustmentsForAdjustment(
  visibleExpenses: ReadonlyArray<ManualExpense>,
  adjustment: ManualExpense
): ManualExpense[] {
  if (!adjustment.adjusts_manual_expense_id) {
    return [];
  }

  return visibleExpenses
    .filter(
      (row) =>
        row.id !== adjustment.id &&
        row.adjusts_manual_expense_id === adjustment.adjusts_manual_expense_id &&
        isManualExpenseAdjustment(row)
    )
    .sort(compareExpensesNewestFirst);
}

function mapAdjustmentRow(expense: ManualExpense): ManualExpenseDetailAdjustmentRow {
  return {
    id: expense.id,
    directionLabel: expense.adjustment_direction
      ? adjustmentDirectionLabel(expense.adjustment_direction)
      : "Adjustment",
    amountLabel: formatCurrency(Number(expense.amount)),
    dateLabel: formatDisplayDate(expense.expense_date),
    reason: expense.adjustment_reason,
    description: expense.description,
  };
}

function resolveLinkedOriginal(
  expense: ManualExpense,
  visibleExpenses: ReadonlyArray<ManualExpense>
): { description: string; amountLabel: string | null } | null {
  if (!expense.adjusts_manual_expense_id) {
    return null;
  }

  const original = visibleExpenses.find(
    (row) => row.id === expense.adjusts_manual_expense_id
  );

  if (!original) {
    return {
      description: ORIGINAL_EXPENSE_UNAVAILABLE_LABEL,
      amountLabel: null,
    };
  }

  return {
    description: original.description,
    amountLabel: formatCurrency(Number(original.amount)),
  };
}

function buildPaymentAudit({
  expense,
  visibleExpenses,
  paymentTransaction,
  creditTransaction,
  creditedAdjustmentIds,
}: {
  expense: ManualExpense;
  visibleExpenses: ReadonlyArray<ManualExpense>;
  paymentTransaction?: CashPaymentTransaction | null;
  creditTransaction?: CashAdjustmentTransaction | null;
  creditedAdjustmentIds: ReadonlySet<string>;
}): ManualExpenseDetailPaymentAudit {
  const isAdjustment = isManualExpenseAdjustment(expense);

  if (isAdjustment) {
    const creditApplied = isDecreaseManualExpenseAdjustment(expense)
      ? isAdjustmentAlreadyCredited(expense.id, creditedAdjustmentIds)
      : null;

    let creditAmountLabel: string | null = null;
    let creditDateLabel: string | null = null;
    let creditNotes: string | null = null;

    if (creditTransaction && creditApplied) {
      const descriptionLookup = buildManualExpenseDescriptionLookup(visibleExpenses);
      const creditRow = mapCashAdjustmentCreditsForDisplay(
        [creditTransaction],
        descriptionLookup
      )[0];

      if (creditRow) {
        creditAmountLabel = formatCurrency(creditRow.amount);
        creditDateLabel = formatDisplayDateTime(creditRow.creditedAt);
        creditNotes = creditRow.notes;
      }
    }

    return {
      markPaidLabel: EXPENSE_DETAIL_ADJUSTMENT_MARK_PAID_MESSAGE,
      markPaidAt: null,
      cashDeductionStatusLabel: null,
      hasPaymentTransaction: false,
      paymentAmountLabel: null,
      paymentDateLabel: null,
      paymentNotes: null,
      creditApplied,
      creditAmountLabel,
      creditDateLabel,
      creditNotes,
    };
  }

  const hasPaymentTransaction = paymentTransaction != null;
  const cashStatus = getCashDeductionStatus({
    isMarkedPaid: expense.is_paid,
    hasPaymentTransaction,
  });

  let paymentAmountLabel: string | null = null;
  let paymentDateLabel: string | null = null;
  let paymentNotes: string | null = null;

  if (paymentTransaction) {
    const descriptionLookup = buildManualExpenseDescriptionLookup(visibleExpenses);
    const paymentRow = mapCashPaymentDeductionsForDisplay(
      [paymentTransaction],
      {
        billInstanceNameById: new Map(),
        debtPaymentDescriptionById: new Map(),
        manualExpenseDescriptionById: descriptionLookup,
      }
    )[0];

    if (paymentRow) {
      paymentAmountLabel = paymentRow.formattedAmount;
      paymentDateLabel = formatDisplayDateTime(paymentRow.paidAt);
      paymentNotes = paymentRow.notes;
    }
  }

  return {
    markPaidLabel: expense.is_paid ? "Marked paid" : "Not marked paid",
    markPaidAt: expense.paid_at ? formatDisplayDateTime(expense.paid_at) : null,
    cashDeductionStatusLabel: cashDeductionStatusLabel(cashStatus),
    hasPaymentTransaction,
    paymentAmountLabel,
    paymentDateLabel,
    paymentNotes,
    creditApplied: null,
    creditAmountLabel: null,
    creditDateLabel: null,
    creditNotes: null,
  };
}

function buildActionAvailability({
  expense,
  userId,
  shareKey,
  paidManualExpenseIds,
  creditedAdjustmentIds,
  hasPaymentTransaction,
}: {
  expense: ManualExpense;
  userId: string;
  shareKey: BillShareKey | null;
  paidManualExpenseIds: ReadonlySet<string>;
  creditedAdjustmentIds: ReadonlySet<string>;
  hasPaymentTransaction: boolean;
}): ManualExpenseDetailActionRow[] {
  const isCreator = expense.created_by_user_id === userId;
  const isAdjustment = isManualExpenseAdjustment(expense);
  const paidThroughApp = isManualExpensePaidThroughApp(
    expense.id,
    paidManualExpenseIds
  );
  const canEdit = isCreator && canEditManualExpenseFinancialFields(
    expense.id,
    paidManualExpenseIds
  );
  const canDelete = canDeleteManualExpense({
    createdByUserId: expense.created_by_user_id,
    userId,
    hasPaymentTransaction,
  });
  const cashStatus = getCashDeductionStatus({
    isMarkedPaid: expense.is_paid,
    hasPaymentTransaction,
  });

  const editExplanation = !isCreator
    ? EXPENSE_DETAIL_NOT_CREATOR_MESSAGE
    : paidThroughApp
      ? PAID_THROUGH_APP_EDIT_MESSAGE
      : EXPENSE_DETAIL_EDIT_AVAILABLE_MESSAGE;

  const deleteExplanation = !isCreator
    ? EXPENSE_DETAIL_NOT_CREATOR_MESSAGE
    : hasPaymentTransaction
      ? PAID_THROUGH_APP_DELETE_MESSAGE
      : EXPENSE_DETAIL_DELETE_AVAILABLE_MESSAGE;

  const createAdjustmentAvailable =
    isCreator && !isAdjustment && paidThroughApp;
  const createAdjustmentExplanation = !isCreator
    ? EXPENSE_DETAIL_NOT_CREATOR_MESSAGE
    : isAdjustment
      ? "Create adjustment applies to original expenses that were deducted from cash."
      : paidThroughApp
        ? EXPENSE_DETAIL_CREATE_ADJUSTMENT_AVAILABLE_MESSAGE
        : "Create adjustment is available only after Pay & deduct cash on the original expense.";

  let payAvailable = false;
  let payExplanation = ADJUSTMENT_PAY_DISABLED_MESSAGE;

  if (!isAdjustment) {
    if (hasPaymentTransaction) {
      payExplanation = DUPLICATE_PAYMENT_MESSAGE;
    } else if (cashStatus !== "unpaid") {
      payExplanation =
        cashStatus === "marked_paid_only"
          ? "Pay & deduct cash is unavailable because this expense is marked paid without a cash deduction."
          : "Pay & deduct cash is unavailable because this expense has already been deducted from cash.";
    } else {
      const shareAmount = getMyExpenseShareAmount(expense, shareKey);
      if (shareAmount === null) {
        payExplanation =
          "Choose your budget profile in Settings before paying from cash.";
      } else if (shareAmount <= 0) {
        payExplanation = "Your share for this expense is zero.";
      } else {
        payAvailable = true;
        payExplanation = EXPENSE_DETAIL_PAY_AVAILABLE_MESSAGE;
      }
    }
  }

  let creditAvailable = false;
  let creditExplanation = EXPENSE_DETAIL_CREDIT_AVAILABLE_MESSAGE;

  if (isAdjustment) {
    if (!isDecreaseManualExpenseAdjustment(expense)) {
      creditExplanation = ADJUSTMENT_PAY_DISABLED_MESSAGE;
    } else if (isAdjustmentAlreadyCredited(expense.id, creditedAdjustmentIds)) {
      creditExplanation =
        "This adjustment has already been credited to your current amount.";
    } else if (canShowCashCreditActionForAdjustment(expense, creditedAdjustmentIds)) {
      const creditAmount = getMyExpenseShareAmount(expense, shareKey);
      if (creditAmount === null) {
        creditExplanation =
          "Choose your budget profile in Settings before crediting cash.";
      } else if (creditAmount <= 0) {
        creditExplanation = "Your share for this adjustment is zero.";
      } else {
        creditAvailable = true;
        creditExplanation = EXPENSE_DETAIL_CREDIT_AVAILABLE_MESSAGE;
      }
    }
  } else {
    creditExplanation =
      "Credit current amount applies only to decrease adjustment rows.";
  }

  return [
    {
      action: "edit",
      label: "Edit expense",
      available: canEdit,
      explanation: editExplanation,
    },
    {
      action: "delete",
      label: "Delete expense",
      available: canDelete,
      explanation: deleteExplanation,
    },
    {
      action: "create_adjustment",
      label: "Create adjustment",
      available: createAdjustmentAvailable,
      explanation: createAdjustmentExplanation,
    },
    {
      action: "pay",
      label: "Pay & deduct cash",
      available: payAvailable,
      explanation: payExplanation,
    },
    {
      action: "credit",
      label: "Credit current amount",
      available: creditAvailable,
      explanation: creditExplanation,
    },
  ];
}

export function buildManualExpenseDetailView({
  expense,
  visibleExpenses,
  userId,
  shareKey,
  paidManualExpenseIds,
  paymentTransaction,
  creditTransaction,
  creditedAdjustmentIds,
  cashflowStartDate,
}: {
  expense: ManualExpense;
  visibleExpenses: ReadonlyArray<ManualExpense>;
  userId: string;
  shareKey: BillShareKey | null;
  paidManualExpenseIds: ReadonlySet<string>;
  paymentTransaction?: CashPaymentTransaction | null;
  creditTransaction?: CashAdjustmentTransaction | null;
  creditedAdjustmentIds: ReadonlySet<string>;
  cashflowStartDate?: string | null;
}): ManualExpenseDetailView | null {
  const isVisible = visibleExpenses.some((row) => row.id === expense.id);
  if (!isVisible) {
    return null;
  }

  const isAdjustment = isManualExpenseAdjustment(expense);
  const linkedOriginal = resolveLinkedOriginal(expense, visibleExpenses);
  const relatedAdjustments = isAdjustment
    ? getSiblingAdjustmentsForAdjustment(visibleExpenses, expense).map(mapAdjustmentRow)
    : getRelatedAdjustmentsForOriginal(visibleExpenses, expense.id).map(mapAdjustmentRow);

  const hasPaymentTransaction = paymentTransaction != null;

  return {
    description: expense.description,
    beforeCashflowStartLabel: getManualExpensePreStartLabel(
      expense,
      cashflowStartDate
    ),
    scopeLabel: expenseScopeLabel(expense.expense_scope),
    amountLabel: formatCurrency(Number(expense.amount)),
    dateLabel: formatDisplayDate(expense.expense_date),
    periodBucketLabel: formatExpensePeriodBucket(expense.period_bucket),
    splitTypeLabel: expenseSplitTypeLabel(expense.split_type),
    telesAmountLabel: formatCurrency(Number(expense.teles_amount)),
    nicoleAmountLabel: formatCurrency(Number(expense.nicole_amount)),
    category: expense.category,
    notes: expense.notes,
    createdAtLabel: expense.created_at
      ? formatDisplayDateTime(expense.created_at)
      : null,
    updatedAtLabel: expense.updated_at
      ? formatDisplayDateTime(expense.updated_at)
      : null,
    isAdjustment,
    adjustmentDirectionLabel: expense.adjustment_direction
      ? adjustmentDirectionLabel(expense.adjustment_direction)
      : null,
    adjustmentReason: expense.adjustment_reason,
    linkedOriginalDescription: linkedOriginal?.description ?? null,
    linkedOriginalAmountLabel: linkedOriginal?.amountLabel ?? null,
    relatedAdjustments,
    paymentAudit: buildPaymentAudit({
      expense,
      visibleExpenses,
      paymentTransaction,
      creditTransaction,
      creditedAdjustmentIds,
    }),
    actions: buildActionAvailability({
      expense,
      userId,
      shareKey,
      paidManualExpenseIds,
      creditedAdjustmentIds,
      hasPaymentTransaction,
    }),
  };
}
