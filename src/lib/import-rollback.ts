import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/format";
import {
  isBillInstanceProtected,
  isDebtPaymentProtected,
  isManualExpenseProtected,
  userFacingRecordLabel,
  type ImportProtectionContext,
} from "@/lib/import-duplicates";
import { sanitizeImportDisplayText } from "@/lib/import-validation";
import type { HouseholdMember } from "@/lib/types";
import { canUserApplyImport } from "@/lib/import-apply";

export type ImportBatchStatus =
  | "applied"
  | "partial"
  | "failed"
  | "rolled_back"
  | "rollback_partial"
  | "rollback_failed";

export type ImportBatchRecordAction =
  | "created"
  | "updated"
  | "skipped"
  | "replaced"
  | "deleted";

export type RollbackTargetGroup =
  | "bill_templates"
  | "bill_instances"
  | "debt_accounts"
  | "debt_payments"
  | "linked_debt_bill_instances"
  | "manual_expenses"
  | "savings_contributions";

export type RollbackEligibility =
  | "deletable"
  | "already_removed"
  | "protected"
  | "not_visible"
  | "unknown";

export type ImportBatchHistoryInput = {
  id: string;
  source_file_name: string;
  source_file_kind: string;
  status: ImportBatchStatus;
  strategy:
    | "create_new_only"
    | "update_matching"
    | "replace_selected_month"
    | null;
  scope_year: number | null;
  scope_month: number | null;
  created_at: string;
  created_by: string;
};

export type ImportBatchRecordInput = {
  id: string;
  import_batch_id: string;
  source_sheet_name: string | null;
  source_row_number: number | null;
  row_type: string;
  target_table: string;
  target_id: string;
  action: ImportBatchRecordAction;
};

export type RollbackBillTemplateTarget = {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
};

export type RollbackBillInstanceTarget = {
  id: string;
  name: string;
  year: number;
  month: number;
  period_bucket: "1_14" | "15_eom";
  due_date: string | null;
  amount: number;
  teles_amount: number;
  nicole_amount: number;
  is_paid: boolean;
  paid_status: "unpaid" | "paid";
  notes: string | null;
  bill_id: string | null;
};

export type RollbackManualExpenseTarget = {
  id: string;
  description: string;
  expense_date: string;
  amount: number;
  category: string;
  is_paid: boolean;
  notes: string | null;
  created_by_user_id: string;
};

export type RollbackDebtAccountTarget = {
  id: string;
  name: string;
  is_archived: boolean;
};

export type RollbackDebtPaymentTarget = {
  id: string;
  debt_account_id: string;
  debt_account_name: string;
  payment_date: string;
  total_payment: number;
  paid_status: boolean;
  linked_bill_instance_id: string | null;
};

export type RollbackSavingsContributionTarget = {
  id: string;
  savings_goal_name: string;
  contribution_date: string | null;
  amount: number;
  user_id: string;
};

export type RollbackTargetLookup = {
  billTemplates: Map<string, RollbackBillTemplateTarget>;
  billInstances: Map<string, RollbackBillInstanceTarget>;
  debtAccounts: Map<string, RollbackDebtAccountTarget>;
  debtPayments: Map<string, RollbackDebtPaymentTarget>;
  manualExpenses: Map<string, RollbackManualExpenseTarget>;
  savingsContributions: Map<string, RollbackSavingsContributionTarget>;
};

export type RollbackProtectionContext = ImportProtectionContext & {
  cashDeductedSavingsContributionIds: ReadonlySet<string>;
  debtPaymentIdByBillId: ReadonlyMap<string, string>;
};

export type RollbackPreviewItem = {
  batchRecordId: string;
  targetTable: string;
  targetId: string;
  group: RollbackTargetGroup;
  label: string;
  dateOrMonthLabel: string | null;
  amountLabel: string | null;
  sourceLabel: string;
  eligibility: RollbackEligibility;
  protectionReason: string | null;
};

