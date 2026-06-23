import {
  buildImportApplyResultSummary,
  canUserApplyImport,
  emptyImportApplyResultCounts,
  IMPORT_OWNER_ONLY_COPY,
  type ImportApplyResultSummary,
  type ImportRowCreatePlan,
} from "@/lib/import-apply";
import type {
  ImportRowUpdatePlan,
  ImportStrategyPlan,
} from "@/lib/import-duplicates";
import { supabase } from "@/lib/supabase";
import type { HouseholdMember } from "@/lib/types";
import {
  fetchImportDuplicateContext,
  type ImportDuplicateContextFetchResult,
} from "./import-duplicate-context";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sanitizeApplyImportErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not complete the import. Please try again or contact support.";
  }
  return message;
}

export { fetchImportDuplicateContext };
export type { ImportDuplicateContextFetchResult };

type BatchRecordInsert = {
  household_id: string;
  import_batch_id: string;
  source_sheet_name: string;
  source_row_number: number;
  row_type: string;
  target_table: string;
  target_id: string;
  action: "created" | "updated" | "skipped" | "replaced" | "deleted";
};

async function insertBatchRecord(record: BatchRecordInsert): Promise<string | null> {
  const { error } = await supabase.from("import_batch_records").insert(record);
  return error ? sanitizeApplyImportErrorMessage(error.message) : null;
}

export type ApplyImportParams = {
  householdId: string;
  userId: string;
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined;
  fileName: string;
  fileKind: string;
  strategyPlan: ImportStrategyPlan;
};

async function applyCreatePlan(
  plan: ImportRowCreatePlan,
  params: ApplyImportParams,
  importBatchId: string,
  counts: ReturnType<typeof emptyImportApplyResultCounts>,
  developerDetails: string[],
  debtAccountIds: Map<string, string>
): Promise<void> {
  if (plan.kind === "bill_template" && plan.billTemplate) {
    const { data, error } = await supabase
      .from("bills")
      .insert(plan.billTemplate)
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create bill template.");
    }
    counts.billTemplates += 1;
    const recordError = await insertBatchRecord({
      household_id: params.householdId,
      import_batch_id: importBatchId,
      source_sheet_name: plan.sheetName,
      source_row_number: plan.rowNumber,
      row_type: plan.rowType,
      target_table: "bills",
      target_id: data.id,
      action: "created",
    });
    if (recordError) {
      developerDetails.push(recordError);
    }
    return;
  }

  if (plan.kind === "bill_instance" && plan.billInstance) {
    const { data, error } = await supabase
      .from("bill_instances")
      .insert(plan.billInstance)
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create bill instance.");
    }
    counts.billInstances += 1;
    const recordError = await insertBatchRecord({
      household_id: params.householdId,
      import_batch_id: importBatchId,
      source_sheet_name: plan.sheetName,
      source_row_number: plan.rowNumber,
      row_type: plan.rowType,
      target_table: "bill_instances",
      target_id: data.id,
      action: "created",
    });
    if (recordError) {
      developerDetails.push(recordError);
    }
    return;
  }

  if (plan.kind === "manual_expense" && plan.manualExpense) {
    const { data, error } = await supabase
      .from("manual_expenses")
      .insert(plan.manualExpense)
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create manual expense.");
    }
    counts.manualExpenses += 1;
    const recordError = await insertBatchRecord({
      household_id: params.householdId,
      import_batch_id: importBatchId,
      source_sheet_name: plan.sheetName,
      source_row_number: plan.rowNumber,
      row_type: plan.rowType,
      target_table: "manual_expenses",
      target_id: data.id,
      action: "created",
    });
    if (recordError) {
      developerDetails.push(recordError);
    }
    return;
  }

  if (plan.kind === "savings_contribution" && plan.savingsContribution) {
    const { data, error } = await supabase
      .from("savings_contributions")
      .insert({
        household_id: params.householdId,
        user_id: params.userId,
        savings_goal_id: plan.savingsContribution.savingsGoalId,
        amount: plan.savingsContribution.amount,
        contribution_date: plan.savingsContribution.contributionDate,
        notes: plan.savingsContribution.notes,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create savings contribution.");
    }
    counts.savingsContributions += 1;
    const recordError = await insertBatchRecord({
      household_id: params.householdId,
      import_batch_id: importBatchId,
      source_sheet_name: plan.sheetName,
      source_row_number: plan.rowNumber,
      row_type: plan.rowType,
      target_table: "savings_contributions",
      target_id: data.id,
      action: "created",
    });
    if (recordError) {
      developerDetails.push(recordError);
    }
    return;
  }

  if (plan.kind === "debt_payment_with_bill" && plan.debtPaymentWithBill) {
    const debtPlan = plan.debtPaymentWithBill;
    let debtAccountId = debtPlan.debtAccountId;

    if (!debtAccountId && debtPlan.createDebtAccount) {
      const cached = debtAccountIds.get(debtPlan.debtAccountName.toLowerCase());
      if (cached) {
        debtAccountId = cached;
      } else {
        const { data: accountData, error: accountError } = await supabase
          .from("debt_accounts")
          .insert({
            household_id: params.householdId,
            ...debtPlan.createDebtAccount,
          })
          .select("id")
          .single();
        if (accountError || !accountData?.id) {
          throw new Error(accountError?.message ?? "Failed to create debt account.");
        }
        debtAccountId = accountData.id;
        debtAccountIds.set(debtPlan.debtAccountName.toLowerCase(), accountData.id);
        const recordError = await insertBatchRecord({
          household_id: params.householdId,
          import_batch_id: importBatchId,
          source_sheet_name: plan.sheetName,
          source_row_number: plan.rowNumber,
          row_type: plan.rowType,
          target_table: "debt_accounts",
          target_id: accountData.id,
          action: "created",
        });
        if (recordError) {
          developerDetails.push(recordError);
        }
      }
    }

    if (!debtAccountId) {
      throw new Error("Debt account could not be resolved.");
    }

    const { data: billData, error: billError } = await supabase
      .from("bill_instances")
      .insert(debtPlan.bill)
      .select("id")
      .single();
    if (billError || !billData) {
      throw new Error(billError?.message ?? "Failed to create linked debt bill.");
    }
    counts.linkedDebtBills += 1;

    const { data: paymentData, error: paymentError } = await supabase
      .from("debt_payments")
      .insert({
        ...debtPlan.payment,
        debt_account_id: debtAccountId,
        linked_bill_instance_id: billData.id,
      })
      .select("id")
      .single();
    if (paymentError || !paymentData) {
      throw new Error(paymentError?.message ?? "Failed to create debt payment.");
    }
    counts.debtPayments += 1;

    for (const [targetTable, targetId] of [
      ["bill_instances", billData.id],
      ["debt_payments", paymentData.id],
    ] as const) {
      const recordError = await insertBatchRecord({
        household_id: params.householdId,
        import_batch_id: importBatchId,
        source_sheet_name: plan.sheetName,
        source_row_number: plan.rowNumber,
        row_type: plan.rowType,
        target_table: targetTable,
        target_id: targetId,
        action: "created",
      });
      if (recordError) {
        developerDetails.push(recordError);
      }
    }
    return;
  }

  throw new Error(`Unsupported plan kind for row ${plan.rowNumber}.`);
}

