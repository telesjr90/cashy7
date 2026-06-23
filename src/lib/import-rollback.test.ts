import { describe, expect, it } from "vitest";
import {
  buildBatchActionCounts,
  buildImportBatchHistoryDisplay,
  buildRollbackDeletePlan,
  buildRollbackPreviewGroups,
  buildRollbackResultSummary,
  classifyRollbackEligibility,
  containsRawUuid,
  emptyRollbackResultCounts,
  IMPORT_ROLLBACK_CONFIRMATION_LINES,
  resolveRollbackBatchStatus,
  type ImportBatchRecordInput,
  type RollbackProtectionContext,
  type RollbackTargetLookup,
} from "./import-rollback";

function makeBillInstance(
  overrides: Partial<import("./import-rollback").RollbackBillInstanceTarget> = {}
) {
  return {
    id: "instance-1",
    name: "Rent",
    year: 2026,
    month: 6,
    period_bucket: "15_eom" as const,
    due_date: "2026-06-15",
    amount: 1200,
    teles_amount: 612,
    nicole_amount: 588,
    is_paid: false,
    paid_status: "unpaid" as const,
    notes: null,
    bill_id: null,
    ...overrides,
  };
}

function makeExpense(
  overrides: Partial<import("./import-rollback").RollbackManualExpenseTarget> = {}
) {
  return {
    id: "expense-1",
    description: "Groceries",
    expense_date: "2026-06-10",
    amount: 45,
    category: "Food",
    is_paid: false,
    notes: null,
    created_by_user_id: USER_ID,
    ...overrides,
  };
}

const USER_ID = "user-owner";
const OTHER_USER_ID = "user-member";

function emptyTargets(): RollbackTargetLookup {
  return {
    billTemplates: new Map(),
    billInstances: new Map(),
    debtAccounts: new Map(),
    debtPayments: new Map(),
    manualExpenses: new Map(),
    savingsContributions: new Map(),
  };
}

function emptyProtection(
  overrides: Partial<RollbackProtectionContext> = {}
): RollbackProtectionContext {
  return {
    cashDeductedBillIds: new Set(),
    cashDeductedDebtPaymentIds: new Set(),
    cashDeductedExpenseIds: new Set(),
    debtLinkedBillIds: new Set(),
    cashDeductedSavingsContributionIds: new Set(),
    debtPaymentIdByBillId: new Map(),
    ...overrides,
  };
}

function makeRecord(
  overrides: Partial<ImportBatchRecordInput> = {}
): ImportBatchRecordInput {
  return {
    id: "record-1",
    import_batch_id: "batch-1",
    source_sheet_name: "CSV",
    source_row_number: 2,
    row_type: "bill",
    target_table: "bill_instances",
    target_id: "instance-1",
    action: "created",
    ...overrides,
  };
}