export type RollbackPreviewGroup = {
  group: RollbackTargetGroup;
  title: string;
  items: RollbackPreviewItem[];
};

export type RollbackDeletePlanItem = {
  batchRecordId: string;
  targetTable: string;
  targetId: string;
  group: RollbackTargetGroup;
  label: string;
  deleteOrder: number;
};

export type RollbackResultCounts = {
  deleted: number;
  protected: number;
  alreadyMissing: number;
  failed: number;
  byGroup: Record<RollbackTargetGroup, number>;
};

export type ImportBatchHistoryRow = {
  id: string;
  fileName: string;
  fileKind: string;
  createdAtLabel: string;
  createdByLabel: string | null;
  statusLabel: string;
  strategyLabel: string;
  scopeLabel: string | null;
  actionCounts: {
    created: number;
    updated: number;
    skipped: number;
    replaced: number;
    deleted: number;
  };
  rollbackAvailable: boolean;
  rollbackAvailabilityLabel: string;
};

export type RollbackResultSummary = {
  counts: RollbackResultCounts;
  batchStatus: ImportBatchStatus;
  userMessage: string;
  developerDetails: string[];
};

export const IMPORT_ROLLBACK_OWNER_ONLY_COPY =
  "Only a household owner can roll back spreadsheet imports.";

export const IMPORT_ROLLBACK_CONFIRMATION_LINES = [
  "This will delete only records created by this import batch.",
  "Protected or cash-audited records will be skipped.",
  "Cash history will not be changed.",
  "This cannot be undone from this screen.",
] as const;

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const GROUP_TITLES: Record<RollbackTargetGroup, string> = {
  bill_templates: "Bill templates",
  bill_instances: "Bill instances",
  debt_accounts: "Debt accounts",
  debt_payments: "Debt payments",
  linked_debt_bill_instances: "Linked debt bill instances",
  manual_expenses: "Manual expenses",
  savings_contributions: "Savings contributions",
};

const DELETE_ORDER: Record<RollbackTargetGroup, number> = {
  debt_payments: 700,
  linked_debt_bill_instances: 650,
  bill_instances: 600,
  manual_expenses: 500,
  savings_contributions: 400,
  debt_accounts: 300,
  bill_templates: 200,
};

export function canUserRollbackImport(
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined
): boolean {
  return canUserApplyImport(membership);
}

export function formatImportBatchStatusLabel(status: ImportBatchStatus): string {
  switch (status) {
    case "applied":
      return "Applied";
    case "partial":
      return "Partially applied";
    case "failed":
      return "Failed";
    case "rolled_back":
      return "Rolled back";
    case "rollback_partial":
      return "Partially rolled back";
    case "rollback_failed":
      return "Rollback failed";
  }
}

export function formatImportStrategyLabel(
  strategy: ImportBatchHistoryInput["strategy"]
): string {
  switch (strategy) {
    case "create_new_only":
      return "Create new only";
    case "update_matching":
      return "Update matching";
    case "replace_selected_month":
      return "Replace selected month";
    default:
      return "Not recorded";
  }
}

export function buildBatchActionCounts(
  records: Pick<ImportBatchRecordInput, "action">[]
): ImportBatchHistoryRow["actionCounts"] {
  const counts = { created: 0, updated: 0, skipped: 0, replaced: 0, deleted: 0 };
  for (const record of records) {
    if (record.action === "created") counts.created += 1;
    if (record.action === "updated") counts.updated += 1;
    if (record.action === "skipped") counts.skipped += 1;
    if (record.action === "replaced") counts.replaced += 1;
    if (record.action === "deleted") counts.deleted += 1;
  }
  return counts;
}

