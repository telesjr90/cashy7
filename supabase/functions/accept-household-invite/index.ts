import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const HOUSEHOLD_MAX_MEMBERS = 2;

type AcceptErrorCode =
  | "unauthorized"
  | "missing_invitation"
  | "invalid_invitation"
  | "wrong_email"
  | "expired"
  | "cancelled"
  | "already_accepted"
  | "household_full"
  | "already_member"
  | "self_invite"
  | "forbidden"
  | "profile_unavailable"
  | "server_error";

type AcceptResponseBody = {
  ok: boolean;
  code?: AcceptErrorCode;
  message: string;
};

function jsonResponse(body: AcceptResponseBody, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function safeMessageForCode(code: AcceptErrorCode): string {
  switch (code) {
    case "unauthorized":
      return "Sign in with the email address that received the invite to continue.";
    case "missing_invitation":
      return "This invite link is missing required information.";
    case "invalid_invitation":
      return "This invite is not valid.";
    case "wrong_email":
      return "This invite was sent to a different email address.";
    case "expired":
      return "This invite has expired.";
    case "cancelled":
      return "This invite is no longer active.";
    case "already_accepted":
      return "This invite has already been accepted.";
    case "household_full":
      return "This household already has two active members.";
    case "already_member":
      return "You are already an active member of this household.";
    case "self_invite":
      return "You cannot accept an invite you sent to yourself.";
    case "forbidden":
      return "You cannot accept this invite.";
    case "profile_unavailable":
      return "The profile reserved for this invite is no longer available. Ask the household owner to send a new invite.";
  }
  return "Could not accept this invite. Please try again.";
}

function isInvitationExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) && parsed <= Date.now();
}

async function findUnclaimedPersonId(
  adminClient: ReturnType<typeof createClient>,
  householdId: string
): Promise<string | null> {
  const { data: people, error: peopleError } = await adminClient
    .from("people")
    .select("id")
    .eq("household_id", householdId)
    .order("name", { ascending: true });

  if (peopleError || !people?.length) {
    return null;
  }

  const { data: members, error: membersError } = await adminClient
    .from("household_members")
    .select("person_id")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .eq("status", "active");

  if (membersError) {
    return null;
  }

  const claimed = new Set(
    (members ?? [])
      .map((member) => member.person_id)
      .filter((personId): personId is string => typeof personId === "string")
  );

  const unclaimed = people.find((person) => !claimed.has(person.id));
  return unclaimed?.id ?? null;
}

