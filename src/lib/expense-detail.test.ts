import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_PAY_DISABLED_MESSAGE,
  buildManualExpenseDetailView,
  EXPENSE_DETAIL_EDIT_AVAILABLE_MESSAGE,
  EXPENSE_DETAIL_NOT_CREATOR_MESSAGE,
  getRelatedAdjustmentsForOriginal,
  getSiblingAdjustmentsForAdjustment,
  ORIGINAL_EXPENSE_UNAVAILABLE_LABEL,
  PAID_THROUGH_APP_EDIT_MESSAGE,
} from "@/lib/expense-detail";
import { EXPENSE_PRE_START_LABEL } from "@/lib/expense-cashflow-start";
import type {
  CashAdjustmentTransaction,
  CashPaymentTransaction,
  ManualExpense,
} from "@/lib/types";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

function makeExpense(
  overrides: Partial<ManualExpense> & Pick<ManualExpense, "id" | "description">
): ManualExpense {
  return {
    id: overrides.id,
    household_id: "household-1",
    created_by_user_id: overrides.created_by_user_id ?? USER_ID,
    person_id: null,
    expense_scope: overrides.expense_scope ?? "private",
    description: overrides.description,
    category: overrides.category ?? null,
    amount: overrides.amount ?? 100,
    expense_date: overrides.expense_date ?? "2026-06-15",
    period_bucket: overrides.period_bucket ?? "15_eom",
    split_type: overrides.split_type ?? "personal",
    teles_amount: overrides.teles_amount ?? 100,
    nicole_amount: overrides.nicole_amount ?? 0,
    is_paid: overrides.is_paid ?? false,
    paid_at: overrides.paid_at ?? null,
    notes: overrides.notes ?? null,
    adjusts_manual_expense_id: overrides.adjusts_manual_expense_id ?? null,
    adjustment_direction: overrides.adjustment_direction ?? null,
    adjustment_reason: overrides.adjustment_reason ?? null,
    created_at: overrides.created_at ?? "2026-06-15T10:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-15T10:00:00.000Z",
  };
}

function buildDetail(
  expense: ManualExpense,
  visibleExpenses: ManualExpense[],
  options?: {
    paidManualExpenseIds?: Set<string>;
    paymentTransaction?: CashPaymentTransaction | null;
    creditTransaction?: CashAdjustmentTransaction | null;
    creditedAdjustmentIds?: Set<string>;
    userId?: string;
    shareKey?: "teles_amount" | "nicole_amount" | null;
    cashflowStartDate?: string | null;
  }
) {
  return buildManualExpenseDetailView({
    expense,
    visibleExpenses,
    userId: options?.userId ?? USER_ID,
    shareKey: options?.shareKey ?? "teles_amount",
    paidManualExpenseIds: options?.paidManualExpenseIds ?? new Set(),
    paymentTransaction: options?.paymentTransaction,
    creditTransaction: options?.creditTransaction,
    creditedAdjustmentIds: options?.creditedAdjustmentIds ?? new Set(),
    cashflowStartDate: options?.cashflowStartDate,
  });
}

describe("getRelatedAdjustmentsForOriginal", () => {
  it("returns child adjustments newest first", () => {
    const original = makeExpense({ id: "orig-1", description: "Groceries" });
    const older = makeExpense({
      id: "adj-old",
      description: "Older adjustment",
      expense_date: "2026-06-10",
      created_at: "2026-06-10T10:00:00.000Z",
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "increase",
    });
    const newer = makeExpense({
      id: "adj-new",
      description: "Newer adjustment",
      expense_date: "2026-06-20",
      created_at: "2026-06-20T10:00:00.000Z",
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "decrease",
    });

    const related = getRelatedAdjustmentsForOriginal(
      [original, older, newer],
      "orig-1"
    );

    expect(related.map((row) => row.id)).toEqual(["adj-new", "adj-old"]);
  });
});

describe("getSiblingAdjustmentsForAdjustment", () => {
  it("excludes the selected adjustment and includes siblings", () => {
    const original = makeExpense({ id: "orig-1", description: "Groceries" });
    const selected = makeExpense({
      id: "adj-selected",
      description: "Selected adjustment",
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "decrease",
    });
    const sibling = makeExpense({
      id: "adj-sibling",
      description: "Sibling adjustment",
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "increase",
    });

    const siblings = getSiblingAdjustmentsForAdjustment(
      [original, selected, sibling],
      selected
    );

    expect(siblings.map((row) => row.id)).toEqual(["adj-sibling"]);
  });
});