export function isBatchRollbackAvailable(
  batch: Pick<ImportBatchHistoryInput, "status">,
  records: Pick<ImportBatchRecordInput, "action">[]
): { available: boolean; label: string } {
  if (batch.status === "rolled_back") {
    return { available: false, label: "Already rolled back" };
  }
  const createdCount = records.filter((record) => record.action === "created").length;
  if (createdCount === 0) {
    return { available: false, label: "No created records to roll back" };
  }
  if (batch.status === "rollback_failed") {
    return { available: true, label: "Retry rollback" };
  }
  if (batch.status === "rollback_partial") {
    return { available: true, label: "Retry rollback for remaining records" };
  }
  return { available: true, label: "Rollback available" };
}

function formatCreatedAtLabel(createdAt: string): string {
  try {
    return format(parseISO(createdAt), "MMM d, yyyy h:mm a");
  } catch {
    return sanitizeImportDisplayText(createdAt);
  }
}

function formatScopeLabel(year: number | null, month: number | null): string | null {
  if (year === null || month === null) {
    return null;
  }
  return `${month}/${year}`;
}

export function buildImportBatchHistoryDisplay(input: {
  batches: ImportBatchHistoryInput[];
  recordsByBatchId: Map<string, ImportBatchRecordInput[]>;
  createdByLabels: Map<string, string>;
}): ImportBatchHistoryRow[] {
  return input.batches.map((batch) => {
    const records = input.recordsByBatchId.get(batch.id) ?? [];
    const rollback = isBatchRollbackAvailable(batch, records);
    const createdByLabel = input.createdByLabels.get(batch.created_by) ?? null;
    const safeCreatedBy =
      createdByLabel && !UUID_PATTERN.test(createdByLabel) ? createdByLabel : "Household owner";

    return {
      id: batch.id,
      fileName: sanitizeImportDisplayText(batch.source_file_name),
      fileKind: sanitizeImportDisplayText(batch.source_file_kind),
      createdAtLabel: formatCreatedAtLabel(batch.created_at),
      createdByLabel: safeCreatedBy,
      statusLabel: formatImportBatchStatusLabel(batch.status),
      strategyLabel: formatImportStrategyLabel(batch.strategy),
      scopeLabel: formatScopeLabel(batch.scope_year, batch.scope_month),
      actionCounts: buildBatchActionCounts(records),
      rollbackAvailable: rollback.available,
      rollbackAvailabilityLabel: rollback.label,
    };
  });
}

export function formatRollbackSourceLabel(
  sheetName: string | null,
  rowNumber: number | null
): string {
  const sheet = sheetName ? sanitizeImportDisplayText(sheetName) : "Sheet";
  if (rowNumber === null || rowNumber <= 0) {
    return sheet;
  }
  return `${sheet} · row ${rowNumber}`;
}

function resolveTargetGroup(
  record: ImportBatchRecordInput,
  protection: RollbackProtectionContext
): RollbackTargetGroup {
  if (record.target_table === "bills") {
    return "bill_templates";
  }
  if (record.target_table === "debt_accounts") {
    return "debt_accounts";
  }
  if (record.target_table === "debt_payments") {
    return "debt_payments";
  }
  if (record.target_table === "manual_expenses") {
    return "manual_expenses";
  }
  if (record.target_table === "savings_contributions") {
    return "savings_contributions";
  }
  if (record.target_table === "bill_instances") {
    if (protection.debtLinkedBillIds.has(record.target_id)) {
      return "linked_debt_bill_instances";
    }
    return "bill_instances";
  }
  return "bill_instances";
}

function monthYearLabel(month: number, year: number): string {
  return `${month}/${year}`;
}

function buildBillTemplateLabel(target: RollbackBillTemplateTarget): string {
  return userFacingRecordLabel([target.name, target.category]);
}

function buildBillInstanceLabel(target: RollbackBillInstanceTarget): string {
  return userFacingRecordLabel([
    target.name,
    monthYearLabel(target.month, target.year),
  ]);
}

function buildDebtPaymentLabel(target: RollbackDebtPaymentTarget): string {
  return userFacingRecordLabel([
    target.debt_account_name,
    target.payment_date.slice(0, 10),
    formatCurrency(target.total_payment),
  ]);
}

