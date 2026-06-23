import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildConflictResolutionGuidance,
  buildPersonMappingView,
  PERSON_MAPPING_CHOOSE_PROFILE_COPY,
  PERSON_MAPPING_CONFLICT_DESCRIPTION,
  PERSON_MAPPING_CONFLICT_GUIDANCE,
  PERSON_MAPPING_CONFLICT_TITLE,
  PERSON_MAPPING_ONE_ACTIVE_COPY,
  PERSON_MAPPING_PRIVACY_COPY,
  PERSON_MAPPING_REMOVED_INVITED_COPY,
  PERSON_MAPPING_RESERVED_COPY,
  PERSON_MAPPING_SELECT_ERROR,
  PERSON_MAPPING_SUCCESS_COPY,
  validatePersonMappingSelection,
} from "@/lib/person-mapping-conflicts";
import { isHouseholdOwnerRole } from "@/lib/permissions-audit";
import {
  getHouseholdMembers,
  getHouseholdPeople,
  getMyHouseholdMemberProfile,
  updateMyPersonMapping,
} from "@/lib/user-person";
import type { HouseholdMember, Person } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader as Loader2 } from "lucide-react";

interface PersonMappingCardProps {
  householdId: string;
  userId: string;
  membership: HouseholdMember | null;
  onProfileSaved: () => Promise<void>;
}

export function PersonMappingCard({
  householdId,
  userId,
  membership,
  onProfileSaved,
}: PersonMappingCardProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [peopleResult, membersResult, membershipResult] = await Promise.all([
      getHouseholdPeople(householdId),
      getHouseholdMembers(householdId),
      getMyHouseholdMemberProfile(householdId, userId),
    ]);

    const errors = [
      peopleResult.error,
      membersResult.error,
      membershipResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      setLoadError(errors[0] ?? "Failed to load profile mapping.");
      setPeople([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    setPeople(peopleResult.people);
    setMembers(membersResult.members);
    setSelectedPersonId(membershipResult.membership?.person_id ?? "");
    setLoading(false);
  }, [householdId, userId]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const mappingView = useMemo(
    () =>
      buildPersonMappingView({
        people,
        members,
        currentUserId: userId,
      }),
    [people, members, userId]
  );

  const conflictGuidance = useMemo(
    () =>
      buildConflictResolutionGuidance({
        hasAvailableProfile: mappingView.availableCount > 0,
        isOwner: isHouseholdOwnerRole(membership),
      }),
    [mappingView.availableCount, membership]
  );

  const handleSave = async () => {
    setSaveError(null);
    setSuccess(null);

    if (!selectedPersonId.trim()) {
      setSaveError(PERSON_MAPPING_SELECT_ERROR);
      return;
    }

    const validation = validatePersonMappingSelection({
      selectedPersonId,
      people,
      members,
      currentUserId: userId,
    });

    if (!validation.ok) {
      setSaveError(validation.error);
      return;
    }

    setSaving(true);

    const { membership: updatedMembership, error } = await updateMyPersonMapping(
      householdId,
      userId,
      selectedPersonId
    );

    setSaving(false);

    if (error) {
      setSaveError(error);
      await loadProfileData();
      return;
    }

    setSelectedPersonId(updatedMembership?.person_id ?? selectedPersonId);
    await Promise.all([loadProfileData(), onProfileSaved()]);
    setSuccess(PERSON_MAPPING_SUCCESS_COPY);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your budget profile</CardTitle>
        <CardDescription>
          {PERSON_MAPPING_CHOOSE_PROFILE_COPY} {PERSON_MAPPING_ONE_ACTIVE_COPY}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {PERSON_MAPPING_REMOVED_INVITED_COPY} {PERSON_MAPPING_PRIVACY_COPY}
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading budget profiles...
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : mappingView.noProfilesCopy ? (
          <p className="text-sm text-muted-foreground">{mappingView.noProfilesCopy}</p>
        ) : (
          <>
            {mappingView.hasConflict && (
              <Alert variant="destructive">
                <AlertTitle>{PERSON_MAPPING_CONFLICT_TITLE}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{PERSON_MAPPING_CONFLICT_DESCRIPTION}</p>
                  <p>{PERSON_MAPPING_CONFLICT_GUIDANCE}</p>
                  {mappingView.conflictPersonNames.length > 0 && (
                    <p>
                      Conflicting profile
                      {mappingView.conflictPersonNames.length === 1 ? "" : "s"}:{" "}
                      {mappingView.conflictPersonNames.join(", ")}
                    </p>
                  )}
                  <p>{conflictGuidance}</p>
                </AlertDescription>
              </Alert>
            )}

            {mappingView.showChoosePrompt && !mappingView.hasConflict && (
              <Alert>
                <AlertDescription>{PERSON_MAPPING_CHOOSE_PROFILE_COPY}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="budget-profile">Profile</Label>
              <Select
                value={selectedPersonId || undefined}
                onValueChange={setSelectedPersonId}
              >
                <SelectTrigger id="budget-profile" className="w-full">
                  <SelectValue placeholder="Select your budget profile" />
                </SelectTrigger>
                <SelectContent>
                  {mappingView.options.map((option) => (
                    <SelectItem
                      key={option.personId}
                      value={option.personId}
                      disabled={!option.available}
                    >
                      {option.name}
                      {!option.available ? ` (${PERSON_MAPPING_RESERVED_COPY})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save budget profile
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