describe("import rollback helpers", () => {
  it("batch history display hides raw UUIDs", () => {
    const rows = buildImportBatchHistoryDisplay({
      batches: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          source_file_name: "household.csv",
          source_file_kind: "CSV spreadsheet",
          status: "applied",
          strategy: "create_new_only",
          scope_year: null,
          scope_month: null,
          created_at: "2026-06-23T12:00:00.000Z",
          created_by: "00000000-0000-4000-8000-000000000099",
        },
      ],
      recordsByBatchId: new Map([
        [
          "00000000-0000-4000-8000-000000000001",
          [makeRecord({ action: "created" })],
        ],
      ]),
      createdByLabels: new Map([
        ["00000000-0000-4000-8000-000000000099", "00000000-0000-4000-8000-000000000099"],
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.fileName).toBe("household.csv");
    expect(rows[0]?.createdByLabel).toBe("Household owner");
    expect(containsRawUuid(rows[0]?.fileName ?? "")).toBe(false);
    expect(containsRawUuid(rows[0]?.createdByLabel ?? "")).toBe(false);
  });

  it("groups rollback preview records by target type", () => {
    const targets = emptyTargets();
    targets.billInstances.set("instance-1", makeBillInstance());
    targets.manualExpenses.set("expense-1", makeExpense());

    const groups = buildRollbackPreviewGroups({
      records: [
        makeRecord({ id: "r1", target_id: "instance-1" }),
        makeRecord({
          id: "r2",
          target_table: "manual_expenses",
          target_id: "expense-1",
          row_type: "expense",
        }),
      ],
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
    });

    expect(groups.map((group) => group.group)).toEqual([
      "bill_instances",
      "manual_expenses",
    ]);
    expect(groups[0]?.items).toHaveLength(1);
    expect(groups[1]?.items).toHaveLength(1);
  });

  it("marks created unpaid bill instance as deletable", () => {
    const targets = emptyTargets();
    targets.billInstances.set("instance-1", makeBillInstance());

    const item = classifyRollbackEligibility({
      record: makeRecord(),
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["instance-1"]),
    });

    expect(item.eligibility).toBe("deletable");
    expect(containsRawUuid(item.label)).toBe(false);
  });

  it("marks paid bill as protected", () => {
    const targets = emptyTargets();
    targets.billInstances.set("instance-1", makeBillInstance({ is_paid: true, paid_status: "paid" }));

    const item = classifyRollbackEligibility({
      record: makeRecord(),
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["instance-1"]),
    });

    expect(item.eligibility).toBe("protected");
    expect(item.protectionReason).toContain("Paid");
  });

  it("marks cash-deducted expense as protected", () => {
    const targets = emptyTargets();
    targets.manualExpenses.set("expense-1", makeExpense());

    const item = classifyRollbackEligibility({
      record: makeRecord({
        target_table: "manual_expenses",
        target_id: "expense-1",
      }),
      targets,
      protection: emptyProtection({
        cashDeductedExpenseIds: new Set(["expense-1"]),
      }),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["expense-1"]),
    });

    expect(item.eligibility).toBe("protected");
    expect(item.protectionReason).toContain("Cash-deducted");
  });

  it("marks paid debt payment as protected", () => {
    const targets = emptyTargets();
    targets.debtPayments.set("payment-1", {
      id: "payment-1",
      debt_account_id: "account-1",
      debt_account_name: "Card",
      payment_date: "2026-06-01",
      total_payment: 200,
      paid_status: true,
      linked_bill_instance_id: null,
    });

    const item = classifyRollbackEligibility({
      record: makeRecord({
        target_table: "debt_payments",
        target_id: "payment-1",
      }),
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["payment-1"]),
    });

    expect(item.eligibility).toBe("protected");
  });

  it("plans linked debt payment and bill safely when both created by batch", () => {
    const targets = emptyTargets();
    targets.billInstances.set(
      "bill-1",
      makeBillInstance({
        id: "bill-1",
        name: "Debt: Card",
        amount: 200,
        teles_amount: 102,
        nicole_amount: 98,
      })
    );
    targets.debtPayments.set("payment-1", {
      id: "payment-1",
      debt_account_id: "account-1",
      debt_account_name: "Card",
      payment_date: "2026-06-01",
      total_payment: 200,
      paid_status: false,
      linked_bill_instance_id: "bill-1",
    });

    const protection = emptyProtection({
      debtLinkedBillIds: new Set(["bill-1"]),
      debtPaymentIdByBillId: new Map([["bill-1", "payment-1"]]),
    });

    const groups = buildRollbackPreviewGroups({
      records: [
        makeRecord({
          id: "r-payment",
          target_table: "debt_payments",
          target_id: "payment-1",
        }),
        makeRecord({
          id: "r-bill",
          target_table: "bill_instances",
          target_id: "bill-1",
        }),
      ],
      targets,
      protection,
      userId: USER_ID,
    });

    const plan = buildRollbackDeletePlan(groups);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.group).toBe("debt_payments");
    expect(plan[1]?.group).toBe("linked_debt_bill_instances");
  });

  it("does not delete debt account when protected payments remain", () => {
    const targets = emptyTargets();
    targets.debtAccounts.set("account-1", {
      id: "account-1",
      name: "Card",
      is_archived: false,
    });
    targets.debtPayments.set("payment-1", {
      id: "payment-1",
      debt_account_id: "account-1",
      debt_account_name: "Card",
      payment_date: "2026-06-01",
      total_payment: 200,
      paid_status: true,
      linked_bill_instance_id: null,
    });

    const groups = buildRollbackPreviewGroups({
      records: [
        makeRecord({
          id: "r-account",
          target_table: "debt_accounts",
          target_id: "account-1",
        }),
        makeRecord({
          id: "r-payment",
          target_table: "debt_payments",
          target_id: "payment-1",
        }),
      ],
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
    });

    const accountGroup = groups.find((group) => group.group === "debt_accounts");
    expect(accountGroup?.items[0]?.eligibility).toBe("protected");
    expect(buildRollbackDeletePlan(groups).some((item) => item.group === "debt_accounts")).toBe(
      false
    );
  });

  it("allows deletable savings contribution for signed-in user", () => {
    const targets = emptyTargets();
    targets.savingsContributions.set("contrib-1", {
      id: "contrib-1",
      savings_goal_name: "Emergency",
      contribution_date: "2026-06-05",
      amount: 100,
      user_id: USER_ID,
    });

    const item = classifyRollbackEligibility({
      record: makeRecord({
        target_table: "savings_contributions",
        target_id: "contrib-1",
      }),
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["contrib-1"]),
    });

    expect(item.eligibility).toBe("deletable");
  });

  it("marks other-user savings contribution as protected", () => {
    const targets = emptyTargets();
    targets.savingsContributions.set("contrib-1", {
      id: "contrib-1",
      savings_goal_name: "Emergency",
      contribution_date: "2026-06-05",
      amount: 100,
      user_id: OTHER_USER_ID,
    });

    const item = classifyRollbackEligibility({
      record: makeRecord({
        target_table: "savings_contributions",
        target_id: "contrib-1",
      }),
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["contrib-1"]),
    });

    expect(item.eligibility).toBe("protected");
  });

  it("marks missing target record as already removed", () => {
    const item = classifyRollbackEligibility({
      record: makeRecord({ target_id: "missing-instance" }),
      targets: emptyTargets(),
      protection: emptyProtection(),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["missing-instance"]),
    });

    expect(item.eligibility).toBe("already_removed");
  });

  it("delete plan excludes protected and missing records", () => {
    const targets = emptyTargets();
    targets.billInstances.set(
      "ok",
      makeBillInstance({ id: "ok", name: "Water", amount: 50, teles_amount: 26, nicole_amount: 24 })
    );
    targets.billInstances.set(
      "paid",
      makeBillInstance({
        id: "paid",
        is_paid: true,
        paid_status: "paid",
      })
    );

    const groups = buildRollbackPreviewGroups({
      records: [
        makeRecord({ id: "r-ok", target_id: "ok" }),
        makeRecord({ id: "r-paid", target_id: "paid" }),
        makeRecord({ id: "r-missing", target_id: "missing" }),
      ],
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
    });

    const plan = buildRollbackDeletePlan(groups);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.targetId).toBe("ok");
  });

  it("result summary counts deleted, protected, missing, and failed", () => {
    const counts = emptyRollbackResultCounts();
    counts.deleted = 2;
    counts.protected = 1;
    counts.alreadyMissing = 1;
    counts.failed = 1;
    counts.byGroup.bill_instances = 2;

    const summary = buildRollbackResultSummary({ counts });
    expect(summary.userMessage).toContain("Deleted 2");
    expect(summary.userMessage).toContain("Skipped 1 protected");
    expect(summary.userMessage).toContain("already removed");
    expect(summary.userMessage).toContain("failed");
    expect(summary.userMessage).toContain("Cash history was not changed");
    expect(resolveRollbackBatchStatus(counts)).toBe("rollback_partial");
  });

  it("confirmation copy includes no-cash-history-change warning", () => {
    expect(IMPORT_ROLLBACK_CONFIRMATION_LINES.join(" ")).toContain(
      "Cash history will not be changed"
    );
  });

  it("uses no raw UUIDs in user-facing labels", () => {
    const targets = emptyTargets();
    targets.billInstances.set(
      "instance-1",
      makeBillInstance({
        name: "00000000-0000-4000-8000-000000000001",
        amount: 50,
        teles_amount: 26,
        nicole_amount: 24,
      })
    );

    const item = classifyRollbackEligibility({
      record: makeRecord(),
      targets,
      protection: emptyProtection(),
      userId: USER_ID,
      batchCreatedTargetIds: new Set(["instance-1"]),
    });

    expect(containsRawUuid(item.label)).toBe(false);
  });

  it("builds batch action counts from record actions", () => {
    expect(
      buildBatchActionCounts([
        { action: "created" },
        { action: "created" },
        { action: "updated" },
        { action: "skipped" },
        { action: "replaced" },
        { action: "deleted" },
      ])
    ).toEqual({
      created: 2,
      updated: 1,
      skipped: 1,
      replaced: 1,
      deleted: 1,
    });
  });

  it("resolves rolled_back when all eligible records deleted", () => {
    const counts = emptyRollbackResultCounts();
    counts.deleted = 3;
    expect(resolveRollbackBatchStatus(counts)).toBe("rolled_back");
  });
});
