import {
  acceptInviteErrorLabel,
  buildAcceptInviteInvokePayload,
  mapAcceptFunctionCode,
  sanitizeAcceptServiceMessage,
  type AcceptInviteErrorCode,
} from "@/lib/household-invite-acceptance";
import { supabase } from "@/lib/supabase";

const ACCEPT_HOUSEHOLD_INVITE_FUNCTION = "accept-household-invite";

export type AcceptHouseholdInviteOutcome =
  | { ok: true; message: string }
  | { ok: false; code: AcceptInviteErrorCode; error: string };

export type AcceptInviteClient = {
  functions: {
    invoke: (
      name: string,
      options: { body: { invitationId: string } }
    ) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
};

type AcceptFunctionResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
};

function normalizeFunctionResponse(data: unknown): AcceptFunctionResponse {
  if (!data || typeof data !== "object") {
    return {};
  }
  return data as AcceptFunctionResponse;
}

export async function acceptHouseholdInvite(
  invitationId: string,
  client: AcceptInviteClient = supabase as unknown as AcceptInviteClient
): Promise<AcceptHouseholdInviteOutcome> {
  const payload = buildAcceptInviteInvokePayload(invitationId);
  if (!payload.invitationId) {
    return {
      ok: false,
      code: "missing_invitation",
      error: acceptInviteErrorLabel("missing_invitation"),
    };
  }

  const { data, error } = await client.functions.invoke(
    ACCEPT_HOUSEHOLD_INVITE_FUNCTION,
    { body: payload }
  );

  if (error) {
    return {
      ok: false,
      code: "function_unavailable",
      error: sanitizeAcceptServiceMessage(error.message),
    };
  }

  const response = normalizeFunctionResponse(data);
  if (response.ok === true) {
    return {
      ok: true,
      message:
        response.message?.trim() || "You joined the household.",
    };
  }

  const code = mapAcceptFunctionCode(response.code);
  const message =
    response.message?.trim() || acceptInviteErrorLabel(code);

  return {
    ok: false,
    code,
    error: sanitizeAcceptServiceMessage(message),
  };
}
