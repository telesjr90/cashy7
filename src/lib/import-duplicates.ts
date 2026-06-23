import type {
  ImportCreatePlanKind,
  ImportRowCreatePlan,
  ImportRowExcluded,
} from "@/lib/import-apply";
import type { ImportValidatedRowType } from "@/lib/import-validation";
import { sanitizeImportDisplayText } from "@/lib/import-validation";
import type { PeriodBucket } from "@/lib/periods";
import type { InsertTables, UpdateTables } from "@/lib/types";

export type ImportDuplicateStrategy =
  | "create_new_only"
  | "update_matching"
  | "replace_selected_month";

export type DuplicateMatchStatus =
  | "no_match"
  | "exact_match"
  | "possible_match"
  | "ambiguous_match"
  | "protected_match";

export type ImportStrategyAction =
  | "create"
  | "update"
  | "skip"
  | "replace_delete";

export type ExistingBillTemplate = {
  id: string;
  name: string;
  period_bucket: PeriodBucket;
  due_day: string | null;
  category: string;
  default_amount: number | null;
  notes: string | null;
  is_active: boolean;
};

export type ExistingBillInstance = {
  id: string;
  name: string;
  year: number;
  month: number;
  period_bucket: PeriodBucket;
  due_date: string | null;
  amount: number;
  teles_amount: number;
  nicole_amount: number;
  is_paid: boolean;
  paid_status: "unpaid" | "paid";
  notes: string | null;
  bill_id: string | null;
};

export type ExistingDebtAccount = {
  id: string;
  name: string;
  is_archived: boolean;
};

export type ExistingDebtPayment = {
  id: string;
  debt_account_id: string;
  debt_account_name: string;
  payment_date: string;
  total_payment: number;
  paid_status: boolean;
  linked_bill_instance_id: string | null;
};

export type ExistingManualExpense = {
  id: string;
  description: string;
  expense_date: string;
  amount: number;
  category: string | null;
  is_paid: boolean;
  notes: string | null;
  created_by_user_id: string;
};

export type ExistingSavingsContribution = {
  id: string;
  savings_goal_id: string;
  savings_goal_name: string;
  contribution_date: string | null;
  amount: number;
  notes: string | null;
  user_id: string;
};

export type ImportBatchTrackedRecord = {
  target_table: string;
  target_id: string;
  import_batch_id: string;
  year: number | null;
  month: number | null;
};

export type ImportDuplicateContext = {
  existingBillTemplates: ExistingBillTemplate[];
  existingBillInstances: ExistingBillInstance[];
  existingDebtAccounts: ExistingDebtAccount[];
  existingDebtPayments: ExistingDebtPayment[];
  existingManualExpenses: ExistingManualExpense[];
  existingSavingsContributions: ExistingSavingsContribution[];
  savingsGoals: { id: string; name: string }[];
  protection: ImportProtectionContext;
  importedRecords: ImportBatchTrackedRecord[];
};

export type ImportProtectionContext = {
  cashDeductedBillIds: ReadonlySet<string>;
  cashDeductedDebtPaymentIds: ReadonlySet<string>;
  cashDeductedExpenseIds: ReadonlySet<string>;
  debtLinkedBillIds: ReadonlySet<string>;
};

export type DuplicateMatchResult = {
  status: DuplicateMatchStatus;
  targetTable: string | null;
  targetId: string | null;
  label: string;
  reason: string | null;
};

export type ImportRowUpdatePlan = {
  rowId: string;
  sheetName: string;
  rowNumber: number;
  rowType: ImportValidatedRowType;
  kind: ImportCreatePlanKind;
  targetTable: string;
  targetId: string;
  label: string;
  updates:
    | { table: "bills"; payload: UpdateTables<"bills"> }
    | { table: "bill_instances"; payload: UpdateTables<"bill_instances"> }
    | { table: "manual_expenses"; payload: UpdateTables<"manual_expenses"> }
    | { table: "debt_payments"; payload: UpdateTables<"debt_payments"> }
    | { table: "savings_contributions"; payload: UpdateTables<"savings_contributions"> };
  batchRecordPlans: {
    sourceSheetName: string;
    sourceRowNumber: number;
    rowType: ImportValidatedRowType;
    targetTable: string;
    action: "updated";
  }[];
};

export type ImportReplaceDeletePlan = {
  targetTable: string;
  targetId: string;
  label: string;
  reason: string;
  year: number | null;
  month: number | null;
  importBatchId: string | null;
};

