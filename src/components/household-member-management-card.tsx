import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildManagementActionLabel,
  buildManagementConfirmationLines,
  buildMemberManagementView,
  canCancelPendingInvite,
  canOwnerManageMembers,
  canRemoveActiveMember,
  canResendPendingInvite,
  CANCEL_INVITE_ACTION_LABEL,
  HOUSEHOLD_MEMBER_MANAGEMENT_DESCRIPTION,
  HOUSEHOLD_MEMBER_MANAGEMENT_PRIVACY_COPY,
  HOUSEHOLD_MEMBER_MANAGEMENT_READ_ONLY_COPY,
  HOUSEHOLD_MEMBER_MANAGEMENT_TITLE,
  REMOVE_MEMBER_ACTION_LABEL,
  RESEND_INVITE_ACTION_LABEL,
  type HouseholdMemberManagementAction,
} from "@/lib/household-member-management";
import {
  cancelHouseholdInvite,
  removeHouseholdMember,
  resendHouseholdInvite,
} from "@/lib/household-member-management-service";
import { listHouseholdInvitations } from "@/lib/household-invitation-service";
import { getHouseholdMembers } from "@/lib/user-person";
import type { HouseholdInvitation, HouseholdMember } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader as Loader2 } from "lucide-react";

interface HouseholdMemberManagementCardProps {
  householdId: string;
  membership: HouseholdMember | null;
  callerUserId: string;
}

type PendingAction =
  | { kind: "invite"; action: "cancel_invite" | "resend_invite"; invitationId: string }
  | { kind: "member"; action: "remove_member"; memberId: string };

export function HouseholdMemberManagementCard({
  householdId,
  membership,
  callerUserId,
}: HouseholdMemberManagementCardProps) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [acting, setActing] = useState(false);

  const canManage = canOwnerManageMembers(membership);

  const loadState = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [membersResult, invitationsResult] = await Promise.all([
      getHouseholdMembers(householdId),
      canManage
        ? listHouseholdInvitations(householdId)
        : Promise.resolve({ invitations: [], error: null }),
    ]);

    const errors = [membersResult.error, invitationsResult.error].filter(Boolean);
    if (errors.length > 0) {
      setLoadError(errors[0] ?? "Could not load household members.");
      setMembers([]);
      setInvitations([]);
    } else {
      setMembers(membersResult.members);
      setInvitations(invitationsResult.invitations);
    }

    setLoading(false);
  }, [canManage, householdId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const view = useMemo(
    () =>
      buildMemberManagementView({
        membership,
        members,
        invitations,
      }),
    [invitations, members, membership]
  );

  const activeOwnerCount = useMemo(
    () =>
      members.filter(
        (member) =>
          member.status === "active" &&
          member.is_active === true &&
          (member.role === "owner" || member.is_owner === true)
      ).length,
    [members]
  );

  const handleConfirmAction = async () => {
    if (!pendingAction) {
      return;
    }

    setActionError(null);
    setSuccess(null);
    setActing(true);

    let result;
    if (pendingAction.kind === "invite") {
      result =
        pendingAction.action === "cancel_invite"
          ? await cancelHouseholdInvite(pendingAction.invitationId)
          : await resendHouseholdInvite(pendingAction.invitationId);
    } else {
      result = await removeHouseholdMember(pendingAction.memberId);
    }

    setActing(false);
    setPendingAction(null);

    if (!result.ok) {
      setActionError(result.error);
      return;
    }

    setSuccess(result.message);
    await loadState();
  };

  const openInviteAction = (
    action: "cancel_invite" | "resend_invite",
    invitationId: string
  ) => {
    setActionError(null);
    setSuccess(null);
    setPendingAction({ kind: "invite", action, invitationId });
  };

  const openRemoveMember = (memberId: string) => {
    setActionError(null);
    setSuccess(null);
    setPendingAction({ kind: "member", action: "remove_member", memberId });
  };

  const confirmationAction: HouseholdMemberManagementAction | null =
    pendingAction?.action ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{HOUSEHOLD_MEMBER_MANAGEMENT_TITLE}</CardTitle>
        <CardDescription>{HOUSEHOLD_MEMBER_MANAGEMENT_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {HOUSEHOLD_MEMBER_MANAGEMENT_PRIVACY_COPY}
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading household members...
          </div>
        ) : (
          <>
            {loadError && (
              <Alert variant="destructive">
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            )}

            {!canManage ? (
              <p className="text-sm text-muted-foreground">
                {HOUSEHOLD_MEMBER_MANAGEMENT_READ_ONLY_COPY}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{view.capacityLabel}</p>
            )}

            {view.activeMembers.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-medium">Active members</h3>
                <ul className="space-y-2 text-sm">
                  {view.activeMembers.map((member) => {
                    const targetMember = members.find((row) => row.id === member.id);
                    const removalCheck = canRemoveActiveMember({
                      callerUserId,
                      targetMember,
                      activeOwnerCount,
                    });

                    return (
                      <li
                        key={member.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{member.label}</span>
                            <Badge variant="secondary">{member.roleLabel}</Badge>
                            <Badge variant="outline">{member.statusLabel}</Badge>
                          </div>
                          {member.detailLabel && member.detailLabel !== member.label && (
                            <p className="text-muted-foreground">{member.detailLabel}</p>
                          )}
                        </div>
                        {canManage && removalCheck.allowed && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRemoveMember(member.id)}
                          >
                            {REMOVE_MEMBER_ACTION_LABEL}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {canManage && view.pendingInvites.length === 0 && !view.hasSecondActiveMember && (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            )}

            {canManage && view.pendingInvites.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-medium">Pending invites</h3>
                <ul className="space-y-2 text-sm">
                  {view.pendingInvites.map((invite) => {
                    const invitation = invitations.find((row) => row.id === invite.id);
                    const canCancel = canCancelPendingInvite(invitation);
                    const canResend = canResendPendingInvite(invitation);

                    return (
                      <li
                        key={invite.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{invite.email}</span>
                            <Badge variant="outline">{invite.statusLabel}</Badge>
                          </div>
                          <p className="text-muted-foreground">
                            Sent {invite.sentAtLabel}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canResend && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openInviteAction("resend_invite", invite.id)
                              }
                            >
                              {RESEND_INVITE_ACTION_LABEL}
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openInviteAction("cancel_invite", invite.id)
                              }
                            >
                              {CANCEL_INVITE_ACTION_LABEL}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {canManage && view.historyItems.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-medium">Recent history</h3>
                <ul className="space-y-2 text-sm">
                  {view.historyItems.map((item, index) => (
                    <li
                      key={`${item.kind}-${item.label}-${index}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/20 px-3 py-2"
                    >
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground">
                        {item.statusLabel}
                        {item.detailLabel ? ` · ${item.detailLabel}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {actionError && (
              <Alert variant="destructive">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        <AlertDialog
          open={pendingAction !== null}
          onOpenChange={(open) => {
            if (!open && !acting) {
              setPendingAction(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmationAction
                  ? buildManagementActionLabel(confirmationAction)
                  : "Confirm action"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {confirmationAction &&
                    buildManagementConfirmationLines(confirmationAction).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  pendingAction?.action === "remove_member"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : undefined
                }
                disabled={acting}
                onClick={(event) => {
                  event.preventDefault();
                  void handleConfirmAction();
                }}
              >
                {acting ? "Working…" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