function buildManualExpenseLabel(target: RollbackManualExpenseTarget): string {
  return userFacingRecordLabel([
    target.description,
    target.expense_date.slice(0, 10),
    formatCurrency(target.amount),
  ]);
}

function buildSavingsContributionLabel(target: RollbackSavingsContributionTarget): string {
  return userFacingRecordLabel([
    target.savings_goal_name,
    target.contribution_date?.slice(0, 10) ?? "No date",
    formatCurrency(target.amount),
  ]);
}

function nonCreatedActionReason(action: ImportBatchRecordAction): string {
  switch (action) {
    case "updated":
      return "Updated during import — not removed on rollback.";
    case "skipped":
      return "Skipped during import — nothing to remove.";
    case "replaced":
      return "Replacement marker — not removed on rollback.";
    case "deleted":
      return "Deleted during import — not restored on rollback.";
    default:
      return "Not a created import record.";
  }
}

function classifyBillTemplateEligibility(
  record: ImportBatchRecordInput,
  target: RollbackBillTemplateTarget | undefined,
  batchCreatedTargetIds: ReadonlySet<string>,
  allBillInstances: Iterable<RollbackBillInstanceTarget>,
  instanceEligibilityById: ReadonlyMap<string, RollbackEligibility>
): { eligibility: RollbackEligibility; reason: string | null } {
  if (!target) {
    return { eligibility: "already_removed", reason: "Already removed" };
  }
  if (record.action !== "created") {
    return { eligibility: "protected", reason: nonCreatedActionReason(record.action) };
  }
  for (const instance of allBillInstances) {
    if (instance.bill_id !== target.id) {
      continue;
    }
    if (!batchCreatedTargetIds.has(instance.id)) {
      return {
        eligibility: "protected",
        reason: "Bill template has instances outside this import batch.",
      };
    }
    const instanceEligibility = instanceEligibilityById.get(instance.id);
    if (instanceEligibility && instanceEligibility !== "deletable") {
      return {
        eligibility: "protected",
        reason: "Bill template has protected instances that must remain.",
      };
    }
  }
  if (!target.is_active) {
    return {
      eligibility: "protected",
      reason: "Inactive bill template is protected.",
    };
  }
  return { eligibility: "deletable", reason: null };
}

function classifyDebtAccountEligibility(
  record: ImportBatchRecordInput,
  target: RollbackDebtAccountTarget | undefined,
  batchCreatedTargetIds: ReadonlySet<string>,
  allPayments: Iterable<RollbackDebtPaymentTarget>,
  paymentEligibilityById: ReadonlyMap<string, RollbackEligibility>
): { eligibility: RollbackEligibility; reason: string | null } {
  if (!target) {
    return { eligibility: "already_removed", reason: "Already removed" };
  }
  if (record.action !== "created") {
    return { eligibility: "protected", reason: nonCreatedActionReason(record.action) };
  }
  if (target.is_archived) {
    return {
      eligibility: "protected",
      reason: "Archived debt account is protected.",
    };
  }
  for (const payment of allPayments) {
    if (payment.debt_account_id !== target.id) {
      continue;
    }
    if (!batchCreatedTargetIds.has(payment.id)) {
      return {
        eligibility: "protected",
        reason: "Debt account has payments outside this import batch.",
      };
    }
    const paymentEligibility = paymentEligibilityById.get(payment.id);
    if (paymentEligibility && paymentEligibility !== "deletable") {
      return {
        eligibility: "protected",
        reason: "Debt account has protected payments that must remain.",
      };
    }
  }
  return { eligibility: "deletable", reason: null };
}

