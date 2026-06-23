import { describe, expect, it } from "vitest";
import {
  buildConflictResolutionGuidance,
  buildPersonMappingUpdatePayload,
  buildPersonMappingView,
  buildPersonProfileOptions,
  buildProfileReservationLabel,
  containsRawUuidInPersonMappingCopy,
  detectDuplicateActivePersonAssignments,
  getReservedPersonIds,
  PERSON_MAPPING_CONFLICT_DESCRIPTION,
  PERSON_MAPPING_CONFLICT_GUIDANCE,
  PERSON_MAPPING_RESERVED_COPY,
  PERSON_MAPPING_STALE_ERROR,
  resolveUsablePersonId,
  validatePersonMappingSelection,
  type PersonMappingMember,
} from "./person-mapping-conflicts";

const TELES_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NICOLE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_USER_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_USER_ID = "44444444-4444-4444-8444-444444444444";

const PEOPLE = [
  { id: TELES_ID, household_id: "hh-1", name: "Teles", color: null, pay_schedule: "biweekly", pay_schedule_description: null, paycheck_amount: 0, created_at: "" },
  { id: NICOLE_ID, household_id: "hh-1", name: "Nicole", color: null, pay_schedule: "biweekly", pay_schedule_description: null, paycheck_amount: 0, created_at: "" },
];

function makeMember(
  overrides: Partial<PersonMappingMember> & Pick<PersonMappingMember, "user_id">
): PersonMappingMember {
  return {
    id: `member-${overrides.user_id}`,
    person_id: null,
    email: `${overrides.user_id}@example.com`,
    display_name: "Member",
    role: "member",
    is_owner: false,
    status: "active",
    is_active: true,
    ...overrides,
  };
}

describe("person mapping conflicts", () => {
  it("gives one active member with no person both profiles", () => {
    const members = [makeMember({ user_id: OWNER_USER_ID, person_id: null })];
    const options = buildPersonProfileOptions(PEOPLE, members, OWNER_USER_ID);

    expect(options).toHaveLength(2);
    expect(options.every((option) => option.available)).toBe(true);
  });

  it("lets active member keep Teles and see Nicole available", () => {
    const members = [
      makeMember({ user_id: OWNER_USER_ID, person_id: TELES_ID, display_name: "Owner" }),
    ];
    const options = buildPersonProfileOptions(PEOPLE, members, OWNER_USER_ID);

    expect(options.find((option) => option.personId === TELES_ID)?.available).toBe(true);
    expect(options.find((option) => option.personId === NICOLE_ID)?.available).toBe(true);
  });

  it("blocks second active member from selecting reserved Teles", () => {
    const members = [
      makeMember({ user_id: OWNER_USER_ID, person_id: TELES_ID, display_name: "Owner" }),
      makeMember({ user_id: MEMBER_USER_ID, person_id: null, display_name: "Partner" }),
    ];
    const options = buildPersonProfileOptions(PEOPLE, members, MEMBER_USER_ID);
    const teles = options.find((option) => option.personId === TELES_ID);
    const nicole = options.find((option) => option.personId === NICOLE_ID);

    expect(teles?.available).toBe(false);
    expect(teles?.unavailableReason).toBe(PERSON_MAPPING_RESERVED_COPY);
    expect(nicole?.available).toBe(true);
  });

  it("does not reserve Nicole for removed member with Nicole assigned", () => {
    const members = [
      makeMember({ user_id: OWNER_USER_ID, person_id: null }),
      makeMember({
        user_id: MEMBER_USER_ID,
        person_id: NICOLE_ID,
        status: "removed",
        is_active: false,
      }),
    ];

    expect(getReservedPersonIds(members)).toEqual(new Set());
    expect(
      buildPersonProfileOptions(PEOPLE, members, OWNER_USER_ID).find(
        (option) => option.personId === NICOLE_ID
      )?.available
    ).toBe(true);
  });

  it("does not reserve Nicole for invited member with Nicole assigned", () => {
    const members = [
      makeMember({ user_id: OWNER_USER_ID, person_id: null }),
      makeMember({
        user_id: MEMBER_USER_ID,
        person_id: NICOLE_ID,
        status: "invited",
        is_active: true,
      }),
    ];

    expect(getReservedPersonIds(members)).toEqual(new Set());
  });

  it("does not reserve profiles for pending invites without active membership rows", () => {
    const members = [makeMember({ user_id: OWNER_USER_ID, person_id: null })];
    const options = buildPersonProfileOptions(PEOPLE, members, OWNER_USER_ID);

    expect(options.every((option) => option.available)).toBe(true);
  });

  it("detects duplicate active assignment conflict", () => {
    const members = [
      makeMember({ user_id: OWNER_USER_ID, person_id: TELES_ID }),
      makeMember({ user_id: MEMBER_USER_ID, person_id: TELES_ID }),
    ];

    expect(detectDuplicateActivePersonAssignments(members)).toEqual([TELES_ID]);
    expect(
      buildPersonMappingView({
        people: PEOPLE,
        members,
        currentUserId: OWNER_USER_ID,
      }).hasConflict
    ).toBe(true);
  });

  it("uses readable duplicate conflict alert copy", () => {
    const guidance = buildConflictResolutionGuidance({
      hasAvailableProfile: true,
      isOwner: true,
    });

    expect(PERSON_MAPPING_CONFLICT_DESCRIPTION).toContain("same profile");
    expect(PERSON_MAPPING_CONFLICT_GUIDANCE).toContain("different profile");
    expect(guidance).toContain("available profile");
    expect(containsRawUuidInPersonMappingCopy(PERSON_MAPPING_CONFLICT_DESCRIPTION)).toBe(
      false
    );
  });

  it("keeps unavailable profile denial copy free of raw UUIDs", () => {
    expect(containsRawUuidInPersonMappingCopy(PERSON_MAPPING_RESERVED_COPY)).toBe(false);
    expect(containsRawUuidInPersonMappingCopy(PERSON_MAPPING_STALE_ERROR)).toBe(false);
  });

  it("builds update payload for current user only", () => {
    expect(
      buildPersonMappingUpdatePayload("hh-1", OWNER_USER_ID, TELES_ID)
    ).toEqual({
      householdId: "hh-1",
      userId: OWNER_USER_ID,
      personId: TELES_ID,
    });
  });

  it("blocks stale availability before save", () => {
    const members = [
      makeMember({ user_id: OWNER_USER_ID, person_id: TELES_ID }),
      makeMember({ user_id: MEMBER_USER_ID, person_id: null }),
    ];
    const result = validatePersonMappingSelection({
      selectedPersonId: TELES_ID,
      people: PEOPLE,
      members,
      currentUserId: MEMBER_USER_ID,
    });

    expect(result).toEqual({ ok: false, error: PERSON_MAPPING_STALE_ERROR });
  });

  it("uses safe owner/member display labels without private amounts", () => {
    const label = buildProfileReservationLabel({
      display_name: "Partner",
      email: "partner@example.com",
    });

    expect(label).toBe("Partner");
    expect(label).not.toMatch(/\$/);
    expect(containsRawUuidInPersonMappingCopy(label)).toBe(false);
  });

  it("treats conflicting mapping as unusable for split-safe guards", () => {
    const members = [
      makeMember({ user_id: OWNER_USER_ID, person_id: TELES_ID }),
      makeMember({ user_id: MEMBER_USER_ID, person_id: TELES_ID }),
    ];

    expect(resolveUsablePersonId(members, OWNER_USER_ID)).toBeNull();
    expect(resolveUsablePersonId(members, MEMBER_USER_ID)).toBeNull();
  });
});
