import { describe, expect, it, vi } from "vitest";
import {
  listHouseholdInvitations,
  sendHouseholdInvite,
  type HouseholdInvitationClient,
} from "./household-invitation-service";
import type { HouseholdInvitation } from "./types";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-4222-8222-222222222222";

function createMockClient(
  invoke: HouseholdInvitationClient["functions"]["invoke"],
  invitations: HouseholdInvitation[] = []
): HouseholdInvitationClient {
  return {
    functions: { invoke },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: invitations,
            error: null,
          }),
        }),
      }),
    }),
  };
}

describe("household invitation service", () => {
  it("rejects empty email without invoking function", async () => {
    const invoke = vi.fn();
    const result = await sendHouseholdInvite("   ", createMockClient(invoke));
    expect(result.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes function with normalized email only", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "Invite sent.", invitationId: INVITATION_ID },
      error: null,
    }));

    await sendHouseholdInvite(" Partner@Example.com ", createMockClient(invoke));

    expect(invoke).toHaveBeenCalledWith("invite-household-member", {
      body: { email: "partner@example.com" },
    });
  });

  it("returns success on ok function response", async () => {
    const result = await sendHouseholdInvite(
      "partner@example.com",
      createMockClient(async () => ({
        data: { ok: true, message: "Invite sent.", invitationId: INVITATION_ID },
        error: null,
      }))
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("Invite sent.");
    }
  });

  it("maps unauthorized function response", async () => {
    const result = await sendHouseholdInvite(
      "partner@example.com",
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "unauthorized",
          message: "You must be signed in to send an invite.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthorized");
      expect(result.error).toMatch(/signed in/i);
    }
  });

  it("maps forbidden non-owner function response", async () => {
    const result = await sendHouseholdInvite(
      "partner@example.com",
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "forbidden",
          message: "Only a household owner can invite members.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden");
    }
  });

  it("maps self-invite function response", async () => {
    const result = await sendHouseholdInvite(
      "owner@example.com",
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "self_invite",
          message: "You cannot invite your own email address.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("self_invite");
    }
  });

  it("maps household full function response", async () => {
    const result = await sendHouseholdInvite(
      "partner@example.com",
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "household_full",
          message: "This household already has two active members.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("household_full");
    }
  });

  it("returns function unavailable on invoke transport error", async () => {
    const result = await sendHouseholdInvite(
      "partner@example.com",
      createMockClient(async () => ({
        data: null,
        error: { message: "Failed to send a request to the Edge Function" },
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("function_unavailable");
    }
  });

  it("maps duplicate invite safe error", async () => {
    const result = await sendHouseholdInvite(
      "partner@example.com",
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "duplicate_invite",
          message: "A pending invite already exists for this email.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/pending invite/i);
    }
  });

  it("does not expose service role key in client code path", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "Invite sent." },
      error: null,
    }));
    await sendHouseholdInvite("partner@example.com", createMockClient(invoke));
    const serialized = JSON.stringify(invoke.mock.calls);
    expect(serialized).not.toMatch(/service_role/i);
    expect(serialized).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
  });

  it("lists household invitations for owner client", async () => {
    const invitation: HouseholdInvitation = {
      id: INVITATION_ID,
      household_id: HOUSEHOLD_ID,
      email: "partner@example.com",
      role: "member",
      status: "invited",
      invited_by: "33333333-3333-4333-8333-333333333333",
      invited_user_id: null,
      expires_at: null,
      accepted_at: null,
      created_at: "2026-06-01T12:00:00.000Z",
      updated_at: "2026-06-01T12:00:00.000Z",
    };

    const result = await listHouseholdInvitations(
      HOUSEHOLD_ID,
      createMockClient(vi.fn(), [invitation])
    );

    expect(result.error).toBeNull();
    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0]?.email).toBe("partner@example.com");
  });
});
