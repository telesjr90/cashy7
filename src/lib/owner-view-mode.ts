import { useCallback, useEffect, useState } from "react";
import { isActiveHouseholdOwner, type MembershipSlice } from "@/lib/permissions-audit";

export type OwnerViewMode = "personal" | "admin";

export const DEFAULT_OWNER_VIEW_MODE: OwnerViewMode = "personal";

export const OWNER_VIEW_MODE_STORAGE_KEY = "cashflow.ownerViewMode";

export const OWNER_VIEW_TOGGLE_LABEL = "View mode";

export const OWNER_VIEW_PERSONAL_LABEL = "Personal view";

export const OWNER_VIEW_ADMIN_LABEL = "Admin view";

export const OWNER_ADMIN_BANNER_COPY =
  "Admin view: You are viewing all household member data as owner.";

export const OWNER_ADMIN_READ_ONLY_COPY =
  "Admin view is read-only. You cannot change another member's private records here.";

export const OWNER_PERSONAL_PRIVACY_COPY =
  "Personal view: only your own private cash, savings, paycheck, receipts, and audit history are shown.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Only an ACTIVE household owner may use Admin view. Removed, invited, or
 * missing membership, and non-owner members, always behave as Personal.
 */
export function canUseOwnerAdminView(
  membership: MembershipSlice | null | undefined
): boolean {
  return isActiveHouseholdOwner(membership);
}

export function normalizeOwnerViewMode(
  value: string | null | undefined
): OwnerViewMode {
  return value === "admin" ? "admin" : "personal";
}

/**
 * Resolve the effective view mode. If the caller cannot use Admin view, the
 * effective mode is always Personal regardless of the requested mode.
 */
export function resolveOwnerViewMode(input: {
  membership: MembershipSlice | null | undefined;
  requestedMode: OwnerViewMode | null | undefined;
}): OwnerViewMode {
  if (!canUseOwnerAdminView(input.membership)) {
    return "personal";
  }
  return normalizeOwnerViewMode(input.requestedMode);
}

export function isOwnerAdminViewActive(input: {
  membership: MembershipSlice | null | undefined;
  mode: OwnerViewMode | null | undefined;
}): boolean {
  return (
    canUseOwnerAdminView(input.membership) &&
    normalizeOwnerViewMode(input.mode) === "admin"
  );
}

export function ownerViewModeLabel(mode: OwnerViewMode): string {
  return mode === "admin" ? OWNER_VIEW_ADMIN_LABEL : OWNER_VIEW_PERSONAL_LABEL;
}

export function ownerAdminLabelContainsRawUuid(text: string): boolean {
  return UUID_PATTERN.test(text);
}

function readStoredOwnerViewMode(): OwnerViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_OWNER_VIEW_MODE;
  }
  try {
    return normalizeOwnerViewMode(
      window.localStorage.getItem(OWNER_VIEW_MODE_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_OWNER_VIEW_MODE;
  }
}

function persistOwnerViewMode(mode: OwnerViewMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(OWNER_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures; mode still works for the session.
  }
}

export interface UseOwnerViewModeResult {
  mode: OwnerViewMode;
  effectiveMode: OwnerViewMode;
  canUseAdmin: boolean;
  isAdmin: boolean;
  setMode: (mode: OwnerViewMode) => void;
}

/**
 * Owner-only Personal/Admin view-mode state. Non-owners always resolve to
 * Personal and the stored preference is never honored for them.
 */
export function useOwnerViewMode(
  membership: MembershipSlice | null | undefined
): UseOwnerViewModeResult {
  const canUseAdmin = canUseOwnerAdminView(membership);
  const [storedMode, setStoredMode] = useState<OwnerViewMode>(() =>
    readStoredOwnerViewMode()
  );

  useEffect(() => {
    setStoredMode(readStoredOwnerViewMode());
  }, []);

  // If the user loses admin eligibility, force back to personal.
  useEffect(() => {
    if (!canUseAdmin && storedMode !== "personal") {
      setStoredMode("personal");
    }
  }, [canUseAdmin, storedMode]);

  const setMode = useCallback(
    (mode: OwnerViewMode) => {
      const next = canUseAdmin ? normalizeOwnerViewMode(mode) : "personal";
      setStoredMode(next);
      persistOwnerViewMode(next);
    },
    [canUseAdmin]
  );

  const effectiveMode = resolveOwnerViewMode({
    membership,
    requestedMode: storedMode,
  });

  return {
    mode: storedMode,
    effectiveMode,
    canUseAdmin,
    isAdmin: effectiveMode === "admin",
    setMode,
  };
}
