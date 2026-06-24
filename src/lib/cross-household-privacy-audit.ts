/**
 * CASHFLOW-CURSOR-129 — Cross-household privacy registry for docs and unit tests.
 * Static expectations only; live isolation is verified by scripts/smoke-cross-household-privacy.mjs.
 */

export type CrossHouseholdIsolationCategory =
  | "household_shared"
  | "owner_managed"
  | "own_user_private"
  | "import_tracking"
  | "receipt_private"
  | "savings_private"
  | "paycheck_private"
  | "system_audit";

export interface CrossHouseholdTableExpectation {
  table: string;
  category: CrossHouseholdIsolationCategory;
  readIsolation: "required";
  writeIsolation: "required" | "owner_managed_only";
  ownerAdminCrossHouseholdRead: "denied";
  notes?: string;
}

export const CROSS_HOUSEHOLD_READ_TABLES = [
  "households",
  "household_members",
  "people",
  "household_settings",
  "bills",
  "bill_instances",
  "debt_accounts",
  "debt_payments",
  "manual_expenses",
  "import_batches",
  "import_batch_records",
  "receipt_uploads",
  "receipt_candidates",
  "savings_goals",
  "savings_goal_participants",
  "savings_contributions",
  "cash_snapshots",
  "cash_payment_transactions",
  "paycheck_schedules",
] as const;

export const CROSS_HOUSEHOLD_RPC_FUNCTIONS = [
  "pay_source_from_current_cash",
  "credit_manual_expense_adjustment_to_current_cash",
] as const;

export function buildCrossHouseholdTableExpectations(): CrossHouseholdTableExpectation[] {
  return [
    { table: "households", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "household_members", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "people", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "household_settings", category: "owner_managed", readIsolation: "required", writeIsolation: "owner_managed_only", ownerAdminCrossHouseholdRead: "denied" },
    { table: "bills", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "bill_instances", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "debt_accounts", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "debt_payments", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "manual_expenses", category: "household_shared", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied", notes: "Private rows in foreign household must not leak" },
    { table: "import_batches", category: "import_tracking", readIsolation: "required", writeIsolation: "owner_managed_only", ownerAdminCrossHouseholdRead: "denied" },
    { table: "import_batch_records", category: "import_tracking", readIsolation: "required", writeIsolation: "owner_managed_only", ownerAdminCrossHouseholdRead: "denied" },
    { table: "receipt_uploads", category: "receipt_private", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied", notes: "Owner admin same-household read allowed; cross-household denied" },
    { table: "receipt_candidates", category: "receipt_private", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "savings_goals", category: "savings_private", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "savings_goal_participants", category: "savings_private", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "savings_contributions", category: "savings_private", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "cash_snapshots", category: "own_user_private", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied", notes: "Owner admin same-household member read allowed after migration 034" },
    { table: "cash_payment_transactions", category: "system_audit", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
    { table: "paycheck_schedules", category: "paycheck_private", readIsolation: "required", writeIsolation: "required", ownerAdminCrossHouseholdRead: "denied" },
  ];
}

export function crossHouseholdOwnerAdminMustDenyForeignPrivateRows(): readonly string[] {
  return [
    "cash_snapshots",
    "cash_payment_transactions",
    "paycheck_schedules",
    "savings_goals",
    "savings_goal_participants",
    "savings_contributions",
    "receipt_uploads",
    "receipt_candidates",
  ];
}

export function ownerAdminSameHouseholdMemberReadAllowed(): readonly string[] {
  return crossHouseholdOwnerAdminMustDenyForeignPrivateRows();
}