function classifyLinkedDebtBillEligibility(
  record: ImportBatchRecordInput,
  target: RollbackBillInstanceTarget | undefined,
  protection: RollbackProtectionContext,
  batchCreatedTargetIds: ReadonlySet<string>,
  paymentById: Map<string, RollbackDebtPaymentTarget>
): { eligibility: RollbackEligibility; reason: string | null } {
  if (!target) {
    return { eligibility: "already_removed", reason: "Already removed" };
  }
  if (record.action !== "created") {
    return { eligibility: "protected", reason: nonCreatedActionReason(record.action) };
  }
  const paymentId = protection.debtPaymentIdByBillId.get(target.id);
  if (!paymentId) {
    return {
      eligibility: "protected",
      reason: "Linked debt bill is missing its payment link.",
    };
  }
  if (!batchCreatedTargetIds.has(paymentId)) {
    return {
      eligibility: "protected",
      reason: "Linked debt payment was not created by this import batch.",
    };
  }
  const payment = paymentById.get(paymentId);
  if (!payment) {
    return { eligibility: "already_removed", reason: "Linked debt payment already removed" };
  }
  const paymentProtection = isDebtPaymentProtected(payment, protection);
  if (paymentProtection) {
    return { eligibility: "protected", reason: paymentProtection };
  }
  if (target.is_paid || target.paid_status === "paid") {
    return {
      eligibility: "protected",
      reason: "Paid bill is protected from import changes.",
    };
  }
  if (protection.cashDeductedBillIds.has(target.id)) {
    return {
      eligibility: "protected",
      reason: "Cash-deducted bill is protected from import changes.",
    };
  }
  return { eligibility: "deletable", reason: null };
}

