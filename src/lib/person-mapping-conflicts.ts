import { isActiveHouseholdMember } from "@/lib/household-member-management";
import type { HouseholdMember, Person } from "@/lib/types";

export const PERSON_MAPPING_CHOOSE_PROFILE_COPY =
  "Choose the profile that represents you.";
export const PERSON_MAPPING_ONE_ACTIVE_COPY =
  "Only one active member can use each profile.";
export const PERSON_MAPPING_REMOVED_INVITED_COPY =
  "Removed or invited members do not reserve profiles.";
export const PERSON_MAPPING_PRIVACY_COPY =
  "Your private cash, savings, receipts, paycheck, and audit history remain private.";
export const PERSON_MAPPING_RESERVED_COPY =
  "This profile is already assigned to another active household member.";
export const PERSON_MAPPING_CONFLICT_TITLE = "Profile assignment conflict";
export const PERSON_MAPPING_CONFLICT_DESCRIPTION =
  "Two active members are assigned to the same profile.";
export const PERSON_MAPPING_CONFLICT_GUIDANCE =
  "Each active member must use a different profile.";
export const PERSON_MAPPING_SUCCESS_COPY = "Profile updated.";
export const PERSON_MAPPING_STALE_ERROR = "That profile is no longer available.";
export const PERSON_MAPPING_SELECT_ERROR = "Please select a budget profile.";
export const PERSON_MAPPING_NO_PROFILES_COPY =
  "No household profiles are available yet. Teles and Nicole must be set up before you can choose yours.";

export type PersonMappingMember = Pick<
  HouseholdMember,
  | "id"
  | "user_id"
  | "person_id"
  | "status"
  | "is_active"
  | "display_name"
  | "email"
  | "role"
  | "is_owner"
>;

export type PersonMappingMemberSlice = Pick<
  PersonMappingMember,
  "user_id" | "person_id" | "status" | "is_active"
>;

export interface PersonProfileOption {
  personId: string;
  name: string;
  available: boolean;
  isCurrentUserSelection: boolean;
  unavailableReason: string | null;
}

