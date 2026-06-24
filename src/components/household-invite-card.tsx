import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildInviteProfileOptions,
  buildPeopleNameLookup,
  buildPendingInvitationDisplays,
  canOwnerInviteMembers,
  canSendHouseholdInvite,
  HOUSEHOLD_INVITE_DESCRIPTION,
  HOUSEHOLD_INVITE_EMAIL_LABEL,
  HOUSEHOLD_INVITE_NO_PROFILES_COPY,
  HOUSEHOLD_INVITE_PENDING_TITLE,
  HOUSEHOLD_INVITE_PRIVACY_COPY,
  HOUSEHOLD_INVITE_PROFILE_LABEL,
  HOUSEHOLD_INVITE_PROFILE_NONE_OPTION_LABEL,
  HOUSEHOLD_INVITE_PROFILE_PLACEHOLDER,
  HOUSEHOLD_INVITE_READ_ONLY_COPY,
  HOUSEHOLD_INVITE_SEND_LABEL,
  HOUSEHOLD_INVITE_SUCCESS_COPY,
  HOUSEHOLD_INVITE_TITLE,
  HOUSEHOLD_MAX_USERS_COPY,
  validateAssignedProfileSelection,
  validateInviteEmail,
} from "@/lib/household-invitations";
import {
  listHouseholdInvitations,
  sendHouseholdInvite,
} from "@/lib/household-invitation-service";
import { getHouseholdMembers, getHouseholdPeople } from "@/lib/user-person";
import type { HouseholdInvitation, HouseholdMember, Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader as Loader2 } from "lucide-react";

const NO_PROFILE_VALUE = "__none__";

interface HouseholdInviteCardProps {
  householdId: string;
  membership: HouseholdMember | null;
  ownerEmail: string | null | undefined;
}

export function HouseholdInviteCard({
  householdId,
  membership,
  ownerEmail,
}: HouseholdInviteCardProps) {
  const [emailInput, setEmailInput] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string>(NO_PROFILE_VALUE);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const canInvite = canOwnerInviteMembers(membership);

  const loadInviteState = useCallback(async () => {
    if (!canInvite) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const [invitationsResult, membersResult, peopleResult] = await Promise.all([
      listHouseholdInvitations(householdId),
      getHouseholdMembers(householdId),
      getHouseholdPeople(householdId),
    ]);

    const errors = [
      invitationsResult.error,
      membersResult.error,
      peopleResult.error,
    ].filter(Boolean);
    if (errors.length > 0) {
      setLoadError(errors[0] ?? "Could not load household invite status.");
      setInvitations([]);
      setMembers([]);
      setPeople([]);
    } else {
      setInvitations(invitationsResult.invitations);
      setMembers(membersResult.members);
      setPeople(peopleResult.people);
    }

    setLoading(false);
  }, [canInvite, householdId]);

  useEffect(() => {
    void loadInviteState();
  }, [loadInviteState]);

  const peopleById = useMemo(() => buildPeopleNameLookup(people), [people]);

  const pendingDisplays = useMemo(
    () => buildPendingInvitationDisplays(invitations, peopleById),
    [invitations, peopleById]
  );

  const profileOptions = useMemo(
    () =>
      buildInviteProfileOptions({
        people,
        activeMembers: members,
        pendingInvitations: invitations,
      }),
    [people, members, invitations]
  );

  const handleSendInvite = async () => {
    setValidationError(null);
    setSubmitError(null);
    setSuccess(null);

    const clientValidation = validateInviteEmail(emailInput);
    if (!clientValidation.valid) {
      setValidationError(clientValidation.error);
      return;
    }

    const permission = canSendHouseholdInvite({
      membership,
      ownerEmail,
      inviteEmail: emailInput,
      activeMembers: members,
      pendingInvitations: invitations,
    });

    if (!permission.allowed) {
      setValidationError(permission.message);
      return;
    }

    const assignedPersonId =
      selectedPersonId === NO_PROFILE_VALUE ? null : selectedPersonId;

    const profileValidation = validateAssignedProfileSelection({
      assignedPersonId,
      people,
      activeMembers: members,
      pendingInvitations: invitations,
    });

    if (!profileValidation.ok) {
      setValidationError(profileValidation.error);
      return;
    }

    setSending(true);
    const result = await sendHouseholdInvite(
      emailInput,
      profileValidation.assignedPersonId
    );
    setSending(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setEmailInput("");
    setSelectedPersonId(NO_PROFILE_VALUE);
    setSuccess(result.message || HOUSEHOLD_INVITE_SUCCESS_COPY);
    await loadInviteState();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{HOUSEHOLD_INVITE_TITLE}</CardTitle>
        <CardDescription>{HOUSEHOLD_INVITE_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{HOUSEHOLD_MAX_USERS_COPY}</p>
        <p className="text-sm text-muted-foreground">{HOUSEHOLD_INVITE_PRIVACY_COPY}</p>

        {!canInvite ? (
          <p className="text-sm text-muted-foreground">
            {HOUSEHOLD_INVITE_READ_ONLY_COPY}
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invite status...
          </div>
        ) : (
          <>
            {loadError && (
              <Alert variant="destructive">
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            )}

            {pendingDisplays.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-medium">{HOUSEHOLD_INVITE_PENDING_TITLE}</h3>
                <ul className="space-y-2 text-sm">
                  {pendingDisplays.map((invite) => (
                    <li
                      key={`${invite.email}-${invite.sentAtLabel}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                    >
                      <span className="min-w-0 break-all font-medium">{invite.email}</span>
                      <span className="text-muted-foreground">
                        {invite.statusLabel} · Sent {invite.sentAtLabel}
                      </span>
                      {invite.assignedProfileLabel && (
                        <span className="w-full text-xs text-muted-foreground">
                          Assigned profile: {invite.assignedProfileLabel}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="household-invite-email">{HOUSEHOLD_INVITE_EMAIL_LABEL}</Label>
              <Input
                id="household-invite-email"
                type="email"
                autoComplete="email"
                placeholder="partner@example.com"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="household-invite-profile">
                {HOUSEHOLD_INVITE_PROFILE_LABEL}
              </Label>
              {profileOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {HOUSEHOLD_INVITE_NO_PROFILES_COPY}
                </p>
              ) : (
                <Select
                  value={selectedPersonId}
                  onValueChange={setSelectedPersonId}
                >
                  <SelectTrigger
                    id="household-invite-profile"
                    className="w-full"
                    data-testid="household-invite-profile-trigger"
                  >
                    <SelectValue
                      placeholder={HOUSEHOLD_INVITE_PROFILE_PLACEHOLDER}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROFILE_VALUE}>
                      {HOUSEHOLD_INVITE_PROFILE_NONE_OPTION_LABEL}
                    </SelectItem>
                    {profileOptions.map((option) => (
                      <SelectItem
                        key={option.personId}
                        value={option.personId}
                        disabled={!option.available}
                      >
                        {option.name}
                        {!option.available && option.unavailableReason
                          ? ` — ${option.unavailableReason}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {validationError && (
              <Alert variant="destructive">
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleSendInvite} disabled={sending}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {HOUSEHOLD_INVITE_SEND_LABEL}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
