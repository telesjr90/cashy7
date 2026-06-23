import { describe, expect, it, vi } from "vitest";
import {
  cancelHouseholdInvite,
  invokeHouseholdMemberManagement,
  removeHouseholdMember,
  resendHouseholdInvite,
  type HouseholdMemberManagementClient,
} from "./household-member-management-service";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createMockClient(
  invoke: HouseholdMemberManagementClient["functions"]["invoke"]
): HouseholdMemberManagementClient {
  return { functions: { invoke } };
}

describe("household member management service", () => {
  it("rejects cancel without invitation id", async () => {
    const invoke = vi.fn();
    const result = await invokeHouseholdMemberManagement(
      { action: "cancel_invite" },
      createMockClient(invoke)
    );
    expect(result.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes function with action and invitation id only", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "Invite cancelled." },
      error: null,
    }));

    await cancelHouseholdInvite(INVITATION_ID, createMockClient(invoke));

    expect(invoke).toHaveBeenCalledWith("manage-household-members", {
      body: { action: "cancel_invite", invitationId: INVITATION_ID },
    });
  });

  it("invokes resend with pending invitation id", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "A new invite email was sent." },
      error: null,
    }));

    await resendHouseholdInvite(INVITATION_ID, createMockClient(invoke));

    expect(invoke).toHaveBeenCalledWith("manage-household-members", {
      body: { action: "resend_invite", invitationId: INVITATION_ID },
    });
  });

  it("invokes remove member with member id only", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "Member removed from household." },
      error: null,
    }));

    await removeHouseholdMember(MEMBER_ID, createMockClient(invoke));

    expect(invoke).toHaveBeenCalledWith("manage-household-members", {
      body: { action: "remove_member", memberId: MEMBER_ID },
    });
  });

  it("maps unauthorized function response", async () => {
    const result = await cancelHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "unauthorized",
          message: "You must be signed in to manage household members.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthorized");
    }
  });

  it("maps forbidden function response", async () => {
    const result = await cancelHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "forbidden",
          message: "Only a household owner can manage members.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden");
    }
  });

  it("maps invalid status for accepted invite cancellation", async () => {
    const result = await cancelHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "invalid_status",
          message: "This action is not available for the current status.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_status");
    }
  });

  it("maps self-removal block", async () => {
    const result = await removeHouseholdMember(
      MEMBER_ID,
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "cannot_remove_self",
          message: "You cannot remove yourself from the household.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("cannot_remove_self");
    }
  });

  it("maps transport failure to function unavailable", async () => {
    const result = await cancelHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: null,
        error: { message: "Function not found" },
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("function_unavailable");
    }
  });

  it("does not expose service role key in client code path", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "Invite cancelled." },
      error: null,
    }));
    await cancelHouseholdInvite(INVITATION_ID, createMockClient(invoke));
    const serialized = JSON.stringify(invoke.mock.calls);
    expect(serialized).not.toMatch(/service_role/i);
    expect(serialized).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
  });
});
