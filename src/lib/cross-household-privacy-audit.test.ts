import { describe, expect, it } from "vitest";
import {
  CROSS_HOUSEHOLD_READ_TABLES,
  CROSS_HOUSEHOLD_RPC_FUNCTIONS,
  buildCrossHouseholdTableExpectations,
  crossHouseholdOwnerAdminMustDenyForeignPrivateRows,
} from "./cross-household-privacy-audit";

describe("cross-household-privacy-audit", () => {
  it("covers every required cross-household read table", () => {
    const expectations = buildCrossHouseholdTableExpectations();
    expect(expectations.map((row) => row.table)).toEqual([...CROSS_HOUSEHOLD_READ_TABLES]);
  });

  it("requires cross-household read isolation on all registry tables", () => {
    for (const row of buildCrossHouseholdTableExpectations()) {
      expect(row.readIsolation).toBe("required");
      expect(row.ownerAdminCrossHouseholdRead).toBe("denied");
    }
  });

  it("lists hardened RPC functions for cross-household denial", () => {
    expect(CROSS_HOUSEHOLD_RPC_FUNCTIONS).toContain("pay_source_from_current_cash");
    expect(CROSS_HOUSEHOLD_RPC_FUNCTIONS).toContain(
      "credit_manual_expense_adjustment_to_current_cash"
    );
  });

  it("documents owner-admin cross-household private tables", () => {
    expect(crossHouseholdOwnerAdminMustDenyForeignPrivateRows().length).toBeGreaterThan(0);
    expect(crossHouseholdOwnerAdminMustDenyForeignPrivateRows()).toContain("cash_snapshots");
    expect(crossHouseholdOwnerAdminMustDenyForeignPrivateRows()).toContain("paycheck_schedules");
  });
});
