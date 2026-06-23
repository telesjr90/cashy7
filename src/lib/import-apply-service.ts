import {
  buildImportApplyResultSummary,
  canUserApplyImport,
  emptyImportApplyResultCounts,
  IMPORT_OWNER_ONLY_COPY,
  type ImportApplyContext,
  type ImportApplyResultSummary,
  type ImportRowCreatePlan,
} from "@/lib/import-apply";
import { supabase } from "@/lib/supabase";
import type { HouseholdMember } from "@/lib/types";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function sanitizeApplyImportErrorMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not complete the import. Please try again or contact support.";
  }
  return message;
}

export async function fetchImportApplyContext(
  householdId: string,
  userId: string
): Promise<{ context: ImportApplyContext; error: string | null }> {
  const [
    templatesResult,
    instancesResult,
    debtAccountsResult,
    debtPaymentsResult,
    expensesResult,
    savingsGoalsResult,
    savingsContributionsResult,
  ] = await Promise.all([
    supabase
      .from("bills")
      .select("id, name")
      .eq("household_id", householdId)
      .eq("recurring", true),
    supabase
      .from("bill_instances")
      .select("name, year, month, period_bucket")
      .eq("household_id", householdId),
    supabase
      .from("debt_accounts")
      .select("id, name")
      .eq("household_id", householdId)
      .eq("is_archived", false),
    supabase
      .from("debt_payments")
      .select("debt_account_id, payment_date, total_payment")
      .eq("household_id", householdId),
    supabase
      .from("manual_expenses")
      .select("description, expense_date, amount")
      .eq("household_id", householdId),
    supabase.from("savings_goals").select("id, name").eq("household_id", householdId),
    supabase
      .from("savings_contributions")
      .select("savings_goal_id, contribution_date, amount")
      .eq("household_id", householdId)
      .eq("user_id", userId),
  ]);

  const firstError =
    templatesResult.error ??
    instancesResult.error ??
    debtAccountsResult.error ??
    debtPaymentsResult.error ??
    expensesResult.error ??
    savingsGoalsResult.error ??
    savingsContributionsResult.error;

  if (firstError) {
    return {
      context: {
        existingBillTemplates: [],
        existingBillInstances: [],
        existingDebtAccounts: [],
        existingDebtPayments: [],
        existingManualExpenses: [],
        existingSavingsContributions: [],
        savingsGoals: [],
      },
      error: sanitizeApplyImportErrorMessage(firstError.message),
    };
  }

  return {
    context: {
      existingBillTemplates: templatesResult.data ?? [],
      existingBillInstances: (instancesResult.data ?? []) as ImportApplyContext["existingBillInstances"],
      existingDebtAccounts: debtAccountsResult.data ?? [],
      existingDebtPayments: debtPaymentsResult.data ?? [],
      existingManualExpenses: expensesResult.data ?? [],
      existingSavingsContributions: savingsContributionsResult.data ?? [],
      savingsGoals: savingsGoalsResult.data ?? [],
    },
    error: null,
  };
}

type BatchRecordInsert = {
  household_id: string;
  import_batch_id: string;
  source_sheet_name: string;
  source_row_number: number;
  row_type: string;
  target_table: string;
  target_id: string;
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
  plans: ImportRowCreatePlan[];
  skippedCount: number;
};

export async function applyImport(params: ApplyImportParams): Promise<ImportApplyResultSummary> {
  const developerDetails: string[] = [];
  const counts = emptyImportApplyResultCounts();
  counts.skipped = params.skippedCount;

  if (!canUserApplyImport(params.membership)) {
    return buildImportApplyResultSummary({
      counts: { ...counts, failed: params.plans.length },
      importBatchId: null,
      developerDetails: [IMPORT_OWNER_ONLY_COPY],
    });
  }

  if (params.plans.length === 0) {
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
    })
    .select("id")
    .single();

  if (batchError || !batchData) {
    return buildImportApplyResultSummary({
      counts: { ...counts, failed: params.plans.length },
      importBatchId: null,
      developerDetails: [
        sanitizeApplyImportErrorMessage(batchError?.message ?? "Failed to create import batch."),
      ],
    });
  }

  const importBatchId = batchData.id as string;
  const debtAccountIds = new Map<string, string>();

  for (const plan of params.plans) {
    try {
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
        });
        if (recordError) {
          developerDetails.push(recordError);
        }
        continue;
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
        });
        if (recordError) {
          developerDetails.push(recordError);
        }
        continue;
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
        });
        if (recordError) {
          developerDetails.push(recordError);
        }
        continue;
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
        });
        if (recordError) {
          developerDetails.push(recordError);
        }
        continue;
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
          });
          if (recordError) {
            developerDetails.push(recordError);
          }
        }
        continue;
      }

      counts.failed += 1;
      developerDetails.push(`Unsupported plan kind for row ${plan.rowNumber}.`);
    } catch (error) {
      counts.failed += 1;
      const message =
        error instanceof Error
          ? sanitizeApplyImportErrorMessage(error.message)
          : "Unknown import error.";
      developerDetails.push(`Row ${plan.rowNumber}: ${message}`);
    }
  }

  const createdTotal =
    counts.billTemplates +
    counts.billInstances +
    counts.debtPayments +
    counts.manualExpenses +
    counts.savingsContributions;

  const batchStatus =
    counts.failed > 0 ? (createdTotal > 0 ? "partial" : "failed") : "applied";

  if (batchStatus !== "applied") {
    await supabase.from("import_batches").update({ status: batchStatus }).eq("id", importBatchId);
  }

  return buildImportApplyResultSummary({
    counts,
    importBatchId,
    developerDetails,
  });
}
