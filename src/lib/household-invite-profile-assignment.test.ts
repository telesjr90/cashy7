import { describe, expect, it } from "vitest";
import {
  buildAssignedProfileLabel,
  buildInviteInvokePayload,
  buildInviteProfileOptions,
  buildPeopleNameLookup,
  buildPendingInvitationDisplays,
  canOwnerInviteMembers,
  getActiveMemberPersonIds,
  getPendingInviteAssignedPersonIds,
  HOUSEHOLD_INVITE_PROFILE_RESERVED_ACTIVE_COPY,
  HOUSEHOLD_INVITE_PROFILE_RESERVED_PENDING_COPY,
  HOUSEHOLD_INVITE_PROFILE_STALE_ERROR,
  HOUSEHOLD_INVITE_PROFILE_UNKNOWN_LABEL,
  validateAssignedProfileSelection,
} from "./household-invitations";
import type { HouseholdInvitation, HouseholdMember, Person } from "./types";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const TELES_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NICOLE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PEOPLE: Person[] = [
  {
    id: TELES_ID,
    household_id: "hh",
    name: "Teles",
    color: null,
    pay_schedule: "semi_monthly",
    pay_schedule_description: null,
    paycheck_amount: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: NICOLE_ID,
    household_id: "hh",
    name: "Nicole",
    color: null,
    pay_schedule: "semi_monthly",
    pay_schedule_description: null,
    paycheck_amount: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function makeMember(overrides: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    id: "member-1",
    household_id: "hh",
    user_id: "user-1",
    person_id: TELES_ID,
    email: "owner@example.com",
    display_name: null,
    role: "owner",
    status: "active",
    is_owner: true,
    is_active: true,
    removed_at: null,
    removed_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeInvitation(
  overrides: Partial<HouseholdInvitation> = {}
): HouseholdInvitation {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    household_id: "hh",
    email: "nicolekatr@gmail.com",
    role: "member",
    status: "invited",
    invited_by: "user-1",
    invited_user_id: null,
    assigned_person_id: null,
    expires_at: null,
    accepted_at: null,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("invite profile assignment", () => {
  it("marks profiles used by active members as unavailable", () => {
    const options = buildInviteProfileOptions({
      people: PEOPLE,
      activeMembers: [makeMember({ person_id: TELES_ID })],
      pendingInvitations: [],
    });
    const teles = options.find((o) => o.personId === TELES_ID);
    const nicole = options.find((o) => o.personId === NICOLE_ID);
    expect(teles?.available).toBe(false);
    expect(teles?.unavailableReason).toBe(
      HOUSEHOLD_INVITE_PROFILE_RESERVED_ACTIVE_COPY
    );
    expect(nicole?.available).toBe(true);
  });

  it("marks profiles reserved by pending invites as unavailable", () => {
    const options = buildInviteProfileOptions({
      people: PEOPLE,
      activeMembers: [makeMember({ person_id: TELES_ID })],
      pendingInvitations: [makeInvitation({ assigned_person_id: NICOLE_ID })],
    });
    const nicole = options.find((o) => o.personId === NICOLE_ID);
    expect(nicole?.available).toBe(false);
    expect(nicole?.unavailableReason).toBe(
      HOUSEHOLD_INVITE_PROFILE_RESERVED_PENDING_COPY
    );
  });

  it("does not reserve profiles from cancelled/accepted/removed invites or members", () => {
    expect(
      getPendingInviteAssignedPersonIds([
        makeInvitation({ status: "cancelled", assigned_person_id: NICOLE_ID }),
        makeInvitation({ status: "accepted", assigned_person_id: NICOLE_ID }),
        makeInvitation({ status: "expired", assigned_person_id: NICOLE_ID }),
      ]).size
    ).toBe(0);

    expect(
      getActiveMemberPersonIds([
        makeMember({ status: "removed", is_active: false, person_id: TELES_ID }),
        makeMember({ status: "invited", is_active: true, person_id: NICOLE_ID }),
      ]).size
    ).toBe(0);
  });

  it("validates an available assigned profile selection", () => {
    const result = validateAssignedProfileSelection({
      assignedPersonId: NICOLE_ID,
      people: PEOPLE,
      activeMembers: [makeMember({ person_id: TELES_ID })],
      pendingInvitations: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignedPersonId).toBe(NICOLE_ID);
    }
  });

  it("allows an empty assignment (auto-link fallback)", () => {
    const result = validateAssignedProfileSelection({
      assignedPersonId: "",
      people: PEOPLE,
      activeMembers: [],
      pendingInvitations: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignedPersonId).toBeNull();
    }
  });

  it("rejects a profile that is no longer available at send time", () => {
    const result = validateAssignedProfileSelection({
      assignedPersonId: NICOLE_ID,
      people: PEOPLE,
      activeMembers: [],
      pendingInvitations: [makeInvitation({ assigned_person_id: NICOLE_ID })],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(HOUSEHOLD_INVITE_PROFILE_STALE_ERROR);
    }
  });

  it("rejects a profile not in the household", () => {
    const result = validateAssignedProfileSelection({
      assignedPersonId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      people: PEOPLE,
      activeMembers: [],
      pendingInvitations: [],
    });
    expect(result.ok).toBe(false);
  });

  it("builds an invoke payload with and without an assigned profile", () => {
    expect(buildInviteInvokePayload("Nicolekatr@Gmail.com")).toEqual({
      email: "nicolekatr@gmail.com",
    });
    expect(
      buildInviteInvokePayload("Nicolekatr@Gmail.com", NICOLE_ID)
    ).toEqual({ email: "nicolekatr@gmail.com", assignedPersonId: NICOLE_ID });
  });

  it("enforces owner-only assignment context", () => {
    expect(canOwnerInviteMembers(makeMember())).toBe(true);
    expect(
      canOwnerInviteMembers(
        makeMember({ role: "member", is_owner: false })
      )
    ).toBe(false);
  });

  it("renders assigned profile labels by name without raw UUIDs", () => {
    const lookup = buildPeopleNameLookup(PEOPLE);
    expect(
      buildAssignedProfileLabel(
        makeInvitation({ assigned_person_id: NICOLE_ID }),
        lookup
      )
    ).toBe("Nicole");
    // Unknown id never leaks a raw UUID.
    expect(
      buildAssignedProfileLabel(
        makeInvitation({ assigned_person_id: NICOLE_ID })
      )
    ).toBe(HOUSEHOLD_INVITE_PROFILE_UNKNOWN_LABEL);
    expect(buildAssignedProfileLabel(makeInvitation())).toBeNull();
  });

  it("includes assigned profile label in pending displays without raw UUIDs", () => {
    const lookup = buildPeopleNameLookup(PEOPLE);
    const displays = buildPendingInvitationDisplays(
      [makeInvitation({ assigned_person_id: NICOLE_ID })],
      lookup
    );
    expect(displays).toHaveLength(1);
    expect(displays[0]?.assignedProfileLabel).toBe("Nicole");
    expect(UUID_RE.test(JSON.stringify(displays))).toBe(false);
  });
});
