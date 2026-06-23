import { describe, expect, it } from "vitest";
import {
  buildManagementConfirmationLines,
  buildManagementInvokePayload,
  buildMemberDisplayLabel,
  buildMemberManagementView,
  canCancelPendingInvite,
  canOwnerManageMembers,
  canRemoveActiveMember,
  canResendPendingInvite,
  CANCEL_INVITE_CONFIRMATION_LINES,
  containsRawUuidInDisplayLabel,
  countPendingInvitations,
  HOUSEHOLD_MEMBER_MANAGEMENT_READ_ONLY_COPY,
  isActiveHouseholdMember,
  isRemovedHouseholdMember,
  managementErrorLabel,
  REMOVE_MEMBER_CONFIRMATION_LINES,
  sanitizeManagementServiceMessage,
} from "./household-member-management";
import { countActiveHouseholdMembers } from "./household-invitations";
import type { HouseholdInvitation, HouseholdMember } from "./types";

const OWNER_MEMBERSHIP: HouseholdMember = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  household_id: "22222222-2222-4222-8222-222222222222",
  user_id: "33333333-3333-4333-8333-333333333333",
  person_id: null,
  email: "owner@example.com",
  display_name: "Owner",
  role: "owner",
  status: "active",
  is_owner: true,
  is_active: true,
  removed_at: null,
  removed_by: null,
  created_at: "2026-06-01T12:00:00.000Z",
};

const MEMBER_MEMBERSHIP: HouseholdMember = {
  ...OWNER_MEMBERSHIP,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  user_id: "44444444-4444-4444-8444-444444444444",
  email: "member@example.com",
  display_name: "Member",
  role: "member",
  is_owner: false,
};

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";