describe("buildManualExpenseDetailView", () => {
  it("returns null when expense is not in visible list", () => {
    const expense = makeExpense({ id: "hidden", description: "Hidden" });

    expect(buildDetail(expense, [])).toBeNull();
  });

  it("maps original expense core fields and empty adjustments", () => {
    const expense = makeExpense({
      id: "exp-1",
      description: "Coffee",
      category: "Food",
      notes: "Morning run",
    });

    const detail = buildDetail(expense, [expense]);

    expect(detail).not.toBeNull();
    expect(detail?.description).toBe("Coffee");
    expect(detail?.scopeLabel).toBe("Private");
    expect(detail?.category).toBe("Food");
    expect(detail?.notes).toBe("Morning run");
    expect(detail?.relatedAdjustments).toEqual([]);
    expect(detail?.isAdjustment).toBe(false);
  });

  it("maps linked adjustments for an original expense", () => {
    const original = makeExpense({ id: "orig-1", description: "Dinner" });
    const adjustment = makeExpense({
      id: "adj-1",
      description: "Adjustment for dinner",
      amount: 20,
      expense_date: "2026-06-18",
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "increase",
      adjustment_reason: "Forgot tip",
    });

    const detail = buildDetail(original, [original, adjustment]);

    expect(detail?.relatedAdjustments).toHaveLength(1);
    expect(detail?.relatedAdjustments[0]).toMatchObject({
      directionLabel: "Increase",
      reason: "Forgot tip",
      description: "Adjustment for dinner",
    });
  });

  it("maps adjustment linked original description", () => {
    const original = makeExpense({
      id: "orig-1",
      description: "Original dinner",
      amount: 80,
    });
    const adjustment = makeExpense({
      id: "adj-1",
      description: "Decrease adjustment",
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "decrease",
      adjustment_reason: "Refund received",
    });

    const detail = buildDetail(adjustment, [original, adjustment]);

    expect(detail?.linkedOriginalDescription).toBe("Original dinner");
    expect(detail?.linkedOriginalAmountLabel).toBe("CA$80.00");
    expect(detail?.adjustmentReason).toBe("Refund received");
  });

  it("uses human-readable fallback when linked original is missing", () => {
    const adjustment = makeExpense({
      id: "adj-1",
      description: "Orphan adjustment",
      adjusts_manual_expense_id: "missing-orig",
      adjustment_direction: "decrease",
    });

    const detail = buildDetail(adjustment, [adjustment]);

    expect(detail?.linkedOriginalDescription).toBe(
      ORIGINAL_EXPENSE_UNAVAILABLE_LABEL
    );
    expect(detail?.linkedOriginalDescription).not.toContain("missing-orig");
  });

  it("preserves paid-through-app edit guard messaging", () => {
    const expense = makeExpense({ id: "exp-paid", description: "Paid expense" });
    const paidIds = new Set(["exp-paid"]);

    const detail = buildDetail(expense, [expense], { paidManualExpenseIds: paidIds });
    const editAction = detail?.actions.find((row) => row.action === "edit");

    expect(editAction?.available).toBe(false);
    expect(editAction?.explanation).toBe(PAID_THROUGH_APP_EDIT_MESSAGE);
  });

  it("shows editable explanation for unpaid original expense", () => {
    const expense = makeExpense({ id: "exp-open", description: "Open expense" });
    const detail = buildDetail(expense, [expense]);
    const editAction = detail?.actions.find((row) => row.action === "edit");

    expect(editAction?.available).toBe(true);
    expect(editAction?.explanation).toBe(EXPENSE_DETAIL_EDIT_AVAILABLE_MESSAGE);
  });

  it("preserves deducted-from-cash payment audit context", () => {
    const expense = makeExpense({
      id: "exp-paid",
      description: "Paid expense",
      is_paid: true,
      paid_at: "2026-06-16T12:00:00.000Z",
    });
    const paymentTransaction: CashPaymentTransaction = {
      id: "pay-1",
      household_id: "household-1",
      user_id: USER_ID,
      person_id: null,
      source_type: "manual_expense",
      source_id: "exp-paid",
      amount: 50,
      previous_cash_snapshot_id: "snap-old",
      new_cash_snapshot_id: "snap-new",
      paid_at: "2026-06-16T12:30:00.000Z",
      notes: "Paid expense: Paid expense",
      created_at: "2026-06-16T12:30:00.000Z",
    };

    const detail = buildDetail(expense, [expense], {
      paidManualExpenseIds: new Set(["exp-paid"]),
      paymentTransaction,
    });

    expect(detail?.paymentAudit.cashDeductionStatusLabel).toBe(
      "Deducted from cash"
    );
    expect(detail?.paymentAudit.hasPaymentTransaction).toBe(true);
    expect(detail?.paymentAudit.paymentAmountLabel).toBe("− CA$50.00");
    expect(detail?.paymentAudit.paymentNotes).toBe("Paid expense: Paid expense");
  });

  it("preserves credited decrease adjustment status", () => {
    const adjustment = makeExpense({
      id: "adj-decrease",
      description: "Decrease adjustment",
      amount: 15,
      teles_amount: 15,
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "decrease",
    });
    const creditTransaction: CashAdjustmentTransaction = {
      id: "credit-1",
      household_id: "household-1",
      user_id: USER_ID,
      person_id: null,
      source_type: "manual_expense_adjustment",
      source_id: "adj-decrease",
      amount: 15,
      previous_cash_snapshot_id: "snap-old",
      new_cash_snapshot_id: "snap-new",
      credited_at: "2026-06-17T09:00:00.000Z",
      notes: "Cash credit for adjustment",
      created_at: "2026-06-17T09:00:00.000Z",
    };

    const detail = buildDetail(adjustment, [adjustment], {
      creditedAdjustmentIds: new Set(["adj-decrease"]),
      creditTransaction,
    });

    expect(detail?.paymentAudit.creditApplied).toBe(true);
    expect(detail?.paymentAudit.creditAmountLabel).toBe("CA$15.00");
    expect(detail?.paymentAudit.creditNotes).toBe("Cash credit for adjustment");

    const creditAction = detail?.actions.find((row) => row.action === "credit");
    expect(creditAction?.available).toBe(false);
    expect(creditAction?.explanation).toContain("already been credited");
  });

  it("blocks pay action for adjustment rows", () => {
    const adjustment = makeExpense({
      id: "adj-1",
      description: "Increase adjustment",
      adjusts_manual_expense_id: "orig-1",
      adjustment_direction: "increase",
    });

    const detail = buildDetail(adjustment, [adjustment]);
    const payAction = detail?.actions.find((row) => row.action === "pay");

    expect(payAction?.available).toBe(false);
    expect(payAction?.explanation).toBe(ADJUSTMENT_PAY_DISABLED_MESSAGE);
  });

  it("explains non-creator actions as unavailable", () => {
    const expense = makeExpense({
      id: "exp-other",
      description: "Shared expense",
      created_by_user_id: OTHER_USER_ID,
      expense_scope: "shared",
    });

    const detail = buildDetail(expense, [expense], { userId: USER_ID });
    const editAction = detail?.actions.find((row) => row.action === "edit");

    expect(editAction?.available).toBe(false);
    expect(editAction?.explanation).toBe(EXPENSE_DETAIL_NOT_CREATOR_MESSAGE);
  });
});

describe("buildManualExpenseDetailView cashflow start", () => {
  it("includes a pre-start label when the expense date is before cashflow start", () => {
    const expense = makeExpense({
      id: "pre-start",
      description: "Legacy expense",
      expense_date: "2026-01-01",
    });

    const detail = buildDetail(expense, [expense], {
      cashflowStartDate: "2026-06-15",
    });

    expect(detail?.beforeCashflowStartLabel).toBe(EXPENSE_PRE_START_LABEL);
  });

  it("omits the pre-start label for expenses on or after cashflow start", () => {
    const expense = makeExpense({
      id: "active",
      description: "Current expense",
      expense_date: "2026-06-15",
    });

    const detail = buildDetail(expense, [expense], {
      cashflowStartDate: "2026-06-15",
    });

    expect(detail?.beforeCashflowStartLabel).toBeNull();
  });

  it("omits the pre-start label when no cashflow start date is configured", () => {
    const expense = makeExpense({
      id: "legacy",
      description: "Legacy expense",
      expense_date: "2026-01-01",
    });

    const detail = buildDetail(expense, [expense], {
      cashflowStartDate: null,
    });

    expect(detail?.beforeCashflowStartLabel).toBeNull();
  });
});
