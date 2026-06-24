import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const HOUSEHOLD_MAX_MEMBERS = 2;

type InviteErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_email"
  | "self_invite"
  | "duplicate_invite"
  | "already_member"
  | "household_full"
  | "invalid_profile"
  | "profile_unavailable"
  | "provider_error"
  | "server_error";

type InviteResponseBody = {
  ok: boolean;
  code?: InviteErrorCode;
  message: string;
  invitationId?: string;
};

function jsonResponse(body: InviteResponseBody, status = 200) {
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

function isValidEmail(value: string): boolean {
  if (!value || value.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function safeMessageForCode(code: InviteErrorCode): string {
  switch (code) {
    case "unauthorized":
      return "You must be signed in to send an invite.";
    case "forbidden":
      return "Only a household owner can invite members.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "self_invite":
      return "You cannot invite your own email address.";
    case "duplicate_invite":
      return "A pending invite already exists for this email.";
    case "already_member":
      return "This email already belongs to an active household member.";
    case "household_full":
      return "This household already has two active members.";
    case "invalid_profile":
      return "Select a profile that belongs to this household.";
    case "profile_unavailable":
      return "That profile is no longer available.";
    case "provider_error":
      return "Could not send the invite right now. Try again later.";
  }
  return "Could not send the invite. Please try again.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, code: "server_error", message: "Only POST requests are supported." },
      405
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(
      { ok: false, code: "unauthorized", message: safeMessageForCode("unauthorized") },
      401
    );
  }

  let rawEmail = "";
  let rawAssignedPersonId = "";
  try {
    const body = await req.json();
    rawEmail = typeof body?.email === "string" ? body.email : "";
    rawAssignedPersonId =
      typeof body?.assignedPersonId === "string"
        ? body.assignedPersonId.trim()
        : "";
  } catch {
    return jsonResponse(
      { ok: false, code: "invalid_email", message: safeMessageForCode("invalid_email") },
      400
    );
  }

  if (rawAssignedPersonId && !isValidUuid(rawAssignedPersonId)) {
    return jsonResponse(
      { ok: false, code: "invalid_profile", message: safeMessageForCode("invalid_profile") },
      400
    );
  }

  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return jsonResponse(
      { ok: false, code: "invalid_email", message: safeMessageForCode("invalid_email") },
      400
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      { ok: false, code: "server_error", message: safeMessageForCode("server_error") },
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
      { ok: false, code: "unauthorized", message: safeMessageForCode("unauthorized") },
      401
    );
  }

  const callerEmail = user.email ? normalizeEmail(user.email) : "";
  if (callerEmail && callerEmail === email) {
    return jsonResponse(
      { ok: false, code: "self_invite", message: safeMessageForCode("self_invite") },
      400
    );
  }

  const { data: membership, error: membershipError } = await userClient
    .from("household_members")
    .select("household_id, role, is_owner, status, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership) {
    return jsonResponse(
      { ok: false, code: "forbidden", message: safeMessageForCode("forbidden") },
      403
    );
  }

  const isOwner =
    membership.is_owner === true || membership.role === "owner";
  if (!isOwner) {
    return jsonResponse(
      { ok: false, code: "forbidden", message: safeMessageForCode("forbidden") },
      403
    );
  }

  const householdId = membership.household_id as string;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: activeMembers, error: membersError } = await adminClient
    .from("household_members")
    .select("id, user_id, email, person_id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .eq("is_active", true);

  if (membersError) {
    return jsonResponse(
      { ok: false, code: "server_error", message: safeMessageForCode("server_error") },
      500
    );
  }

  const members = activeMembers ?? [];
  if (members.length >= HOUSEHOLD_MAX_MEMBERS) {
    return jsonResponse(
      { ok: false, code: "household_full", message: safeMessageForCode("household_full") },
      409
    );
  }

  for (const member of members) {
    const memberEmail =
      typeof member.email === "string" ? normalizeEmail(member.email) : "";
    if (memberEmail && memberEmail === email) {
      return jsonResponse(
        { ok: false, code: "already_member", message: safeMessageForCode("already_member") },
        409
      );
    }

    if (member.user_id) {
      const { data: authUserData, error: authUserError } =
        await adminClient.auth.admin.getUserById(member.user_id);
      if (!authUserError && authUserData?.user?.email) {
        if (normalizeEmail(authUserData.user.email) === email) {
          return jsonResponse(
            {
              ok: false,
              code: "already_member",
              message: safeMessageForCode("already_member"),
            },
            409
          );
        }
      }
    }
  }

  const { data: pendingInvite, error: pendingError } = await adminClient
    .from("household_invitations")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "invited")
    .ilike("email", email)
    .maybeSingle();

  if (pendingError) {
    return jsonResponse(
      { ok: false, code: "server_error", message: safeMessageForCode("server_error") },
      500
    );
  }

  if (pendingInvite) {
    return jsonResponse(
      { ok: false, code: "duplicate_invite", message: safeMessageForCode("duplicate_invite") },
      409
    );
  }

  let assignedPersonId: string | null = null;
  if (rawAssignedPersonId) {
    const { data: assignedPerson, error: personError } = await adminClient
      .from("people")
      .select("id")
      .eq("id", rawAssignedPersonId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (personError) {
      return jsonResponse(
        { ok: false, code: "server_error", message: safeMessageForCode("server_error") },
        500
      );
    }

    if (!assignedPerson) {
      return jsonResponse(
        { ok: false, code: "invalid_profile", message: safeMessageForCode("invalid_profile") },
        400
      );
    }

    // Reserved by an active member?
    const reservedByActiveMember = members.some(
      (member) => member.person_id === rawAssignedPersonId
    );
    if (reservedByActiveMember) {
      return jsonResponse(
        {
          ok: false,
          code: "profile_unavailable",
          message: safeMessageForCode("profile_unavailable"),
        },
        409
      );
    }

    // Reserved by another pending invite?
    const { data: pendingForProfile, error: pendingProfileError } = await adminClient
      .from("household_invitations")
      .select("id")
      .eq("household_id", householdId)
      .eq("status", "invited")
      .eq("assigned_person_id", rawAssignedPersonId)
      .maybeSingle();

    if (pendingProfileError) {
      return jsonResponse(
        { ok: false, code: "server_error", message: safeMessageForCode("server_error") },
        500
      );
    }

    if (pendingForProfile) {
      return jsonResponse(
        {
          ok: false,
          code: "profile_unavailable",
          message: safeMessageForCode("profile_unavailable"),
        },
        409
      );
    }

    assignedPersonId = rawAssignedPersonId;
  }

  const { data: invitation, error: insertError } = await adminClient
    .from("household_invitations")
    .insert({
      household_id: householdId,
      email,
      role: "member",
      status: "invited",
      invited_by: user.id,
      assigned_person_id: assignedPersonId,
    })
    .select("id")
    .single();

  if (insertError || !invitation) {
    if (insertError?.code === "23505") {
      return jsonResponse(
        { ok: false, code: "duplicate_invite", message: safeMessageForCode("duplicate_invite") },
        409
      );
    }
    return jsonResponse(
      { ok: false, code: "server_error", message: safeMessageForCode("server_error") },
      500
    );
  }

  const redirectTo = Deno.env.get("APP_INVITE_REDIRECT_URL")?.trim() || undefined;

  const inviteOptions: {
    redirectTo?: string;
    data: Record<string, string>;
  } = {
    data: {
      household_id: householdId,
      household_invitation_id: invitation.id,
    },
  };

  if (redirectTo) {
    inviteOptions.redirectTo = redirectTo;
  }

  const { data: invitedUser, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (inviteError) {
    await adminClient
      .from("household_invitations")
      .update({ status: "cancelled" })
      .eq("id", invitation.id);

    return jsonResponse(
      { ok: false, code: "provider_error", message: safeMessageForCode("provider_error") },
      502
    );
  }

  if (invitedUser?.user?.id) {
    await adminClient
      .from("household_invitations")
      .update({ invited_user_id: invitedUser.user.id })
      .eq("id", invitation.id);
  }

  return jsonResponse({
    ok: true,
    message: "Invite sent.",
    invitationId: invitation.id,
  });
});
