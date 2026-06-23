import {
  mapPersonMappingDatabaseError,
  PERSON_MAPPING_SELECT_ERROR,
  validatePersonMappingSelection,
} from "@/lib/person-mapping-conflicts";
import { supabase } from "@/lib/supabase";
import type { HouseholdMember, Person } from "@/lib/types";

export async function getHouseholdPeople(householdId: string): Promise<{
  people: Person[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("household_id", householdId)
    .order("name");

  if (error) {
    return { people: [], error: error.message };
  }

  return { people: (data as Person[]) ?? [], error: null };
}

export async function getHouseholdMembers(householdId: string): Promise<{
  members: HouseholdMember[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("household_members")
    .select(
      "id, household_id, user_id, person_id, email, display_name, role, status, is_owner, is_active, removed_at, removed_by"
    )
    .eq("household_id", householdId);

  if (error) {
    return { members: [], error: error.message };
  }

  return { members: (data as HouseholdMember[]) ?? [], error: null };
}

export async function getMyHouseholdMemberProfile(
  householdId: string,
  userId: string
): Promise<{ membership: HouseholdMember | null; error: string | null }> {
  const { data, error } = await supabase
    .from("household_members")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { membership: null, error: error.message };
  }

  return { membership: (data as HouseholdMember | null) ?? null, error: null };
}

export function isPersonInHousehold(
  personId: string,
  people: Array<{ id: string }>
): boolean {
  return people.some((person) => person.id === personId);
}

export async function updateMyPersonMapping(
  householdId: string,
  userId: string,
  personId: string
): Promise<{ membership: HouseholdMember | null; error: string | null }> {
  if (!personId.trim()) {
    return { membership: null, error: PERSON_MAPPING_SELECT_ERROR };
  }

  const [{ people, error: peopleError }, { members, error: membersError }] =
    await Promise.all([
      getHouseholdPeople(householdId),
      getHouseholdMembers(householdId),
    ]);

  if (peopleError) {
    return { membership: null, error: peopleError };
  }

  if (membersError) {
    return { membership: null, error: membersError };
  }

  if (!isPersonInHousehold(personId, people)) {
    return {
      membership: null,
      error: "Selected profile is not part of this household.",
    };
  }

  const validation = validatePersonMappingSelection({
    selectedPersonId: personId,
    people,
    members,
    currentUserId: userId,
  });

  if (!validation.ok) {
    return { membership: null, error: validation.error };
  }

  const { data, error } = await supabase
    .from("household_members")
    .update({ person_id: personId })
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "active")
    .select()
    .maybeSingle();

  if (error) {
    return {
      membership: null,
      error: mapPersonMappingDatabaseError(error.message),
    };
  }

  if (!data) {
    return {
      membership: null,
      error: "Could not update your household membership.",
    };
  }

  return { membership: data as HouseholdMember, error: null };
}
