import { describe, expect, it } from "vitest";
import {
  buildInvitationDisplayModel,
  buildPendingInvitationDisplays,
  canOwnerInviteMembers,
  canSendHouseholdInvite,
  countActiveHouseholdMembers,
  hasPendingInviteForEmail,
  HOUSEHOLD_INVITE_READ_ONLY_COPY,
  HOUSEHOLD_INVITE_SUCCESS_COPY,
  inviteErrorLabel,
  isEmailActiveHouseholdMember,
  isHouseholdAtMemberCapacity,
  isSelfInvite,
  mapInviteFunctionCode,
  normalizeInviteEmail,
  sanitizeInviteServiceMessage,
  validateInviteEmail,
} from "./household-invitations";
import type { HouseholdInvitation, HouseholdMember } from "./types";

const OWNER_MEMBERSHIP: Pick<HouseholdMember, "role" | "is_owner"> = {
  role: "owner",
  is_owner: true,
};

const MEMBER_MEMBERSHIP: Pick<HouseholdMember, "role" | "is_owner"> = {
  role: "member",
  is_owner: false,
};

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

describe("household invitations helpers", () => {
  it("accepts and normalizes valid email", () => {
    const result = validateInviteEmail("  Partner@Example.COM ");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("partner@example.com");
    expect(result.error).toBeNull();
  });

  it("rejects invalid email", () => {
    const result = validateInviteEmail("not-an-email");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/valid email/i);
  });

  it("blocks self-invite", () => {
    expect(isSelfInvite("owner@example.com", "Owner@Example.com")).toBe(true);
    expect(
      canSendHouseholdInvite({
        membership: OWNER_MEMBERSHIP,
        ownerEmail: "owner@example.com",
        inviteEmail: "owner@example.com",
        activeMembers: [],
        pendingInvitations: [],
      }).code
    ).toBe("self_invite");
  });

  it("blocks duplicate pending invite", () => {
    const result = canSendHouseholdInvite({
      membership: OWNER_MEMBERSHIP,
      ownerEmail: "owner@example.com",
      inviteEmail: "partner@example.com",
      activeMembers: [],
      pendingInvitations: [makeInvitation()],
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("duplicate_invite");
  });

  it("blocks active household member invite", () => {
    const activeMembers: Array<
      Pick<HouseholdMember, "email" | "status" | "is_active">
    > = [
      {
        email: "partner@example.com",
        status: "active",
        is_active: true,
      },
    ];
    expect(isEmailActiveHouseholdMember(activeMembers, "Partner@Example.com")).toBe(
      true
    );
    const result = canSendHouseholdInvite({
      membership: OWNER_MEMBERSHIP,
      ownerEmail: "owner@example.com",
      inviteEmail: "partner@example.com",
      activeMembers,
      pendingInvitations: [],
    });
    expect(result.code).toBe("already_member");
  });

  it("blocks invite when max two-user household reached", () => {
    const activeMembers: Array<
      Pick<HouseholdMember, "email" | "status" | "is_active">
    > = [
      { email: "owner@example.com", status: "active", is_active: true },
      { email: "member@example.com", status: "active", is_active: true },
    ];
    expect(countActiveHouseholdMembers(activeMembers)).toBe(2);
    expect(isHouseholdAtMemberCapacity(2)).toBe(true);
    const result = canSendHouseholdInvite({
      membership: OWNER_MEMBERSHIP,
      ownerEmail: "owner@example.com",
      inviteEmail: "new@example.com",
      activeMembers,
      pendingInvitations: [],
    });
    expect(result.code).toBe("household_full");
  });

  it("allows owner invite when checks pass", () => {
    expect(canOwnerInviteMembers(OWNER_MEMBERSHIP)).toBe(true);
    const result = canSendHouseholdInvite({
      membership: OWNER_MEMBERSHIP,
      ownerEmail: "owner@example.com",
      inviteEmail: "partner@example.com",
      activeMembers: [
        { email: "owner@example.com", status: "active", is_active: true },
      ],
      pendingInvitations: [],
    });
    expect(result.allowed).toBe(true);
  });

  it("denies non-owner invite permission", () => {
    expect(canOwnerInviteMembers(MEMBER_MEMBERSHIP)).toBe(false);
    const result = canSendHouseholdInvite({
      membership: MEMBER_MEMBERSHIP,
      ownerEmail: "member@example.com",
      inviteEmail: "partner@example.com",
      activeMembers: [],
      pendingInvitations: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.message).toBe(HOUSEHOLD_INVITE_READ_ONLY_COPY);
  });

  it("defaults missing membership to no invite permission", () => {
    expect(canOwnerInviteMembers(null)).toBe(false);
    expect(canOwnerInviteMembers(undefined)).toBe(false);
  });

  it("display model hides raw UUIDs", () => {
    const display = buildInvitationDisplayModel(makeInvitation());
    expect(display.email).toBe("partner@example.com");
    expect(display.statusLabel).toBe("Pending");
    expect(display.sentAtLabel).toMatch(/June/);
    expect(JSON.stringify(display)).not.toMatch(INVITATION_ID);
  });

  it("builds pending invitation displays only", () => {
    const displays = buildPendingInvitationDisplays([
      makeInvitation(),
      makeInvitation({ status: "accepted", email: "accepted@example.com" }),
    ]);
    expect(displays).toHaveLength(1);
    expect(displays[0]?.email).toBe("partner@example.com");
  });

  it("maps safe error labels", () => {
    expect(inviteErrorLabel("provider_error")).toMatch(/try again later/i);
    expect(mapInviteFunctionCode("duplicate_invite")).toBe("duplicate_invite");
    expect(mapInviteFunctionCode("unexpected")).toBe("unknown");
  });

  it("sanitizes UUID-bearing service messages", () => {
    expect(
      sanitizeInviteServiceMessage(
        `Failed for user ${INVITATION_ID}`
      )
    ).not.toMatch(INVITATION_ID);
  });

  it("normalizes email consistently", () => {
    expect(normalizeInviteEmail(" A@B.COM ")).toBe("a@b.com");
    expect(hasPendingInviteForEmail([makeInvitation()], "Partner@Example.com")).toBe(
      true
    );
  });

  it("exposes success copy constant", () => {
    expect(HOUSEHOLD_INVITE_SUCCESS_COPY).toBe("Invite sent.");
  });
});
