import { describe, expect, it } from "vitest";
import {
  buildPermissionAuditMatrix,
  buildPermissionDenialReason,
  canMembershipPerformAction,
  canPerformPermissionAction,
  classifyHouseholdAccessRole,
  isActiveHouseholdMembership,
  isActiveHouseholdOwner,
  isInvitedHouseholdMembership,
  isRemovedHouseholdMembership,
  permissionLabelContainsRawUuid,
  sanitizePermissionServiceMessage,
} from "./permissions-audit";
import type { HouseholdMember } from "./types";

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

describe("permissions-audit membership classification", () => {
  it("classifies unauthenticated users", () => {
    expect(
      classifyHouseholdAccessRole({
        authenticated: false,
        membership: null,
      })
    ).toBe("unauthenticated");
  });

  it("classifies invited users without active membership", () => {
    expect(
      classifyHouseholdAccessRole({
        authenticated: true,
        membership: null,
        hasPendingInvitation: true,
      })
    ).toBe("invited_pending");
  });

  it("classifies active members and owners", () => {
    expect(
      classifyHouseholdAccessRole({
        authenticated: true,
        membership: MEMBER_MEMBERSHIP,
      })
    ).toBe("active_member");
    expect(
      classifyHouseholdAccessRole({
        authenticated: true,
        membership: OWNER_MEMBERSHIP,
      })
    ).toBe("owner");
  });

  it("treats removed members as inactive", () => {
    const removed = {
      ...MEMBER_MEMBERSHIP,
      status: "removed" as const,
      is_active: false,
    };
    expect(isRemovedHouseholdMembership(removed)).toBe(true);
    expect(isActiveHouseholdMembership(removed)).toBe(false);
    expect(
      classifyHouseholdAccessRole({
        authenticated: true,
        membership: removed,
      })
    ).toBe("removed_member");
  });

  it("does not treat invited membership rows as active", () => {
    const invited = {
      ...MEMBER_MEMBERSHIP,
      status: "invited" as const,
      is_active: true,
    };
    expect(isInvitedHouseholdMembership(invited)).toBe(true);
    expect(isActiveHouseholdMembership(invited)).toBe(false);
    expect(isActiveHouseholdOwner(invited)).toBe(false);
  });
});

describe("permissions-audit action guards", () => {
  it("denies unauthenticated protected permissions", () => {
    expect(canPerformPermissionAction("unauthenticated", "access_protected_app")).toBe(
      false
    );
    expect(
      canPerformPermissionAction("unauthenticated", "invite_household_member")
    ).toBe(false);
  });

  it("blocks members from owner-only actions", () => {
    expect(canPerformPermissionAction("active_member", "invite_household_member")).toBe(
      false
    );
    expect(canPerformPermissionAction("active_member", "manage_household_members")).toBe(
      false
    );
    expect(
      canPerformPermissionAction("active_member", "change_cashflow_start_date")
    ).toBe(false);
    expect(canPerformPermissionAction("active_member", "apply_spreadsheet_import")).toBe(
      false
    );
    expect(
      canPerformPermissionAction("active_member", "rollback_spreadsheet_import")
    ).toBe(false);
  });

  it("allows owners to perform owner actions", () => {
    expect(canPerformPermissionAction("owner", "invite_household_member")).toBe(true);
    expect(canPerformPermissionAction("owner", "manage_household_members")).toBe(true);
    expect(canPerformPermissionAction("owner", "change_cashflow_start_date")).toBe(true);
    expect(canPerformPermissionAction("owner", "apply_spreadsheet_import")).toBe(true);
    expect(canPerformPermissionAction("owner", "rollback_spreadsheet_import")).toBe(true);
  });

  it("blocks owners from other-user private data", () => {
    expect(canPerformPermissionAction("owner", "view_other_user_private_data")).toBe(
      false
    );
    expect(canPerformPermissionAction("owner", "mutate_other_user_private_data")).toBe(
      false
    );
  });

  it("blocks removed members from household actions", () => {
    expect(canPerformPermissionAction("removed_member", "access_protected_app")).toBe(
      false
    );
    expect(canPerformPermissionAction("removed_member", "view_shared_household_data")).toBe(
      false
    );
    expect(canPerformPermissionAction("removed_member", "invite_household_member")).toBe(
      false
    );
  });

  it("evaluates membership helpers for owner-only import actions", () => {
    expect(
      canMembershipPerformAction(MEMBER_MEMBERSHIP, "apply_spreadsheet_import", {
        authenticated: true,
      })
    ).toBe(false);
    expect(
      canMembershipPerformAction(OWNER_MEMBERSHIP, "apply_spreadsheet_import", {
        authenticated: true,
      })
    ).toBe(true);
  });
});

describe("permissions-audit denial copy", () => {
  it("returns readable member denial labels", () => {
    expect(buildPermissionDenialReason("invite_household_member", "active_member")).toBe(
      "Only a household owner can invite members."
    );
    expect(
      buildPermissionDenialReason("change_cashflow_start_date", "active_member")
    ).toContain("household owner");
  });

  it("does not include raw UUIDs in denial labels", () => {
    const labels = [
      buildPermissionDenialReason("invite_household_member", "active_member"),
      buildPermissionDenialReason("manage_household_members", "active_member"),
      buildPermissionDenialReason("view_other_user_private_data", "owner"),
      buildPermissionDenialReason("access_protected_app", "removed_member"),
    ];
    for (const label of labels) {
      expect(permissionLabelContainsRawUuid(label)).toBe(false);
    }
  });

  it("sanitizes service messages that leak UUIDs", () => {
    expect(
      sanitizePermissionServiceMessage(
        "Failed for user 11111111-1111-4111-8111-111111111111"
      )
    ).toBe("Could not complete this action. Please try again.");
    expect(sanitizePermissionServiceMessage("Invite service unavailable.")).toBe(
      "Invite service unavailable."
    );
  });
});

describe("permissions-audit matrix", () => {
  it("builds a matrix with no GAP rows after hardening", () => {
    const matrix = buildPermissionAuditMatrix();
    expect(matrix.length).toBeGreaterThan(10);
    expect(matrix.every((row) => row.auditStatus === "PASS")).toBe(true);
    expect(matrix.some((row) => row.action === "invite_household_member")).toBe(
      true
    );
  });
});
