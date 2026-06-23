import {
  buildManagementInvokePayload,
  buildManagementSuccessCopy,
  managementErrorLabel,
  mapManagementFunctionCode,
  sanitizeManagementServiceMessage,
  type HouseholdMemberManagementAction,
  type HouseholdMemberManagementErrorCode,
} from "@/lib/household-member-management";
import { supabase } from "@/lib/supabase";

const MANAGE_HOUSEHOLD_MEMBERS_FUNCTION = "manage-household-members";

export type ManageHouseholdMembersOutcome =
  | { ok: true; message: string }
  | { ok: false; code: HouseholdMemberManagementErrorCode; error: string };

export type HouseholdMemberManagementClient = {
  functions: {
    invoke: (
      name: string,
      options: {
        body: {
          action: HouseholdMemberManagementAction;
          invitationId?: string;
          memberId?: string;
        };
      }
    ) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
};

type ManagementFunctionResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
};

function normalizeFunctionResponse(data: unknown): ManagementFunctionResponse {
  if (!data || typeof data !== "object") {
    return {};
  }
  return data as ManagementFunctionResponse;
}

export async function invokeHouseholdMemberManagement(
  input: {
    action: HouseholdMemberManagementAction;
    invitationId?: string;
    memberId?: string;
  },
  client: HouseholdMemberManagementClient = supabase as unknown as HouseholdMemberManagementClient
): Promise<ManageHouseholdMembersOutcome> {
  const payload = buildManagementInvokePayload(input);

  if (
    (payload.action === "cancel_invite" || payload.action === "resend_invite") &&
    !payload.invitationId
  ) {
    return {
      ok: false,
      code: "invalid_target",
      error: managementErrorLabel("invalid_target"),
    };
  }

  if (payload.action === "remove_member" && !payload.memberId) {
    return {
      ok: false,
      code: "invalid_target",
      error: managementErrorLabel("invalid_target"),
    };
  }

  const { data, error } = await client.functions.invoke(
    MANAGE_HOUSEHOLD_MEMBERS_FUNCTION,
    { body: payload }
  );

  if (error) {
    return {
      ok: false,
      code: "function_unavailable",
      error: sanitizeManagementServiceMessage(error.message),
    };
  }

  const response = normalizeFunctionResponse(data);
  if (response.ok === true) {
    return {
      ok: true,
      message:
        response.message?.trim() || buildManagementSuccessCopy(payload.action),
    };
  }

  const code = mapManagementFunctionCode(response.code);
  const message = response.message?.trim() || managementErrorLabel(code);

  return {
    ok: false,
    code,
    error: sanitizeManagementServiceMessage(message),
  };
}

export async function cancelHouseholdInvite(
  invitationId: string,
  client?: HouseholdMemberManagementClient
): Promise<ManageHouseholdMembersOutcome> {
  return invokeHouseholdMemberManagement(
    { action: "cancel_invite", invitationId },
    client
  );
}

export async function resendHouseholdInvite(
  invitationId: string,
  client?: HouseholdMemberManagementClient
): Promise<ManageHouseholdMembersOutcome> {
  return invokeHouseholdMemberManagement(
    { action: "resend_invite", invitationId },
    client
  );
}

export async function removeHouseholdMember(
  memberId: string,
  client?: HouseholdMemberManagementClient
): Promise<ManageHouseholdMembersOutcome> {
  return invokeHouseholdMemberManagement(
    { action: "remove_member", memberId },
    client
  );
}