export type ImportStrategyPlanItem =
  | {
      action: "create";
      rowId: string;
      sheetName: string;
      rowNumber: number;
      rowType: ImportValidatedRowType;
      kind: ImportCreatePlanKind;
      label: string;
      createPlan: ImportRowCreatePlan;
      match: DuplicateMatchResult;
    }
  | {
      action: "update";
      rowId: string;
      sheetName: string;
      rowNumber: number;
      rowType: ImportValidatedRowType;
      kind: ImportCreatePlanKind;
      label: string;
      updatePlan: ImportRowUpdatePlan;
      match: DuplicateMatchResult;
    }
  | {
      action: "skip";
      rowId: string;
      sheetName: string;
      rowNumber: number;
      rowType: ImportValidatedRowType;
      label: string;
      reason: string;
      match: DuplicateMatchResult;
    };

export type ImportStrategyPlanSummary = {
  toCreate: number;
  toUpdate: number;
  toSkipDuplicate: number;
  toSkipProtected: number;
  toSkipAmbiguous: number;
  toReplaceDelete: number;
  validationExcluded: number;
};

export type ImportStrategyPlan = {
  strategy: ImportDuplicateStrategy;
  scopeYear: number | null;
  scopeMonth: number | null;
  items: ImportStrategyPlanItem[];
  replaceDeletes: ImportReplaceDeletePlan[];
  summary: ImportStrategyPlanSummary;
  skippedFromBuild: ImportRowExcluded[];
  excludedFromBuild: ImportRowExcluded[];
};

export const IMPORT_STRATEGY_LABELS: Record<ImportDuplicateStrategy, string> = {
  create_new_only: "Create new only",
  update_matching: "Update matching",
  replace_selected_month: "Replace selected month",
};

export const IMPORT_STRATEGY_DESCRIPTIONS: Record<ImportDuplicateStrategy, string> = {
  create_new_only:
    "Safest option. Existing exact matches are skipped. Only new non-matching rows are created.",
  update_matching:
    "Updates safe exact matches only. Paid, cash-deducted, and ambiguous rows are skipped.",
  replace_selected_month:
    "Replaces previously imported records in the selected month after confirmation. Protected records are preserved.",
};

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function normalizeMatchKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function userFacingRecordLabel(parts: string[]): string {
  const label = parts
    .map((part) => sanitizeImportDisplayText(part))
    .filter(
      (part) =>
        part.length > 0 &&
        !UUID_PATTERN.test(part) &&
        part !== "(hidden id)"
    )
    .join(" · ");
  if (!label || UUID_PATTERN.test(label)) {
    return "Existing record";
  }
  return label;
}

export function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

export function datesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return a.slice(0, 10) === b.slice(0, 10);
}

function emptySummary(): ImportStrategyPlanSummary {
  return {
    toCreate: 0,
    toUpdate: 0,
    toSkipDuplicate: 0,
    toSkipProtected: 0,
    toSkipAmbiguous: 0,
    toReplaceDelete: 0,
    validationExcluded: 0,
  };
}

function noMatch(label: string): DuplicateMatchResult {
  return {
    status: "no_match",
    targetTable: null,
    targetId: null,
    label,
    reason: null,
  };
}

function matchResult(input: {
  status: DuplicateMatchStatus;
  targetTable: string | null;
  targetId: string | null;
  label: string;
  reason: string | null;
}): DuplicateMatchResult {
  return {
    status: input.status,
    targetTable: input.targetTable,
    targetId: input.targetId,
    label: input.label,
    reason: input.reason,
  };
}

export function isBillInstanceProtected(
  instance: ExistingBillInstance,
  protection: ImportProtectionContext
): string | null {
  if (instance.is_paid || instance.paid_status === "paid") {
    return "Paid bill is protected from import changes.";
  }
  if (protection.cashDeductedBillIds.has(instance.id)) {
    return "Cash-deducted bill is protected from import changes.";
  }
  if (protection.debtLinkedBillIds.has(instance.id)) {
    return "Debt-linked bill is protected from import changes.";
  }
  return null;
}

export function isBillTemplateProtected(template: ExistingBillTemplate): string | null {
  if (!template.is_active) {
    return "Inactive bill template is protected from import changes.";
  }
  return null;
}

export function isDebtPaymentProtected(
  payment: ExistingDebtPayment,
  protection: ImportProtectionContext
): string | null {
  if (payment.paid_status) {
    return "Paid debt payment is protected from import changes.";
  }
  if (protection.cashDeductedDebtPaymentIds.has(payment.id)) {
    return "Cash-deducted debt payment is protected from import changes.";
  }
  return null;
}

export function isManualExpenseProtected(
  expense: ExistingManualExpense,
  protection: ImportProtectionContext
): string | null {
  if (expense.is_paid) {
    return "Paid expense is protected from import changes.";
  }
  if (protection.cashDeductedExpenseIds.has(expense.id)) {
    return "Cash-deducted expense is protected from import changes.";
  }
  return null;
}

