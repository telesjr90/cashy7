import { describe, expect, it } from "vitest";
import {
  canUseOwnerAdminView,
  isOwnerAdminViewActive,
  normalizeOwnerViewMode,
  OWNER_ADMIN_BANNER_COPY,
  OWNER_PERSONAL_PRIVACY_COPY,
  ownerAdminLabelContainsRawUuid,
  ownerViewModeLabel,
  resolveOwnerViewMode,
} from "./owner-view-mode";
import type { MembershipSlice } from "./permissions-audit";

const ACTIVE_OWNER: MembershipSlice = {
  role: "owner",
  is_owner: true,
  status: "active",
  is_active: true,
};

const ACTIVE_MEMBER: MembershipSlice = {
  role: "member",
  is_owner: false,
  status: "active",
  is_active: true,
};

const REMOVED_OWNER: MembershipSlice = {
  role: "owner",
  is_owner: true,
  status: "removed",
  is_active: false,
};

const INVITED_OWNER: MembershipSlice = {
  role: "owner",
  is_owner: true,
  status: "invited",
  is_active: true,
};

describe("owner view mode", () => {
  it("only allows active owners to use admin view", () => {
    expect(canUseOwnerAdminView(ACTIVE_OWNER)).toBe(true);
    expect(canUseOwnerAdminView(ACTIVE_MEMBER)).toBe(false);
    expect(canUseOwnerAdminView(REMOVED_OWNER)).toBe(false);
    expect(canUseOwnerAdminView(INVITED_OWNER)).toBe(false);
    expect(canUseOwnerAdminView(null)).toBe(false);
    expect(canUseOwnerAdminView(undefined)).toBe(false);
  });

  it("normalizes view mode values", () => {
    expect(normalizeOwnerViewMode("admin")).toBe("admin");
    expect(normalizeOwnerViewMode("personal")).toBe("personal");
    expect(normalizeOwnerViewMode("garbage")).toBe("personal");
    expect(normalizeOwnerViewMode(null)).toBe("personal");
  });

  it("forces non-owners to personal regardless of requested mode", () => {
    expect(
      resolveOwnerViewMode({ membership: ACTIVE_MEMBER, requestedMode: "admin" })
    ).toBe("personal");
    expect(
      resolveOwnerViewMode({ membership: REMOVED_OWNER, requestedMode: "admin" })
    ).toBe("personal");
    expect(
      resolveOwnerViewMode({ membership: null, requestedMode: "admin" })
    ).toBe("personal");
  });

  it("honors requested admin mode for active owners", () => {
    expect(
      resolveOwnerViewMode({ membership: ACTIVE_OWNER, requestedMode: "admin" })
    ).toBe("admin");
    expect(
      resolveOwnerViewMode({ membership: ACTIVE_OWNER, requestedMode: "personal" })
    ).toBe("personal");
    // Default is personal when nothing requested.
    expect(
      resolveOwnerViewMode({ membership: ACTIVE_OWNER, requestedMode: null })
    ).toBe("personal");
  });

  it("computes admin-active only for eligible owners in admin mode", () => {
    expect(
      isOwnerAdminViewActive({ membership: ACTIVE_OWNER, mode: "admin" })
    ).toBe(true);
    expect(
      isOwnerAdminViewActive({ membership: ACTIVE_OWNER, mode: "personal" })
    ).toBe(false);
    expect(
      isOwnerAdminViewActive({ membership: ACTIVE_MEMBER, mode: "admin" })
    ).toBe(false);
  });

  it("labels modes and copy without raw UUIDs", () => {
    expect(ownerViewModeLabel("admin")).toMatch(/admin/i);
    expect(ownerViewModeLabel("personal")).toMatch(/personal/i);
    expect(ownerAdminLabelContainsRawUuid(OWNER_ADMIN_BANNER_COPY)).toBe(false);
    expect(ownerAdminLabelContainsRawUuid(OWNER_PERSONAL_PRIVACY_COPY)).toBe(
      false
    );
  });
});
