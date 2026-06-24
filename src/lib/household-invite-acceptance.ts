import type { HouseholdInvitation } from "@/lib/types";
import { normalizeInviteEmail } from "@/lib/household-invitations";

export const ACCEPT_INVITE_TITLE = "Join household";

export const ACCEPT_INVITE_LOADING_COPY = "Preparing your invite...";

export const ACCEPT_INVITE_ACCEPTING_COPY = "Joining household...";

export const ACCEPT_INVITE_SUCCESS_TITLE = "You joined the household.";

export const ACCEPT_INVITE_SUCCESS_BODY =
  "You can now continue to the dashboard.";

export const ACCEPT_INVITE_PRIVACY_COPY =
  "Your private cash, savings, receipts, and paycheck settings remain private.";

export const ACCEPT_INVITE_SIGN_IN_COPY =
  "Sign in with the email address that received the invite to continue.";

export const ACCEPT_INVITE_SET_PASSWORD_COPY =
  "If this is your first sign-in, set your password using the invite email instructions, then return here.";

export type AcceptInviteErrorCode =
  | "missing_invitation"
  | "invalid_invitation"
  | "unauthorized"
  | "wrong_email"
  | "expired"
  | "cancelled"
  | "already_accepted"
  | "household_full"
  | "already_member"
  | "self_invite"
  | "forbidden"
  | "profile_unavailable"
  | "function_unavailable"
  | "unknown";

export type AcceptInvitePageState =
  | "loading"
  | "needs_sign_in"
  | "accepting"
  | "success"
  | "error";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function normalizeInvitationId(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function isInvitationIdPresent(value: string | null | undefined): boolean {
  return normalizeInvitationId(value).length > 0;
}

export function resolveInvitationId(input: {
  queryInvitationId?: string | null;
  metadataInvitationId?: string | null;
}): string {
  const fromQuery = normalizeInvitationId(input.queryInvitationId);
  if (fromQuery) {
    return fromQuery;
  }
  return normalizeInvitationId(input.metadataInvitationId);
}

export function invitationEmailsMatch(
  callerEmail: string | null | undefined,
  invitationEmail: string
): boolean {
  if (!callerEmail?.trim()) {
    return false;
  }
  return normalizeInviteEmail(callerEmail) === normalizeInviteEmail(invitationEmail);
}

export function isInvitationExpired(
  invitation: Pick<HouseholdInvitation, "expires_at" | "status">,
  now: Date = new Date()
): boolean {
  if (invitation.status === "expired") {
    return true;
  }
  if (!invitation.expires_at) {
    return false;
  }
  const expiresAt = Date.parse(invitation.expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export function canClientPreviewAcceptInvitation(input: {
  invitationId: string;
  callerEmail: string | null | undefined;
  invitation?: Pick<HouseholdInvitation, "email" | "status" | "expires_at"> | null;
}): { allowed: boolean; code: AcceptInviteErrorCode | null } {
  if (!isInvitationIdPresent(input.invitationId)) {
    return { allowed: false, code: "missing_invitation" };
  }

  if (!input.callerEmail?.trim()) {
    return { allowed: false, code: "unauthorized" };
  }

  if (!input.invitation) {
    return { allowed: true, code: null };
  }

  if (!invitationEmailsMatch(input.callerEmail, input.invitation.email)) {
    return { allowed: false, code: "wrong_email" };
  }

  if (input.invitation.status === "accepted") {
    return { allowed: false, code: "already_accepted" };
  }

  if (input.invitation.status === "cancelled") {
    return { allowed: false, code: "cancelled" };
  }

  if (
    input.invitation.status === "expired" ||
    isInvitationExpired(input.invitation)
  ) {
    return { allowed: false, code: "expired" };
  }

  if (input.invitation.status !== "invited") {
    return { allowed: false, code: "invalid_invitation" };
  }

  return { allowed: true, code: null };
}

export function acceptInviteErrorLabel(code: AcceptInviteErrorCode): string {
  switch (code) {
    case "missing_invitation":
      return "This invite link is missing required information.";
    case "invalid_invitation":
      return "This invite is not valid.";
    case "unauthorized":
      return ACCEPT_INVITE_SIGN_IN_COPY;
    case "wrong_email":
      return "This invite was sent to a different email address.";
    case "expired":
      return "This invite has expired.";
    case "cancelled":
      return "This invite is no longer active.";
    case "already_accepted":
      return "This invite has already been accepted.";
    case "household_full":
      return "This household already has two active members.";
    case "already_member":
      return "You are already an active member of this household.";
    case "self_invite":
      return "You cannot accept an invite you sent to yourself.";
    case "forbidden":
      return "You cannot accept this invite.";
    case "profile_unavailable":
      return "The profile reserved for this invite is no longer available. Ask the household owner to send a new invite.";
    case "function_unavailable":
      return "Invite acceptance is unavailable right now. Try again later.";
    default:
      return "Could not accept this invite. Please try again.";
  }
}

export function mapAcceptFunctionCode(
  code: string | undefined
): AcceptInviteErrorCode {
  switch (code) {
    case "missing_invitation":
    case "invalid_invitation":
    case "unauthorized":
    case "wrong_email":
    case "expired":
    case "cancelled":
    case "already_accepted":
    case "household_full":
    case "already_member":
    case "self_invite":
    case "forbidden":
    case "profile_unavailable":
      return code;
    default:
      return "unknown";
  }
}

export function sanitizeAcceptServiceMessage(message: string): string {
  if (UUID_PATTERN.test(message)) {
    return acceptInviteErrorLabel("unknown");
  }
  return message;
}

export function buildAcceptInvitePageState(input: {
  authLoading: boolean;
  authCodePending: boolean;
  userPresent: boolean;
  accepting: boolean;
  accepted: boolean;
  errorCode: AcceptInviteErrorCode | null;
  invitationId: string;
}): AcceptInvitePageState {
  if (input.accepted) {
    return "success";
  }

  if (input.authLoading || input.authCodePending) {
    return "loading";
  }

  if (!isInvitationIdPresent(input.invitationId)) {
    return "error";
  }

  if (!input.userPresent) {
    return "needs_sign_in";
  }

  if (input.accepting) {
    return "accepting";
  }

  if (input.errorCode) {
    return "error";
  }

  return "accepting";
}

export function buildAcceptInviteInvokePayload(invitationId: string): {
  invitationId: string;
} {
  return { invitationId: normalizeInvitationId(invitationId) };
}

export function buildAcceptInviteQueryString(invitationId: string): string {
  const id = normalizeInvitationId(invitationId);
  if (!id) {
    return "";
  }
  return `?invitation=${encodeURIComponent(id)}`;
}