export function classifyBillTemplateMatch(
  plan: ImportRowCreatePlan,
  context: ImportDuplicateContext
): DuplicateMatchResult {
  const payload = plan.billTemplate;
  if (!payload) {
    return noMatch("Bill template");
  }

  const normalizedName = normalizeMatchKey(payload.name);
  const exact = context.existingBillTemplates.filter(
    (template) =>
      normalizeMatchKey(template.name) === normalizedName &&
      template.period_bucket === payload.period_bucket &&
      (template.due_day ?? "1") === (payload.due_day ?? "1")
  );

  if (exact.length === 1) {
    const template = exact[0]!;
    const protection = isBillTemplateProtected(template);
    if (protection) {
      return matchResult({
        status: "protected_match",
        targetTable: "bills",
        targetId: template.id,
        label: userFacingRecordLabel([template.name, template.category]),
        reason: protection,
      });
    }
    return matchResult({
      status: "exact_match",
      targetTable: "bills",
      targetId: template.id,
      label: userFacingRecordLabel([template.name, template.category]),
      reason: null,
    });
  }

  const possible = context.existingBillTemplates.filter(
    (template) => normalizeMatchKey(template.name) === normalizedName
  );
  if (possible.length === 1) {
    return matchResult({
      status: "possible_match",
      targetTable: "bills",
      targetId: possible[0]!.id,
      label: userFacingRecordLabel([possible[0]!.name]),
      reason: "Possible duplicate bill template. Skipped because match is not exact.",
    });
  }
  if (possible.length > 1) {
    return matchResult({
      status: "ambiguous_match",
      targetTable: "bills",
      targetId: null,
      label: userFacingRecordLabel([payload.name]),
      reason: "Multiple bill templates match this row. Skipped for safety.",
    });
  }

  return noMatch(userFacingRecordLabel([payload.name]));
}

export function classifyBillInstanceMatch(
  plan: ImportRowCreatePlan,
  context: ImportDuplicateContext
): DuplicateMatchResult {
  const payload = plan.billInstance;
  if (!payload) {
    return noMatch("Bill instance");
  }

  const normalizedName = normalizeMatchKey(payload.name);
  const exact = context.existingBillInstances.filter(
    (instance) =>
      normalizeMatchKey(instance.name) === normalizedName &&
      instance.year === payload.year &&
      instance.month === payload.month &&
      instance.period_bucket === payload.period_bucket &&
      (!payload.due_date ||
        !instance.due_date ||
        datesMatch(instance.due_date, payload.due_date))
  );

  if (exact.length === 1) {
    const instance = exact[0]!;
    const protection = isBillInstanceProtected(instance, context.protection);
    if (protection) {
      return matchResult({
        status: "protected_match",
        targetTable: "bill_instances",
        targetId: instance.id,
        label: userFacingRecordLabel([
          instance.name,
          `${instance.month}/${instance.year}`,
          instance.period_bucket,
        ]),
        reason: protection,
      });
    }
    return matchResult({
      status: "exact_match",
      targetTable: "bill_instances",
      targetId: instance.id,
      label: userFacingRecordLabel([
        instance.name,
        `${instance.month}/${instance.year}`,
        instance.period_bucket,
      ]),
      reason: null,
    });
  }

  const possible = context.existingBillInstances.filter(
    (instance) =>
      normalizeMatchKey(instance.name) === normalizedName &&
      instance.year === payload.year &&
      instance.month === payload.month
  );
  if (possible.length === 1) {
    return matchResult({
      status: "possible_match",
      targetTable: "bill_instances",
      targetId: possible[0]!.id,
      label: userFacingRecordLabel([possible[0]!.name, `${possible[0]!.month}/${possible[0]!.year}`]),
      reason: "Possible duplicate bill. Skipped because match is not exact.",
    });
  }
  if (possible.length > 1) {
    return matchResult({
      status: "ambiguous_match",
      targetTable: "bill_instances",
      targetId: null,
      label: userFacingRecordLabel([payload.name]),
      reason: "Multiple bills match this row. Skipped for safety.",
    });
  }

  return noMatch(userFacingRecordLabel([payload.name]));
}

