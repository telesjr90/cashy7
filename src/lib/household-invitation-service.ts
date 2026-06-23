import {
  buildInviteInvokePayload,
  HOUSEHOLD_INVITE_SUCCESS_COPY,
  inviteErrorLabel,
  mapInviteFunctionCode,
  sanitizeInviteServiceMessage,
  type HouseholdInviteErrorCode,
} from "@/lib/household-invitations";
import { supabase } from "@/lib/supabase";
import type { HouseholdInvitation } from "@/lib/types";

const INVITE_HOUSEHOLD_MEMBER_FUNCTION = "invite-household-member";

export type InviteHouseholdMemberOutcome =
  | { ok: true; message: string; invitationId?: string }
  | { ok: false; code: HouseholdInviteErrorCode; error: string };

export type HouseholdInvitationClient = {
  functions: {
    invoke: (
      name: string,
      options: { body: { email: string } }
    ) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  from: (table: "household_invitations") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        order: (
          column: string,
          options: { ascending: boolean }
        ) => Promise<{
          data: HouseholdInvitation[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

type InviteFunctionResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  invitationId?: string;
};

function normalizeFunctionResponse(data: unknown): InviteFunctionResponse {
  if (!data || typeof data !== "object") {
    return {};
  }
  return data as InviteFunctionResponse;
}

export async function sendHouseholdInvite(
  email: string,
  client: HouseholdInvitationClient = supabase as unknown as HouseholdInvitationClient
): Promise<InviteHouseholdMemberOutcome> {
  const payload = buildInviteInvokePayload(email);
  if (!payload.email) {
    return {
      ok: false,
      code: "invalid_email",
      error: inviteErrorLabel("invalid_email"),
    };
  }

  const { data, error } = await client.functions.invoke(
    INVITE_HOUSEHOLD_MEMBER_FUNCTION,
    { body: payload }
  );

  if (error) {
    return {
      ok: false,
      code: "function_unavailable",
      error: sanitizeInviteServiceMessage(error.message),
    };
  }

  const response = normalizeFunctionResponse(data);
  if (response.ok === true) {
    return {
      ok: true,
      message: response.message?.trim() || HOUSEHOLD_INVITE_SUCCESS_COPY,
      invitationId: response.invitationId,
    };
  }

  const code = mapInviteFunctionCode(response.code);
  const message =
    response.message?.trim() || inviteErrorLabel(code);

  return {
    ok: false,
    code,
    error: sanitizeInviteServiceMessage(message),
  };
}

export async function listHouseholdInvitations(
  householdId: string,
  client: HouseholdInvitationClient = supabase as unknown as HouseholdInvitationClient
): Promise<{ invitations: HouseholdInvitation[]; error: string | null }> {
  const { data, error } = await client
    .from("household_invitations")
    .select(
      "id, household_id, email, role, status, invited_by, invited_user_id, expires_at, accepted_at, created_at, updated_at"
    )
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      invitations: [],
      error: sanitizeInviteServiceMessage(error.message),
    };
  }

  return { invitations: data ?? [], error: null };
}
