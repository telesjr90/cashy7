import { canUserEditCashflowStartDate } from "@/lib/cashflow-start-admin";
import { debtBillInstanceName, split5149 } from "@/lib/format";
import type { ImportFieldKey } from "@/lib/import-column-mapping";
import {
  isTruthyMarker,
  normalizeImportPeriod,
  parseImportAmount,
  parseImportDate,
  parseImportMonth,
  sanitizeImportDisplayText,
  type ImportValidatedRow,
  type ImportValidatedRowType,
} from "@/lib/import-validation";
import type { PeriodBucket } from "@/lib/periods";
import type { HouseholdMember, InsertTables } from "@/lib/types";

export const IMPORT_OWNER_ONLY_COPY =
  "Only a household owner can apply spreadsheet imports.";

export const IMPORT_APPLY_BUTTON_LABEL = "Apply import";

export const IMPORT_CONFIRM_INTRO_COPY =
  "This will create records in your household.";

export const IMPORT_CONFIRM_NO_CASH_COPY = "No cash will be deducted.";

export const IMPORT_CONFIRM_REVIEW_COPY =
  "You can review imported records before continuing.";

export const IMPORT_APPLIED_COPY = "Import applied.";

export const IMPORT_NO_CASH_DEDUCTED_COPY = "No cash was deducted.";

export const IMPORT_ROLLBACK_LATER_COPY =
  "Rollback/delete imported batch will be available in a later task.";

export const IMPORT_NOTE_PREFIX = "[Imported from spreadsheet";

export type ImportCreatePlanKind =
  | "bill_template"
  | "bill_instance"
  | "debt_payment_with_bill"
  | "manual_expense"
  | "savings_contribution";

export type ImportBatchRecordPlan = {
  sourceSheetName: string;
  sourceRowNumber: number;
  rowType: ImportValidatedRowType;
  targetTable: string;
  targetIdPlaceholder: string;
};

export type ImportRowCreatePlan = {
  rowId: string;
  sheetName: string;
  rowNumber: number;
  rowType: ImportValidatedRowType;
  kind: ImportCreatePlanKind;
  hasWarning: boolean;
  batchRecordPlans: ImportBatchRecordPlan[];
  billTemplate?: InsertTables<"bills">;
  billInstance?: InsertTables<"bill_instances">;
  debtPaymentWithBill?: {
    debtAccountName: string;
    debtAccountId?: string;
    createDebtAccount?: {
      name: string;
      original_amount: number;
      current_balance: number;
      notes: string | null;
    };
    bill: InsertTables<"bill_instances">;
    payment: Omit<
      InsertTables<"debt_payments">,
      "linked_bill_instance_id" | "debt_account_id"
    >;
  };
  manualExpense?: InsertTables<"manual_expenses">;
  savingsContribution?: {
    savingsGoalId: string;
    amount: number;
    contributionDate: string;
    notes: string | null;
  };
};

export type ImportRowExcluded = {
  rowId: string;
  sheetName: string;
  rowNumber: number;
  rowType: ImportValidatedRowType;
  reason: string;
};

export type ImportApplyContext = {
  existingBillTemplates: { id: string; name: string }[];
  existingBillInstances: {
    name: string;
    year: number;
    month: number;
    period_bucket: PeriodBucket;
  }[];
  existingDebtAccounts: { id: string; name: string }[];
  existingDebtPayments: {
    debt_account_id: string;
    payment_date: string;
    total_payment: number;
  }[];
  existingManualExpenses: {
    description: string;
    expense_date: string;
    amount: number;
  }[];
  existingSavingsContributions: {
    savings_goal_id: string;
    contribution_date: string | null;
    amount: number;
  }[];
  savingsGoals: { id: string; name: string }[];
};

export type ImportCreatePlanBuildResult = {
  plans: ImportRowCreatePlan[];
  excluded: ImportRowExcluded[];
  skipped: ImportRowExcluded[];
};

export type ImportConfirmationSummary = {
  fileName: string;
  sheetSummary: string;
  rowsToCreate: number;
  skippedRows: number;
  warningRows: number;
  errorRows: number;
  countsByKind: Record<ImportCreatePlanKind, number>;
  countsByRowType: Record<Exclude<ImportValidatedRowType, "unknown" | "ambiguous">, number>;
  noRecordsChangedYet: true;
};

