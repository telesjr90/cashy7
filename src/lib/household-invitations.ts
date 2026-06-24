import { isActiveHouseholdOwner } from "@/lib/permissions-audit";
import type { HouseholdInvitation, HouseholdMember, Person } from "@/lib/types";
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

export const HOUSEHOLD_INVITE_PROFILE_LABEL = "Assign profile (optional)";

export const HOUSEHOLD_INVITE_PROFILE_PLACEHOLDER =
  "Select a profile for this person";

export const HOUSEHOLD_INVITE_PROFILE_NONE_OPTION_LABEL = "No profile (let them choose)";

export const HOUSEHOLD_INVITE_PROFILE_RESERVED_ACTIVE_COPY =
  "Already assigned to an active member.";

export const HOUSEHOLD_INVITE_PROFILE_RESERVED_PENDING_COPY =
  "Reserved by a pending invite.";

export const HOUSEHOLD_INVITE_PROFILE_STALE_ERROR =
  "That profile is no longer available.";

export const HOUSEHOLD_INVITE_PROFILE_NOT_IN_HOUSEHOLD_ERROR =
  "Selected profile is not part of this household.";

export const HOUSEHOLD_INVITE_PROFILE_UNKNOWN_LABEL = "Assigned profile";

export const HOUSEHOLD_INVITE_NO_PROFILES_COPY =
  "No household profiles are available to assign yet.";

export type HouseholdInviteErrorCode =
  | "invalid_email"
  | "self_invite"
  | "duplicate_invite"
  | "already_member"
  | "household_full"
  | "invalid_profile"
  | "profile_unavailable"
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
  membership:
    | Pick<HouseholdMember, "role" | "is_owner">
    | Pick<HouseholdMember, "role" | "is_owner" | "status" | "is_active">
    | null
    | undefined
): boolean {
  return isActiveHouseholdOwner(membership);
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
  membership:
    | Pick<HouseholdMember, "role" | "is_owner">
    | Pick<HouseholdMember, "role" | "is_owner" | "status" | "is_active">
    | null
    | undefined;
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
    case "invalid_profile":
      return HOUSEHOLD_INVITE_PROFILE_NOT_IN_HOUSEHOLD_ERROR;
    case "profile_unavailable":
      return HOUSEHOLD_INVITE_PROFILE_STALE_ERROR;
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
    case "invalid_profile":
    case "profile_unavailable":
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
  assignedProfileLabel: string | null;
}

export interface InviteProfileOption {
  personId: string;
  name: string;
  available: boolean;
  unavailableReason: string | null;
}

export function getActiveMemberPersonIds(
  members: ReadonlyArray<
    Pick<HouseholdMember, "person_id" | "status" | "is_active">
  >
): Set<string> {
  const ids = new Set<string>();
  for (const member of members) {
    if (
      member.status === "active" &&
      member.is_active === true &&
      typeof member.person_id === "string" &&
      member.person_id.length > 0
    ) {
      ids.add(member.person_id);
    }
  }
  return ids;
}

export function getPendingInviteAssignedPersonIds(
  invitations: ReadonlyArray<
    Pick<HouseholdInvitation, "status" | "assigned_person_id">
  >
): Set<string> {
  const ids = new Set<string>();
  for (const invitation of invitations) {
    if (
      invitation.status === "invited" &&
      typeof invitation.assigned_person_id === "string" &&
      invitation.assigned_person_id.length > 0
    ) {
      ids.add(invitation.assigned_person_id);
    }
  }
  return ids;
}

