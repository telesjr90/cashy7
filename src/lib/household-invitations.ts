import type { HouseholdInvitation, HouseholdMember } from "@/lib/types";
import { format, parseISO } from "date-fns";

export const HOUSEHOLD_MAX_MEMBERS = 2;

export const HOUSEHOLD_INVITE_TITLE = "Invite household member";

export const HOUSEHOLD_INVITE_DESCRIPTION =
  "Send an email invite for the second household user.";

export const HOUSEHOLD_INVITE_READ_ONLY_COPY =
  "Only a household owner can invite members.";

export const HOUSEHOLD_MAX_USERS_COPY = "This household supports two users.";

export const HOUSEHOLD_INVITE_PRIVACY_COPY =
  "Invited members do not see private cash, private savings, receipt candidates, or cash audit history until membership and privacy rules are applied.";

export const HOUSEHOLD_INVITE_SUCCESS_COPY = "Invite sent.";

export const HOUSEHOLD_INVITE_EMAIL_LABEL = "Email address";

export const HOUSEHOLD_INVITE_SEND_LABEL = "Send invite";

export const HOUSEHOLD_INVITE_PENDING_TITLE = "Pending invite";

export type HouseholdInviteErrorCode =
  | "invalid_email"
  | "self_invite"
  | "duplicate_invite"
  | "already_member"
  | "household_full"
  | "forbidden"
  | "unauthorized"
  | "provider_error"
  | "function_unavailable"
  | "unknown";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInviteEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateInviteEmail(value: string): {
  valid: boolean;
  normalized: string;
  error: string | null;
} {
  const normalized = normalizeInviteEmail(value);
  if (!normalized) {
    return { valid: false, normalized, error: "Enter an email address." };
  }
  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return { valid: false, normalized, error: "Enter a valid email address." };
  }
  return { valid: true, normalized, error: null };
}

export function canOwnerInviteMembers(
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined
): boolean {
  if (!membership) {
    return false;
  }
  return membership.role === "owner" || membership.is_owner === true;
}

export function isSelfInvite(
  inviteEmail: string,
  ownerEmail: string | null | undefined
): boolean {
  if (!ownerEmail?.trim()) {
    return false;
  }
  return normalizeInviteEmail(inviteEmail) === normalizeInviteEmail(ownerEmail);
}

export function countActiveHouseholdMembers(
  members: ReadonlyArray<Pick<HouseholdMember, "status" | "is_active">>
): number {
  return members.filter(
    (member) => member.status === "active" && member.is_active === true
  ).length;
}

export function isHouseholdAtMemberCapacity(activeMemberCount: number): boolean {
  return activeMemberCount >= HOUSEHOLD_MAX_MEMBERS;
}

export function hasPendingInviteForEmail(
  invitations: ReadonlyArray<Pick<HouseholdInvitation, "email" | "status">>,
  email: string
): boolean {
  const normalized = normalizeInviteEmail(email);
  return invitations.some(
    (invitation) =>
      invitation.status === "invited" &&
      normalizeInviteEmail(invitation.email) === normalized
  );
}

export function isEmailActiveHouseholdMember(
  members: ReadonlyArray<Pick<HouseholdMember, "email" | "status" | "is_active">>,
  email: string
): boolean {
  const normalized = normalizeInviteEmail(email);
  return members.some((member) => {
    if (member.status !== "active" || member.is_active !== true) {
      return false;
    }
    const memberEmail =
      typeof member.email === "string" ? normalizeInviteEmail(member.email) : "";
    return memberEmail.length > 0 && memberEmail === normalized;
  });
}

