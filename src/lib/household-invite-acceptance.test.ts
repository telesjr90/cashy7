import { describe, expect, it } from "vitest";
import {
  ACCEPT_INVITE_PRIVACY_COPY,
  ACCEPT_INVITE_SIGN_IN_COPY,
  ACCEPT_INVITE_SUCCESS_TITLE,
  acceptInviteErrorLabel,
  buildAcceptInviteInvokePayload,
  buildAcceptInvitePageState,
  buildAcceptInviteQueryString,
  canClientPreviewAcceptInvitation,
  invitationEmailsMatch,
  isInvitationExpired,
  isInvitationIdPresent,
  mapAcceptFunctionCode,
  resolveInvitationId,
  sanitizeAcceptServiceMessage,
} from "./household-invite-acceptance";
import type { HouseholdInvitation } from "./types";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";

function makeInvitation(
  overrides: Partial<HouseholdInvitation> = {}
): HouseholdInvitation {
  return {
    id: INVITATION_ID,
    household_id: "22222222-2222-4222-8222-222222222222",
    email: "partner@example.com",
    role: "member",
    status: "invited",
    invited_by: "33333333-3333-4333-8333-333333333333",
    invited_user_id: null,
    expires_at: null,
    accepted_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("household invite acceptance helpers", () => {
  it("resolves invitation id from query before metadata", () => {
    expect(
      resolveInvitationId({
        queryInvitationId: INVITATION_ID,
        metadataInvitationId: "44444444-4444-4444-8444-444444444444",
      })
    ).toBe(INVITATION_ID);
  });

  it("falls back to metadata invitation id", () => {
    expect(
      resolveInvitationId({
        queryInvitationId: "",
        metadataInvitationId: INVITATION_ID,
      })
    ).toBe(INVITATION_ID);
  });

  it("matches invitation email case-insensitively", () => {
    expect(invitationEmailsMatch("Partner@Example.com", "partner@example.com")).toBe(
      true
    );
  });

  it("blocks wrong email", () => {
    const preview = canClientPreviewAcceptInvitation({
      invitationId: INVITATION_ID,
      callerEmail: "other@example.com",
      invitation: makeInvitation(),
    });
    expect(preview.allowed).toBe(false);
    expect(preview.code).toBe("wrong_email");
    expect(acceptInviteErrorLabel("wrong_email")).toMatch(/different email/i);
  });

  it("blocks expired invite", () => {
    const invitation = makeInvitation({
      expires_at: "2020-01-01T00:00:00.000Z",
    });
    expect(isInvitationExpired(invitation, new Date("2026-06-01T00:00:00.000Z"))).toBe(
      true
    );
    const preview = canClientPreviewAcceptInvitation({
      invitationId: INVITATION_ID,
      callerEmail: "partner@example.com",
      invitation,
    });
    expect(preview.code).toBe("expired");
    expect(acceptInviteErrorLabel("expired")).toMatch(/expired/i);
  });

  it("blocks cancelled invite", () => {
    const preview = canClientPreviewAcceptInvitation({
      invitationId: INVITATION_ID,
      callerEmail: "partner@example.com",
      invitation: makeInvitation({ status: "cancelled" }),
    });
    expect(preview.code).toBe("cancelled");
  });

  it("blocks already accepted invite", () => {
    const preview = canClientPreviewAcceptInvitation({
      invitationId: INVITATION_ID,
      callerEmail: "partner@example.com",
      invitation: makeInvitation({ status: "accepted" }),
    });
    expect(preview.code).toBe("already_accepted");
  });

  it("blocks household full state copy", () => {
    expect(acceptInviteErrorLabel("household_full")).toBe(
      "This household already has two active members."
    );
  });

  it("blocks already active member", () => {
    expect(acceptInviteErrorLabel("already_member")).toMatch(/already an active member/i);
  });

  it("requires invitation id", () => {
    expect(isInvitationIdPresent("")).toBe(false);
    const preview = canClientPreviewAcceptInvitation({
      invitationId: "",
      callerEmail: "partner@example.com",
    });
    expect(preview.code).toBe("missing_invitation");
  });

  it("shows sign-in state without session", () => {
    const state = buildAcceptInvitePageState({
      authLoading: false,
      authCodePending: false,
      userPresent: false,
      accepting: false,
      accepted: false,
      errorCode: null,
      invitationId: INVITATION_ID,
    });
    expect(state).toBe("needs_sign_in");
    expect(ACCEPT_INVITE_SIGN_IN_COPY).toMatch(/sign in/i);
  });

  it("shows success display without raw UUIDs", () => {
    expect(ACCEPT_INVITE_SUCCESS_TITLE).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(sanitizeAcceptServiceMessage(`Failed ${INVITATION_ID}`)).not.toMatch(
      INVITATION_ID
    );
  });

  it("wrong-email display hides sensitive invite data", () => {
    const label = acceptInviteErrorLabel("wrong_email");
    expect(label).not.toContain("partner@example.com");
    expect(label).toMatch(/different email/i);
  });

  it("includes privacy copy for private cash and savings", () => {
    expect(ACCEPT_INVITE_PRIVACY_COPY).toMatch(/private cash/i);
    expect(ACCEPT_INVITE_PRIVACY_COPY).toMatch(/savings/i);
    expect(ACCEPT_INVITE_PRIVACY_COPY).toMatch(/receipts/i);
    expect(ACCEPT_INVITE_PRIVACY_COPY).toMatch(/paycheck/i);
  });

  it("builds invoke payload with invitation id only", () => {
    expect(buildAcceptInviteInvokePayload(` ${INVITATION_ID} `)).toEqual({
      invitationId: INVITATION_ID,
    });
  });

  it("builds accept invite query string", () => {
    expect(buildAcceptInviteQueryString(INVITATION_ID)).toBe(
      `?invitation=${encodeURIComponent(INVITATION_ID)}`
    );
  });

  it("maps function codes safely", () => {
    expect(mapAcceptFunctionCode("wrong_email")).toBe("wrong_email");
    expect(mapAcceptFunctionCode("unexpected")).toBe("unknown");
  });

  it("allows valid pending invite preview", () => {
    const preview = canClientPreviewAcceptInvitation({
      invitationId: INVITATION_ID,
      callerEmail: "partner@example.com",
      invitation: makeInvitation(),
    });
    expect(preview.allowed).toBe(true);
    expect(preview.code).toBeNull();
  });
});