export function buildInviteProfileOptions(input: {
  people: ReadonlyArray<Person>;
  activeMembers: ReadonlyArray<
    Pick<HouseholdMember, "person_id" | "status" | "is_active">
  >;
  pendingInvitations: ReadonlyArray<
    Pick<HouseholdInvitation, "status" | "assigned_person_id">
  >;
}): InviteProfileOption[] {
  const activeReserved = getActiveMemberPersonIds(input.activeMembers);
  const pendingReserved = getPendingInviteAssignedPersonIds(
    input.pendingInvitations
  );

  return input.people.map((person) => {
    if (activeReserved.has(person.id)) {
      return {
        personId: person.id,
        name: person.name,
        available: false,
        unavailableReason: HOUSEHOLD_INVITE_PROFILE_RESERVED_ACTIVE_COPY,
      };
    }
    if (pendingReserved.has(person.id)) {
      return {
        personId: person.id,
        name: person.name,
        available: false,
        unavailableReason: HOUSEHOLD_INVITE_PROFILE_RESERVED_PENDING_COPY,
      };
    }
    return {
      personId: person.id,
      name: person.name,
      available: true,
      unavailableReason: null,
    };
  });
}

export function validateAssignedProfileSelection(input: {
  assignedPersonId: string | null | undefined;
  people: ReadonlyArray<Person>;
  activeMembers: ReadonlyArray<
    Pick<HouseholdMember, "person_id" | "status" | "is_active">
  >;
  pendingInvitations: ReadonlyArray<
    Pick<HouseholdInvitation, "status" | "assigned_person_id">
  >;
}):
  | { ok: true; assignedPersonId: string | null }
  | { ok: false; error: string } {
  const id = input.assignedPersonId?.trim() ?? "";
  if (!id) {
    return { ok: true, assignedPersonId: null };
  }

  const person = input.people.find((row) => row.id === id);
  if (!person) {
    return { ok: false, error: HOUSEHOLD_INVITE_PROFILE_NOT_IN_HOUSEHOLD_ERROR };
  }

  const activeReserved = getActiveMemberPersonIds(input.activeMembers);
  const pendingReserved = getPendingInviteAssignedPersonIds(
    input.pendingInvitations
  );
  if (activeReserved.has(id) || pendingReserved.has(id)) {
    return { ok: false, error: HOUSEHOLD_INVITE_PROFILE_STALE_ERROR };
  }

  return { ok: true, assignedPersonId: id };
}

export function buildPeopleNameLookup(
  people: ReadonlyArray<Pick<Person, "id" | "name">>
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const person of people) {
    lookup.set(person.id, person.name);
  }
  return lookup;
}

export function buildAssignedProfileLabel(
  invitation: Pick<HouseholdInvitation, "assigned_person_id">,
  peopleById?: ReadonlyMap<string, string>
): string | null {
  const id = invitation.assigned_person_id;
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  const name = peopleById?.get(id);
  if (name && name.trim().length > 0) {
    return name;
  }
  // Never surface a raw UUID in the UI.
  return HOUSEHOLD_INVITE_PROFILE_UNKNOWN_LABEL;
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
  invitation: HouseholdInvitation,
  peopleById?: ReadonlyMap<string, string>
): HouseholdInvitationDisplay {
  return {
    email: invitation.email,
    statusLabel: buildInvitationStatusLabel(invitation.status),
    sentAtLabel: formatInvitationSentAt(invitation.created_at),
    assignedProfileLabel: buildAssignedProfileLabel(invitation, peopleById),
  };
}

export function buildPendingInvitationDisplays(
  invitations: HouseholdInvitation[],
  peopleById?: ReadonlyMap<string, string>
): HouseholdInvitationDisplay[] {
  return invitations
    .filter((invitation) => invitation.status === "invited")
    .map((invitation) => buildInvitationDisplayModel(invitation, peopleById));
}

export function buildInviteInvokePayload(
  email: string,
  assignedPersonId?: string | null
): { email: string; assignedPersonId?: string } {
  const payload: { email: string; assignedPersonId?: string } = {
    email: normalizeInviteEmail(email),
  };
  const id = assignedPersonId?.trim();
  if (id) {
    payload.assignedPersonId = id;
  }
  return payload;
}
