/**
 * CASHFLOW-CURSOR-127 — static RLS intent registry for regression tests and docs.
 * Mirrors migration-defined policies; does not query live Supabase.
 */

export type RlsDataClassification =
  | "household_shared"
  | "owner_managed"
  | "own_user_private"
  | "storage_private"
  | "import_tracking"
  | "receipt_private"
  | "savings_private"
  | "paycheck_private"
  | "system_audit";

export type RlsRuleKind =
  | "active_household_member"
  | "active_household_owner"
  | "own_user"
  | "uploader_own"
  | "shared_or_own_private"
  | "append_only_own_user"
  | "storage_uploader_path"
  | "onboarding_owner_fallback";

export type RlsAuditResult = "PASS" | "GAP" | "NOT_APPLICABLE";

export interface RlsTableExpectation {
  object: string;
  classification: RlsDataClassification;
  intendedVisibility: string;
  ruleKind: RlsRuleKind;
  rlsEnabled: true;
  selectSummary: string;
  insertSummary: string;
  updateSummary: string;
  deleteSummary: string;
  removedInvitedBehavior: string;
  auditResult: RlsAuditResult;
  notes?: string;
}

export interface RlsStoragePolicyGroup {
  object: string;
  classification: "storage_private";
  intendedVisibility: string;
  bucketPublic: false;
  selectSummary: string;
  insertSummary: string;
  updateSummary: string;
  deleteSummary: string;
  ruleKind: "storage_uploader_path";
  removedInvitedBehavior: string;
  auditResult: RlsAuditResult;
  notes?: string;
}

export interface RlsHelperExpectation {
  name: string;
  usesAuthUid: true;
  excludesRemovedInvited: boolean;
  excludesPendingInvitation: boolean;
  auditResult: RlsAuditResult;
  notes?: string;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const ACTIVE_HOUSEHOLD =
  "household_id = get_my_household_id() (active member: status=active, is_active=true)";

const OWN_USER =
  "user_id = auth.uid() and household_id = get_my_household_id()";

const OWNER_WRITE =
  "get_my_household_id() and is_my_household_owner() = true";

const UPLOADER_OWN =
  "uploaded_by/created_by = auth.uid() and household_id = get_my_household_id()";

const REMOVED_INVITED =
  "get_my_household_id() returns null → shared/household rows denied; own-user rows still scoped to auth.uid() where applicable";

export const RLS_OWN_USER_PRIVATE_TABLES = [
  "cash_snapshots",
  "cash_payment_transactions",
  "cash_adjustment_transactions",
  "paycheck_schedules",
  "savings_goal_participants",
  "savings_contributions",
  "receipt_uploads",
  "receipt_candidates",
] as const;

export const RLS_HOUSEHOLD_SHARED_TABLES = [
  "households",
  "household_members",
  "people",
  "bills",
  "bill_instances",
  "debt_accounts",
  "debt_payments",
  "manual_expenses",
  "savings_goals",
] as const;

export const RLS_OWNER_MANAGED_TABLES = [
  "household_settings",
  "household_invitations",
  "import_batches",
  "import_batch_records",
] as const;

export const RLS_ALL_APP_TABLES = [
  ...RLS_HOUSEHOLD_SHARED_TABLES,
  ...RLS_OWNER_MANAGED_TABLES,
  ...RLS_OWN_USER_PRIVATE_TABLES,
] as const;

export function rlsLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}

export function buildRlsHelperExpectations(): RlsHelperExpectation[] {
  return [
    {
      name: "get_my_household_id",
      usesAuthUid: true,
      excludesRemovedInvited: true,
      excludesPendingInvitation: true,
      auditResult: "PASS",
      notes:
        "Filters household_members by auth.uid(), is_active=true, status=active; limit 1",
    },
    {
      name: "is_my_household_owner",
      usesAuthUid: true,
      excludesRemovedInvited: true,
      excludesPendingInvitation: true,
      auditResult: "PASS",
      notes:
        "Requires active membership plus role=owner or is_owner=true within get_my_household_id() household",
    },
  ];
}

