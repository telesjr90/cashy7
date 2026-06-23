import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { acceptHouseholdInvite } from "@/lib/household-invite-acceptance-service";
import {
  ACCEPT_INVITE_ACCEPTING_COPY,
  ACCEPT_INVITE_LOADING_COPY,
  ACCEPT_INVITE_PRIVACY_COPY,
  ACCEPT_INVITE_SET_PASSWORD_COPY,
  ACCEPT_INVITE_SIGN_IN_COPY,
  ACCEPT_INVITE_SUCCESS_BODY,
  ACCEPT_INVITE_SUCCESS_TITLE,
  ACCEPT_INVITE_TITLE,
  acceptInviteErrorLabel,
  buildAcceptInvitePageState,
  buildAcceptInviteQueryString,
  resolveInvitationId,
  type AcceptInviteErrorCode,
} from "@/lib/household-invite-acceptance";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

function readMetadataInvitationId(
  metadata: Record<string, unknown> | undefined
): string | null {
  const value = metadata?.household_invitation_id;
  return typeof value === "string" ? value : null;
}

export function AcceptInvitePage() {
  const { user, household, loading: authLoading, refreshHousehold } = useAuth();
  const [authCodePending, setAuthCodePending] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errorCode, setErrorCode] = useState<AcceptInviteErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const acceptAttemptedRef = useRef(false);

  const queryParams = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );

  const invitationId = useMemo(
    () =>
      resolveInvitationId({
        queryInvitationId: queryParams.get("invitation"),
        metadataInvitationId: readMetadataInvitationId(user?.user_metadata),
      }),
    [queryParams, user?.user_metadata]
  );

  const loginHref = `/login${buildAcceptInviteQueryString(invitationId)}`;

  useEffect(() => {
    let cancelled = false;

    const establishSessionFromRedirect = async () => {
      const code = queryParams.get("code");
      if (!code) {
        if (!cancelled) {
          setAuthCodePending(false);
        }
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!cancelled) {
        setAuthCodePending(false);
        if (error) {
          setErrorCode("unauthorized");
          setErrorMessage(ACCEPT_INVITE_SIGN_IN_COPY);
        }
      }
    };

    void establishSessionFromRedirect();

    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  const runAcceptance = useCallback(async () => {
    if (!invitationId || !user || household) {
      return;
    }

    setAccepting(true);
    setErrorCode(null);
    setErrorMessage(null);

    const result = await acceptHouseholdInvite(invitationId);
    setAccepting(false);

    if (result.ok) {
      await refreshHousehold();
      setAccepted(true);
      return;
    }

    setErrorCode(result.code);
    setErrorMessage(result.error);
  }, [household, invitationId, refreshHousehold, user]);

  useEffect(() => {
    if (authLoading || authCodePending || !user || !invitationId || accepted) {
      return;
    }

    if (household) {
      if (!errorCode) {
        setErrorCode("already_member");
        setErrorMessage(acceptInviteErrorLabel("already_member"));
      }
      return;
    }

    if (acceptAttemptedRef.current) {
      return;
    }

    acceptAttemptedRef.current = true;
    void runAcceptance();
  }, [
    accepted,
    authCodePending,
    authLoading,
    errorCode,
    household,
    invitationId,
    runAcceptance,
    user,
  ]);

  const pageState = buildAcceptInvitePageState({
    authLoading,
    authCodePending,
    userPresent: Boolean(user),
    accepting,
    accepted,
    errorCode,
    invitationId,
  });

  const displayError =
    errorMessage ??
    (errorCode ? acceptInviteErrorLabel(errorCode) : acceptInviteErrorLabel("missing_invitation"));

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{ACCEPT_INVITE_TITLE}</CardTitle>
          <CardDescription>
            Accept your household invite to start sharing bills and expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pageState === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {ACCEPT_INVITE_LOADING_COPY}
            </div>
          )}

          {pageState === "needs_sign_in" && (
            <>
              <p className="text-sm text-muted-foreground">
                {ACCEPT_INVITE_SIGN_IN_COPY}
              </p>
              <p className="text-sm text-muted-foreground">
                {ACCEPT_INVITE_SET_PASSWORD_COPY}
              </p>
            </>
          )}

          {pageState === "accepting" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {ACCEPT_INVITE_ACCEPTING_COPY}
            </div>
          )}

          {pageState === "success" && (
            <>
              <Alert>
                <AlertDescription>
                  <span className="block font-medium">{ACCEPT_INVITE_SUCCESS_TITLE}</span>
                  <span className="mt-1 block">{ACCEPT_INVITE_SUCCESS_BODY}</span>
                </AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground">
                {ACCEPT_INVITE_PRIVACY_COPY}
              </p>
            </>
          )}

          {pageState === "error" && (
            <Alert variant="destructive">
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {pageState === "success" && (
            <Button asChild className="w-full">
              <Link to="/">Continue to dashboard</Link>
            </Button>
          )}

          {pageState === "needs_sign_in" && (
            <Button asChild className="w-full">
              <Link
                to={loginHref}
                state={{ from: { pathname: "/accept-invite", search: window.location.search } }}
              >
                Sign in
              </Link>
            </Button>
          )}

          {pageState === "error" &&
            errorCode === "function_unavailable" && (
              <Button
                className="w-full"
                onClick={() => {
                  acceptAttemptedRef.current = false;
                  void runAcceptance();
                }}
                disabled={!user || !invitationId}
              >
                Try again
              </Button>
            )}
        </CardFooter>
      </Card>
    </div>
  );
}
