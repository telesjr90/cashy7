import type { HouseholdInvitation, HouseholdMember } from "@/lib/types";
import { format, parseISO } from "date-fns";
import {
  buildInvitationStatusLabel,
  canOwnerInviteMembers,
  countActiveHouseholdMembers,
  formatInvitationSentAt,
  HOUSEHOLD_MAX_MEMBERS,
} from "@/lib/household-invitations";

export const HOUSEHOLD_MEMBER_MANAGEMENT_TITLE = "Household members";

export const HOUSEHOLD_MEMBER_MANAGEMENT_DESCRIPTION =
  "Review household membership and manage pending invites.";

export const HOUSEHOLD_MEMBER_MANAGEMENT_READ_ONLY_COPY =
  "Only a household owner can manage members.";

export const HOUSEHOLD_MEMBER_MANAGEMENT_PRIVACY_COPY =
  "Member management does not expose private cash, private savings, receipt candidates, paycheck amounts, or cash audit history.";

export const CANCEL_INVITE_ACTION_LABEL = "Cancel invite";

export const RESEND_INVITE_ACTION_LABEL = "Resend invite";

export const REMOVE_MEMBER_ACTION_LABEL = "Remove member";

export const CANCEL_INVITE_SUCCESS_COPY = "Invite cancelled.";

export const RESEND_INVITE_SUCCESS_COPY = "A new invite email was sent.";

export const REMOVE_MEMBER_SUCCESS_COPY = "Member removed from household.";

export const CANCEL_INVITE_CONFIRMATION_LINES = [
  "This invite will no longer be usable.",
  "No household records will be deleted.",
] as const;

export const RESEND_INVITE_CONFIRMATION_LINES = [
  "A new invite email will be sent to this address.",
] as const;

export const REMOVE_MEMBER_CONFIRMATION_LINES = [
  "This removes household access for this member.",
  "Historical shared records are preserved.",
  "Private cash, savings, receipts, paycheck, and audit records are not deleted.",
] as const;

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type HouseholdMemberManagementAction =
  | "cancel_invite"
  | "resend_invite"
  | "remove_member";

export type HouseholdMemberManagementErrorCode =
  | "forbidden"
  | "unauthorized"
  | "invalid_target"
  | "invalid_status"
  | "cannot_remove_self"
  | "cannot_remove_owner"
  | "only_owner"
  | "provider_error"
  | "function_unavailable"
  | "unknown";

export type MemberDisplayStatus = "active" | "invited" | "removed" | "cancelled";

export interface HouseholdMemberDisplay {
  id: string;
  label: string;
  roleLabel: string;
  statusLabel: string;
  detailLabel: string | null;
}

export interface HouseholdInvitationManagementDisplay {
  id: string;
  email: string;
  statusLabel: string;
  sentAtLabel: string;
}

export interface HouseholdMemberManagementView {
  canManage: boolean;
  activeMembers: HouseholdMemberDisplay[];
  pendingInvites: HouseholdInvitationManagementDisplay[];
  historyItems: Array<{
    kind: "invite" | "member";
    label: string;
    statusLabel: string;
    detailLabel: string | null;
  }>;
  capacityLabel: string;
  hasSecondActiveMember: boolean;
  hasPendingInvite: boolean;
}

export function canOwnerManageMembers(
  membership: Pick<HouseholdMember, "role" | "is_owner" | "status" | "is_active"> | null | undefined
): boolean {
  if (!membership || membership.status !== "active" || membership.is_active !== true) {
    return false;
  }
  return canOwnerInviteMembers(membership);
}

export function isActiveHouseholdMember(
  member: Pick<HouseholdMember, "status" | "is_active">
): boolean {
  return member.status === "active" && member.is_active === true;
}

export function isRemovedHouseholdMember(
  member: Pick<HouseholdMember, "status" | "is_active">
): boolean {
  return member.status === "removed" || member.is_active === false;
}

export function buildMemberRoleLabel(
  member: Pick<HouseholdMember, "role" | "is_owner">
): string {
  if (member.role === "owner" || member.is_owner === true) {
    return "Owner";
  }
  return "Member";
}