export function buildRlsTableExpectations(): RlsTableExpectation[] {
  return [
    {
      object: "households",
      classification: "household_shared",
      intendedVisibility: "Active members read household; owner/created_by fallback for onboarding",
      ruleKind: "onboarding_owner_fallback",
      rlsEnabled: true,
      selectSummary:
        "id = get_my_household_id() OR owner_id/created_by = auth.uid()",
      insertSummary: "owner_id or created_by = auth.uid()",
      updateSummary: "same as select",
      deleteSummary: "same as select",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "household_members",
      classification: "household_shared",
      intendedVisibility:
        "Active household members read membership roster; users read own row",
      ruleKind: "active_household_member",
      rlsEnabled: true,
      selectSummary: `${ACTIVE_HOUSEHOLD} OR user_id = auth.uid()`,
      insertSummary: "active household or self bootstrap as household owner",
      updateSummary: "own row only (person_id validated in household)",
      deleteSummary: ACTIVE_HOUSEHOLD,
      removedInvitedBehavior:
        "Removed users may read own membership row via user_id = auth.uid(); no shared data",
      auditResult: "PASS",
    },
    {
      object: "household_invitations",
      classification: "owner_managed",
      intendedVisibility: "Owner read/manage invitations only",
      ruleKind: "active_household_owner",
      rlsEnabled: true,
      selectSummary: OWNER_WRITE,
      insertSummary: `${OWNER_WRITE}; invited_by = auth.uid()`,
      updateSummary: OWNER_WRITE,
      deleteSummary: "none (cancel via status update)",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "people",
      classification: "household_shared",
      intendedVisibility: "Active members read/write household person profiles",
      ruleKind: "active_household_member",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: ACTIVE_HOUSEHOLD,
      updateSummary: ACTIVE_HOUSEHOLD,
      deleteSummary: ACTIVE_HOUSEHOLD,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "GAP",
      notes:
        "Legacy paycheck_amount/pay_schedule columns are household-readable; app uses paycheck_schedules (own-user). Latent risk if columns populated outside app.",
    },
    {
      object: "household_settings",
      classification: "owner_managed",
      intendedVisibility: "All active members read; owner write only",
      ruleKind: "active_household_owner",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: OWNER_WRITE,
      updateSummary: OWNER_WRITE,
      deleteSummary: "none",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "bills",
      classification: "household_shared",
      intendedVisibility: "Active household members full CRUD",
      ruleKind: "active_household_member",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: ACTIVE_HOUSEHOLD,
      updateSummary: ACTIVE_HOUSEHOLD,
      deleteSummary: ACTIVE_HOUSEHOLD,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "bill_instances",
      classification: "household_shared",
      intendedVisibility: "Active household members full CRUD with bill_id FK check",
      ruleKind: "active_household_member",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: `${ACTIVE_HOUSEHOLD}; bill_id in same household`,
      updateSummary: "same as insert",
      deleteSummary: ACTIVE_HOUSEHOLD,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "debt_accounts",
      classification: "household_shared",
      intendedVisibility: "Active household members full CRUD",
      ruleKind: "active_household_member",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: ACTIVE_HOUSEHOLD,
      updateSummary: ACTIVE_HOUSEHOLD,
      deleteSummary: ACTIVE_HOUSEHOLD,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "debt_payments",
      classification: "household_shared",
      intendedVisibility: "Active household members full CRUD with FK checks",
      ruleKind: "active_household_member",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: `${ACTIVE_HOUSEHOLD}; debt_account/bill_instance FK in household`,
      updateSummary: "same as insert",
      deleteSummary: ACTIVE_HOUSEHOLD,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "manual_expenses",
      classification: "household_shared",
      intendedVisibility: "Shared expenses household-visible; private only to creator",
      ruleKind: "shared_or_own_private",
      rlsEnabled: true,
      selectSummary:
        `${ACTIVE_HOUSEHOLD} AND (expense_scope=shared OR created_by_user_id=auth.uid())`,
      insertSummary: `${ACTIVE_HOUSEHOLD}; created_by_user_id = auth.uid()`,
      updateSummary: "creator only within household",
      deleteSummary: "creator only within household",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "cash_snapshots",
      classification: "own_user_private",
      intendedVisibility: "Own user current cash only",
      ruleKind: "own_user",
      rlsEnabled: true,
      selectSummary: OWN_USER,
      insertSummary: OWN_USER,
      updateSummary: OWN_USER,
      deleteSummary: OWN_USER,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "cash_payment_transactions",
      classification: "system_audit",
      intendedVisibility: "Own-user append-only cash audit rows",
      ruleKind: "append_only_own_user",
      rlsEnabled: true,
      selectSummary: OWN_USER,
      insertSummary: OWN_USER,
      updateSummary: "none (append-only)",
      deleteSummary: "none (append-only)",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "cash_adjustment_transactions",
      classification: "system_audit",
      intendedVisibility: "Own-user append-only cash credit audit rows",
      ruleKind: "append_only_own_user",
      rlsEnabled: true,
      selectSummary: OWN_USER,
      insertSummary: OWN_USER,
      updateSummary: "none (append-only)",
      deleteSummary: "none (append-only)",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "savings_goals",
      classification: "savings_private",
      intendedVisibility: "Shared goals household-visible; private goals creator-only",
      ruleKind: "shared_or_own_private",
      rlsEnabled: true,
      selectSummary:
        `${ACTIVE_HOUSEHOLD} AND (goal_type=shared OR created_by_user_id=auth.uid())`,
      insertSummary: `${ACTIVE_HOUSEHOLD}; created_by_user_id = auth.uid()`,
      updateSummary: "creator only",
      deleteSummary: "creator only",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "savings_goal_participants",
      classification: "savings_private",
      intendedVisibility: "Own participant targets only",
      ruleKind: "own_user",
      rlsEnabled: true,
      selectSummary: OWN_USER,
      insertSummary: OWN_USER,
      updateSummary: OWN_USER,
      deleteSummary: OWN_USER,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "savings_contributions",
      classification: "savings_private",
      intendedVisibility: "Own contributions only",
      ruleKind: "own_user",
      rlsEnabled: true,
      selectSummary: OWN_USER,
      insertSummary: OWN_USER,
      updateSummary: OWN_USER,
      deleteSummary: OWN_USER,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "paycheck_schedules",
      classification: "paycheck_private",
      intendedVisibility: "Own paycheck schedule and amount only",
      ruleKind: "own_user",
      rlsEnabled: true,
      selectSummary: OWN_USER,
      insertSummary: OWN_USER,
      updateSummary: OWN_USER,
      deleteSummary: OWN_USER,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "import_batches",
      classification: "import_tracking",
      intendedVisibility: "Household read metadata; owner apply/rollback write",
      ruleKind: "active_household_owner",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: `${OWNER_WRITE}; created_by = auth.uid()`,
      updateSummary: OWNER_WRITE,
      deleteSummary: "none",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "import_batch_records",
      classification: "import_tracking",
      intendedVisibility: "Household read record links; owner insert/update",
      ruleKind: "active_household_owner",
      rlsEnabled: true,
      selectSummary: ACTIVE_HOUSEHOLD,
      insertSummary: OWNER_WRITE,
      updateSummary: OWNER_WRITE,
      deleteSummary: "none",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "receipt_uploads",
      classification: "receipt_private",
      intendedVisibility: "Uploader-only receipt metadata",
      ruleKind: "uploader_own",
      rlsEnabled: true,
      selectSummary: UPLOADER_OWN,
      insertSummary: UPLOADER_OWN,
      updateSummary: UPLOADER_OWN,
      deleteSummary: UPLOADER_OWN,
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
    {
      object: "receipt_candidates",
      classification: "receipt_private",
      intendedVisibility: "Uploader-only draft candidates",
      ruleKind: "uploader_own",
      rlsEnabled: true,
      selectSummary: UPLOADER_OWN,
      insertSummary: `${UPLOADER_OWN}; receipt_upload owned by caller`,
      updateSummary: "own pending/dismissed/approved transitions",
      deleteSummary: "own pending/dismissed only",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
  ];
}

export function buildRlsStorageExpectations(): RlsStoragePolicyGroup[] {
  return [
    {
      object: "storage.buckets:receipt-uploads",
      classification: "storage_private",
      intendedVisibility: "Private bucket; no anonymous read",
      bucketPublic: false,
      selectSummary: "bucket_id=receipt-uploads; folder[1]=auth.uid()",
      insertSummary: "bucket_id=receipt-uploads; folder[1]=auth.uid()",
      updateSummary: "none (delete + re-upload pattern)",
      deleteSummary: "bucket_id=receipt-uploads; folder[1]=auth.uid()",
      ruleKind: "storage_uploader_path",
      removedInvitedBehavior: REMOVED_INVITED,
      auditResult: "PASS",
    },
  ];
}

export function countRlsGaps(
  tables: RlsTableExpectation[] = buildRlsTableExpectations(),
  storage: RlsStoragePolicyGroup[] = buildRlsStorageExpectations()
): number {
  return (
    tables.filter((row) => row.auditResult === "GAP").length +
    storage.filter((row) => row.auditResult === "GAP").length
  );
}

export function assertAllTablesClassified(): void {
  const expected = new Set(RLS_ALL_APP_TABLES);
  const documented = new Set(buildRlsTableExpectations().map((row) => row.object));

  for (const table of expected) {
    if (!documented.has(table)) {
      throw new Error(`Missing RLS classification for table: ${table}`);
    }
  }

  for (const table of documented) {
    if (!expected.has(table as (typeof RLS_ALL_APP_TABLES)[number])) {
      throw new Error(`Unexpected RLS table in registry: ${table}`);
    }
  }
}