export function canSendHouseholdInvite(input: {
  membership: Pick<HouseholdMember, "role" | "is_owner"> | null | undefined;
  ownerEmail: string | null | undefined;
  inviteEmail: string;
  activeMembers: ReadonlyArray<Pick<HouseholdMember, "email" | "status" | "is_active">>;
  pendingInvitations: ReadonlyArray<Pick<HouseholdInvitation, "email" | "status">>;
}): { allowed: boolean; code: HouseholdInviteErrorCode | null; message: string | null } {
  if (!canOwnerInviteMembers(input.membership)) {
    return {
      allowed: false,
      code: "forbidden",
      message: HOUSEHOLD_INVITE_READ_ONLY_COPY,
    };
  }

  const validation = validateInviteEmail(input.inviteEmail);
  if (!validation.valid) {
    return {
      allowed: false,
      code: "invalid_email",
      message: validation.error,
    };
  }

  if (isSelfInvite(validation.normalized, input.ownerEmail)) {
    return {
      allowed: false,
      code: "self_invite",
      message: inviteErrorLabel("self_invite"),
    };
  }

  if (isHouseholdAtMemberCapacity(countActiveHouseholdMembers(input.activeMembers))) {
    return {
      allowed: false,
      code: "household_full",
      message: inviteErrorLabel("household_full"),
    };
  }

  if (isEmailActiveHouseholdMember(input.activeMembers, validation.normalized)) {
    return {
      allowed: false,
      code: "already_member",
      message: inviteErrorLabel("already_member"),
    };
  }

  if (hasPendingInviteForEmail(input.pendingInvitations, validation.normalized)) {
    return {
      allowed: false,
      code: "duplicate_invite",
      message: inviteErrorLabel("duplicate_invite"),
    };
  }

  return { allowed: true, code: null, message: null };
}

export function inviteErrorLabel(code: HouseholdInviteErrorCode): string {
  switch (code) {
    case "invalid_email":
      return "Enter a valid email address.";
    case "self_invite":
      return "You cannot invite your own email address.";
    case "duplicate_invite":
      return "A pending invite already exists for this email.";
    case "already_member":
      return "This email already belongs to an active household member.";
    case "household_full":
      return "This household already has two active members.";
    case "forbidden":
      return HOUSEHOLD_INVITE_READ_ONLY_COPY;
    case "unauthorized":
      return "You must be signed in to send an invite.";
    case "provider_error":
      return "Could not send the invite right now. Try again later.";
    case "function_unavailable":
      return "Invite service is unavailable right now. Try again later.";
    default:
      return "Could not send the invite. Please try again.";
  }
}

export function sanitizeInviteServiceMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return inviteErrorLabel("unknown");
  }
  return message;
}

export function mapInviteFunctionCode(
  code: string | undefined
): HouseholdInviteErrorCode {
  switch (code) {
    case "invalid_email":
    case "self_invite":
    case "duplicate_invite":
    case "already_member":
    case "household_full":
    case "forbidden":
    case "unauthorized":
    case "provider_error":
      return code;
    default:
      return "unknown";
  }
}

export interface HouseholdInvitationDisplay {
  email: string;
  statusLabel: string;
  sentAtLabel: string;
}

export function buildInvitationStatusLabel(
  status: HouseholdInvitation["status"]
): string {
  switch (status) {
    case "invited":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return "Unknown";
  }
}

export function formatInvitationSentAt(createdAt: string): string {
  try {
    return format(parseISO(createdAt), "MMMM d, yyyy");
  } catch {
    return "Unknown date";
  }
}

export function buildInvitationDisplayModel(
  invitation: HouseholdInvitation
): HouseholdInvitationDisplay {
  return {
    email: invitation.email,
    statusLabel: buildInvitationStatusLabel(invitation.status),
    sentAtLabel: formatInvitationSentAt(invitation.created_at),
  };
}

export function buildPendingInvitationDisplays(
  invitations: HouseholdInvitation[]
): HouseholdInvitationDisplay[] {
  return invitations
    .filter((invitation) => invitation.status === "invited")
    .map(buildInvitationDisplayModel);
}

export function buildInviteInvokePayload(email: string): { email: string } {
  return { email: normalizeInviteEmail(email) };
}