export function classifyRollbackEligibility(input: {
  record: ImportBatchRecordInput;
  targets: RollbackTargetLookup;
  protection: RollbackProtectionContext;
  userId: string;
  batchCreatedTargetIds: ReadonlySet<string>;
}): RollbackPreviewItem {
  const group = resolveTargetGroup(input.record, input.protection);
  const sourceLabel = formatRollbackSourceLabel(
    input.record.source_sheet_name,
    input.record.source_row_number
  );

  if (input.record.action !== "created") {
    return {
      batchRecordId: input.record.id,
      targetTable: input.record.target_table,
      targetId: input.record.target_id,
      group,
      label: "Import batch record",
      dateOrMonthLabel: null,
      amountLabel: null,
      sourceLabel,
      eligibility: "protected",
      protectionReason: nonCreatedActionReason(input.record.action),
    };
  }

  if (input.record.target_table === "bills") {
    const target = input.targets.billTemplates.get(input.record.target_id);
    const { eligibility, reason } = classifyBillTemplateEligibility(
      input.record,
      target,
      input.batchCreatedTargetIds,
      input.targets.billInstances.values(),
      new Map()
    );
    return {
      batchRecordId: input.record.id,
      targetTable: input.record.target_table,
      targetId: input.record.target_id,
      group,
      label: target ? buildBillTemplateLabel(target) : "Bill template",
      dateOrMonthLabel: null,
      amountLabel: null,
      sourceLabel,
      eligibility,
      protectionReason: reason,
    };
  }

  if (input.record.target_table === "bill_instances") {
    const target = input.targets.billInstances.get(input.record.target_id);
    if (group === "linked_debt_bill_instances") {
      const paymentById = new Map(
        [...input.targets.debtPayments.values()].map((payment) => [payment.id, payment])
      );
      const { eligibility, reason } = classifyLinkedDebtBillEligibility(
        input.record,
        target,
        input.protection,
        input.batchCreatedTargetIds,
        paymentById
      );
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: target ? buildBillInstanceLabel(target) : "Linked debt bill",
        dateOrMonthLabel: target ? monthYearLabel(target.month, target.year) : null,
        amountLabel: target ? formatCurrency(target.amount) : null,
        sourceLabel,
        eligibility,
        protectionReason: reason,
      };
    }
    if (!target) {
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: "Bill instance",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility: "already_removed",
        protectionReason: "Already removed",
      };
    }
    const protectionReason = isBillInstanceProtected(target, input.protection);
    return {
      batchRecordId: input.record.id,
      targetTable: input.record.target_table,
      targetId: input.record.target_id,
      group,
      label: buildBillInstanceLabel(target),
      dateOrMonthLabel: monthYearLabel(target.month, target.year),
      amountLabel: formatCurrency(target.amount),
      sourceLabel,
      eligibility: protectionReason ? "protected" : "deletable",
      protectionReason,
    };
  }

  if (input.record.target_table === "debt_accounts") {
    const target = input.targets.debtAccounts.get(input.record.target_id);
    const { eligibility, reason } = classifyDebtAccountEligibility(
      input.record,
      target,
      input.batchCreatedTargetIds,
      input.targets.debtPayments.values(),
      new Map()
    );
    return {
      batchRecordId: input.record.id,
      targetTable: input.record.target_table,
      targetId: input.record.target_id,
      group,
      label: target ? userFacingRecordLabel([target.name]) : "Debt account",
      dateOrMonthLabel: null,
      amountLabel: null,
      sourceLabel,
      eligibility,
      protectionReason: reason,
    };
  }

  if (input.record.target_table === "debt_payments") {
    const target = input.targets.debtPayments.get(input.record.target_id);
    if (!target) {
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: "Debt payment",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility: "already_removed",
        protectionReason: "Already removed",
      };
    }
    const protectionReason = isDebtPaymentProtected(target, input.protection);
    return {
      batchRecordId: input.record.id,
      targetTable: input.record.target_table,
      targetId: input.record.target_id,
      group,
      label: buildDebtPaymentLabel(target),
      dateOrMonthLabel: target.payment_date.slice(0, 10),
      amountLabel: formatCurrency(target.total_payment),
      sourceLabel,
      eligibility: protectionReason ? "protected" : "deletable",
      protectionReason,
    };
  }

  if (input.record.target_table === "manual_expenses") {
    const target = input.targets.manualExpenses.get(input.record.target_id);
    if (!target) {
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: "Manual expense",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility: "already_removed",
        protectionReason: "Already removed",
      };
    }
    if (target.created_by_user_id !== input.userId) {
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: "Private expense",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility: "not_visible",
        protectionReason: "Another member's private expense cannot be rolled back.",
      };
    }
    const protectionReason = isManualExpenseProtected(target, input.protection);
    return {
      batchRecordId: input.record.id,
      targetTable: input.record.target_table,
      targetId: input.record.target_id,
      group,
      label: buildManualExpenseLabel(target),
      dateOrMonthLabel: target.expense_date.slice(0, 10),
      amountLabel: formatCurrency(target.amount),
      sourceLabel,
      eligibility: protectionReason ? "protected" : "deletable",
      protectionReason,
    };
  }

  if (input.record.target_table === "savings_contributions") {
    const target = input.targets.savingsContributions.get(input.record.target_id);
    if (!target) {
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: "Savings contribution",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility: "not_visible",
        protectionReason: "Savings contribution is not visible to the signed-in user.",
      };
    }
    if (target.user_id !== input.userId) {
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: "Savings contribution",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility: "protected",
        protectionReason: "Another member's savings contribution cannot be rolled back.",
      };
    }
    if (input.protection.cashDeductedSavingsContributionIds.has(target.id)) {
      return {
        batchRecordId: input.record.id,
        targetTable: input.record.target_table,
        targetId: input.record.target_id,
        group,
        label: buildSavingsContributionLabel(target),
        dateOrMonthLabel: target.contribution_date?.slice(0, 10) ?? null,
        amountLabel: formatCurrency(target.amount),
        sourceLabel,
        eligibility: "protected",
        protectionReason: "Cash-deducted savings contribution is protected.",
      };
    }
    return {
      batchRecordId: input.record.id,
      targetTable: input.record.target_table,
      targetId: input.record.target_id,
      group,
      label: buildSavingsContributionLabel(target),
      dateOrMonthLabel: target.contribution_date?.slice(0, 10) ?? null,
      amountLabel: formatCurrency(target.amount),
      sourceLabel,
      eligibility: "deletable",
      protectionReason: null,
    };
  }

  return {
    batchRecordId: input.record.id,
    targetTable: input.record.target_table,
    targetId: input.record.target_id,
    group,
    label: "Imported record",
    dateOrMonthLabel: null,
    amountLabel: null,
    sourceLabel,
    eligibility: "unknown",
    protectionReason: "Unsupported imported record type.",
  };
}