export interface PersonMappingView {
  options: PersonProfileOption[];
  hasConflict: boolean;
  conflictPersonIds: string[];
  conflictPersonNames: string[];
  currentUserPersonId: string | null;
  availableCount: number;
  noProfilesCopy: string | null;
  showChoosePrompt: boolean;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function getActiveMembersWithPersonMapping(
  members: ReadonlyArray<PersonMappingMemberSlice>
): PersonMappingMemberSlice[] {
  return members.filter(isActiveHouseholdMember);
}

export function getReservedPersonIds(
  members: ReadonlyArray<PersonMappingMemberSlice>,
  excludeUserId?: string
): Set<string> {
  const reserved = new Set<string>();

  for (const member of getActiveMembersWithPersonMapping(members)) {
    if (excludeUserId && member.user_id === excludeUserId) {
      continue;
    }
    if (member.person_id) {
      reserved.add(member.person_id);
    }
  }

  return reserved;
}

export function detectDuplicateActivePersonAssignments(
  members: ReadonlyArray<PersonMappingMemberSlice>
): string[] {
  const counts = new Map<string, number>();

  for (const member of getActiveMembersWithPersonMapping(members)) {
    if (!member.person_id) {
      continue;
    }
    counts.set(member.person_id, (counts.get(member.person_id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([personId]) => personId);
}

export function hasActivePersonMappingConflict(
  members: ReadonlyArray<PersonMappingMemberSlice>
): boolean {
  return detectDuplicateActivePersonAssignments(members).length > 0;
}

export function resolveUsablePersonId(
  members: ReadonlyArray<PersonMappingMemberSlice>,
  currentUserId: string
): string | null {
  const currentMember = members.find(
    (member) =>
      member.user_id === currentUserId && isActiveHouseholdMember(member)
  );

  if (!currentMember?.person_id) {
    return null;
  }

  if (detectDuplicateActivePersonAssignments(members).includes(currentMember.person_id)) {
    return null;
  }

  return currentMember.person_id;
}

export function buildPersonProfileOptions(
  people: ReadonlyArray<Person>,
  members: ReadonlyArray<PersonMappingMemberSlice>,
  currentUserId: string
): PersonProfileOption[] {
  const currentMember = members.find((member) => member.user_id === currentUserId);
  const currentPersonId = currentMember?.person_id ?? null;
  const reserved = getReservedPersonIds(members, currentUserId);

  return people.map((person) => {
    const isCurrentUserSelection = person.id === currentPersonId;
    const isReserved = reserved.has(person.id) && !isCurrentUserSelection;

    return {
      personId: person.id,
      name: person.name,
      available: !isReserved,
      isCurrentUserSelection,
      unavailableReason: isReserved ? PERSON_MAPPING_RESERVED_COPY : null,
    };
  });
}

export function buildPersonMappingView(input: {
  people: ReadonlyArray<Person>;
  members: ReadonlyArray<PersonMappingMemberSlice>;
  currentUserId: string;
}): PersonMappingView {
  const options = buildPersonProfileOptions(
    input.people,
    input.members,
    input.currentUserId
  );
  const conflictPersonIds = detectDuplicateActivePersonAssignments(input.members);
  const conflictPersonNames = conflictPersonIds
    .map((personId) => input.people.find((person) => person.id === personId)?.name)
    .filter((name): name is string => Boolean(name));
  const currentUserPersonId =
    input.members.find((member) => member.user_id === input.currentUserId)?.person_id ??
    null;

  return {
    options,
    hasConflict: conflictPersonIds.length > 0,
    conflictPersonIds,
    conflictPersonNames,
    currentUserPersonId,
    availableCount: options.filter((option) => option.available).length,
    noProfilesCopy:
      input.people.length === 0 ? PERSON_MAPPING_NO_PROFILES_COPY : null,
    showChoosePrompt: !currentUserPersonId,
  };
}

export function validatePersonMappingSelection(input: {
  selectedPersonId: string;
  people: ReadonlyArray<Person>;
  members: ReadonlyArray<PersonMappingMemberSlice>;
  currentUserId: string;
}): { ok: true } | { ok: false; error: string } {
  const person = input.people.find((row) => row.id === input.selectedPersonId);
  if (!person) {
    return {
      ok: false,
      error: "Selected profile is not part of this household.",
    };
  }

  const reserved = getReservedPersonIds(input.members, input.currentUserId);
  if (reserved.has(input.selectedPersonId)) {
    return { ok: false, error: PERSON_MAPPING_STALE_ERROR };
  }

  return { ok: true };
}

export function buildPersonMappingUpdatePayload(
  householdId: string,
  currentUserId: string,
  personId: string
): { householdId: string; userId: string; personId: string } {
  return {
    householdId,
    userId: currentUserId,
    personId,
  };
}

export function buildProfileReservationLabel(
  member: Pick<HouseholdMember, "display_name" | "email">
): string {
  const displayName = member.display_name?.trim();
  if (displayName) {
    return displayName;
  }

  const email = member.email?.trim();
  if (email) {
    return email;
  }

  return "Another member";
}

export function buildConflictResolutionGuidance(input: {
  hasAvailableProfile: boolean;
  isOwner: boolean;
}): string {
  if (input.hasAvailableProfile) {
    return "Select an available profile below to resolve your assignment.";
  }

  if (input.isOwner) {
    return "Coordinate with the other active member so each person uses a different profile.";
  }

  return "Ask the household owner to coordinate profile assignments with the other member.";
}

export function containsRawUuidInPersonMappingCopy(text: string): boolean {
  return UUID_PATTERN.test(text);
}

export function mapPersonMappingDatabaseError(errorMessage: string): string {
  if (
    errorMessage.includes("idx_household_members_active_person_unique") ||
    errorMessage.includes("idx_household_members_household_person_unique") ||
    errorMessage.includes("duplicate key value")
  ) {
    return PERSON_MAPPING_STALE_ERROR;
  }

  return errorMessage;
}
