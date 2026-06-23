import { hasCashDeductionForBill } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import type { HouseholdMember } from "@/lib/types";
import {
  buildImportBatchHistoryDisplay,
  buildRollbackDeletePlan,
  buildRollbackPreviewGroups,
  buildRollbackResultSummary,
  canUserRollbackImport,
  emptyRollbackResultCounts,
  IMPORT_ROLLBACK_OWNER_ONLY_COPY,
  resolveRollbackBatchStatus,
  summarizeRollbackPreview,
  type ImportBatchHistoryInput,
  type ImportBatchRecordInput,
  type RollbackPreviewGroup,
  type RollbackResultSummary,
  type RollbackTargetLookup,
} from "@/lib/import-rollback";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sanitizeRollbackErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not complete the rollback. Please try again or contact support.";
  }
  return message;
}

export { canUserRollbackImport };

export type FetchImportBatchesResult = {
  batches: ImportBatchHistoryInput[];
  recordsByBatchId: Map<string, ImportBatchRecordInput[]>;
  createdByLabels: Map<string, string>;
  error: string | null;
};

export async function fetchImportBatches(
  householdId: string
): Promise<FetchImportBatchesResult> {
  const [batchesResult, recordsResult, membersResult] = await Promise.all([
    supabase
      .from("import_batches")
      .select(
        "id, source_file_name, source_file_kind, status, strategy, scope_year, scope_month, created_at, created_by"
      )
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase
      .from("import_batch_records")
      .select(
        "id, import_batch_id, source_sheet_name, source_row_number, row_type, target_table, target_id, action"
      )
      .eq("household_id", householdId),
    supabase
      .from("household_members")
      .select("user_id, display_name, email")
      .eq("household_id", householdId),
  ]);

  const firstError =
    batchesResult.error ?? recordsResult.error ?? membersResult.error;
  if (firstError) {
    return {
      batches: [],
      recordsByBatchId: new Map(),
      createdByLabels: new Map(),
      error: sanitizeRollbackErrorMessage(firstError.message),
    };
  }

  const recordsByBatchId = new Map<string, ImportBatchRecordInput[]>();
  for (const record of recordsResult.data ?? []) {
    const list = recordsByBatchId.get(record.import_batch_id) ?? [];
    list.push({
      id: record.id,
      import_batch_id: record.import_batch_id,
      source_sheet_name: record.source_sheet_name,
      source_row_number: record.source_row_number,
      row_type: record.row_type,
      target_table: record.target_table,
      target_id: record.target_id,
      action: record.action,
    });
    recordsByBatchId.set(record.import_batch_id, list);
  }

  const createdByLabels = new Map<string, string>();
  for (const member of membersResult.data ?? []) {
    const label = member.display_name?.trim() || member.email?.trim();
    if (label) {
      createdByLabels.set(member.user_id, label);
    }
  }

  return {
    batches: (batchesResult.data ?? []) as ImportBatchHistoryInput[],
    recordsByBatchId,
    createdByLabels,
    error: null,
  };
}

function collectIds(
  records: ImportBatchRecordInput[],
  table: string
): string[] {
  return records
    .filter((record) => record.target_table === table)
    .map((record) => record.target_id);
}