export function classifyDebtPaymentMatch(
  plan: ImportRowCreatePlan,
  context: ImportDuplicateContext
): DuplicateMatchResult {
  const debtPlan = plan.debtPaymentWithBill;
  if (!debtPlan) {
    return noMatch("Debt payment");
  }

  const accountName = normalizeMatchKey(debtPlan.debtAccountName);
  const paymentDate = debtPlan.payment.payment_date;
  const amount = debtPlan.payment.total_payment ?? 0;

  const accountMatches = context.existingDebtAccounts.filter(
    (account) => normalizeMatchKey(account.name) === accountName
  );
  if (accountMatches.length > 1) {
    return matchResult({
      status: "ambiguous_match",
      targetTable: "debt_payments",
      targetId: null,
      label: userFacingRecordLabel([debtPlan.debtAccountName]),
      reason: "Multiple debt accounts match this row. Skipped for safety.",
    });
  }

  const account = accountMatches[0];
  if (!account) {
    return noMatch(userFacingRecordLabel([debtPlan.debtAccountName]));
  }
  if (account.is_archived) {
    return matchResult({
      status: "protected_match",
      targetTable: "debt_accounts",
      targetId: account.id,
      label: userFacingRecordLabel([account.name]),
      reason: "Archived debt account is protected from import changes.",
    });
  }

  const exact = context.existingDebtPayments.filter(
    (payment) =>
      payment.debt_account_id === account.id &&
      datesMatch(payment.payment_date, paymentDate) &&
      amountsClose(payment.total_payment, amount)
  );

  if (exact.length === 1) {
    const payment = exact[0]!;
    const protection = isDebtPaymentProtected(payment, context.protection);
    if (protection) {
      return matchResult({
        status: "protected_match",
        targetTable: "debt_payments",
        targetId: payment.id,
        label: userFacingRecordLabel([
          payment.debt_account_name,
          payment.payment_date.slice(0, 10),
        ]),
        reason: protection,
      });
    }
    return matchResult({
      status: "exact_match",
      targetTable: "debt_payments",
      targetId: payment.id,
      label: userFacingRecordLabel([
        payment.debt_account_name,
        payment.payment_date.slice(0, 10),
      ]),
      reason: null,
    });
  }

  const possible = context.existingDebtPayments.filter(
    (payment) =>
      payment.debt_account_id === account.id && datesMatch(payment.payment_date, paymentDate)
  );
  if (possible.length === 1) {
    return matchResult({
      status: "possible_match",
      targetTable: "debt_payments",
      targetId: possible[0]!.id,
      label: userFacingRecordLabel([account.name, paymentDate]),
      reason: "Possible duplicate debt payment. Skipped because match is not exact.",
    });
  }
  if (possible.length > 1) {
    return matchResult({
      status: "ambiguous_match",
      targetTable: "debt_payments",
      targetId: null,
      label: userFacingRecordLabel([debtPlan.debtAccountName]),
      reason: "Multiple debt payments match this row. Skipped for safety.",
    });
  }

  return noMatch(userFacingRecordLabel([debtPlan.debtAccountName, paymentDate]));
}

export function classifyManualExpenseMatch(
  plan: ImportRowCreatePlan,
  context: ImportDuplicateContext
): DuplicateMatchResult {
  const payload = plan.manualExpense;
  if (!payload) {
    return noMatch("Expense");
  }

  const normalizedDescription = normalizeMatchKey(payload.description);
  const exact = context.existingManualExpenses.filter(
    (expense) =>
      normalizeMatchKey(expense.description) === normalizedDescription &&
      datesMatch(expense.expense_date, payload.expense_date) &&
      amountsClose(expense.amount, payload.amount) &&
      (!payload.category ||
        !expense.category ||
        normalizeMatchKey(expense.category) === normalizeMatchKey(payload.category))
  );

  if (exact.length === 1) {
    const expense = exact[0]!;
    const protection = isManualExpenseProtected(expense, context.protection);
    if (protection) {
      return matchResult({
        status: "protected_match",
        targetTable: "manual_expenses",
        targetId: expense.id,
        label: userFacingRecordLabel([
          expense.description,
          expense.expense_date.slice(0, 10),
        ]),
        reason: protection,
      });
    }
    return matchResult({
      status: "exact_match",
      targetTable: "manual_expenses",
      targetId: expense.id,
      label: userFacingRecordLabel([
        expense.description,
        expense.expense_date.slice(0, 10),
      ]),
      reason: null,
    });
  }

  const possible = context.existingManualExpenses.filter(
    (expense) =>
      normalizeMatchKey(expense.description) === normalizedDescription &&
      datesMatch(expense.expense_date, payload.expense_date)
  );
  if (possible.length === 1) {
    return matchResult({
      status: "possible_match",
      targetTable: "manual_expenses",
      targetId: possible[0]!.id,
      label: userFacingRecordLabel([possible[0]!.description]),
      reason: "Possible duplicate expense. Skipped because match is not exact.",
    });
  }
  if (possible.length > 1) {
    return matchResult({
      status: "ambiguous_match",
      targetTable: "manual_expenses",
      targetId: null,
      label: userFacingRecordLabel([payload.description]),
      reason: "Multiple expenses match this row. Skipped for safety.",
    });
  }

  return noMatch(
    userFacingRecordLabel([payload.description, payload.expense_date ?? ""])
  );
}