// Confirms an owner-assigned profile is still usable at accept time:
// belongs to the household, not used by an active member, and not reserved by
// a different pending invite. Returns false if anything makes it unavailable.
async function isAssignedPersonStillAvailable(
  adminClient: ReturnType<typeof createClient>,
  householdId: string,
  assignedPersonId: string,
  currentInvitationId: string
): Promise<boolean> {
  const { data: person, error: personError } = await adminClient
    .from("people")
    .select("id")
    .eq("id", assignedPersonId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (personError || !person) {
    return false;
  }

  const { data: activeMembers, error: membersError } = await adminClient
    .from("household_members")
    .select("person_id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .eq("is_active", true);

  if (membersError) {
    return false;
  }

  const usedByActiveMember = (activeMembers ?? []).some(
    (member) => member.person_id === assignedPersonId
  );
  if (usedByActiveMember) {
    return false;
  }

  const { data: otherPending, error: pendingError } = await adminClient
    .from("household_invitations")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "invited")
    .eq("assigned_person_id", assignedPersonId)
    .neq("id", currentInvitationId)
    .maybeSingle();

  if (pendingError) {
    return false;
  }

  return !otherPending;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        code: "server_error",
        message: "Only POST requests are supported.",
      },
      405
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(
      {
        ok: false,
        code: "unauthorized",
        message: safeMessageForCode("unauthorized"),
      },
      401
    );
  }

  let invitationId = "";
  try {
    const body = await req.json();
    invitationId =
      typeof body?.invitationId === "string" ? body.invitationId.trim() : "";
  } catch {
    return jsonResponse(
      {
        ok: false,
        code: "missing_invitation",
        message: safeMessageForCode("missing_invitation"),
      },
      400
    );
  }

  if (!isValidUuid(invitationId)) {
    return jsonResponse(
      {
        ok: false,
        code: "missing_invitation",
        message: safeMessageForCode("missing_invitation"),
      },
      400
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      {
        ok: false,
        code: "server_error",
        message: safeMessageForCode("server_error"),
      },
      500
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(
      {
        ok: false,
        code: "unauthorized",
        message: safeMessageForCode("unauthorized"),
      },
      401
    );
  }

  const callerEmail = user.email ? normalizeEmail(user.email) : "";
  if (!callerEmail) {
    return jsonResponse(
      {
        ok: false,
        code: "unauthorized",
        message: safeMessageForCode("unauthorized"),
      },
      401
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: invitation, error: invitationError } = await adminClient
    .from("household_invitations")
    .select(
      "id, household_id, email, role, status, invited_by, invited_user_id, assigned_person_id, expires_at, accepted_at"
    )
    .eq("id", invitationId)
    .maybeSingle();

  if (invitationError || !invitation) {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_invitation",
        message: safeMessageForCode("invalid_invitation"),
      },
      404
    );
  }

  const householdId = invitation.household_id as string;
  const inviteEmail = normalizeEmail(invitation.email as string);

  if (inviteEmail !== callerEmail) {
    return jsonResponse(
      {
        ok: false,
        code: "wrong_email",
        message: safeMessageForCode("wrong_email"),
      },
      403
    );
  }

  if (invitation.invited_by === user.id) {
    return jsonResponse(
      {
        ok: false,
        code: "self_invite",
        message: safeMessageForCode("self_invite"),
      },
      400
    );
  }

  const { data: household, error: householdError } = await adminClient
    .from("households")
    .select("owner_id")
    .eq("id", householdId)
    .maybeSingle();

  if (householdError || !household) {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_invitation",
        message: safeMessageForCode("invalid_invitation"),
      },
      404
    );
  }

  if (household.owner_id === user.id) {
    return jsonResponse(
      {
        ok: false,
        code: "forbidden",
        message: safeMessageForCode("forbidden"),
      },
      403
    );
  }

  if (invitation.status === "accepted") {
    return jsonResponse(
      {
        ok: false,
        code: "already_accepted",
        message: safeMessageForCode("already_accepted"),
      },
      409
    );
  }

  if (invitation.status === "cancelled") {
    return jsonResponse(
      {
        ok: false,
        code: "cancelled",
        message: safeMessageForCode("cancelled"),
      },
      409
    );
  }

  if (
    invitation.status === "expired" ||
    isInvitationExpired(invitation.expires_at as string | null)
  ) {
    return jsonResponse(
      {
        ok: false,
        code: "expired",
        message: safeMessageForCode("expired"),
      },
      409
    );
  }

  if (invitation.status !== "invited") {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_invitation",
        message: safeMessageForCode("invalid_invitation"),
      },
      400
    );
  }

  const { data: existingMembership, error: existingMembershipError } =
    await adminClient
      .from("household_members")
      .select("id, household_id, status, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("status", "active")
      .maybeSingle();

  if (existingMembershipError) {
    return jsonResponse(
      {
        ok: false,
        code: "server_error",
        message: safeMessageForCode("server_error"),
      },
      500
    );
  }

  if (existingMembership) {
    if (existingMembership.household_id === householdId) {
      return jsonResponse(
        {
          ok: false,
          code: "already_member",
          message: safeMessageForCode("already_member"),
        },
        409
      );
    }

    return jsonResponse(
      {
        ok: false,
        code: "forbidden",
        message: safeMessageForCode("forbidden"),
      },
      403
    );
  }

  const { data: activeMembers, error: membersError } = await adminClient
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .eq("is_active", true);

  if (membersError) {
    return jsonResponse(
      {
        ok: false,
        code: "server_error",
        message: safeMessageForCode("server_error"),
      },
      500
    );
  }

  if ((activeMembers ?? []).length >= HOUSEHOLD_MAX_MEMBERS) {
    return jsonResponse(
      {
        ok: false,
        code: "household_full",
        message: safeMessageForCode("household_full"),
      },
      409
    );
  }

  const assignedPersonId =
    typeof invitation.assigned_person_id === "string" &&
    invitation.assigned_person_id.length > 0
      ? invitation.assigned_person_id
      : null;

  let personId: string | null;
  if (assignedPersonId) {
    const stillAvailable = await isAssignedPersonStillAvailable(
      adminClient,
      householdId,
      assignedPersonId,
      invitationId
    );
    if (!stillAvailable) {
      // Fail safely with clear copy — do not auto-pick a different profile.
      return jsonResponse(
        {
          ok: false,
          code: "profile_unavailable",
          message: safeMessageForCode("profile_unavailable"),
        },
        409
      );
    }
    personId = assignedPersonId;
  } else {
    personId = await findUnclaimedPersonId(adminClient, householdId);
  }

  const { error: memberInsertError } = await adminClient
    .from("household_members")
    .insert({
      household_id: householdId,
      user_id: user.id,
      email: callerEmail,
      role: "member",
      status: "active",
      is_owner: false,
      is_active: true,
      person_id: personId,
    });

  if (memberInsertError) {
    if (memberInsertError.code === "23505") {
      return jsonResponse(
        {
          ok: false,
          code: "already_member",
          message: safeMessageForCode("already_member"),
        },
        409
      );
    }

    return jsonResponse(
      {
        ok: false,
        code: "server_error",
        message: safeMessageForCode("server_error"),
      },
      500
    );
  }

  const acceptedAt = new Date().toISOString();
  const { error: invitationUpdateError } = await adminClient
    .from("household_invitations")
    .update({
      status: "accepted",
      accepted_at: acceptedAt,
      invited_user_id: user.id,
    })
    .eq("id", invitationId)
    .eq("status", "invited");

  if (invitationUpdateError) {
    return jsonResponse(
      {
        ok: false,
        code: "server_error",
        message: safeMessageForCode("server_error"),
      },
      500
    );
  }

  return jsonResponse({
    ok: true,
    message: "You joined the household.",
  });
});