export function buildMemberStatusLabel(
  member: Pick<HouseholdMember, "status" | "is_active">
): string {
  if (member.status === "removed" || (member.is_active === false && member.status !== "invited")) {
    return "Removed";
  }
  if (member.status === "invited") {
    return "Invited";
  }
  if (member.status === "active" && member.is_active === true) {
    return "Active";
  }
  return "Unknown";
}

export function buildMemberDisplayLabel(
  member: Pick<HouseholdMember, "display_name" | "email">
): string {
  const displayName = member.display_name?.trim();
  if (displayName) {
    return displayName;
  }
  const email = member.email?.trim();
  if (email) {
    return email;
  }
  return "Household member";
}

export function buildMemberDisplayModel(
  member: HouseholdMember
): HouseholdMemberDisplay {
  return {
    id: member.id,
    label: buildMemberDisplayLabel(member),
    roleLabel: buildMemberRoleLabel(member),
    statusLabel: buildMemberStatusLabel(member),
    detailLabel: member.email?.trim() ? member.email.trim() : null,
  };
}

export function buildInvitationManagementDisplay(
  invitation: HouseholdInvitation
): HouseholdInvitationManagementDisplay {
  return {
    id: invitation.id,
    email: invitation.email,
    statusLabel: buildInvitationStatusLabel(invitation.status),
    sentAtLabel: formatInvitationSentAt(invitation.created_at),
  };
}

export function formatMemberRemovedAt(removedAt: string | null | undefined): string | null {
  if (!removedAt) {
    return null;
  }
  try {
    return format(parseISO(removedAt), "MMMM d, yyyy");
  } catch {
    return null;
  }
}

export function countPendingInvitations(
  invitations: ReadonlyArray<Pick<HouseholdInvitation, "status">>
): number {
  return invitations.filter((invitation) => invitation.status === "invited").length;
}

export function buildCapacityLabel(activeMemberCount: number, pendingInviteCount: number): string {
  const activeLabel =
    activeMemberCount >= HOUSEHOLD_MAX_MEMBERS
      ? "This household has two active members."
      : activeMemberCount === 1
        ? "One active member. You can invite one more user."
        : "No active members counted.";

  if (pendingInviteCount > 0) {
    return `${activeLabel} ${pendingInviteCount} pending invite${pendingInviteCount === 1 ? "" : "s"}.`;
  }

  return activeLabel;
}

export function buildMemberManagementView(input: {
  membership: Pick<HouseholdMember, "role" | "is_owner" | "status" | "is_active"> | null | undefined;
  members: HouseholdMember[];
  invitations: HouseholdInvitation[];
}): HouseholdMemberManagementView {
  const canManage = canOwnerManageMembers(input.membership);
  const activeMembers = input.members
    .filter(isActiveHouseholdMember)
    .map(buildMemberDisplayModel);

  const pendingInvites = input.invitations
    .filter((invitation) => invitation.status === "invited")
    .map(buildInvitationManagementDisplay);

  const historyItems = [
    ...input.invitations
      .filter((invitation) => invitation.status === "cancelled" || invitation.status === "expired")
      .map((invitation) => ({
        kind: "invite" as const,
        label: invitation.email,
        statusLabel: buildInvitationStatusLabel(invitation.status),
        detailLabel: `Sent ${formatInvitationSentAt(invitation.created_at)}`,
      })),
    ...input.members
      .filter(isRemovedHouseholdMember)
      .map((member) => {
        const display = buildMemberDisplayModel(member);
        const removedAt = formatMemberRemovedAt(member.removed_at);
        return {
          kind: "member" as const,
          label: display.label,
          statusLabel: display.statusLabel,
          detailLabel: removedAt ? `Removed ${removedAt}` : null,
        };
      }),
  ];

  const activeMemberCount = countActiveHouseholdMembers(input.members);
  const pendingInviteCount = countPendingInvitations(input.invitations);

  return {
    canManage,
    activeMembers,
    pendingInvites,
    historyItems,
    capacityLabel: buildCapacityLabel(activeMemberCount, pendingInviteCount),
    hasSecondActiveMember: activeMemberCount >= HOUSEHOLD_MAX_MEMBERS,
    hasPendingInvite: pendingInviteCount > 0,
  };
}

export function canCancelPendingInvite(
  invitation: Pick<HouseholdInvitation, "status"> | null | undefined
): boolean {
  return invitation?.status === "invited";
}