export type ImportApplyResultCounts = {
  billTemplates: number;
  billInstances: number;
  debtPayments: number;
  linkedDebtBills: number;
  manualExpenses: number;
  savingsContributions: number;
  skipped: number;
  failed: number;
};

export type ImportApplyResultSummary = {
  success: boolean;
  partial: boolean;
  counts: ImportApplyResultCounts;
  importBatchId: string | null;
  userMessage: string;
  developerDetails: string[];
};

function mappedValue(
  row: ImportValidatedRow,
  field: ImportFieldKey
): string | number | boolean | null {
  return row.mappedValues[field] ?? null;
}

function mappedScalar(row: ImportValidatedRow, field: ImportFieldKey): string | null {
  const value = mappedValue(row, field);
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function canUserApplyImport(
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined
): boolean {
  return canUserEditCashflowStartDate(membership);
}

export function isRowWritable(row: ImportValidatedRow): boolean {
  return (
    (row.status === "valid" || row.status === "warning") &&
    row.rowType !== "unknown" &&
    row.rowType !== "ambiguous"
  );
}

export function buildImportSourceNote(
  fileName: string,
  rowNumber: number,
  sourceLabel?: string | null
): string {
  const safeFile = sanitizeImportDisplayText(fileName);
  const parts = [`${IMPORT_NOTE_PREFIX} · ${safeFile} · row ${rowNumber}`];
  if (sourceLabel) {
    parts.push(sanitizeImportDisplayText(sourceLabel));
  }
  return `${parts.join(" · ")}]`;
}

export function appendImportNote(
  existingNotes: string | null | undefined,
  importNote: string
): string {
  const trimmed = existingNotes?.trim();
  if (!trimmed) {
    return importNote;
  }
  return `${trimmed}\n${importNote}`;
}

function resolveAmountAndShares(row: ImportValidatedRow): {
  amount: number;
  teles: number;
  nicole: number;
} | null {
  const amount = parseImportAmount(mappedValue(row, "amount"));
  const teles = parseImportAmount(mappedValue(row, "telesShare"));
  const nicole = parseImportAmount(mappedValue(row, "nicoleShare"));

  if (amount !== null && teles !== null && nicole !== null) {
    return { amount, teles, nicole };
  }

  if (amount !== null) {
    const split = split5149(amount);
    if (teles !== null) {
      return { amount, teles, nicole: amount - teles };
    }
    if (nicole !== null) {
      return { amount, teles: amount - nicole, nicole };
    }
    return { amount, teles: split.teles, nicole: split.nicole };
  }

  if (teles !== null && nicole !== null) {
    return { amount: teles + nicole, teles, nicole };
  }

  return null;
}

function resolveYearMonthPeriod(row: ImportValidatedRow): {
  year: number;
  month: number;
  period: PeriodBucket;
  dueDate: string | null;
} | null {
  const dueDateParsed = parseImportDate(mappedValue(row, "dueDate"));
  const monthParsed = parseImportMonth(mappedValue(row, "month"));
  const period = normalizeImportPeriod(mappedValue(row, "period"));

  if (dueDateParsed) {
    const year = dueDateParsed.getUTCFullYear();
    const month = dueDateParsed.getUTCMonth() + 1;
    const day = dueDateParsed.getUTCDate();
    const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const resolvedPeriod = period ?? (day <= 14 ? "1_14" : "15_eom");
    return { year, month, period: resolvedPeriod, dueDate };
  }

  if (monthParsed && period) {
    return {
      year: monthParsed.year,
      month: monthParsed.month,
      period,
      dueDate: null,
    };
  }

  return null;
}

function findDebtAccountId(
  name: string,
  accounts: ImportApplyContext["existingDebtAccounts"]
): string | undefined {
  const normalized = normalizeName(name);
  const matches = accounts.filter((account) => normalizeName(account.name) === normalized);
  return matches.length === 1 ? matches[0]!.id : undefined;
}

function findSavingsGoalId(
  row: ImportValidatedRow,
  goals: ImportApplyContext["savingsGoals"]
): { goalId?: string; reason?: string } {
  const category = mappedScalar(row, "category");
  const name = mappedScalar(row, "name");
  const candidates = [category, name].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = normalizeName(candidate);
    const matches = goals.filter((goal) => normalizeName(goal.name) === normalized);
    if (matches.length === 1) {
      return { goalId: matches[0]!.id };
    }
    if (matches.length > 1) {
      return { reason: "Multiple savings goals match this row. Skipped." };
    }
  }

  return { reason: "No matching savings goal found. Skipped." };
}

