import { describe, expect, it } from "vitest";
import {
  assertAllTablesClassified,
  buildRlsHelperExpectations,
  buildRlsStorageExpectations,
  buildRlsTableExpectations,
  countRlsGaps,
  RLS_ALL_APP_TABLES,
  RLS_HOUSEHOLD_SHARED_TABLES,
  RLS_OWN_USER_PRIVATE_TABLES,
  RLS_OWNER_MANAGED_TABLES,
  rlsLabelContainsRawUuid,
} from "./rls-audit";

describe("rls-audit table registry", () => {
  it("classifies every app table without duplicates", () => {
    expect(() => assertAllTablesClassified()).not.toThrow();
    expect(RLS_ALL_APP_TABLES).toHaveLength(21);
  });

  it("lists expected private tables", () => {
    expect(RLS_OWN_USER_PRIVATE_TABLES).toEqual(
      expect.arrayContaining([
        "cash_snapshots",
        "cash_payment_transactions",
        "cash_adjustment_transactions",
        "paycheck_schedules",
        "savings_goal_participants",
        "savings_contributions",
        "receipt_uploads",
        "receipt_candidates",
      ])
    );
  });

  it("lists expected household-shared tables", () => {
    expect(RLS_HOUSEHOLD_SHARED_TABLES).toEqual(
      expect.arrayContaining([
        "bills",
        "bill_instances",
        "debt_accounts",
        "debt_payments",
        "manual_expenses",
        "savings_goals",
      ])
    );
  });

  it("lists expected owner-managed tables", () => {
    expect(RLS_OWNER_MANAGED_TABLES).toEqual(
      expect.arrayContaining([
        "household_settings",
        "household_invitations",
        "import_batches",
        "import_batch_records",
      ])
    );
  });

  it("marks removed/invited as excluded from active household helpers", () => {
    const helpers = buildRlsHelperExpectations();
    for (const helper of helpers) {
      expect(helper.excludesRemovedInvited).toBe(true);
      expect(helper.excludesPendingInvitation).toBe(true);
      expect(helper.usesAuthUid).toBe(true);
      expect(helper.auditResult).toBe("PASS");
    }
  });

  it("uses safe labels without raw UUIDs", () => {
    const labels = [
      ...buildRlsTableExpectations().flatMap((row) => [
        row.object,
        row.intendedVisibility,
        row.selectSummary,
        row.insertSummary,
        row.updateSummary,
        row.deleteSummary,
        row.removedInvitedBehavior,
        row.notes ?? "",
      ]),
      ...buildRlsStorageExpectations().flatMap((row) => [
        row.object,
        row.selectSummary,
        row.notes ?? "",
      ]),
    ];

    for (const label of labels) {
      expect(rlsLabelContainsRawUuid(label)).toBe(false);
    }
  });

  it("documents storage as private uploader-scoped", () => {
    const storage = buildRlsStorageExpectations();
    expect(storage).toHaveLength(1);
    expect(storage[0]?.bucketPublic).toBe(false);
    expect(storage[0]?.auditResult).toBe("PASS");
  });

  it("tracks latent people paycheck column gap separately from paycheck_schedules", () => {
    const people = buildRlsTableExpectations().find((row) => row.object === "people");
    const paycheck = buildRlsTableExpectations().find(
      (row) => row.object === "paycheck_schedules"
    );

    expect(people?.auditResult).toBe("GAP");
    expect(paycheck?.auditResult).toBe("PASS");
  });

  it("reports gap count for follow-up hardening", () => {
    expect(countRlsGaps()).toBe(1);
  });
});
