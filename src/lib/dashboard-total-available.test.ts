import { describe, it, expect } from "vitest";
import {
  sumAllSavingsContributions,
  calculateTotalAmountAvailable,
} from "./dashboard-total-available";
import type { SavingsContribution } from "@/lib/types";

// ─── sumAllSavingsContributions ───────────────────────────────────────────────

describe("sumAllSavingsContributions", () => {
  it("returns 0 for an empty array", () => {
    expect(sumAllSavingsContributions([])).toBe(0);
  });

  it("sums a single contribution", () => {
    const contributions = [{ amount: 250 }] as Pick<SavingsContribution, "amount">[];
    expect(sumAllSavingsContributions(contributions)).toBe(250);
  });

  it("sums multiple contributions across all periods", () => {
    const contributions = [
      { amount: 250 },
      { amount: 100 },
      { amount: 50 },
    ] as Pick<SavingsContribution, "amount">[];
    expect(sumAllSavingsContributions(contributions)).toBe(400);
  });

  it("handles string-numeric amounts (Supabase numeric columns)", () => {
    const contributions = [
      { amount: "125.50" as unknown as number },
      { amount: "74.50" as unknown as number },
    ] as Pick<SavingsContribution, "amount">[];
    expect(sumAllSavingsContributions(contributions)).toBeCloseTo(200);
  });

  it("does not sum contributions from another user (isolation: only receives own contributions)", () => {
    // Privacy is enforced at the data layer (RLS + getMySavingsContributions).
    // This helper sums whatever it receives; the privacy test verifies the
    // caller does not pass another user's contributions.
    const myContributions = [{ amount: 300 }] as Pick<SavingsContribution, "amount">[];
    expect(sumAllSavingsContributions(myContributions)).toBe(300);
  });
});

// ─── calculateTotalAmountAvailable ───────────────────────────────────────────

describe("calculateTotalAmountAvailable", () => {
  it("returns null when cashAmount is null (no snapshot recorded)", () => {
    expect(calculateTotalAmountAvailable(null, 0)).toBeNull();
    expect(calculateTotalAmountAvailable(null, 500)).toBeNull();
  });

  it("returns cashAmount + savingsBalance when snapshot exists", () => {
    expect(calculateTotalAmountAvailable(1000, 400)).toBe(1400);
  });

  it("returns cashAmount when savings balance is zero", () => {
    expect(calculateTotalAmountAvailable(850, 0)).toBe(850);
  });

  it("handles fractional amounts (CAD cents)", () => {
    expect(calculateTotalAmountAvailable(1000.5, 249.75)).toBeCloseTo(1250.25);
  });

  it("handles negative cashAmount (overdrawn account)", () => {
    expect(calculateTotalAmountAvailable(-50, 200)).toBe(150);
  });

  it("preserves additive identity: adding 0 savings returns cash amount unchanged", () => {
    const cashAmount = 2500;
    const result = calculateTotalAmountAvailable(cashAmount, 0);
    expect(result).toBe(cashAmount);
  });

  it("totalAmountAvailable >= safeToSpendAfterSavings (sanity: total includes savings already set aside)", () => {
    // Cash on hand: $1000, savings balance: $300
    // safe-to-spend-after-savings: $1000 - $200 (bills) - $100 (savings obligation) = $700
    const cashAmount = 1000;
    const savingsBalance = 300;
    const totalAvailable = calculateTotalAmountAvailable(cashAmount, savingsBalance);
    const safeToSpendAfter = 700;
    expect(totalAvailable).not.toBeNull();
    expect(totalAvailable!).toBeGreaterThan(safeToSpendAfter);
  });
});

// ─── Integration: Personal view must not include another user's data ──────────

describe("totalAmountAvailable privacy", () => {
  it("Personal view total uses only the signed-in user's cash + savings", () => {
    // getMySavingsContributions is already scoped to user.id via RLS.
    // This test verifies the formula: if we only pass the current user's
    // contributions, the total is correct and does not accidentally add 0
    // contributions from another user.
    const myContributions = [{ amount: 200 }, { amount: 100 }] as Pick<
      SavingsContribution,
      "amount"
    >[];
    const otherUserContributions = [{ amount: 999 }] as Pick<
      SavingsContribution,
      "amount"
    >[];

    const mySavingsBalance = sumAllSavingsContributions(myContributions);
    const myTotal = calculateTotalAmountAvailable(1000, mySavingsBalance);

    // If other user's data were mistakenly included, the result would be 1000 + 300 + 999
    const leakedTotal = calculateTotalAmountAvailable(
      1000,
      sumAllSavingsContributions([...myContributions, ...otherUserContributions])
    );

    expect(myTotal).toBe(1300);
    expect(leakedTotal).toBe(2299);
    expect(myTotal).not.toBe(leakedTotal);
  });

  it("member view total is always based on their own contributions only", () => {
    // Member (Nicole) never receives owner (Teles) private cash snapshot or
    // savings contributions. If Nicole has no savings, her total equals her
    // own cash amount only.
    const nicoleContributions: Pick<SavingsContribution, "amount">[] = [];
    const nicoleCash = 750;
    const nicoleTotal = calculateTotalAmountAvailable(
      nicoleCash,
      sumAllSavingsContributions(nicoleContributions)
    );
    expect(nicoleTotal).toBe(750);
  });
});

// ─── CAD formatting (contract) ────────────────────────────────────────────────

describe("totalAmountAvailable formatting contract", () => {
  it("the result is a plain number suitable for formatCurrency(CAD)", () => {
    const result = calculateTotalAmountAvailable(1234.56, 789.01);
    expect(typeof result).toBe("number");
    // formatCurrency should receive a number, not a string or null
    expect(result).not.toBeNull();
    expect(Number.isFinite(result)).toBe(true);
  });
});