export function classifySavingsContributionMatch(
  plan: ImportRowCreatePlan,
  context: ImportDuplicateContext,
  userId: string
): DuplicateMatchResult {
  const payload = plan.savingsContribution;
  if (!payload) {
    return noMatch("Savings contribution");
  }

  const goal = context.savingsGoals.find((item) => item.id === payload.savingsGoalId);
  const goalName = goal?.name ?? "Savings goal";

  const exact = context.existingSavingsContributions.filter(
    (contribution) =>
      contribution.user_id === userId &&
      contribution.savings_goal_id === payload.savingsGoalId &&
      datesMatch(contribution.contribution_date, payload.contributionDate) &&
      amountsClose(contribution.amount, payload.amount)
  );

  if (exact.length === 1) {
    return matchResult({
      status: "exact_match",
      targetTable: "savings_contributions",
      targetId: exact[0]!.id,
      label: userFacingRecordLabel([goalName, payload.contributionDate]),
      reason: null,
    });
  }

  const possible = context.existingSavingsContributions.filter(
    (contribution) =>
      contribution.user_id === userId &&
      contribution.savings_goal_id === payload.savingsGoalId &&
      datesMatch(contribution.contribution_date, payload.contributionDate)
  );
  if (possible.length === 1) {
    return matchResult({
      status: "possible_match",
      targetTable: "savings_contributions",
      targetId: possible[0]!.id,
      label: userFacingRecordLabel([goalName, payload.contributionDate]),
      reason: "Possible duplicate savings contribution. Skipped because match is not exact.",
    });
  }
  if (possible.length > 1) {
    return matchResult({
      status: "ambiguous_match",
      targetTable: "savings_contributions",
      targetId: null,
      label: userFacingRecordLabel([goalName]),
      reason: "Multiple savings contributions match this row. Skipped for safety.",
    });
  }

  return noMatch(userFacingRecordLabel([goalName, payload.contributionDate]));
}

export function classifyCreatePlanMatch(
  plan: ImportRowCreatePlan,
  context: ImportDuplicateContext,
  userId: string
): DuplicateMatchResult {
  switch (plan.kind) {
    case "bill_template":
      return classifyBillTemplateMatch(plan, context);
    case "bill_instance":
      return classifyBillInstanceMatch(plan, context);
    case "debt_payment_with_bill":
      return classifyDebtPaymentMatch(plan, context);
    case "manual_expense":
      return classifyManualExpenseMatch(plan, context);
    case "savings_contribution":
      return classifySavingsContributionMatch(plan, context, userId);
    default:
      return noMatch(plan.kind);
  }
}

function buildUpdatePlan(
  plan: ImportRowCreatePlan,
  match: DuplicateMatchResult
): ImportRowUpdatePlan | null {
  if (!match.targetId || !match.targetTable) {
    return null;
  }

  const base = {
    rowId: plan.rowId,
    sheetName: plan.sheetName,
    rowNumber: plan.rowNumber,
    rowType: plan.rowType,
    kind: plan.kind,
    targetId: match.targetId,
    label: match.label,
    batchRecordPlans: [
      {
        sourceSheetName: plan.sheetName,
        sourceRowNumber: plan.rowNumber,
        rowType: plan.rowType,
        targetTable: match.targetTable,
        action: "updated" as const,
      },
    ],
  };

  if (plan.kind === "bill_template" && plan.billTemplate) {
    return {
      ...base,
      targetTable: "bills",
      updates: {
        table: "bills",
        payload: {
          category: plan.billTemplate.category,
          default_amount: plan.billTemplate.default_amount,
          due_day: plan.billTemplate.due_day,
          period_bucket: plan.billTemplate.period_bucket,
          notes: plan.billTemplate.notes,
        },
      },
    };
  }

  if (plan.kind === "bill_instance" && plan.billInstance) {
    return {
      ...base,
      targetTable: "bill_instances",
      updates: {
        table: "bill_instances",
        payload: {
          amount: plan.billInstance.amount,
          teles_amount: plan.billInstance.teles_amount,
          nicole_amount: plan.billInstance.nicole_amount,
          due_date: plan.billInstance.due_date,
          notes: plan.billInstance.notes,
        },
      },
    };
  }

  if (plan.kind === "manual_expense" && plan.manualExpense) {
    return {
      ...base,
      targetTable: "manual_expenses",
      updates: {
        table: "manual_expenses",
        payload: {
          description: plan.manualExpense.description,
          category: plan.manualExpense.category,
          amount: plan.manualExpense.amount,
          expense_date: plan.manualExpense.expense_date,
          teles_amount: plan.manualExpense.teles_amount,
          nicole_amount: plan.manualExpense.nicole_amount,
          notes: plan.manualExpense.notes,
        },
      },
    };
  }

  if (plan.kind === "debt_payment_with_bill" && plan.debtPaymentWithBill) {
    return {
      ...base,
      targetTable: "debt_payments",
      updates: {
        table: "debt_payments",
        payload: {
          total_payment: plan.debtPaymentWithBill.payment.total_payment,
          teles_amount: plan.debtPaymentWithBill.payment.teles_amount,
          nicole_amount: plan.debtPaymentWithBill.payment.nicole_amount,
          payment_date: plan.debtPaymentWithBill.payment.payment_date,
        },
      },
    };
  }

  if (plan.kind === "savings_contribution" && plan.savingsContribution) {
    return {
      ...base,
      targetTable: "savings_contributions",
      updates: {
        table: "savings_contributions",
        payload: {
          amount: plan.savingsContribution.amount,
          contribution_date: plan.savingsContribution.contributionDate,
          notes: plan.savingsContribution.notes,
        },
      },
    };
  }

  return null;
}