function makeInvitation(
  overrides: Partial<HouseholdInvitation> = {}
): HouseholdInvitation {
  return {
    id: INVITATION_ID,
    household_id: OWNER_MEMBERSHIP.household_id,
    email: "partner@example.com",
    role: "member",
    status: "invited",
    invited_by: OWNER_MEMBERSHIP.user_id,
    invited_user_id: null,
    expires_at: null,
    accepted_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("household member management helpers", () => {
  it("allows owner to manage members", () => {
    expect(canOwnerManageMembers(OWNER_MEMBERSHIP)).toBe(true);
  });

  it("blocks non-owner from managing members", () => {
    expect(canOwnerManageMembers(MEMBER_MEMBERSHIP)).toBe(false);
    expect(canOwnerManageMembers(null)).toBe(false);
  });

  it("blocks missing or inactive membership from managing", () => {
    expect(
      canOwnerManageMembers({
        ...OWNER_MEMBERSHIP,
        status: "removed",
        is_active: false,
      })
    ).toBe(false);
  });

  it("allows cancelling pending invites only", () => {
    expect(canCancelPendingInvite(makeInvitation())).toBe(true);
    expect(canCancelPendingInvite(makeInvitation({ status: "accepted" }))).toBe(
      false
    );
    expect(canCancelPendingInvite(makeInvitation({ status: "cancelled" }))).toBe(
      false
    );
  });

  it("allows resending pending invites only", () => {
    expect(canResendPendingInvite(makeInvitation())).toBe(true);
    expect(canResendPendingInvite(makeInvitation({ status: "cancelled" }))).toBe(
      false
    );
  });

  it("blocks resending cancelled invites", () => {
    expect(canResendPendingInvite(makeInvitation({ status: "cancelled" }))).toBe(
      false
    );
  });

  it("allows owner to remove active non-owner member", () => {
    const result = canRemoveActiveMember({
      callerUserId: OWNER_MEMBERSHIP.user_id,
      targetMember: MEMBER_MEMBERSHIP,
      activeOwnerCount: 1,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks owner self-removal", () => {
    const result = canRemoveActiveMember({
      callerUserId: OWNER_MEMBERSHIP.user_id,
      targetMember: OWNER_MEMBERSHIP,
      activeOwnerCount: 1,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("cannot_remove_self");
  });

  it("blocks removing household owner", () => {
    const result = canRemoveActiveMember({
      callerUserId: MEMBER_MEMBERSHIP.user_id,
      targetMember: OWNER_MEMBERSHIP,
      activeOwnerCount: 1,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("cannot_remove_owner");
  });

  it("blocks remove when household has no active owner counted", () => {
    const result = canRemoveActiveMember({
      callerUserId: OWNER_MEMBERSHIP.user_id,
      targetMember: MEMBER_MEMBERSHIP,
      activeOwnerCount: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("only_owner");
  });

  it("does not count removed members toward active capacity", () => {
    const members: HouseholdMember[] = [
      OWNER_MEMBERSHIP,
      {
        ...MEMBER_MEMBERSHIP,
        status: "removed",
        is_active: false,
      },
    ];
    expect(countActiveHouseholdMembers(members)).toBe(1);
    expect(isRemovedHouseholdMember(members[1]!)).toBe(true);
    expect(isActiveHouseholdMember(members[1]!)).toBe(false);
  });

  it("counts pending invites separately from active members", () => {
    const invitations = [
      makeInvitation(),
      makeInvitation({ id: "55555555-5555-4555-8555-555555555555", status: "cancelled" }),
    ];
    expect(countPendingInvitations(invitations)).toBe(1);
    expect(countActiveHouseholdMembers([OWNER_MEMBERSHIP])).toBe(1);
  });

  it("builds display model without raw UUID labels", () => {
    const label = buildMemberDisplayLabel({
      display_name: null,
      email: null,
    });
    expect(label).toBe("Household member");
    expect(containsRawUuidInDisplayLabel(label)).toBe(false);
    expect(
      containsRawUuidInDisplayLabel(
        buildMemberDisplayLabel({ display_name: OWNER_MEMBERSHIP.id, email: null })
      )
    ).toBe(true);
  });

  it("includes historical preservation copy for remove confirmation", () => {
    expect(buildManagementConfirmationLines("remove_member")).toEqual(
      REMOVE_MEMBER_CONFIRMATION_LINES
    );
    expect(REMOVE_MEMBER_CONFIRMATION_LINES.join(" ")).toMatch(
      /Historical shared records are preserved/i
    );
    expect(REMOVE_MEMBER_CONFIRMATION_LINES.join(" ")).toMatch(
      /Private cash, savings, receipts, paycheck, and audit records are not deleted/i
    );
  });

  it("includes cancel invite confirmation copy", () => {
    expect(buildManagementConfirmationLines("cancel_invite")).toEqual(
      CANCEL_INVITE_CONFIRMATION_LINES
    );
  });

  it("builds owner management view with pending and active states", () => {
    const view = buildMemberManagementView({
      membership: OWNER_MEMBERSHIP,
      members: [OWNER_MEMBERSHIP, MEMBER_MEMBERSHIP],
      invitations: [makeInvitation()],
    });

    expect(view.canManage).toBe(true);
    expect(view.activeMembers).toHaveLength(2);
    expect(view.pendingInvites).toHaveLength(1);
    expect(view.hasSecondActiveMember).toBe(true);
    expect(view.hasPendingInvite).toBe(true);
  });

  it("builds read-only view for non-owner", () => {
    const view = buildMemberManagementView({
      membership: MEMBER_MEMBERSHIP,
      members: [OWNER_MEMBERSHIP, MEMBER_MEMBERSHIP],
      invitations: [makeInvitation()],
    });

    expect(view.canManage).toBe(false);
  });

  it("sanitizes UUID-bearing service messages", () => {
    expect(
      sanitizeManagementServiceMessage(
        "Failed for 11111111-1111-4111-8111-111111111111"
      )
    ).toBe(managementErrorLabel("unknown"));
  });

  it("maps invoke payload with action and target only", () => {
    expect(
      buildManagementInvokePayload({
        action: "cancel_invite",
        invitationId: INVITATION_ID,
      })
    ).toEqual({
      action: "cancel_invite",
      invitationId: INVITATION_ID,
    });
  });

  it("uses read-only copy for forbidden errors", () => {
    expect(managementErrorLabel("forbidden")).toBe(
      HOUSEHOLD_MEMBER_MANAGEMENT_READ_ONLY_COPY
    );
  });
});
