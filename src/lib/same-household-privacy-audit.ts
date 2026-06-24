/**
 * CASHFLOW-CURSOR-130 — Same-household two-user privacy registry for docs and unit tests.
 * Static expectations only; live isolation is verified by scripts/smoke-same-household-two-user-privacy.mjs.
 */

import {
  RLS_ALL_APP_TABLES,
  RLS_OWN_USER_PRIVATE_TABLES,
  rlsLabelContainsRawUuid,
} from "./rls-audit";

export type SameHouseholdPrivacyCategory =
  | "household_shared"
  | "own_user_private"
  | "owner_admin_read_private"
  | "owner_only_action"
  | "import_tracking"
  | "system_audit";

export interface SameHouseholdTableExpectation {
  table: string;
  category: SameHouseholdPrivacyCategory;
  memberReadOwnHousehold: "allowed" | "own_user_only" | "denied";
  memberReadOtherUserPrivate: "denied";
  ownerPersonalView: "own_user_only";
  ownerAdminReadActiveMember: "allowed" | "denied" | "not_applicable";
  ownerAdminWriteOtherUser: "denied";
  notes?: string;
}

export const SAME_HOUSEHOLD_SHARED_TABLES = [
  "households",
  "household_members",
  "people",
  "household_settings",
  "bills",
  "bill_instances",
  "debt_accounts",
  "debt_payments",
  "manual_expenses",
  "savings_goals",
  "import_batches",
  "import_batch_records",
] as const;

export const SAME_HOUSEHOLD_OWN_USER_PRIVATE_TABLES = [
  ...RLS_OWN_USER_PRIVATE_TABLES,
] as const;

export const SAME_HOUSEHOLD_OWNER_ADMIN_READ_TABLES = [
  "cash_snapshots",
  "cash_payment_transactions",
  "paycheck_schedules",
  "savings_goal_participants",
  "savings_contributions",
  "receipt_uploads",
  "receipt_candidates",
] as const;

export const SAME_HOUSEHOLD_OWNER_ADMIN_WRITE_DENIED_TABLES = [
  "cash_snapshots",
  "cash_payment_transactions",
  "cash_adjustment_transactions",
  "paycheck_schedules",
  "savings_goal_participants",
  "savings_contributions",
  "receipt_uploads",
  "receipt_candidates",
  "manual_expenses",
] as const;

export const MEMBER_FORBIDDEN_PRIVATE_TABLES = [
  "cash_snapshots",
  "cash_payment_transactions",
  "cash_adjustment_transactions",
  "paycheck_schedules",
  "savings_goal_participants",
  "savings_contributions",
  "receipt_uploads",
  "receipt_candidates",
] as const;

export const OWNER_ONLY_ACTIONS = [
  "invite_household_member",
  "remove_household_member",
  "change_cashflow_start_date",
  "apply_import_batch",
  "rollback_import_batch",
  "toggle_owner_admin_view",
] as const;

export const SAME_HOUSEHOLD_RPC_FUNCTIONS = [
  "pay_source_from_current_cash",
  "credit_manual_expense_adjustment_to_current_cash",
] as const;

export function buildSameHouseholdTableExpectations(): SameHouseholdTableExpectation[] {
  return [
    { table: "households", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "household_members", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "people", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "household_settings", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied", notes: "Member read-only; owner write" },
    { table: "bills", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "bill_instances", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "debt_accounts", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "debt_payments", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "manual_expenses", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied", notes: "Private expense rows remain uploader-scoped for member reads" },
    { table: "savings_goals", category: "household_shared", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "import_batches", category: "import_tracking", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied", notes: "Owner-only write" },
    { table: "import_batch_records", category: "import_tracking", memberReadOwnHousehold: "allowed", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied" },
    { table: "household_invitations", category: "owner_only_action", memberReadOwnHousehold: "denied", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "not_applicable", ownerAdminWriteOtherUser: "denied", notes: "Owner-only select" },
    { table: "cash_snapshots", category: "owner_admin_read_private", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied" },
    { table: "cash_payment_transactions", category: "system_audit", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied" },
    { table: "cash_adjustment_transactions", category: "system_audit", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied" },
    { table: "paycheck_schedules", category: "own_user_private", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied" },
    { table: "savings_goal_participants", category: "own_user_private", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied" },
    { table: "savings_contributions", category: "own_user_private", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied" },
    { table: "receipt_uploads", category: "own_user_private", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied", notes: "Storage bytes remain uploader-only" },
    { table: "receipt_candidates", category: "own_user_private", memberReadOwnHousehold: "own_user_only", memberReadOtherUserPrivate: "denied", ownerPersonalView: "own_user_only", ownerAdminReadActiveMember: "allowed", ownerAdminWriteOtherUser: "denied" },
  ];
}

export function assertAllPrivateTablesClassified(): void {
  const classified = new Set(buildSameHouseholdTableExpectations().map((row) => row.table));
  for (const table of RLS_ALL_APP_TABLES) {
    if (!classified.has(table)) {
      throw new Error(`Same-household registry missing C127 table: ${table}`);
    }
  }
}

export function ownerAdminReadExceptions(): readonly string[] {
  return SAME_HOUSEHOLD_OWNER_ADMIN_READ_TABLES;
}

export function memberForbiddenPrivateAccess(): readonly string[] {
  return MEMBER_FORBIDDEN_PRIVATE_TABLES;
}

export function smokeAssertionsRequireServiceRole(): boolean {
  return false;
}

export function registryLabelsAreSafe(): boolean {
  const labels = [
    ...buildSameHouseholdTableExpectations().flatMap((row) => [
      row.table,
      row.category,
      row.notes ?? "",
    ]),
    ...OWNER_ONLY_ACTIONS,
    ...SAME_HOUSEHOLD_RPC_FUNCTIONS,
  ];
  return labels.every((label) => !rlsLabelContainsRawUuid(label));
}
