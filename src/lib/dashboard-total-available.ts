/**
 * Helper for the "Total amount available" dashboard card.
 *
 * "Total amount available" = current cash on hand + total accumulated savings
 * balance. Savings contributions are amounts that have already been deducted
 * from cash via Pay & deduct cash; summing them back gives the user's total
 * visible financial position.
 *
 * This is a display-only calculation that does not affect any safe-to-spend,
 * savings obligation, or audit logic.
 */

import type { SavingsContribution } from "@/lib/types";

/**
 * Sum all savings contributions for a user regardless of period/view.
 * Returns the total accumulated savings balance.
 */
export function sumAllSavingsContributions(
  contributions: Pick<SavingsContribution, "amount">[]
): number {
  return contributions.reduce((sum, c) => sum + Number(c.amount), 0);
}

/**
 * Calculate the total amount available for display on the dashboard.
 *
 * Returns null when cash snapshot is not yet recorded (no snapshot means we
 * cannot display a meaningful total).
 */
export function calculateTotalAmountAvailable(
  cashAmount: number | null,
  savingsBalance: number
): number | null {
  if (cashAmount === null) {
    return null;
  }
  return cashAmount + savingsBalance;
}
