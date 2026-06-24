import { describe, expect, it } from "vitest";
import {
  MEMBER_FORBIDDEN_PRIVATE_TABLES,
  OWNER_ONLY_ACTIONS,
  SAME_HOUSEHOLD_OWNER_ADMIN_READ_TABLES,
  SAME_HOUSEHOLD_OWNER_ADMIN_WRITE_DENIED_TABLES,
  SAME_HOUSEHOLD_OWN_USER_PRIVATE_TABLES,
  SAME_HOUSEHOLD_RPC_FUNCTIONS,
  SAME_HOUSEHOLD_SHARED_TABLES,
  assertAllPrivateTablesClassified,
  buildSameHouseholdTableExpectations,
  memberForbiddenPrivateAccess,
  ownerAdminReadExceptions,
  registryLabelsAreSafe,
  smokeAssertionsRequireServiceRole,
} from "./same-household-privacy-audit";
import { RLS_OWN_USER_PRIVATE_TABLES } from "./rls-audit";

describe("same-household-privacy-audit", () => {
  it("classifies every C127 app table", () => {
    expect(() => assertAllPrivateTablesClassified()).not.toThrow();
  });

  it("lists shared household tables visible to both active members", () => {
    expect(SAME_HOUSEHOLD_SHARED_TABLES).toContain("bills");
    expect(SAME_HOUSEHOLD_SHARED_TABLES).toContain("debt_accounts");
    expect(SAME_HOUSEHOLD_SHARED_TABLES).toContain("people");
  });

  it("covers all C127 own-user private tables", () => {
    for (const table of RLS_OWN_USER_PRIVATE_TABLES) {
      expect(SAME_HOUSEHOLD_OWN_USER_PRIVATE_TABLES).toContain(table);
    }
  });

  it("documents explicit owner-admin read exceptions after OWNER-001", () => {
    expect(ownerAdminReadExceptions()).toEqual(SAME_HOUSEHOLD_OWNER_ADMIN_READ_TABLES);
    expect(ownerAdminReadExceptions()).toContain("cash_snapshots");
    expect(ownerAdminReadExceptions()).toContain("paycheck_schedules");
    expect(ownerAdminReadExceptions()).toContain("receipt_uploads");
  });

  it("denies owner-admin writes on all private tables", () => {
    for (const table of SAME_HOUSEHOLD_OWN_USER_PRIVATE_TABLES) {
      expect(SAME_HOUSEHOLD_OWNER_ADMIN_WRITE_DENIED_TABLES).toContain(table);
    }
    expect(SAME_HOUSEHOLD_OWNER_ADMIN_WRITE_DENIED_TABLES).toContain("manual_expenses");
  });

  it("forbids member access to other-user private financial rows", () => {
    expect(memberForbiddenPrivateAccess()).toEqual(MEMBER_FORBIDDEN_PRIVATE_TABLES);
    expect(memberForbiddenPrivateAccess()).toContain("cash_snapshots");
    expect(memberForbiddenPrivateAccess()).toContain("cash_payment_transactions");
    expect(memberForbiddenPrivateAccess()).toContain("paycheck_schedules");
    expect(memberForbiddenPrivateAccess()).toContain("savings_goal_participants");
    expect(memberForbiddenPrivateAccess()).toContain("receipt_uploads");
  });

  it("lists owner-only action surfaces", () => {
    expect(OWNER_ONLY_ACTIONS).toContain("invite_household_member");
    expect(OWNER_ONLY_ACTIONS).toContain("toggle_owner_admin_view");
    expect(OWNER_ONLY_ACTIONS).toContain("rollback_import_batch");
  });

  it("lists RPC functions for same-household isolation smoke", () => {
    expect(SAME_HOUSEHOLD_RPC_FUNCTIONS).toContain("pay_source_from_current_cash");
  });

  it("requires owner-admin write denial on private rows", () => {
    for (const row of buildSameHouseholdTableExpectations()) {
      if (SAME_HOUSEHOLD_OWNER_ADMIN_WRITE_DENIED_TABLES.includes(row.table as never)) {
        expect(row.ownerAdminWriteOtherUser).toBe("denied");
      }
    }
  });

  it("uses safe labels without raw UUIDs", () => {
    expect(registryLabelsAreSafe()).toBe(true);
  });

  it("never requires service role for smoke assertions", () => {
    expect(smokeAssertionsRequireServiceRole()).toBe(false);
  });
});