function isDuplicateBillTemplate(name: string, context: ImportApplyContext): boolean {
  const normalized = normalizeName(name);
  return context.existingBillTemplates.some(
    (template) => normalizeName(template.name) === normalized
  );
}

function isDuplicateBillInstance(
  input: {
    name: string;
    year: number;
    month: number;
    period: PeriodBucket;
  },
  context: ImportApplyContext
): boolean {
  const normalized = normalizeName(input.name);
  return context.existingBillInstances.some(
    (instance) =>
      normalizeName(instance.name) === normalized &&
      instance.year === input.year &&
      instance.month === input.month &&
      instance.period_bucket === input.period
  );
}

function isDuplicateManualExpense(
  input: { description: string; expenseDate: string; amount: number },
  context: ImportApplyContext
): boolean {
  const normalized = normalizeName(input.description);
  return context.existingManualExpenses.some(
    (expense) =>
      normalizeName(expense.description) === normalized &&
      expense.expense_date.slice(0, 10) === input.expenseDate &&
      Math.abs(expense.amount - input.amount) < 0.01
  );
}

function isDuplicateDebtPayment(
  input: { debtAccountId: string; paymentDate: string; amount: number },
  context: ImportApplyContext
): boolean {
  return context.existingDebtPayments.some(
    (payment) =>
      payment.debt_account_id === input.debtAccountId &&
      payment.payment_date.slice(0, 10) === input.paymentDate &&
      Math.abs(payment.total_payment - input.amount) < 0.01
  );
}

function isDuplicateSavingsContribution(
  input: { savingsGoalId: string; contributionDate: string; amount: number },
  context: ImportApplyContext
): boolean {
  return context.existingSavingsContributions.some(
    (contribution) =>
      contribution.savings_goal_id === input.savingsGoalId &&
      (contribution.contribution_date?.slice(0, 10) ?? "") === input.contributionDate &&
      Math.abs(contribution.amount - input.amount) < 0.01
  );
}

function buildBillTemplatePlan(
  row: ImportValidatedRow,
  householdId: string,
  fileName: string,
  context: ImportApplyContext
): ImportRowCreatePlan | ImportRowExcluded {
  const name = mappedScalar(row, "name");
  if (!name) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Bill template rows need a name.",
    };
  }

  if (isDuplicateBillTemplate(name, context)) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Possible duplicate bill template skipped.",
    };
  }

  const amounts = resolveAmountAndShares(row);
  const timing = resolveYearMonthPeriod(row);
  if (!amounts || !timing) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Bill template rows need amount and date context.",
    };
  }

  const dueDay =
    timing.dueDate !== null
      ? String(Number(timing.dueDate.slice(8, 10)))
      : "1";
  const importNote = buildImportSourceNote(
    fileName,
    row.rowNumber,
    mappedScalar(row, "sourceLabel")
  );

  const payload: InsertTables<"bills"> = {
    household_id: householdId,
    name,
    category: mappedScalar(row, "category") ?? "",
    default_amount: amounts.amount,
    due_day: dueDay,
    period_bucket: timing.period,
    recurring: true,
    active_from: timing.dueDate ?? `${timing.year}-${String(timing.month).padStart(2, "0")}-01`,
    active_until: null,
    notes: appendImportNote(mappedScalar(row, "notes"), importNote),
    is_variable: isTruthyMarker(mappedValue(row, "variableMarker")),
    is_active: true,
  };

  return {
    rowId: row.rowId,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    rowType: row.rowType,
    kind: "bill_template",
    hasWarning: row.status === "warning",
    billTemplate: payload,
    batchRecordPlans: [
      {
        sourceSheetName: row.sheetName,
        sourceRowNumber: row.rowNumber,
        rowType: row.rowType,
        targetTable: "bills",
        targetIdPlaceholder: "bill_template",
      },
    ],
  };
}