async function applyUpdatePlan(
  updatePlan: ImportRowUpdatePlan,
  params: ApplyImportParams,
  importBatchId: string,
  counts: ReturnType<typeof emptyImportApplyResultCounts>,
  developerDetails: string[]
): Promise<void> {
  const { table, payload } = updatePlan.updates;
  const { error } = await supabase.from(table).update(payload).eq("id", updatePlan.targetId);
  if (error) {
    throw new Error(error.message);
  }
  counts.updated += 1;
  const recordError = await insertBatchRecord({
    household_id: params.householdId,
    import_batch_id: importBatchId,
    source_sheet_name: updatePlan.sheetName,
    source_row_number: updatePlan.rowNumber,
    row_type: updatePlan.rowType,
    target_table: updatePlan.targetTable,
    target_id: updatePlan.targetId,
    action: "updated",
  });
  if (recordError) {
    developerDetails.push(recordError);
  }
}

async function applyReplaceDelete(
  deletePlan: ImportStrategyPlan["replaceDeletes"][number],
  params: ApplyImportParams,
  importBatchId: string,
  counts: ReturnType<typeof emptyImportApplyResultCounts>,
  developerDetails: string[]
): Promise<void> {
  const table = deletePlan.targetTable;
  if (
    table !== "bill_instances" &&
    table !== "manual_expenses" &&
    table !== "debt_payments" &&
    table !== "savings_contributions" &&
    table !== "bills"
  ) {
    throw new Error("This imported record type cannot be replaced safely yet.");
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", deletePlan.targetId)
    .eq("household_id", params.householdId);
  if (error) {
    throw new Error(error.message);
  }
  counts.replacedDeleted += 1;
  const recordError = await insertBatchRecord({
    household_id: params.householdId,
    import_batch_id: importBatchId,
    source_sheet_name: "",
    source_row_number: 0,
    row_type: "replace",
    target_table: deletePlan.targetTable,
    target_id: deletePlan.targetId,
    action: "deleted",
  });
  if (recordError) {
    developerDetails.push(recordError);
  }
}

export async function applyImport(params: ApplyImportParams): Promise<ImportApplyResultSummary> {
  const developerDetails: string[] = [];
  const counts = emptyImportApplyResultCounts();
  const writableItems = params.strategyPlan.items.filter(
    (item) => item.action === "create" || item.action === "update"
  );
  const skippedItems = params.strategyPlan.items.filter((item) => item.action === "skip");

  counts.skipped =
    params.strategyPlan.skippedFromBuild.length +
    params.strategyPlan.excludedFromBuild.length +
    skippedItems.length;

  for (const item of skippedItems) {
    if (item.match.status === "protected_match") {
      counts.skippedProtected += 1;
    } else if (
      item.match.status === "possible_match" ||
      item.match.status === "ambiguous_match"
    ) {
      counts.skippedAmbiguous += 1;
    } else {
      counts.skippedDuplicate += 1;
    }
  }

  if (!canUserApplyImport(params.membership)) {
    return buildImportApplyResultSummary({
      counts: { ...counts, failed: writableItems.length + params.strategyPlan.replaceDeletes.length },
      importBatchId: null,
      developerDetails: [IMPORT_OWNER_ONLY_COPY],
    });
  }

  const hasWork =
    writableItems.length > 0 || params.strategyPlan.replaceDeletes.length > 0;
  if (!hasWork) {
    return buildImportApplyResultSummary({
      counts,
      importBatchId: null,
      developerDetails: ["No writable rows to import."],
    });
  }

  const { data: batchData, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      household_id: params.householdId,
      created_by: params.userId,
      source_file_name: params.fileName,
      source_file_kind: params.fileKind,
      status: "applied",
      strategy: params.strategyPlan.strategy,
      scope_year: params.strategyPlan.scopeYear,
      scope_month: params.strategyPlan.scopeMonth,
    })
    .select("id")
    .single();

  if (batchError || !batchData) {
    return buildImportApplyResultSummary({
      counts: { ...counts, failed: writableItems.length + params.strategyPlan.replaceDeletes.length },
      importBatchId: null,
      developerDetails: [
        sanitizeApplyImportErrorMessage(batchError?.message ?? "Failed to create import batch."),
      ],
    });
  }

  const importBatchId = batchData.id as string;
  const debtAccountIds = new Map<string, string>();

  for (const deletePlan of params.strategyPlan.replaceDeletes) {
    try {
      await applyReplaceDelete(deletePlan, params, importBatchId, counts, developerDetails);
    } catch (error) {
      counts.failed += 1;
      const message =
        error instanceof Error
          ? sanitizeApplyImportErrorMessage(error.message)
          : "Unknown import error.";
      developerDetails.push(`Replace delete ${deletePlan.label}: ${message}`);
    }
  }

  for (const item of params.strategyPlan.items) {
    try {
      if (item.action === "create") {
        await applyCreatePlan(
          item.createPlan,
          params,
          importBatchId,
          counts,
          developerDetails,
          debtAccountIds
        );
      } else if (item.action === "update") {
        await applyUpdatePlan(
          item.updatePlan,
          params,
          importBatchId,
          counts,
          developerDetails
        );
      }
    } catch (error) {
      counts.failed += 1;
      const message =
        error instanceof Error
          ? sanitizeApplyImportErrorMessage(error.message)
          : "Unknown import error.";
      developerDetails.push(`Row ${item.rowNumber}: ${message}`);
    }
  }

  const createdTotal =
    counts.billTemplates +
    counts.billInstances +
    counts.debtPayments +
    counts.manualExpenses +
    counts.savingsContributions;
  const changedTotal = createdTotal + counts.updated + counts.replacedDeleted;

  const batchStatus =
    counts.failed > 0 ? (changedTotal > 0 ? "partial" : "failed") : "applied";

  if (batchStatus !== "applied") {
    await supabase.from("import_batches").update({ status: batchStatus }).eq("id", importBatchId);
  }

  return buildImportApplyResultSummary({
    counts,
    importBatchId,
    developerDetails,
  });
}