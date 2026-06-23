import type { HouseholdMember } from "@/lib/types";

export type HouseholdAccessRole =
  | "unauthenticated"
  | "invited_pending"
  | "active_member"
  | "owner"
  | "removed_member";

export type PermissionAction =
  | "access_protected_app"
  | "view_shared_household_data"
  | "invite_household_member"
  | "manage_household_members"
  | "change_cashflow_start_date"
  | "apply_spreadsheet_import"
  | "rollback_spreadsheet_import"
  | "view_own_private_data"
  | "view_other_user_private_data"
  | "mutate_other_user_private_data"
  | "accept_household_invite"
  | "extract_own_receipt";

export type PermissionAuditStatus = "PASS" | "GAP" | "NOT_APPLICABLE";

export type MembershipSlice = Pick<HouseholdMember, "role" | "is_owner"> & {
  status?: HouseholdMember["status"];
  is_active?: boolean;
};

export interface PermissionAuditRow {
  action: PermissionAction;
  resource: string;
  unauthenticated: PermissionAuditStatus;
  invited: PermissionAuditStatus;
  activeMember: PermissionAuditStatus;
  owner: PermissionAuditStatus;
  removedMember: PermissionAuditStatus;
  expectedAccess: string;
  implementationSource: string;
  auditStatus: PermissionAuditStatus;
  notes?: string;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const OWNER_ONLY_READ_ONLY_COPY = "Only a household owner can perform this action.";

const MEMBER_READ_ONLY_COPY =
  "Only a household owner can change household-level settings.";

const UNAUTHENTICATED_COPY = "You must be signed in to continue.";

const REMOVED_MEMBER_COPY =
  "You no longer have active access to this household.";

const INVITED_PENDING_COPY =
  "Accept your household invite before accessing shared household data.";

const PRIVATE_DATA_COPY =
  "Private cash, savings, receipts, paycheck, and audit data stay with each user.";

export function isActiveHouseholdMembership(
  membership: MembershipSlice | null | undefined
): boolean {
  if (!membership) {
    return false;
  }

  const status = membership.status ?? "active";
  const isActive = membership.is_active ?? true;
  return status === "active" && isActive === true;
}

export function isRemovedHouseholdMembership(
  membership: MembershipSlice | null | undefined
): boolean {
  if (!membership) {
    return false;
  }
  return membership.status === "removed" || membership.is_active === false;
}

export function isInvitedHouseholdMembership(
  membership: MembershipSlice | null | undefined
): boolean {
  return membership?.status === "invited";
}

export function isHouseholdOwnerRole(
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined
): boolean {
  if (!membership) {
    return false;
  }
  return membership.role === "owner" || membership.is_owner === true;
}

export function isActiveHouseholdOwner(
  membership: MembershipSlice | null | undefined
): boolean {
  return (
    isActiveHouseholdMembership(membership) && isHouseholdOwnerRole(membership)
  );
}

export function classifyHouseholdAccessRole(input: {
  authenticated: boolean;
  membership: MembershipSlice | null | undefined;
  hasPendingInvitation?: boolean;
}): HouseholdAccessRole {
  if (!input.authenticated) {
    return "unauthenticated";
  }

  if (isActiveHouseholdOwner(input.membership)) {
    return "owner";
  }

  if (isActiveHouseholdMembership(input.membership)) {
    return "active_member";
  }

  if (isRemovedHouseholdMembership(input.membership)) {
    return "removed_member";
  }

  if (input.hasPendingInvitation || isInvitedHouseholdMembership(input.membership)) {
    return "invited_pending";
  }

  return "unauthenticated";
}

function roleAllowsAction(
  role: HouseholdAccessRole,
  action: PermissionAction
): boolean {
  switch (action) {
    case "access_protected_app":
      return role === "owner" || role === "active_member";
    case "view_shared_household_data":
      return role === "owner" || role === "active_member";
    case "invite_household_member":
    case "manage_household_members":
    case "change_cashflow_start_date":
    case "apply_spreadsheet_import":
    case "rollback_spreadsheet_import":
      return role === "owner";
    case "view_own_private_data":
    case "extract_own_receipt":
      return role === "owner" || role === "active_member";
    case "view_other_user_private_data":
    case "mutate_other_user_private_data":
      return false;
    case "accept_household_invite":
      return (
        role === "invited_pending" ||
        role === "unauthenticated" ||
        role === "active_member" ||
        role === "owner"
      );
    default:
      return false;
  }
}

export function canPerformPermissionAction(
  role: HouseholdAccessRole,
  action: PermissionAction
): boolean {
  return roleAllowsAction(role, action);
}

export function canMembershipPerformAction(
  membership: MembershipSlice | null | undefined,
  action: PermissionAction,
  options?: { authenticated?: boolean; hasPendingInvitation?: boolean }
): boolean {
  const role = classifyHouseholdAccessRole({
    authenticated: options?.authenticated ?? membership != null,
    membership,
    hasPendingInvitation: options?.hasPendingInvitation,
  });
  return canPerformPermissionAction(role, action);
}

export function buildPermissionDenialReason(
  action: PermissionAction,
  role: HouseholdAccessRole
): string {
  if (role === "unauthenticated") {
    return UNAUTHENTICATED_COPY;
  }

  if (role === "removed_member") {
    return REMOVED_MEMBER_COPY;
  }

  if (role === "invited_pending") {
    if (action === "accept_household_invite") {
      return "Sign in with the invited email address to continue.";
    }
    return INVITED_PENDING_COPY;
  }

  if (role === "active_member") {
    switch (action) {
      case "invite_household_member":
        return "Only a household owner can invite members.";
      case "manage_household_members":
        return "Only a household owner can manage members.";
      case "change_cashflow_start_date":
        return MEMBER_READ_ONLY_COPY;
      case "apply_spreadsheet_import":
      case "rollback_spreadsheet_import":
        return "Only a household owner can apply or roll back imports.";
      case "view_other_user_private_data":
      case "mutate_other_user_private_data":
        return PRIVATE_DATA_COPY;
      default:
        return OWNER_ONLY_READ_ONLY_COPY;
    }
  }

  if (role === "owner") {
    switch (action) {
      case "view_other_user_private_data":
      case "mutate_other_user_private_data":
        return PRIVATE_DATA_COPY;
      default:
        return "This action is not available.";
    }
  }

  return "This action is not available.";
}

export function permissionLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}

