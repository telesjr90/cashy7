import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const HOUSEHOLD_MAX_MEMBERS = 2;

type ManagementAction = "cancel_invite" | "resend_invite" | "remove_member";

type ManagementErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_target"
  | "invalid_status"
  | "cannot_remove_self"
  | "cannot_remove_owner"
  | "only_owner"
  | "household_full"
  | "provider_error"
  | "server_error";

type ManagementResponseBody = {
  ok: boolean;
  code?: ManagementErrorCode;
  message: string;
};

function jsonResponse(body: ManagementResponseBody, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function safeMessageForCode(code: ManagementErrorCode): string {
  switch (code) {
    case "unauthorized":
      return "You must be signed in to manage household members.";
    case "forbidden":
      return "Only a household owner can manage members.";
    case "invalid_target":
      return "This household member or invite could not be found.";
    case "invalid_status":
      return "This action is not available for the current status.";
    case "cannot_remove_self":
      return "You cannot remove yourself from the household.";
    case "cannot_remove_owner":
      return "Household owners cannot be removed.";
    case "only_owner":
      return "The only household owner cannot be removed.";
    case "household_full":
      return "This household already has two active members.";
    case "provider_error":
      return "Could not resend the invite right now. Try again later.";
  }
  return "Could not complete this action. Please try again.";
}

async function verifyActiveOwner(
  userClient: ReturnType<typeof createClient>
): Promise<
  | { ok: true; userId: string; householdId: string }
  | { ok: false; code: ManagementErrorCode }
> {
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return { ok: false, code: "unauthorized" };
  }

  const { data: membership, error: membershipError } = await userClient
    .from("household_members")
    .select("household_id, role, is_owner, status, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership) {
    return { ok: false, code: "forbidden" };
  }

  const isOwner =
    membership.is_owner === true || membership.role === "owner";
  if (!isOwner) {
    return { ok: false, code: "forbidden" };
  }

  return {
    ok: true,
    userId: user.id,
    householdId: membership.household_id as string,
  };
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

  let action: ManagementAction | "" = "";
  let invitationId = "";
  let memberId = "";

  try {
    const body = await req.json();
    action =
      body?.action === "cancel_invite" ||
      body?.action === "resend_invite" ||
      body?.action === "remove_member"
        ? body.action
        : "";
    invitationId =
      typeof body?.invitationId === "string" ? body.invitationId.trim() : "";
    memberId = typeof body?.memberId === "string" ? body.memberId.trim() : "";
  } catch {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_target",
        message: safeMessageForCode("invalid_target"),
      },
      400
    );
  }

  if (!action) {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_target",
        message: safeMessageForCode("invalid_target"),
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

  const ownerCheck = await verifyActiveOwner(userClient);
  if (!ownerCheck.ok) {
    return jsonResponse(
      {
        ok: false,
        code: ownerCheck.code,
        message: safeMessageForCode(ownerCheck.code),
      },
      ownerCheck.code === "unauthorized" ? 401 : 403
    );
  }

  const { userId, householdId } = ownerCheck;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  if (action === "cancel_invite" || action === "resend_invite") {
    if (!isValidUuid(invitationId)) {
      return jsonResponse(
        {
          ok: false,
          code: "invalid_target",
          message: safeMessageForCode("invalid_target"),
        },
        400
      );
    }

    const { data: invitation, error: invitationError } = await adminClient
      .from("household_invitations")
      .select("id, household_id, email, status, invited_user_id")
      .eq("id", invitationId)
      .maybeSingle();

    if (invitationError || !invitation) {
      return jsonResponse(
        {
          ok: false,
          code: "invalid_target",
          message: safeMessageForCode("invalid_target"),
        },
        404
      );
    }

    if (invitation.household_id !== householdId) {
      return jsonResponse(
        {
          ok: false,
          code: "forbidden",
          message: safeMessageForCode("forbidden"),
        },
        403
      );
    }

    if (invitation.status !== "invited") {
      return jsonResponse(
        {
          ok: false,
          code: "invalid_status",
          message: safeMessageForCode("invalid_status"),
        },
        409
      );
    }

    if (action === "cancel_invite") {
      const { error: cancelError } = await adminClient
        .from("household_invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId)
        .eq("status", "invited");

      if (cancelError) {
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
        message: "Invite cancelled.",
      });
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

    const email = (invitation.email as string).trim().toLowerCase();
    const redirectTo = Deno.env.get("APP_INVITE_REDIRECT_URL")?.trim() || undefined;

    const inviteOptions: {
      redirectTo?: string;
      data: Record<string, string>;
    } = {
      data: {
        household_id: householdId,
        household_invitation_id: invitation.id as string,
      },
    };

    if (redirectTo) {
      inviteOptions.redirectTo = redirectTo;
    }

    const { data: invitedUser, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);

    if (inviteError) {
      return jsonResponse(
        {
          ok: false,
          code: "provider_error",
          message: safeMessageForCode("provider_error"),
        },
        502
      );
    }

    if (invitedUser?.user?.id) {
      await adminClient
        .from("household_invitations")
        .update({ invited_user_id: invitedUser.user.id })
        .eq("id", invitationId);
    } else {
      await adminClient
        .from("household_invitations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", invitationId);
    }

    return jsonResponse({
      ok: true,
      message: "A new invite email was sent.",
    });
  }

  if (!isValidUuid(memberId)) {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_target",
        message: safeMessageForCode("invalid_target"),
      },
      400
    );
  }

  const { data: targetMember, error: targetError } = await adminClient
    .from("household_members")
    .select("id, household_id, user_id, role, is_owner, status, is_active")
    .eq("id", memberId)
    .maybeSingle();

  if (targetError || !targetMember) {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_target",
        message: safeMessageForCode("invalid_target"),
      },
      404
    );
  }

  if (targetMember.household_id !== householdId) {
    return jsonResponse(
      {
        ok: false,
        code: "forbidden",
        message: safeMessageForCode("forbidden"),
      },
      403
    );
  }

  if (targetMember.status !== "active" || targetMember.is_active !== true) {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_status",
        message: safeMessageForCode("invalid_status"),
      },
      409
    );
  }

  if (targetMember.user_id === userId) {
    return jsonResponse(
      {
        ok: false,
        code: "cannot_remove_self",
        message: safeMessageForCode("cannot_remove_self"),
      },
      400
    );
  }

  if (targetMember.is_owner === true || targetMember.role === "owner") {
    const { data: activeOwners, error: ownersError } = await adminClient
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("status", "active")
      .eq("is_active", true)
      .eq("is_owner", true);

    if (ownersError) {
      return jsonResponse(
        {
          ok: false,
          code: "server_error",
          message: safeMessageForCode("server_error"),
        },
        500
      );
    }

    const ownerCount = (activeOwners ?? []).length;
    if (ownerCount <= 1) {
      return jsonResponse(
        {
          ok: false,
          code: "only_owner",
          message: safeMessageForCode("only_owner"),
        },
        409
      );
    }

    return jsonResponse(
      {
        ok: false,
        code: "cannot_remove_owner",
        message: safeMessageForCode("cannot_remove_owner"),
      },
      409
    );
  }

  const removedAt = new Date().toISOString();
  const { error: removeError } = await adminClient
    .from("household_members")
    .update({
      status: "removed",
      is_active: false,
      removed_at: removedAt,
      removed_by: userId,
    })
    .eq("id", memberId)
    .eq("status", "active")
    .eq("is_active", true);

  if (removeError) {
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
    message: "Member removed from household.",
  });
});
