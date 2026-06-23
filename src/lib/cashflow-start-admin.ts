import { isBillInstancePreStart } from "@/lib/bill-cashflow-start";
import { isDebtPaymentPreStart } from "@/lib/debt-cashflow-start";
import { isManualExpensePreStart } from "@/lib/expense-cashflow-start";
import { isSavingsContributionPreStart } from "@/lib/savings-cashflow-start";
import { isActiveHouseholdOwner } from "@/lib/permissions-audit";
import type {
  BillInstance,
  DebtPayment,
  HouseholdMember,
  ManualExpense,
  SavingsContribution,
} from "@/lib/types";
import { parseISO, isValid } from "date-fns";

export const CASHFLOW_START_READ_ONLY_COPY =
  "Only a household admin can change the cashflow start date.";

export const CASHFLOW_START_FIRST_TIME_SETUP_COPY =
  "Choose the date when household cashflow planning begins. Bills, expenses, debt payments, and your savings contributions before this date stay in the database but are excluded from active planning views until you choose to show them.";

export const CASHFLOW_START_CHANGE_CONFIRM_TITLE =
  "Change cashflow start date?";

export const CASHFLOW_START_CHANGE_CONFIRM_INTRO =
  "Changing the cashflow start date updates which rows appear in active planning lists. Review the impact before confirming.";

export const CASHFLOW_START_CHANGE_CONFIRM_POINTS = [
  "Historical records are preserved.",
  "Active planning lists may hide or reveal different rows.",
  "Dashboard warnings and forecasts depend on this boundary.",
  "No source records will be deleted.",
] as const;

export const IMPACT_PREVIEW_BILLS_LABEL = "Bills affected";
export const IMPACT_PREVIEW_EXPENSES_LABEL = "Expenses affected";
export const IMPACT_PREVIEW_DEBT_PAYMENTS_LABEL = "Debt payments affected";
export const IMPACT_PREVIEW_SAVINGS_LABEL = "Your savings contributions affected";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface CashflowStartImpactCategoryCounts {
  total: number;
  becomingActive: number;
  becomingPreStart: number;
}

export interface CashflowStartImpactPreview {
  bills: CashflowStartImpactCategoryCounts;
  expenses: CashflowStartImpactCategoryCounts;
  debtPayments: CashflowStartImpactCategoryCounts;
  savingsContributions: CashflowStartImpactCategoryCounts;
  labels: {
    bills: string;
    expenses: string;
    debtPayments: string;
    savingsContributions: string;
  };
}

export interface CashflowStartImpactPreviewInput {
  billInstances: BillInstance[];
  manualExpenses: ManualExpense[];
  debtPayments: DebtPayment[];
  savingsContributions: SavingsContribution[];
  signedInUserId: string;
  currentStartDate: string;
  proposedStartDate: string;
}

export interface CashflowStartDateValidationResult {
  valid: boolean;
  error: string | null;
}

export function canUserEditCashflowStartDate(
  membership:
    | Pick<HouseholdMember, "role" | "is_owner">
    | Pick<HouseholdMember, "role" | "is_owner" | "status" | "is_active">
    | null
    | undefined
): boolean {
  return isActiveHouseholdOwner(membership);
}

export function validateCashflowStartDateInput(
  value: string
): CashflowStartDateValidationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: false, error: "Please select a cashflow start date." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { valid: false, error: "Please enter a valid cashflow start date." };
  }

  const parsed = parseISO(trimmed);
  if (!isValid(parsed)) {
    return { valid: false, error: "Please enter a valid cashflow start date." };
  }

  return { valid: true, error: null };
}

export function isFirstTimeCashflowStartSetup(
  currentStartDate: string | null | undefined
): boolean {
  return !currentStartDate;
}

export function requiresCashflowStartChangeConfirmation(
  currentStartDate: string | null | undefined,
  proposedStartDate: string
): boolean {
  return Boolean(currentStartDate) && currentStartDate !== proposedStartDate;
}