function buildBillInstancePlan(
  row: ImportValidatedRow,
  householdId: string,
  fileName: string,
  context: ImportApplyContext
): ImportRowCreatePlan | ImportRowExcluded {
  const name = mappedScalar(row, "name");
  if (!name) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Bill rows need a name.",
    };
  }

  const amounts = resolveAmountAndShares(row);
  const timing = resolveYearMonthPeriod(row);
  if (!amounts || !timing) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Bill rows need amount and date context.",
    };
  }

  if (
    isDuplicateBillInstance(
      { name, year: timing.year, month: timing.month, period: timing.period },
      context
    )
  ) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Possible duplicate bill instance skipped.",
    };
  }

  const importNote = buildImportSourceNote(
    fileName,
    row.rowNumber,
    mappedScalar(row, "sourceLabel")
  );

  const payload: InsertTables<"bill_instances"> = {
    household_id: householdId,
    bill_id: null,
    year: timing.year,
    month: timing.month,
    period_bucket: timing.period,
    name,
    amount: amounts.amount,
    teles_amount: amounts.teles,
    nicole_amount: amounts.nicole,
    due_date: timing.dueDate,
    is_paid: false,
    paid_status: "unpaid",
    notes: appendImportNote(mappedScalar(row, "notes"), importNote),
  };

  return {
    rowId: row.rowId,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    rowType: row.rowType,
    kind: "bill_instance",
    hasWarning: row.status === "warning",
    billInstance: payload,
    batchRecordPlans: [
      {
        sourceSheetName: row.sheetName,
        sourceRowNumber: row.rowNumber,
        rowType: row.rowType,
        targetTable: "bill_instances",
        targetIdPlaceholder: "bill_instance",
      },
    ],
  };
}

function buildDebtPlan(
  row: ImportValidatedRow,
  householdId: string,
  fileName: string,
  context: ImportApplyContext
): ImportRowCreatePlan | ImportRowExcluded {
  const debtAccountName = mappedScalar(row, "name");
  if (!debtAccountName) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Debt rows need an account name.",
    };
  }

  const amounts = resolveAmountAndShares(row);
  const timing = resolveYearMonthPeriod(row);
  if (!amounts || !timing || !timing.dueDate) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Debt rows need amount and a due date.",
    };
  }

  const existingAccountId = findDebtAccountId(debtAccountName, context.existingDebtAccounts);
  if (
    existingAccountId &&
    isDuplicateDebtPayment(
      {
        debtAccountId: existingAccountId,
        paymentDate: timing.dueDate,
        amount: amounts.amount,
      },
      context
    )
  ) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Possible duplicate debt payment skipped.",
    };
  }

  const importNote = buildImportSourceNote(
    fileName,
    row.rowNumber,
    mappedScalar(row, "sourceLabel")
  );

  const billPayload: InsertTables<"bill_instances"> = {
    household_id: householdId,
    bill_id: null,
    year: timing.year,
    month: timing.month,
    period_bucket: "1_14",
    name: debtBillInstanceName(debtAccountName),
    amount: amounts.amount,
    teles_amount: amounts.teles,
    nicole_amount: amounts.nicole,
    due_date: null,
    is_paid: false,
    paid_status: "unpaid",
    notes: importNote,
  };

  const paymentPayload: Omit<
    InsertTables<"debt_payments">,
    "linked_bill_instance_id" | "debt_account_id"
  > = {
    household_id: householdId,
    payment_date: timing.dueDate,
    month: timing.month,
    year: timing.year,
    period_bucket: "1_14",
    total_payment: amounts.amount,
    teles_amount: amounts.teles,
    nicole_amount: amounts.nicole,
    remaining_balance_after_payment: null,
    paid_status: false,
  };

  return {
    rowId: row.rowId,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    rowType: row.rowType,
    kind: "debt_payment_with_bill",
    hasWarning: row.status === "warning",
    debtPaymentWithBill: {
      debtAccountName,
      debtAccountId: existingAccountId,
      createDebtAccount: existingAccountId
        ? undefined
        : {
            name: debtAccountName,
            original_amount: amounts.amount,
            current_balance: amounts.amount,
            notes: appendImportNote(mappedScalar(row, "notes"), importNote),
          },
      bill: billPayload,
      payment: paymentPayload,
    },
    batchRecordPlans: [
      {
        sourceSheetName: row.sheetName,
        sourceRowNumber: row.rowNumber,
        rowType: row.rowType,
        targetTable: "bill_instances",
        targetIdPlaceholder: "debt_bill_instance",
      },
      {
        sourceSheetName: row.sheetName,
        sourceRowNumber: row.rowNumber,
        rowType: row.rowType,
        targetTable: "debt_payments",
        targetIdPlaceholder: "debt_payment",
      },
    ],
  };
}