export function buildRollbackPreviewGroups(input: {
  records: ImportBatchRecordInput[];
  targets: RollbackTargetLookup;
  protection: RollbackProtectionContext;
  userId: string;
}): RollbackPreviewGroup[] {
  const batchCreatedTargetIds = new Set(
    input.records.filter((record) => record.action === "created").map((record) => record.target_id)
  );

  const nonTemplateItems = input.records
    .filter(
      (record) =>
        record.target_table !== "debt_accounts" && record.target_table !== "bills"
    )
    .map((record) =>
      classifyRollbackEligibility({
        record,
        targets: input.targets,
        protection: input.protection,
        userId: input.userId,
        batchCreatedTargetIds,
      })
    );

  const instanceEligibilityById = new Map<string, RollbackEligibility>();
  for (const item of nonTemplateItems) {
    if (item.targetTable === "bill_instances") {
      instanceEligibilityById.set(item.targetId, item.eligibility);
    }
  }

  const templateItems = input.records
    .filter((record) => record.target_table === "bills")
    .map((record) => {
      const group = resolveTargetGroup(record, input.protection);
      const sourceLabel = formatRollbackSourceLabel(
        record.source_sheet_name,
        record.source_row_number
      );
      const target = input.targets.billTemplates.get(record.target_id);
      const { eligibility, reason } = classifyBillTemplateEligibility(
        record,
        target,
        batchCreatedTargetIds,
        input.targets.billInstances.values(),
        instanceEligibilityById
      );
      return {
        batchRecordId: record.id,
        targetTable: record.target_table,
        targetId: record.target_id,
        group,
        label: target ? buildBillTemplateLabel(target) : "Bill template",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility,
        protectionReason: reason,
      } satisfies RollbackPreviewItem;
    });

  const paymentEligibilityById = new Map<string, RollbackEligibility>();
  for (const item of nonTemplateItems) {
    if (item.targetTable === "debt_payments") {
      paymentEligibilityById.set(item.targetId, item.eligibility);
    }
  }

  const accountItems = input.records
    .filter((record) => record.target_table === "debt_accounts")
    .map((record) => {
      const group = resolveTargetGroup(record, input.protection);
      const sourceLabel = formatRollbackSourceLabel(
        record.source_sheet_name,
        record.source_row_number
      );
      const target = input.targets.debtAccounts.get(record.target_id);
      const { eligibility, reason } = classifyDebtAccountEligibility(
        record,
        target,
        batchCreatedTargetIds,
        input.targets.debtPayments.values(),
        paymentEligibilityById
      );
      return {
        batchRecordId: record.id,
        targetTable: record.target_table,
        targetId: record.target_id,
        group,
        label: target ? userFacingRecordLabel([target.name]) : "Debt account",
        dateOrMonthLabel: null,
        amountLabel: null,
        sourceLabel,
        eligibility,
        protectionReason: reason,
      } satisfies RollbackPreviewItem;
    });

  const items = [...nonTemplateItems, ...templateItems, ...accountItems];

  const grouped = new Map<RollbackTargetGroup, RollbackPreviewItem[]>();
  for (const item of items) {
    const list = grouped.get(item.group) ?? [];
    list.push(item);
    grouped.set(item.group, list);
  }

  const order: RollbackTargetGroup[] = [
    "bill_templates",
    "bill_instances",
    "debt_accounts",
    "debt_payments",
    "linked_debt_bill_instances",
    "manual_expenses",
    "savings_contributions",
  ];

  return order
    .map((group) => ({
      group,
      title: GROUP_TITLES[group],
      items: grouped.get(group) ?? [],
    }))
    .filter((entry) => entry.items.length > 0);
}