export function buildCashflowStartChangeConfirmationCopy(): {
  title: string;
  intro: string;
  points: readonly string[];
} {
  return {
    title: CASHFLOW_START_CHANGE_CONFIRM_TITLE,
    intro: CASHFLOW_START_CHANGE_CONFIRM_INTRO,
    points: CASHFLOW_START_CHANGE_CONFIRM_POINTS,
  };
}

function countClassificationChanges<T>(
  rows: readonly T[],
  isPreStart: (row: T, cashflowStartDate: string) => boolean,
  currentStartDate: string,
  proposedStartDate: string
): CashflowStartImpactCategoryCounts {
  let becomingActive = 0;
  let becomingPreStart = 0;

  for (const row of rows) {
    const wasPreStart = isPreStart(row, currentStartDate);
    const willBePreStart = isPreStart(row, proposedStartDate);

    if (wasPreStart === willBePreStart) {
      continue;
    }

    if (willBePreStart) {
      becomingPreStart += 1;
    } else {
      becomingActive += 1;
    }
  }

  return {
    total: becomingActive + becomingPreStart,
    becomingActive,
    becomingPreStart,
  };
}

export function formatImpactPreviewCount(
  counts: CashflowStartImpactCategoryCounts
): string {
  if (counts.total === 0) {
    return "0";
  }

  const parts: string[] = [];
  if (counts.becomingActive > 0) {
    parts.push(
      `${counts.becomingActive} would become active`
    );
  }
  if (counts.becomingPreStart > 0) {
    parts.push(
      `${counts.becomingPreStart} would become pre-start`
    );
  }

  return `${counts.total} (${parts.join(", ")})`;
}

export function buildCashflowStartImpactPreview(
  input: CashflowStartImpactPreviewInput
): CashflowStartImpactPreview {
  const {
    billInstances,
    manualExpenses,
    debtPayments,
    savingsContributions,
    signedInUserId,
    currentStartDate,
    proposedStartDate,
  } = input;

  const ownSavingsContributions = savingsContributions.filter(
    (contribution) => contribution.user_id === signedInUserId
  );

  const bills = countClassificationChanges(
    billInstances,
    isBillInstancePreStart,
    currentStartDate,
    proposedStartDate
  );
  const expenses = countClassificationChanges(
    manualExpenses,
    isManualExpensePreStart,
    currentStartDate,
    proposedStartDate
  );
  const debtPaymentCounts = countClassificationChanges(
    debtPayments,
    isDebtPaymentPreStart,
    currentStartDate,
    proposedStartDate
  );
  const savings = countClassificationChanges(
    ownSavingsContributions,
    isSavingsContributionPreStart,
    currentStartDate,
    proposedStartDate
  );

  return {
    bills,
    expenses,
    debtPayments: debtPaymentCounts,
    savingsContributions: savings,
    labels: {
      bills: IMPACT_PREVIEW_BILLS_LABEL,
      expenses: IMPACT_PREVIEW_EXPENSES_LABEL,
      debtPayments: IMPACT_PREVIEW_DEBT_PAYMENTS_LABEL,
      savingsContributions: IMPACT_PREVIEW_SAVINGS_LABEL,
    },
  };
}

export function cashflowStartAdminLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}

export function getCashflowStartSaveBlockedReason(input: {
  canEdit: boolean;
  validation: CashflowStartDateValidationResult;
  currentStartDate: string | null | undefined;
  proposedStartDate: string;
}): string | null {
  if (!input.canEdit) {
    return CASHFLOW_START_READ_ONLY_COPY;
  }

  if (!input.validation.valid) {
    return input.validation.error;
  }

  if (
    input.currentStartDate &&
    input.currentStartDate === input.proposedStartDate.trim()
  ) {
    return "The selected date matches the current cashflow start date.";
  }

  return null;
}