function planLabel(plan: ImportRowCreatePlan): string {
  if (plan.billTemplate) {
    return userFacingRecordLabel([
      plan.billTemplate.name,
      plan.billTemplate.category ?? "",
    ]);
  }
  if (plan.billInstance) {
    return userFacingRecordLabel([
      plan.billInstance.name,
      `${plan.billInstance.month}/${plan.billInstance.year}`,
    ]);
  }
  if (plan.debtPaymentWithBill) {
    return userFacingRecordLabel([
      plan.debtPaymentWithBill.debtAccountName,
      plan.debtPaymentWithBill.payment.payment_date,
    ]);
  }
  if (plan.manualExpense) {
    return userFacingRecordLabel([
      plan.manualExpense.description,
      plan.manualExpense.expense_date ?? "",
    ]);
  }
  if (plan.savingsContribution) {
    return userFacingRecordLabel([
      "Savings contribution",
      plan.savingsContribution.contributionDate ?? "",
    ]);
  }
  return `Row ${plan.rowNumber}`;
}

function skipItem(
  plan: ImportRowCreatePlan,
  match: DuplicateMatchResult,
  reason: string
): ImportStrategyPlanItem {
  return {
    action: "skip",
    rowId: plan.rowId,
    sheetName: plan.sheetName,
    rowNumber: plan.rowNumber,
    rowType: plan.rowType,
    label: planLabel(plan),
    reason,
    match,
  };
}

function createItem(
  plan: ImportRowCreatePlan,
  match: DuplicateMatchResult
): ImportStrategyPlanItem {
  return {
    action: "create",
    rowId: plan.rowId,
    sheetName: plan.sheetName,
    rowNumber: plan.rowNumber,
    rowType: plan.rowType,
    kind: plan.kind,
    label: planLabel(plan),
    createPlan: plan,
    match,
  };
}

function updateItem(
  plan: ImportRowCreatePlan,
  match: DuplicateMatchResult,
  updatePlan: ImportRowUpdatePlan
): ImportStrategyPlanItem {
  return {
    action: "update",
    rowId: plan.rowId,
    sheetName: plan.sheetName,
    rowNumber: plan.rowNumber,
    rowType: plan.rowType,
    kind: plan.kind,
    label: planLabel(plan),
    updatePlan,
    match,
  };
}

function resolveStrategyItem(
  plan: ImportRowCreatePlan,
  match: DuplicateMatchResult,
  strategy: ImportDuplicateStrategy
): ImportStrategyPlanItem {
  if (match.status === "no_match") {
    return createItem(plan, match);
  }

  if (match.status === "protected_match") {
    return skipItem(plan, match, match.reason ?? "Protected record skipped.");
  }

  if (match.status === "possible_match" || match.status === "ambiguous_match") {
    return skipItem(plan, match, match.reason ?? "Duplicate match skipped for safety.");
  }

  if (strategy === "create_new_only") {
    return skipItem(plan, match, "Exact duplicate skipped. Create new only keeps existing records.");
  }

  if (strategy === "update_matching") {
    const updatePlan = buildUpdatePlan(plan, match);
    if (!updatePlan) {
      return skipItem(plan, match, "This record type cannot be updated safely yet.");
    }
    return updateItem(plan, match, updatePlan);
  }

  return skipItem(
    plan,
    match,
    "Replace selected month only replaces previously imported records in scope."
  );
}