export function canResendPendingInvite(
  invitation: Pick<HouseholdInvitation, "status"> | null | undefined
): boolean {
  return invitation?.status === "invited";
}

export function canRemoveActiveMember(input: {
  callerUserId: string;
  targetMember: Pick<
    HouseholdMember,
    "user_id" | "role" | "is_owner" | "status" | "is_active"
  > | null | undefined;
  activeOwnerCount: number;
}): { allowed: boolean; code: HouseholdMemberManagementErrorCode | null } {
  const { targetMember } = input;

  if (!targetMember || !isActiveHouseholdMember(targetMember)) {
    return { allowed: false, code: "invalid_status" };
  }

  if (targetMember.user_id === input.callerUserId) {
    return { allowed: false, code: "cannot_remove_self" };
  }

  if (targetMember.role === "owner" || targetMember.is_owner === true) {
    return { allowed: false, code: "cannot_remove_owner" };
  }

  if (input.activeOwnerCount < 1) {
    return { allowed: false, code: "only_owner" };
  }

  return { allowed: true, code: null };
}

export function buildManagementConfirmationLines(
  action: HouseholdMemberManagementAction
): readonly string[] {
  switch (action) {
    case "cancel_invite":
      return CANCEL_INVITE_CONFIRMATION_LINES;
    case "resend_invite":
      return RESEND_INVITE_CONFIRMATION_LINES;
    case "remove_member":
      return REMOVE_MEMBER_CONFIRMATION_LINES;
  }
}

export function buildManagementActionLabel(
  action: HouseholdMemberManagementAction
): string {
  switch (action) {
    case "cancel_invite":
      return CANCEL_INVITE_ACTION_LABEL;
    case "resend_invite":
      return RESEND_INVITE_ACTION_LABEL;
    case "remove_member":
      return REMOVE_MEMBER_ACTION_LABEL;
  }
}

export function buildManagementSuccessCopy(
  action: HouseholdMemberManagementAction
): string {
  switch (action) {
    case "cancel_invite":
      return CANCEL_INVITE_SUCCESS_COPY;
    case "resend_invite":
      return RESEND_INVITE_SUCCESS_COPY;
    case "remove_member":
      return REMOVE_MEMBER_SUCCESS_COPY;
  }
}

export function managementErrorLabel(
  code: HouseholdMemberManagementErrorCode
): string {
  switch (code) {
    case "forbidden":
      return HOUSEHOLD_MEMBER_MANAGEMENT_READ_ONLY_COPY;
    case "unauthorized":
      return "You must be signed in to manage household members.";
    case "invalid_target":
      return "This household member or invite could not be found.";
    case "invalid_status":
      return "This action is not available for the current status.";
    case "cannot_remove_self":
      return "You cannot remove yourself from the household.";
    case "cannot_remove_owner":
      return "Household owners cannot be removed.";
    case "only_owner":
      return "The only household owner cannot be removed.";
    case "provider_error":
      return "Could not resend the invite right now. Try again later.";
    case "function_unavailable":
      return "Member management is unavailable right now. Try again later.";
    default:
      return "Could not complete this action. Please try again.";
  }
}

export function sanitizeManagementServiceMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return managementErrorLabel("unknown");
  }
  return message;
}

export function mapManagementFunctionCode(
  code: string | undefined
): HouseholdMemberManagementErrorCode {
  switch (code) {
    case "forbidden":
    case "unauthorized":
    case "invalid_target":
    case "invalid_status":
    case "cannot_remove_self":
    case "cannot_remove_owner":
    case "only_owner":
    case "provider_error":
      return code;
    default:
      return "unknown";
  }
}

export function buildManagementInvokePayload(input: {
  action: HouseholdMemberManagementAction;
  invitationId?: string;
  memberId?: string;
}): {
  action: HouseholdMemberManagementAction;
  invitationId?: string;
  memberId?: string;
} {
  return {
    action: input.action,
    ...(input.invitationId ? { invitationId: input.invitationId } : {}),
    ...(input.memberId ? { memberId: input.memberId } : {}),
  };
}

export function containsRawUuidInDisplayLabel(label: string): boolean {
  return UUID_PATTERN.test(label);
}
