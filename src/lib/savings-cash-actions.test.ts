import { describe, expect, it } from "vitest";
import {
  buildSavingsContributionCashDeductionNotes,
  assertCashDeductionTargetsSignedInUser,
  buildSavingsContributionCashDeductionPayload,
  buildSavingsContributionGoalNameLookup,
  buildSavingsContributionInsertPayload,
  buildSavingsContributionPaymentSourceDescription,
  buildContributionCashDeductionDetailLabel,
  getSavingsContributionCashDeductionSourceIds,
  hasCashDeductionForSavingsContribution,
  isDuplicateSavingsContributionCashDeduction,
  SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT,
  SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY,
  SAVINGS_CONTRIBUTION_CASH_DEDUCTED_LABEL,
  SAVINGS_CONTRIBUTION_NO_CASH_DEDUCTION_VISIBLE_LABEL,
  SAVINGS_CONTRIBUTION_PAYMENT_DEDUCTION_FALLBACK_LABEL,
  SAVINGS_CONTRIBUTION_PAYMENT_SOURCE_TYPE,
  savingsCashLabelContainsRawUuid,
  shouldDeductCashForSavingsContribution,
  validateSavingsContributionCashAction,
} from "@/lib/savings-cash-actions";

const userA = "user-a";
const userB = "user-b";

describe("validateSavingsContributionCashAction", () => {
  it("accepts log-only and log-and-deduct actions", () => {
    expect(validateSavingsContributionCashAction(SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY)).toEqual({
      ok: true,
      action: SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY,
    });
    expect(
      validateSavingsContributionCashAction(SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT)
    ).toEqual({
      ok: true,
      action: SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT,
    });
  });

  it("rejects unknown actions", () => {
    expect(validateSavingsContributionCashAction("silent_deduct")).toEqual({
      ok: false,
      error: "Choose whether to log only or also deduct from your current cash.",
    });
  });
});

describe("shouldDeductCashForSavingsContribution", () => {
  it("returns false for log-only", () => {
    expect(
      shouldDeductCashForSavingsContribution(SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY)
    ).toBe(false);
  });

  it("returns true for log-and-deduct", () => {
    expect(
      shouldDeductCashForSavingsContribution(SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT)
    ).toBe(true);
  });
});

describe("buildSavingsContributionInsertPayload", () => {
  it("builds contribution payload without cash deduction fields", () => {
    expect(
      buildSavingsContributionInsertPayload({
        savingsGoalId: "goal-1",
        amount: 50,
        contributionDate: "2026-06-10",
        notes: "Payday",
      })
    ).toEqual({
      savingsGoalId: "goal-1",
      amount: 50,
      contributionDate: "2026-06-10",
      personId: null,
      notes: "Payday",
    });
  });
});

describe("buildSavingsContributionCashDeductionPayload", () => {
  it("builds signed-in-user scoped cash deduction payload", () => {
    const payload = buildSavingsContributionCashDeductionPayload({
      householdId: "household-1",
      userId: userA,
      contributionId: "contrib-1",
      amount: 50,
      goalName: "Emergency fund",
    });

    expect(payload).toEqual({
      householdId: "household-1",
      userId: userA,
      sourceType: SAVINGS_CONTRIBUTION_PAYMENT_SOURCE_TYPE,
      sourceId: "contrib-1",
      amount: 50,
      notes: "Savings contribution · Emergency fund",
    });
  });

  it("never targets another user", () => {
    expect(() => assertCashDeductionTargetsSignedInUser(userA, userB)).toThrow(
      "Cash deduction must target only the signed-in user."
    );
  });
});

describe("duplicate savings contribution cash deduction guard", () => {
  const sourceIds = new Set(["contrib-1"]);

  it("detects existing cash deduction for contribution", () => {
    expect(hasCashDeductionForSavingsContribution("contrib-1", sourceIds)).toBe(true);
    expect(hasCashDeductionForSavingsContribution("contrib-2", sourceIds)).toBe(false);
  });

  it("blocks duplicate deduction for same contribution", () => {
    expect(
      isDuplicateSavingsContributionCashDeduction({
        contributionId: "contrib-1",
        cashDeductionSourceIds: sourceIds,
      })
    ).toBe(true);
  });
});

describe("getSavingsContributionCashDeductionSourceIds", () => {
  it("collects only savings contribution source ids", () => {
    const ids = getSavingsContributionCashDeductionSourceIds([
      { source_type: "manual_expense", source_id: "exp-1" },
      { source_type: "savings_contribution", source_id: "contrib-1" },
      { source_type: "savings_contribution", source_id: "contrib-2" },
    ]);

    expect([...ids]).toEqual(["contrib-1", "contrib-2"]);
  });
});

describe("readable source labels", () => {
  it("includes savings contribution and safe goal name", () => {
    expect(buildSavingsContributionCashDeductionNotes("Vacation")).toBe(
      "Savings contribution · Vacation"
    );
    expect(buildSavingsContributionPaymentSourceDescription("Vacation")).toBe("Vacation");
    expect(buildSavingsContributionPaymentSourceDescription("  ")).toBe(
      SAVINGS_CONTRIBUTION_PAYMENT_DEDUCTION_FALLBACK_LABEL
    );
  });

  it("does not expose raw UUIDs in user-facing labels", () => {
    const labels = [
      buildSavingsContributionCashDeductionNotes("Emergency fund"),
      buildContributionCashDeductionDetailLabel("contrib-1", new Set(["contrib-1"])),
      buildContributionCashDeductionDetailLabel("contrib-2", new Set()),
    ];

    for (const label of labels) {
      expect(savingsCashLabelContainsRawUuid(label)).toBe(false);
    }
  });
});

describe("buildSavingsContributionGoalNameLookup", () => {
  it("maps contribution ids to goal names", () => {
    const lookup = buildSavingsContributionGoalNameLookup(
      [{ id: "contrib-1", savings_goal_id: "goal-1" }],
      [{ id: "goal-1", name: "Emergency fund" }]
    );

    expect(lookup.get("contrib-1")).toBe("Emergency fund");
  });
});

describe("buildContributionCashDeductionDetailLabel", () => {
  it("shows deducted label when cash audit exists", () => {
    expect(
      buildContributionCashDeductionDetailLabel("contrib-1", new Set(["contrib-1"]))
    ).toBe(SAVINGS_CONTRIBUTION_CASH_DEDUCTED_LABEL);
  });

  it("shows privacy-safe fallback when no cash audit exists", () => {
    expect(buildContributionCashDeductionDetailLabel("contrib-1", new Set())).toBe(
      SAVINGS_CONTRIBUTION_NO_CASH_DEDUCTION_VISIBLE_LABEL
    );
  });
});

describe("edit/delete contribution cash behavior", () => {
  it("does not produce automatic cash adjustment payloads from helpers", () => {
    expect(
      buildSavingsContributionInsertPayload({
        savingsGoalId: "goal-1",
        amount: 25,
      })
    ).not.toHaveProperty("sourceType");

    expect(shouldDeductCashForSavingsContribution(SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY)).toBe(
      false
    );
  });
});