export function deriveImportScopeFromPlans(
  plans: ImportRowCreatePlan[]
): { year: number | null; month: number | null } {
  const buckets = new Map<string, number>();
  for (const plan of plans) {
    const year =
      plan.billInstance?.year ??
      plan.debtPaymentWithBill?.payment.year ??
      (plan.manualExpense?.expense_date
        ? Number(plan.manualExpense.expense_date.slice(0, 4))
        : null);
    const month =
      plan.billInstance?.month ??
      plan.debtPaymentWithBill?.payment.month ??
      (plan.manualExpense?.expense_date
        ? Number(plan.manualExpense.expense_date.slice(5, 7))
        : null);
    if (year && month) {
      const key = `${year}-${month}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  let best: { year: number; month: number; count: number } | null = null;
  for (const [key, count] of buckets) {
    const [yearText, monthText] = key.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (!best || count > best.count) {
      best = { year, month, count };
    }
  }

  return best ? { year: best.year, month: best.month } : { year: null, month: null };
}

function isImportedRecordProtected(
  record: ImportBatchTrackedRecord,
  context: ImportDuplicateContext
): string | null {
  if (record.target_table === "bill_instances") {
    const instance = context.existingBillInstances.find((item) => item.id === record.target_id);
    if (!instance) {
      return null;
    }
    return isBillInstanceProtected(instance, context.protection);
  }
  if (record.target_table === "bills") {
    const template = context.existingBillTemplates.find((item) => item.id === record.target_id);
    if (!template) {
      return null;
    }
    return isBillTemplateProtected(template);
  }
  if (record.target_table === "manual_expenses") {
    const expense = context.existingManualExpenses.find((item) => item.id === record.target_id);
    if (!expense) {
      return null;
    }
    return isManualExpenseProtected(expense, context.protection);
  }
  if (record.target_table === "debt_payments") {
    const payment = context.existingDebtPayments.find((item) => item.id === record.target_id);
    if (!payment) {
      return null;
    }
    return isDebtPaymentProtected(payment, context.protection);
  }
  if (record.target_table === "savings_contributions") {
    return null;
  }
  return "This imported record type cannot be replaced safely yet.";
}

function buildReplaceDeletePlans(input: {
  context: ImportDuplicateContext;
  scopeYear: number | null;
  scopeMonth: number | null;
}): ImportReplaceDeletePlan[] {
  if (input.scopeYear === null || input.scopeMonth === null) {
    return [];
  }

  const deletes: ImportReplaceDeletePlan[] = [];
  const seen = new Set<string>();

  for (const record of input.context.importedRecords) {
    if (record.year !== input.scopeYear || record.month !== input.scopeMonth) {
      continue;
    }
    const key = `${record.target_table}:${record.target_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const protection = isImportedRecordProtected(record, input.context);
    if (protection) {
      continue;
    }

    let label = "Imported record";
    if (record.target_table === "bill_instances") {
      const instance = input.context.existingBillInstances.find(
        (item) => item.id === record.target_id
      );
      if (instance) {
        label = userFacingRecordLabel([
          instance.name,
          `${instance.month}/${instance.year}`,
        ]);
      }
    } else if (record.target_table === "manual_expenses") {
      const expense = input.context.existingManualExpenses.find(
        (item) => item.id === record.target_id
      );
      if (expense) {
        label = userFacingRecordLabel([expense.description, expense.expense_date.slice(0, 10)]);
      }
    } else if (record.target_table === "debt_payments") {
      const payment = input.context.existingDebtPayments.find(
        (item) => item.id === record.target_id
      );
      if (payment) {
        label = userFacingRecordLabel([
          payment.debt_account_name,
          payment.payment_date.slice(0, 10),
        ]);
      }
    }

    deletes.push({
      targetTable: record.target_table,
      targetId: record.target_id,
      label,
      reason: "Previously imported record in selected month will be replaced.",
      year: record.year,
      month: record.month,
      importBatchId: record.import_batch_id,
    });
  }

  return deletes;
}

export function buildImportStrategyPlan(input: {
  strategy: ImportDuplicateStrategy;
  scopeYear?: number | null;
  scopeMonth?: number | null;
  createPlans: ImportRowCreatePlan[];
  skippedFromBuild: ImportRowExcluded[];
  excludedFromBuild: ImportRowExcluded[];
  context: ImportDuplicateContext;
  userId: string;
}): ImportStrategyPlan {
  const derivedScope = deriveImportScopeFromPlans(input.createPlans);
  const scopeYear = input.scopeYear ?? derivedScope.year;
  const scopeMonth = input.scopeMonth ?? derivedScope.month;

  const items: ImportStrategyPlanItem[] = [];
  for (const plan of input.createPlans) {
    const match = classifyCreatePlanMatch(plan, input.context, input.userId);
    if (input.strategy === "replace_selected_month") {
      if (match.status === "no_match") {
        items.push(createItem(plan, match));
      } else {
        items.push(
          skipItem(
            plan,
            match,
            "Replace selected month creates new rows and replaces previous imported records in scope."
          )
        );
      }
      continue;
    }
    items.push(resolveStrategyItem(plan, match, input.strategy));
  }

  const replaceDeletes =
    input.strategy === "replace_selected_month"
      ? buildReplaceDeletePlans({
          context: input.context,
          scopeYear,
          scopeMonth,
        })
      : [];

  const summary = buildImportStrategyPlanSummary({
    items,
    replaceDeletes,
    validationExcluded: input.excludedFromBuild.length,
  });

  return {
    strategy: input.strategy,
    scopeYear,
    scopeMonth,
    items,
    replaceDeletes,
    summary,
    skippedFromBuild: input.skippedFromBuild,
    excludedFromBuild: input.excludedFromBuild,
  };
}

export function buildImportStrategyPlanSummary(input: {
  items: ImportStrategyPlanItem[];
  replaceDeletes: ImportReplaceDeletePlan[];
  validationExcluded: number;
}): ImportStrategyPlanSummary {
  const summary = emptySummary();
  summary.validationExcluded = input.validationExcluded;
  summary.toReplaceDelete = input.replaceDeletes.length;

  for (const item of input.items) {
    if (item.action === "create") {
      summary.toCreate += 1;
      continue;
    }
    if (item.action === "update") {
      summary.toUpdate += 1;
      continue;
    }
    if (item.match.status === "protected_match") {
      summary.toSkipProtected += 1;
    } else if (
      item.match.status === "possible_match" ||
      item.match.status === "ambiguous_match"
    ) {
      summary.toSkipAmbiguous += 1;
    } else {
      summary.toSkipDuplicate += 1;
    }
  }

  return summary;
}

export function strategyPlanHasWritableActions(plan: ImportStrategyPlan): boolean {
  return (
    plan.summary.toCreate > 0 ||
    plan.summary.toUpdate > 0 ||
    plan.summary.toReplaceDelete > 0
  );
}

export function buildStrategyPreviewGroups(plan: ImportStrategyPlan): {
  creates: string[];
  updates: string[];
  skipDuplicates: string[];
  skipProtected: string[];
  skipAmbiguous: string[];
  replaceDeletes: string[];
} {
  const creates: string[] = [];
  const updates: string[] = [];
  const skipDuplicates: string[] = [];
  const skipProtected: string[] = [];
  const skipAmbiguous: string[] = [];

  for (const item of plan.items) {
    const line = `${item.label} (row ${item.rowNumber})`;
    if (item.action === "create") {
      creates.push(line);
    } else if (item.action === "update") {
      updates.push(`Update ${item.match.label} from ${line}`);
    } else if (item.match.status === "protected_match") {
      skipProtected.push(`${line}: ${item.reason}`);
    } else if (
      item.match.status === "possible_match" ||
      item.match.status === "ambiguous_match"
    ) {
      skipAmbiguous.push(`${line}: ${item.reason}`);
    } else {
      skipDuplicates.push(`${line}: ${item.reason}`);
    }
  }

  return {
    creates,
    updates,
    skipDuplicates,
    skipProtected,
    skipAmbiguous,
    replaceDeletes: plan.replaceDeletes.map(
      (item) => `${item.label}: ${item.reason}`
    ),
  };
}

export type ImportStrategyResultCounts = {
  created: number;
  updated: number;
  skippedDuplicate: number;
  skippedProtected: number;
  skippedAmbiguous: number;
  replacedDeleted: number;
  failed: number;
};

export function emptyStrategyResultCounts(): ImportStrategyResultCounts {
  return {
    created: 0,
    updated: 0,
    skippedDuplicate: 0,
    skippedProtected: 0,
    skippedAmbiguous: 0,
    replacedDeleted: 0,
    failed: 0,
  };
}

export function buildStrategyResultUserMessage(counts: ImportStrategyResultCounts): string {
  const changed = counts.created + counts.updated + counts.replacedDeleted;
  if (changed === 0 && counts.failed === 0) {
    return "No records were changed. Rows were skipped.";
  }
  if (counts.failed > 0 && changed > 0) {
    return "Import partially applied. Some rows could not be completed.";
  }
  if (counts.failed > 0 && changed === 0) {
    return "Import could not be completed.";
  }
  return "Import applied.";
}

export function isSafeImportUpdateTable(
  table: InsertTables<"bills"> | UpdateTables<"bills"> | string
): boolean {
  return (
    table === "bills" ||
    table === "bill_instances" ||
    table === "manual_expenses" ||
    table === "debt_payments" ||
    table === "savings_contributions"
  );
}