async function buildTargetLookup(
  householdId: string,
  userId: string,
  records: ImportBatchRecordInput[]
): Promise<{
  targets: RollbackTargetLookup;
  protection: import("@/lib/import-rollback").RollbackProtectionContext;
}> {
  const billTemplateIds = collectIds(records, "bills");
  const billInstanceIds = collectIds(records, "bill_instances");
  const debtAccountIds = collectIds(records, "debt_accounts");
  const debtPaymentIds = collectIds(records, "debt_payments");
  const expenseIds = collectIds(records, "manual_expenses");
  const savingsIds = collectIds(records, "savings_contributions");

  const [
    templatesResult,
    instancesResult,
    debtAccountsResult,
    debtPaymentsResult,
    expensesResult,
    savingsResult,
    cashPaymentsResult,
  ] = await Promise.all([
    billTemplateIds.length > 0
      ? supabase
          .from("bills")
          .select("id, name, category, is_active")
          .eq("household_id", householdId)
          .in("id", billTemplateIds)
      : Promise.resolve({ data: [], error: null }),
    billInstanceIds.length > 0
      ? supabase
          .from("bill_instances")
          .select(
            "id, name, year, month, period_bucket, due_date, amount, teles_amount, nicole_amount, is_paid, paid_status, notes, bill_id"
          )
          .eq("household_id", householdId)
          .in("id", billInstanceIds)
      : Promise.resolve({ data: [], error: null }),
    debtAccountIds.length > 0
      ? supabase
          .from("debt_accounts")
          .select("id, name, is_archived")
          .eq("household_id", householdId)
          .in("id", debtAccountIds)
      : Promise.resolve({ data: [], error: null }),
    debtPaymentIds.length > 0
      ? supabase
          .from("debt_payments")
          .select(
            "id, debt_account_id, payment_date, total_payment, paid_status, linked_bill_instance_id, debt_accounts(name)"
          )
          .eq("household_id", householdId)
          .in("id", debtPaymentIds)
      : Promise.resolve({ data: [], error: null }),
    expenseIds.length > 0
      ? supabase
          .from("manual_expenses")
          .select(
            "id, description, expense_date, amount, category, is_paid, notes, created_by_user_id"
          )
          .eq("household_id", householdId)
          .in("id", expenseIds)
      : Promise.resolve({ data: [], error: null }),
    savingsIds.length > 0
      ? supabase
          .from("savings_contributions")
          .select("id, savings_goal_id, contribution_date, amount, user_id, savings_goals(name)")
          .eq("household_id", householdId)
          .in("id", savingsIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("cash_payment_transactions")
      .select("source_type, source_id")
      .eq("household_id", householdId)
      .eq("user_id", userId),
  ]);

  const firstError =
    templatesResult.error ??
    instancesResult.error ??
    debtAccountsResult.error ??
    debtPaymentsResult.error ??
    expensesResult.error ??
    savingsResult.error ??
    cashPaymentsResult.error;
  if (firstError) {
    throw new Error(sanitizeRollbackErrorMessage(firstError.message));
  }

  const targets: RollbackTargetLookup = {
    billTemplates: new Map(),
    billInstances: new Map(),
    debtAccounts: new Map(),
    debtPayments: new Map(),
    manualExpenses: new Map(),
    savingsContributions: new Map(),
  };

  for (const row of templatesResult.data ?? []) {
    targets.billTemplates.set(row.id, {
      id: row.id,
      name: row.name,
      category: row.category ?? "",
      is_active: row.is_active,
    });
  }

  for (const row of instancesResult.data ?? []) {
    targets.billInstances.set(row.id, {
      id: row.id,
      name: row.name,
      year: row.year,
      month: row.month,
      period_bucket: row.period_bucket as "1_14" | "15_eom",
      due_date: row.due_date,
      amount: Number(row.amount),
      teles_amount: Number(row.teles_amount),
      nicole_amount: Number(row.nicole_amount),
      is_paid: row.is_paid,
      paid_status: row.paid_status as "unpaid" | "paid",
      notes: row.notes,
      bill_id: row.bill_id,
    });
  }

  for (const row of debtAccountsResult.data ?? []) {
    targets.debtAccounts.set(row.id, {
      id: row.id,
      name: row.name,
      is_archived: row.is_archived,
    });
  }

  const debtPayments = (debtPaymentsResult.data ?? []).map((row) => {
    const account = Array.isArray(row.debt_accounts)
      ? row.debt_accounts[0]
      : row.debt_accounts;
    return {
      id: row.id,
      debt_account_id: row.debt_account_id,
      debt_account_name: account?.name ?? "Debt account",
      payment_date: row.payment_date,
      total_payment: Number(row.total_payment),
      paid_status: row.paid_status,
      linked_bill_instance_id: row.linked_bill_instance_id,
    };
  });

  for (const payment of debtPayments) {
    targets.debtPayments.set(payment.id, payment);
  }

  for (const row of expensesResult.data ?? []) {
    targets.manualExpenses.set(row.id, {
      id: row.id,
      description: row.description,
      expense_date: row.expense_date,
      amount: Number(row.amount),
      category: row.category ?? "",
      is_paid: row.is_paid,
      notes: row.notes,
      created_by_user_id: row.created_by_user_id,
    });
  }

  for (const row of savingsResult.data ?? []) {
    const goal = Array.isArray(row.savings_goals) ? row.savings_goals[0] : row.savings_goals;
    targets.savingsContributions.set(row.id, {
      id: row.id,
      savings_goal_name: goal?.name ?? "Savings goal",
      contribution_date: row.contribution_date,
      amount: Number(row.amount),
      user_id: row.user_id,
    });
  }

  const debtPaymentIdByBillId = new Map<string, string>();
  const debtLinkedBillIds = new Set<string>();
  for (const payment of debtPayments) {
    if (payment.linked_bill_instance_id) {
      debtPaymentIdByBillId.set(payment.linked_bill_instance_id, payment.id);
      debtLinkedBillIds.add(payment.linked_bill_instance_id);
    }
  }

  const billPaymentSourceIds = new Set<string>();
  const debtPaymentTransactionSourceIds = new Set<string>();
  const expensePaymentSourceIds = new Set<string>();
  const savingsContributionSourceIds = new Set<string>();
  for (const transaction of cashPaymentsResult.data ?? []) {
    if (transaction.source_type === "bill_instance") {
      billPaymentSourceIds.add(transaction.source_id);
    }
    if (transaction.source_type === "debt_payment") {
      debtPaymentTransactionSourceIds.add(transaction.source_id);
    }
    if (transaction.source_type === "manual_expense") {
      expensePaymentSourceIds.add(transaction.source_id);
    }
    if (transaction.source_type === "savings_contribution") {
      savingsContributionSourceIds.add(transaction.source_id);
    }
  }

  const cashDeductedBillIds = new Set<string>();
  for (const instance of targets.billInstances.values()) {
    if (
      hasCashDeductionForBill(instance.id, {
        billPaymentSourceIds,
        debtPaymentIdByBillId,
        debtPaymentTransactionSourceIds,
      })
    ) {
      cashDeductedBillIds.add(instance.id);
    }
  }

  return {
    targets,
    protection: {
      cashDeductedBillIds,
      cashDeductedDebtPaymentIds: debtPaymentTransactionSourceIds,
      cashDeductedExpenseIds: expensePaymentSourceIds,
      debtLinkedBillIds,
      cashDeductedSavingsContributionIds: savingsContributionSourceIds,
      debtPaymentIdByBillId,
    },
  };
}

export type FetchRollbackPreviewResult = {
  previewGroups: RollbackPreviewGroup[];
  error: string | null;
};

export async function fetchRollbackPreview(params: {
  householdId: string;
  userId: string;
  batchId: string;
}): Promise<FetchRollbackPreviewResult> {
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id")
    .eq("id", params.batchId)
    .eq("household_id", params.householdId)
    .maybeSingle();

  if (batchError) {
    return { previewGroups: [], error: sanitizeRollbackErrorMessage(batchError.message) };
  }
  if (!batch) {
    return { previewGroups: [], error: "Import batch was not found." };
  }

  const { data: records, error: recordsError } = await supabase
    .from("import_batch_records")
    .select(
      "id, import_batch_id, source_sheet_name, source_row_number, row_type, target_table, target_id, action"
    )
    .eq("import_batch_id", params.batchId)
    .eq("household_id", params.householdId);

  if (recordsError) {
    return { previewGroups: [], error: sanitizeRollbackErrorMessage(recordsError.message) };
  }

  try {
    const { targets, protection } = await buildTargetLookup(
      params.householdId,
      params.userId,
      (records ?? []) as ImportBatchRecordInput[]
    );
    const previewGroups = buildRollbackPreviewGroups({
      records: (records ?? []) as ImportBatchRecordInput[],
      targets,
      protection,
      userId: params.userId,
    });
    return { previewGroups, error: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? sanitizeRollbackErrorMessage(error.message)
        : "Could not build rollback preview.";
    return { previewGroups: [], error: message };
  }
}

const DELETE_TABLES = new Set([
  "bills",
  "bill_instances",
  "debt_accounts",
  "debt_payments",
  "manual_expenses",
  "savings_contributions",
]);

async function deleteTargetRecord(
  table: string,
  targetId: string,
  householdId: string
): Promise<string | null> {
  if (!DELETE_TABLES.has(table)) {
    return "Unsupported record type for rollback.";
  }

  const query = supabase.from(table).delete().eq("id", targetId).eq("household_id", householdId);
  const { error } = await query;
  return error ? sanitizeRollbackErrorMessage(error.message) : null;
}

export type ApplyImportRollbackParams = {
  householdId: string;
  userId: string;
  batchId: string;
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined;
};

export async function applyImportRollback(
  params: ApplyImportRollbackParams
): Promise<RollbackResultSummary> {
  if (!canUserRollbackImport(params.membership)) {
    return buildRollbackResultSummary({
      counts: emptyRollbackResultCounts(),
      developerDetails: [IMPORT_ROLLBACK_OWNER_ONLY_COPY],
    });
  }

  const previewResult = await fetchRollbackPreview({
    householdId: params.householdId,
    userId: params.userId,
    batchId: params.batchId,
  });

  if (previewResult.error) {
    const counts = emptyRollbackResultCounts();
    counts.failed = 1;
    return buildRollbackResultSummary({
      counts,
      developerDetails: [previewResult.error],
    });
  }

  const skippedCounts = summarizeRollbackPreview(previewResult.previewGroups);
  const deletePlan = buildRollbackDeletePlan(previewResult.previewGroups);
  const counts = emptyRollbackResultCounts();
  counts.protected = skippedCounts.protected;
  counts.alreadyMissing = skippedCounts.alreadyMissing;
  const developerDetails: string[] = [];
  const deletedTargetIds = new Set<string>();

  for (const step of deletePlan) {
    if (deletedTargetIds.has(step.targetId)) {
      continue;
    }
    const error = await deleteTargetRecord(
      step.targetTable,
      step.targetId,
      params.householdId
    );
    if (error) {
      counts.failed += 1;
      developerDetails.push(`${step.label}: ${error}`);
      continue;
    }
    deletedTargetIds.add(step.targetId);
    counts.deleted += 1;
    counts.byGroup[step.group] += 1;
  }

  const batchStatus = resolveRollbackBatchStatus(counts);
  const { error: statusError } = await supabase
    .from("import_batches")
    .update({ status: batchStatus })
    .eq("id", params.batchId)
    .eq("household_id", params.householdId);

  if (statusError) {
    developerDetails.push(sanitizeRollbackErrorMessage(statusError.message));
  }

  return buildRollbackResultSummary({ counts, developerDetails });
}

export { buildImportBatchHistoryDisplay };