function buildExpensePlan(
  row: ImportValidatedRow,
  householdId: string,
  userId: string,
  personId: string | null,
  fileName: string,
  context: ImportApplyContext
): ImportRowCreatePlan | ImportRowExcluded {
  const description = mappedScalar(row, "name");
  const amounts = resolveAmountAndShares(row);
  const timing = resolveYearMonthPeriod(row);

  if (!description || !amounts || !timing?.dueDate) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Expense rows need description, amount, and due date.",
    };
  }

  if (
    isDuplicateManualExpense(
      { description, expenseDate: timing.dueDate, amount: amounts.amount },
      context
    )
  ) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Possible duplicate expense skipped.",
    };
  }

  const importNote = buildImportSourceNote(
    fileName,
    row.rowNumber,
    mappedScalar(row, "sourceLabel")
  );
  const day = Number(timing.dueDate.slice(8, 10));
  const periodBucket: PeriodBucket = day <= 14 ? "1_14" : "15_eom";

  const payload: InsertTables<"manual_expenses"> = {
    household_id: householdId,
    created_by_user_id: userId,
    person_id: personId,
    expense_scope: "shared",
    description,
    category: mappedScalar(row, "category"),
    amount: amounts.amount,
    expense_date: timing.dueDate,
    period_bucket: periodBucket,
    split_type: "51_49",
    teles_amount: amounts.teles,
    nicole_amount: amounts.nicole,
    is_paid: false,
    notes: appendImportNote(mappedScalar(row, "notes"), importNote),
  };

  return {
    rowId: row.rowId,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    rowType: row.rowType,
    kind: "manual_expense",
    hasWarning: row.status === "warning",
    manualExpense: payload,
    batchRecordPlans: [
      {
        sourceSheetName: row.sheetName,
        sourceRowNumber: row.rowNumber,
        rowType: row.rowType,
        targetTable: "manual_expenses",
        targetIdPlaceholder: "manual_expense",
      },
    ],
  };
}

function buildSavingsPlan(
  row: ImportValidatedRow,
  fileName: string,
  context: ImportApplyContext
): ImportRowCreatePlan | ImportRowExcluded {
  const amounts = resolveAmountAndShares(row);
  const timing = resolveYearMonthPeriod(row);
  const goalMatch = findSavingsGoalId(row, context.savingsGoals);

  if (!amounts || !timing?.dueDate) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Savings rows need amount and contribution date.",
    };
  }

  if (!goalMatch.goalId) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: goalMatch.reason ?? "Savings goal could not be matched.",
    };
  }

  if (
    isDuplicateSavingsContribution(
      {
        savingsGoalId: goalMatch.goalId,
        contributionDate: timing.dueDate,
        amount: amounts.amount,
      },
      context
    )
  ) {
    return {
      rowId: row.rowId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowType: row.rowType,
      reason: "Possible duplicate savings contribution skipped.",
    };
  }

  const importNote = buildImportSourceNote(
    fileName,
    row.rowNumber,
    mappedScalar(row, "sourceLabel")
  );

  return {
    rowId: row.rowId,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    rowType: row.rowType,
    kind: "savings_contribution",
    hasWarning: row.status === "warning",
    savingsContribution: {
      savingsGoalId: goalMatch.goalId,
      amount: amounts.amount,
      contributionDate: timing.dueDate,
      notes: appendImportNote(mappedScalar(row, "notes"), importNote),
    },
    batchRecordPlans: [
      {
        sourceSheetName: row.sheetName,
        sourceRowNumber: row.rowNumber,
        rowType: row.rowType,
        targetTable: "savings_contributions",
        targetIdPlaceholder: "savings_contribution",
      },
    ],
  };
}