export function buildRollbackDeletePlan(
  previewGroups: RollbackPreviewGroup[]
): RollbackDeletePlanItem[] {
  const plan: RollbackDeletePlanItem[] = [];
  for (const group of previewGroups) {
    for (const item of group.items) {
      if (item.eligibility !== "deletable") {
        continue;
      }
      plan.push({
        batchRecordId: item.batchRecordId,
        targetTable: item.targetTable,
        targetId: item.targetId,
        group: item.group,
        label: item.label,
        deleteOrder: DELETE_ORDER[item.group],
      });
    }
  }
  return plan.sort((a, b) => b.deleteOrder - a.deleteOrder);
}

export function emptyRollbackResultCounts(): RollbackResultCounts {
  return {
    deleted: 0,
    protected: 0,
    alreadyMissing: 0,
    failed: 0,
    byGroup: {
      bill_templates: 0,
      bill_instances: 0,
      debt_accounts: 0,
      debt_payments: 0,
      linked_debt_bill_instances: 0,
      manual_expenses: 0,
      savings_contributions: 0,
    },
  };
}

export function resolveRollbackBatchStatus(counts: RollbackResultCounts): ImportBatchStatus {
  if (counts.deleted === 0 && counts.failed > 0) {
    return "rollback_failed";
  }
  if (counts.failed > 0 || counts.protected > 0 || counts.alreadyMissing > 0) {
    return "rollback_partial";
  }
  return "rolled_back";
}

export function buildRollbackResultSummary(input: {
  counts: RollbackResultCounts;
  developerDetails?: string[];
}): RollbackResultSummary {
  const batchStatus = resolveRollbackBatchStatus(input.counts);
  const parts: string[] = [];
  if (input.counts.deleted > 0) {
    parts.push(
      `Deleted ${input.counts.deleted} imported record${input.counts.deleted === 1 ? "" : "s"}.`
    );
  }
  if (input.counts.protected > 0) {
    parts.push(
      `Skipped ${input.counts.protected} protected record${input.counts.protected === 1 ? "" : "s"}.`
    );
  }
  if (input.counts.alreadyMissing > 0) {
    parts.push(
      `${input.counts.alreadyMissing} record${input.counts.alreadyMissing === 1 ? " was" : "s were"} already removed.`
    );
  }
  if (input.counts.failed > 0) {
    parts.push(
      `${input.counts.failed} delete${input.counts.failed === 1 ? "" : "s"} failed.`
    );
  }
  if (parts.length === 0) {
    parts.push("No imported records were eligible for rollback.");
  }
  parts.push("Cash history was not changed.");

  return {
    counts: input.counts,
    batchStatus,
    userMessage: parts.join(" "),
    developerDetails: input.developerDetails ?? [],
  };
}

export function summarizeRollbackPreview(previewGroups: RollbackPreviewGroup[]): RollbackResultCounts {
  const counts = emptyRollbackResultCounts();
  for (const group of previewGroups) {
    for (const item of group.items) {
      if (item.eligibility === "deletable") {
        continue;
      }
      if (item.eligibility === "already_removed") {
        counts.alreadyMissing += 1;
      } else if (item.eligibility === "protected" || item.eligibility === "not_visible") {
        counts.protected += 1;
      } else {
        counts.protected += 1;
      }
    }
  }
  return counts;
}

export function eligibilityLabel(eligibility: RollbackEligibility): string {
  switch (eligibility) {
    case "deletable":
      return "Eligible";
    case "already_removed":
      return "Already removed";
    case "protected":
      return "Protected";
    case "not_visible":
      return "Not visible";
    case "unknown":
      return "Unknown";
  }
}

export function containsRawUuid(text: string): boolean {
  return UUID_PATTERN.test(text);
}
