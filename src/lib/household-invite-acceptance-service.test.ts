import { describe, expect, it, vi } from "vitest";
import {
  acceptHouseholdInvite,
  type AcceptInviteClient,
} from "./household-invite-acceptance-service";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";

function createMockClient(
  invoke: AcceptInviteClient["functions"]["invoke"]
): AcceptInviteClient {
  return {
    functions: { invoke },
  };
}

describe("household invite acceptance service", () => {
  it("rejects missing invitation id without invoking function", async () => {
    const invoke = vi.fn();
    const result = await acceptHouseholdInvite("   ", createMockClient(invoke));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("missing_invitation");
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes function with invitation id only", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "You joined the household." },
      error: null,
    }));

    await acceptHouseholdInvite(INVITATION_ID, createMockClient(invoke));

    expect(invoke).toHaveBeenCalledWith("accept-household-invite", {
      body: { invitationId: INVITATION_ID },
    });
  });

  it("returns success on ok function response", async () => {
    const result = await acceptHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: { ok: true, message: "You joined the household." },
        error: null,
      }))
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toMatch(/joined the household/i);
    }
  });

  it("maps unauthorized function response", async () => {
    const result = await acceptHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "unauthorized",
          message: "Sign in with the email address that received the invite to continue.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthorized");
    }
  });

  it("maps wrong email function response", async () => {
    const result = await acceptHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "wrong_email",
          message: "This invite was sent to a different email address.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("wrong_email");
      expect(result.error).not.toContain(INVITATION_ID);
    }
  });

  it("maps non-pending invitation response", async () => {
    const result = await acceptHouseholdInvite(
      INVITATION_ID,
      createMockClient(async () => ({
        data: {
          ok: false,
          code: "already_accepted",
          message: "This invite has already been accepted.",
        },
        error: null,
      }))
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("already_accepted");
    }
  });

  it("maps household full function response", async () => {
    const result = await acceptHouseholdInvite(
      INVITATION_ID,
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
    const result = await acceptHouseholdInvite(
      INVITATION_ID,
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

  it("does not expose service role key in client code path", async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, message: "You joined the household." },
      error: null,
    }));
    await acceptHouseholdInvite(INVITATION_ID, createMockClient(invoke));
    const serialized = JSON.stringify(invoke.mock.calls);
    expect(serialized).not.toMatch(/service_role/i);
    expect(serialized).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
  });
});
