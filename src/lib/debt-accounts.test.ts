import { describe, expect, it } from "vitest";
import type { DebtAccount } from "@/lib/types";
import {
  buildArchivePayload,
  buildReopenPayload,
  canArchiveDebtAccount,
  canCloseDebtAccount,
  canReopenDebtAccount,
  filterActiveDebtAccounts,
  filterArchivedDebtAccounts,
  getDebtAccountArchiveStatus,
  getDebtAccountArchivedBadgeLabel,
  isDebtAccountArchived,
  isDebtScheduleActionAllowed,
} from "@/lib/debt-accounts";

function makeAccount(
  overrides: Partial<DebtAccount> = {}
): DebtAccount {
  return {
    id: "account-1",
    household_id: "household-1",
    name: "Visa",
    original_amount: 1000,
    current_balance: 250,
    target_payoff_date: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    is_archived: false,
    archived_at: null,
    archive_reason: null,
    ...overrides,
  };
}

describe("debt account archive helpers", () => {
  it("treats active accounts as visible in the active list", () => {
    const account = makeAccount();
    expect(isDebtAccountArchived(account)).toBe(false);
    expect(filterActiveDebtAccounts([account])).toEqual([account]);
    expect(filterArchivedDebtAccounts([account])).toEqual([]);
  });

  it("hides archived accounts from the active list", () => {
    const archived = makeAccount({ is_archived: true, archived_at: "2026-06-01T00:00:00.000Z" });
    expect(filterActiveDebtAccounts([archived])).toEqual([]);
    expect(filterArchivedDebtAccounts([archived])).toEqual([archived]);
  });

  it("shows archived accounts when show archived is enabled via filter helper", () => {
    const active = makeAccount({ id: "active" });
    const archived = makeAccount({
      id: "archived",
      is_archived: true,
      archived_at: "2026-06-01T00:00:00.000Z",
    });

    expect(filterArchivedDebtAccounts([active, archived])).toEqual([archived]);
  });

  it("allows paid-off accounts to close", () => {
    const paidOff = makeAccount({ current_balance: 0 });
    expect(canCloseDebtAccount(paidOff)).toBe(true);
    expect(getDebtAccountArchiveStatus(paidOff).closeActionLabel).toBe("Close account");
  });

  it("allows positive-balance accounts to archive but not label them paid off", () => {
    const active = makeAccount({ current_balance: 125 });
    expect(canArchiveDebtAccount(active)).toBe(true);
    expect(canCloseDebtAccount(active)).toBe(false);

    const status = getDebtAccountArchiveStatus(active);
    expect(status.isPaidOff).toBe(false);
    expect(status.closeActionLabel).toBe("Archive account");
    expect(status.closeActionDescription).toContain("remaining balance");
  });

  it("builds archive payload that only changes archive fields", () => {
    expect(buildArchivePayload("Paid off in June", "2026-06-21T12:00:00.000Z")).toEqual({
      is_archived: true,
      archived_at: "2026-06-21T12:00:00.000Z",
      archive_reason: "Paid off in June",
    });
  });

  it("builds reopen payload that clears archive fields safely", () => {
    expect(buildReopenPayload()).toEqual({
      is_archived: false,
      archived_at: null,
      archive_reason: null,
    });
  });

  it("labels paid-off archived accounts as Closed and others as Archived", () => {
    expect(
      getDebtAccountArchivedBadgeLabel(
        makeAccount({ is_archived: true, current_balance: 0 })
      )
    ).toBe("Closed");
    expect(
      getDebtAccountArchivedBadgeLabel(
        makeAccount({ is_archived: true, current_balance: 50 })
      )
    ).toBe("Archived");
  });

  it("allows reopen only for archived accounts", () => {
    expect(canReopenDebtAccount(makeAccount({ is_archived: true }))).toBe(true);
    expect(canReopenDebtAccount(makeAccount())).toBe(false);
  });

  it("blocks schedule replacement on archived accounts", () => {
    expect(isDebtScheduleActionAllowed(makeAccount())).toBe(true);
    expect(isDebtScheduleActionAllowed(makeAccount({ is_archived: true }))).toBe(
      false
    );
  });
});