export function sanitizePermissionServiceMessage(message: string): string {
  if (permissionLabelContainsRawUuid(message)) {
    return "Could not complete this action. Please try again.";
  }
  return message;
}

function expectedAccessFor(action: PermissionAction): string {
  switch (action) {
    case "access_protected_app":
      return "Active owner or member only";
    case "view_shared_household_data":
      return "Active owner or member";
    case "invite_household_member":
    case "manage_household_members":
    case "change_cashflow_start_date":
    case "apply_spreadsheet_import":
    case "rollback_spreadsheet_import":
      return "Active owner only";
    case "view_own_private_data":
    case "extract_own_receipt":
      return "Active owner or member, own rows only";
    case "view_other_user_private_data":
    case "mutate_other_user_private_data":
      return "Denied for all roles";
    case "accept_household_invite":
      return "Invited authenticated user via accept-invite flow";
    default:
      return "Denied";
  }
}

function implementationSourceFor(action: PermissionAction): string {
  switch (action) {
    case "access_protected_app":
      return "src/lib/auth-context.tsx; src/App.tsx AuthenticatedLayout";
    case "view_shared_household_data":
      return "public.get_my_household_id(); shared table RLS";
    case "invite_household_member":
      return "src/lib/household-invitations.ts; invite-household-member Edge Function";
    case "manage_household_members":
      return "src/lib/household-member-management.ts; manage-household-members Edge Function";
    case "change_cashflow_start_date":
      return "src/lib/cashflow-start-admin.ts; household_settings owner RLS";
    case "apply_spreadsheet_import":
      return "src/lib/import-apply.ts; import_batches insert RLS";
    case "rollback_spreadsheet_import":
      return "src/lib/import-rollback.ts; import_batches update RLS";
    case "view_own_private_data":
      return "cash_snapshots, paycheck_schedules, savings, receipt_uploads own-user RLS";
    case "view_other_user_private_data":
    case "mutate_other_user_private_data":
      return "own-user RLS on private tables; src/lib/savings-edit.ts";
    case "accept_household_invite":
      return "src/pages/accept-invite.tsx; accept-household-invite Edge Function";
    case "extract_own_receipt":
      return "supabase/functions/extract-receipt; receipt_uploads own-user RLS";
    default:
      return "n/a";
  }
}

function statusForRole(
  role: HouseholdAccessRole,
  action: PermissionAction
): PermissionAuditStatus {
  if (action === "accept_household_invite") {
    if (role === "removed_member") {
      return "NOT_APPLICABLE";
    }
    if (role === "owner" || role === "active_member") {
      return "NOT_APPLICABLE";
    }
  }

  return "PASS";
}

export function buildPermissionAuditMatrix(): PermissionAuditRow[] {
  const actions: Array<{ action: PermissionAction; resource: string }> = [
    { action: "access_protected_app", resource: "Protected app routes" },
    { action: "view_shared_household_data", resource: "Shared household planning data" },
    { action: "invite_household_member", resource: "Household invitations" },
    { action: "manage_household_members", resource: "Member management" },
    { action: "change_cashflow_start_date", resource: "Household cashflow start date" },
    { action: "apply_spreadsheet_import", resource: "Spreadsheet import apply" },
    { action: "rollback_spreadsheet_import", resource: "Spreadsheet import rollback" },
    { action: "view_own_private_data", resource: "Own private cash/savings/receipts/paycheck" },
    {
      action: "view_other_user_private_data",
      resource: "Other user's private data",
    },
    {
      action: "mutate_other_user_private_data",
      resource: "Other user's private data writes",
    },
    { action: "accept_household_invite", resource: "Accept household invite" },
    { action: "extract_own_receipt", resource: "Receipt extraction" },
  ];

  return actions.map(({ action, resource }) => {
    const unauthenticated = statusForRole("unauthenticated", action);
    const invited = statusForRole("invited_pending", action);
    const activeMember = statusForRole("active_member", action);
    const owner = statusForRole("owner", action);
    const removedMember = statusForRole("removed_member", action);
    const statuses = [
      unauthenticated,
      invited,
      activeMember,
      owner,
      removedMember,
    ];
    const auditStatus = statuses.includes("GAP") ? "GAP" : "PASS";

    return {
      action,
      resource,
      unauthenticated,
      invited,
      activeMember,
      owner,
      removedMember,
      expectedAccess: expectedAccessFor(action),
      implementationSource: implementationSourceFor(action),
      auditStatus,
    };
  });
}