export function buildImportCreatePlans(input: {
  rows: ImportValidatedRow[];
  householdId: string;
  userId: string;
  personId: string | null;
  fileName: string;
  context: ImportApplyContext;
}): ImportCreatePlanBuildResult {
  const plans: ImportRowCreatePlan[] = [];
  const excluded: ImportRowExcluded[] = [];
  const skipped: ImportRowExcluded[] = [];

  for (const row of input.rows) {
    if (!isRowWritable(row)) {
      excluded.push({
        rowId: row.rowId,
        sheetName: row.sheetName,
        rowNumber: row.rowNumber,
        rowType: row.rowType,
        reason:
          row.status === "skipped"
            ? "Empty row skipped."
            : row.status === "error"
              ? "Row has validation errors."
              : "Row type is not importable.",
      });
      continue;
    }

    let outcome: ImportRowCreatePlan | ImportRowExcluded;
    if (row.rowType === "bill") {
      if (isTruthyMarker(mappedValue(row, "recurringMarker"))) {
        outcome = buildBillTemplatePlan(row, input.householdId, input.fileName, input.context);
      } else {
        outcome = buildBillInstancePlan(row, input.householdId, input.fileName, input.context);
      }
    } else if (row.rowType === "debt") {
      outcome = buildDebtPlan(row, input.householdId, input.fileName, input.context);
    } else if (row.rowType === "expense") {
      outcome = buildExpensePlan(
        row,
        input.householdId,
        input.userId,
        input.personId,
        input.fileName,
        input.context
      );
    } else if (row.rowType === "savings") {
      outcome = buildSavingsPlan(row, input.fileName, input.context);
    } else {
      outcome = {
        rowId: row.rowId,
        sheetName: row.sheetName,
        rowNumber: row.rowNumber,
        rowType: row.rowType,
        reason: "Row type is not importable.",
      };
    }

    if ("reason" in outcome) {
      skipped.push(outcome);
      continue;
    }

    plans.push(outcome);
  }

  return { plans, excluded, skipped };
}

function emptyKindCounts(): Record<ImportCreatePlanKind, number> {
  return {
    bill_template: 0,
    bill_instance: 0,
    debt_payment_with_bill: 0,
    manual_expense: 0,
    savings_contribution: 0,
  };
}

export function buildImportConfirmationSummary(input: {
  fileName: string;
  sheetName: string;
  sheetCount: number;
  validationRows: ImportValidatedRow[];
  planBuild: ImportCreatePlanBuildResult;
}): ImportConfirmationSummary {
  const countsByKind = emptyKindCounts();
  for (const plan of input.planBuild.plans) {
    countsByKind[plan.kind] += 1;
  }

  const countsByRowType: ImportConfirmationSummary["countsByRowType"] = {
    bill: 0,
    debt: 0,
    expense: 0,
    savings: 0,
  };
  for (const plan of input.planBuild.plans) {
    if (plan.rowType in countsByRowType) {
      countsByRowType[plan.rowType as keyof typeof countsByRowType] += 1;
    }
  }

  const errorRows = input.validationRows.filter((row) => row.status === "error").length;
  const warningRows = input.planBuild.plans.filter((plan) => plan.hasWarning).length;
  const skippedRows =
    input.planBuild.skipped.length +
    input.planBuild.excluded.length +
    input.validationRows.filter((row) => row.status === "skipped").length;

  return {
    fileName: sanitizeImportDisplayText(input.fileName),
    sheetSummary:
      input.sheetCount > 1
        ? `${input.sheetName} (selected sheet)`
        : input.sheetName,
    rowsToCreate: input.planBuild.plans.length,
    skippedRows,
    warningRows,
    errorRows,
    countsByKind,
    countsByRowType,
    noRecordsChangedYet: true,
  };
}

export function emptyImportApplyResultCounts(): ImportApplyResultCounts {
  return {
    billTemplates: 0,
    billInstances: 0,
    debtPayments: 0,
    linkedDebtBills: 0,
    manualExpenses: 0,
    savingsContributions: 0,
    skipped: 0,
    failed: 0,
  };
}

export function buildImportApplyResultSummary(input: {
  counts: ImportApplyResultCounts;
  importBatchId: string | null;
  developerDetails?: string[];
}): ImportApplyResultSummary {
  const createdTotal =
    input.counts.billTemplates +
    input.counts.billInstances +
    input.counts.debtPayments +
    input.counts.manualExpenses +
    input.counts.savingsContributions;
  const partial = input.counts.failed > 0 && createdTotal > 0;
  const success = input.counts.failed === 0 && createdTotal > 0;
  const allFailed = input.counts.failed > 0 && createdTotal === 0;

  let userMessage = IMPORT_APPLIED_COPY;
  if (allFailed) {
    userMessage = "Import could not be completed.";
  } else if (partial) {
    userMessage = "Import partially applied. Some rows could not be created.";
  } else if (createdTotal === 0 && input.counts.skipped > 0) {
    userMessage = "No new records were created. Rows were skipped.";
  }

  return {
    success,
    partial,
    counts: input.counts,
    importBatchId: input.importBatchId,
    userMessage,
    developerDetails: input.developerDetails ?? [],
  };
}

export function planProducesCashDeduction(_plan: ImportRowCreatePlan): boolean {
  return false;
}

export function userFacingImportBatchLabel(_importBatchId: string | null): string | null {
  return null;
}
