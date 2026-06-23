import { hasCashDeductionForBill } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import type { ImportDuplicateContext } from "./import-duplicates";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function sanitizeFetchError(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return "Could not load import context. Please try again.";
  }
  return message;
}

export type ImportDuplicateContextFetchResult = {
  context: ImportDuplicateContext;
  applyContext: {
    allowDuplicates?: boolean;
    existingBillTemplates: { id: string; name: string }[];
    existingBillInstances: {
      name: string;
      year: number;
      month: number;
      period_bucket: "1_14" | "15_eom";
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
  error: string | null;
};

function emptyDuplicateContext(): ImportDuplicateContext {
  return {
    existingBillTemplates: [],
    existingBillInstances: [],
    existingDebtAccounts: [],
    existingDebtPayments: [],
    existingManualExpenses: [],
    existingSavingsContributions: [],
    savingsGoals: [],
    protection: {
      cashDeductedBillIds: new Set(),
      cashDeductedDebtPaymentIds: new Set(),
      cashDeductedExpenseIds: new Set(),
      debtLinkedBillIds: new Set(),
    },
    importedRecords: [],
  };
}

export async function fetchImportDuplicateContext(
  householdId: string,
  userId: string
): Promise<ImportDuplicateContextFetchResult> {
  const [
    templatesResult,
    instancesResult,
    debtAccountsResult,
    debtPaymentsResult,
    expensesResult,
    savingsGoalsResult,
    savingsContributionsResult,
    cashPaymentsResult,
    batchRecordsResult,
  ] = await Promise.all([
    supabase
      .from("bills")
      .select("id, name, period_bucket, due_day, category, default_amount, notes, is_active")
      .eq("household_id", householdId)
      .eq("recurring", true),
    supabase
      .from("bill_instances")
      .select(
        "id, name, year, month, period_bucket, due_date, amount, teles_amount, nicole_amount, is_paid, paid_status, notes, bill_id"
      )
      .eq("household_id", householdId),
    supabase
      .from("debt_accounts")
      .select("id, name, is_archived")
      .eq("household_id", householdId),
    supabase
      .from("debt_payments")
      .select(
        "id, debt_account_id, payment_date, total_payment, paid_status, linked_bill_instance_id, debt_accounts(name)"
      )
      .eq("household_id", householdId),
    supabase
      .from("manual_expenses")
      .select(
        "id, description, expense_date, amount, category, is_paid, notes, created_by_user_id"
      )
      .eq("household_id", householdId),
    supabase.from("savings_goals").select("id, name").eq("household_id", householdId),
    supabase
      .from("savings_contributions")
      .select("id, savings_goal_id, contribution_date, amount, notes, user_id, savings_goals(name)")
      .eq("household_id", householdId)
      .eq("user_id", userId),
    supabase
      .from("cash_payment_transactions")
      .select("source_type, source_id")
      .eq("household_id", householdId)
      .eq("user_id", userId),
    supabase
      .from("import_batch_records")
      .select("target_table, target_id, import_batch_id")
      .eq("household_id", householdId),
  ]);

  const firstError =
    templatesResult.error ??
    instancesResult.error ??
    debtAccountsResult.error ??
    debtPaymentsResult.error ??
    expensesResult.error ??
    savingsGoalsResult.error ??
    savingsContributionsResult.error ??
    cashPaymentsResult.error ??
    batchRecordsResult.error;

  if (firstError) {
    const empty = emptyDuplicateContext();
    return {
      context: empty,
      applyContext: {
        existingBillTemplates: [],
        existingBillInstances: [],
        existingDebtAccounts: [],
        existingDebtPayments: [],
        existingManualExpenses: [],
        existingSavingsContributions: [],
        savingsGoals: [],
      },
      error: sanitizeFetchError(firstError.message),
    };
  }

  const billInstances = (instancesResult.data ?? []).map((row) => ({
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
  }));

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
  }

  const cashDeductedBillIds = new Set<string>();
  for (const instance of billInstances) {
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

  const savingsContributions = (savingsContributionsResult.data ?? []).map((row) => {
    const goal = Array.isArray(row.savings_goals) ? row.savings_goals[0] : row.savings_goals;
    return {
      id: row.id,
      savings_goal_id: row.savings_goal_id,
      savings_goal_name: goal?.name ?? "Savings goal",
      contribution_date: row.contribution_date,
      amount: Number(row.amount),
      notes: row.notes,
      user_id: row.user_id,
    };
  });

  const instanceById = new Map(billInstances.map((item) => [item.id, item]));
  const expenseById = new Map(
    (expensesResult.data ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        description: row.description,
        expense_date: row.expense_date,
        amount: Number(row.amount),
        category: row.category,
        is_paid: row.is_paid,
        notes: row.notes,
        created_by_user_id: row.created_by_user_id,
      },
    ])
  );
  const paymentById = new Map(debtPayments.map((item) => [item.id, item]));

  const importedRecords = (batchRecordsResult.data ?? [])
    .map((record) => {
      let year: number | null = null;
      let month: number | null = null;
      if (record.target_table === "bill_instances") {
        const instance = instanceById.get(record.target_id);
        year = instance?.year ?? null;
        month = instance?.month ?? null;
      } else if (record.target_table === "manual_expenses") {
        const expense = expenseById.get(record.target_id);
        if (expense?.expense_date) {
          year = Number(expense.expense_date.slice(0, 4));
          month = Number(expense.expense_date.slice(5, 7));
        }
      } else if (record.target_table === "debt_payments") {
        const payment = paymentById.get(record.target_id);
        if (payment?.payment_date) {
          year = Number(payment.payment_date.slice(0, 4));
          month = Number(payment.payment_date.slice(5, 7));
        }
      }
      return {
        target_table: record.target_table,
        target_id: record.target_id,
        import_batch_id: record.import_batch_id,
        year,
        month,
      };
    })
    .filter((record) => record.year !== null && record.month !== null);

  const context: ImportDuplicateContext = {
    existingBillTemplates: (templatesResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      period_bucket: row.period_bucket as "1_14" | "15_eom",
      due_day: row.due_day,
      category: row.category ?? "",
      default_amount: row.default_amount !== null ? Number(row.default_amount) : null,
      notes: row.notes,
      is_active: row.is_active,
    })),
    existingBillInstances: billInstances,
    existingDebtAccounts: (debtAccountsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      is_archived: row.is_archived,
    })),
    existingDebtPayments: debtPayments,
    existingManualExpenses: [...expenseById.values()],
    existingSavingsContributions: savingsContributions,
    savingsGoals: savingsGoalsResult.data ?? [],
    protection: {
      cashDeductedBillIds,
      cashDeductedDebtPaymentIds: debtPaymentTransactionSourceIds,
      cashDeductedExpenseIds: expensePaymentSourceIds,
      debtLinkedBillIds,
    },
    importedRecords,
  };

  return {
    context,
    applyContext: {
      existingBillTemplates: context.existingBillTemplates.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      existingBillInstances: context.existingBillInstances.map((item) => ({
        name: item.name,
        year: item.year,
        month: item.month,
        period_bucket: item.period_bucket,
      })),
      existingDebtAccounts: context.existingDebtAccounts.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      existingDebtPayments: context.existingDebtPayments.map((item) => ({
        debt_account_id: item.debt_account_id,
        payment_date: item.payment_date,
        total_payment: item.total_payment,
      })),
      existingManualExpenses: context.existingManualExpenses.map((item) => ({
        description: item.description,
        expense_date: item.expense_date,
        amount: item.amount,
      })),
      existingSavingsContributions: context.existingSavingsContributions.map((item) => ({
        savings_goal_id: item.savings_goal_id,
        contribution_date: item.contribution_date,
        amount: item.amount,
      })),
      savingsGoals: context.savingsGoals,
    },
    error: null,
  };
}
