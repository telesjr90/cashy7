import { describe, expect, it } from "vitest";
import type {
  BillInstance,
  DebtPayment,
  HouseholdMember,
  ManualExpense,
  SavingsContribution,
} from "@/lib/types";
import {
  buildCashflowStartChangeConfirmationCopy,
  buildCashflowStartImpactPreview,
  canUserEditCashflowStartDate,
  cashflowStartAdminLabelContainsRawUuid,
  CASHFLOW_START_READ_ONLY_COPY,
  formatImpactPreviewCount,
  getCashflowStartSaveBlockedReason,
  IMPACT_PREVIEW_BILLS_LABEL,
  IMPACT_PREVIEW_DEBT_PAYMENTS_LABEL,
  IMPACT_PREVIEW_EXPENSES_LABEL,
  IMPACT_PREVIEW_SAVINGS_LABEL,
  isFirstTimeCashflowStartSetup,
  requiresCashflowStartChangeConfirmation,
  validateCashflowStartDateInput,
} from "./cashflow-start-admin";

function ownerMembership(): Pick<HouseholdMember, "role" | "is_owner"> {
  return { role: "owner", is_owner: true };
}

function memberMembership(): Pick<HouseholdMember, "role" | "is_owner"> {
  return { role: "member", is_owner: false };
}

function makeBill(
  overrides: Partial<BillInstance> & Pick<BillInstance, "year" | "month" | "period_bucket">
): BillInstance {
  return {
    id: "bill-1",
    bill_id: null,
    household_id: "household-1",
    name: "Test Bill",
    amount: 100,
    teles_amount: 50,
    nicole_amount: 50,
    due_date: null,
    is_paid: false,
    paid_status: "unpaid",
    paid_at: null,
    paid_by_user_id: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function makeExpense(
  overrides: Partial<ManualExpense> & Pick<ManualExpense, "id" | "expense_date">
): ManualExpense {
  return {
    household_id: "household-1",
    created_by_user_id: "user-a",
    person_id: null,
    expense_scope: "private",
    description: "Coffee",
    category: null,
    amount: 10,
    period_bucket: "15_eom",
    split_type: "personal",
    teles_amount: 10,
    nicole_amount: 0,
    is_paid: false,
    paid_at: null,
    notes: null,
    adjusts_manual_expense_id: null,
    adjustment_direction: null,
    adjustment_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDebtPayment(
  overrides: Partial<DebtPayment> & Pick<DebtPayment, "id" | "payment_date">
): DebtPayment {
  return {
    household_id: "household-1",
    debt_account_id: "debt-1",
    month: 6,
    year: 2026,
    period_bucket: "1_14",
    total_payment: 50,
    teles_amount: 25,
    nicole_amount: 25,
    remaining_balance_after_payment: 900,
    paid_status: false,
    linked_bill_instance_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<SavingsContribution> &
    Pick<SavingsContribution, "id" | "contribution_date">
): SavingsContribution {
  return {
    household_id: "household-1",
    savings_goal_id: "goal-1",
    user_id: "user-a",
    person_id: null,
    amount: 25,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("canUserEditCashflowStartDate", () => {
  it("allows household owners to edit", () => {
    expect(canUserEditCashflowStartDate(ownerMembership())).toBe(true);
  });

  it("blocks non-admin household members", () => {
    expect(canUserEditCashflowStartDate(memberMembership())).toBe(false);
  });

  it("defaults to read-only when membership context is missing", () => {
    expect(canUserEditCashflowStartDate(null)).toBe(false);
    expect(canUserEditCashflowStartDate(undefined)).toBe(false);
  });
});

describe("validateCashflowStartDateInput", () => {
  it("accepts a valid ISO date", () => {
    expect(validateCashflowStartDateInput("2026-06-15")).toEqual({
      valid: true,
      error: null,
    });
  });

  it("rejects empty and invalid dates", () => {
    expect(validateCashflowStartDateInput("").valid).toBe(false);
    expect(validateCashflowStartDateInput("not-a-date").valid).toBe(false);
    expect(validateCashflowStartDateInput("2026-13-40").valid).toBe(false);
  });
});

describe("first-time setup and change confirmation", () => {
  it("detects first-time setup when no start date exists", () => {
    expect(isFirstTimeCashflowStartSetup(null)).toBe(true);
    expect(isFirstTimeCashflowStartSetup(undefined)).toBe(true);
    expect(isFirstTimeCashflowStartSetup("2026-06-01")).toBe(false);
  });

  it("requires confirmation only when changing an existing start date", () => {
    expect(
      requiresCashflowStartChangeConfirmation("2026-06-01", "2026-06-15")
    ).toBe(true);
    expect(
      requiresCashflowStartChangeConfirmation("2026-06-01", "2026-06-01")
    ).toBe(false);
    expect(requiresCashflowStartChangeConfirmation(null, "2026-06-01")).toBe(
      false
    );
  });

  it("builds non-destructive confirmation copy", () => {
    const copy = buildCashflowStartChangeConfirmationCopy();
    expect(copy.points.some((point) => point.includes("deleted"))).toBe(true);
    expect(copy.points.some((point) => point.includes("preserved"))).toBe(true);
  });
});

describe("getCashflowStartSaveBlockedReason", () => {
  it("blocks unauthorized users with read-only copy", () => {
    expect(
      getCashflowStartSaveBlockedReason({
        canEdit: false,
        validation: { valid: true, error: null },
        currentStartDate: "2026-06-01",
        proposedStartDate: "2026-06-15",
      })
    ).toBe(CASHFLOW_START_READ_ONLY_COPY);
  });

  it("blocks invalid dates and unchanged existing dates", () => {
    expect(
      getCashflowStartSaveBlockedReason({
        canEdit: true,
        validation: { valid: false, error: "Please select a cashflow start date." },
        currentStartDate: null,
        proposedStartDate: "",
      })
    ).toBe("Please select a cashflow start date.");

    expect(
      getCashflowStartSaveBlockedReason({
        canEdit: true,
        validation: { valid: true, error: null },
        currentStartDate: "2026-06-01",
        proposedStartDate: "2026-06-01",
      })
    ).toBe("The selected date matches the current cashflow start date.");
  });
});

describe("buildCashflowStartImpactPreview", () => {
  const currentStartDate = "2026-06-15";
  const proposedStartDate = "2026-07-01";

  const beforeBoth = makeBill({
    id: "bill-before",
    year: 2026,
    month: 6,
    period_bucket: "1_14",
  });
  const betweenDates = makeBill({
    id: "bill-between",
    year: 2026,
    month: 6,
    period_bucket: "15_eom",
  });
  const afterBoth = makeBill({
    id: "bill-after",
    year: 2026,
    month: 7,
    period_bucket: "15_eom",
  });

  it("counts bill classification changes before and after", () => {
    const preview = buildCashflowStartImpactPreview({
      billInstances: [beforeBoth, betweenDates, afterBoth],
      manualExpenses: [],
      debtPayments: [],
      savingsContributions: [],
      signedInUserId: "user-a",
      currentStartDate,
      proposedStartDate,
    });

    expect(preview.bills.total).toBe(1);
    expect(preview.bills.becomingPreStart).toBe(1);
    expect(preview.bills.becomingActive).toBe(0);
  });

  it("counts expense and debt payment classification changes", () => {
    const preview = buildCashflowStartImpactPreview({
      billInstances: [],
      manualExpenses: [
        makeExpense({ id: "expense-between", expense_date: "2026-06-20" }),
        makeExpense({ id: "expense-after", expense_date: "2026-07-05" }),
      ],
      debtPayments: [
        makeDebtPayment({ id: "debt-between", payment_date: "2026-06-20" }),
        makeDebtPayment({ id: "debt-after", payment_date: "2026-07-05" }),
      ],
      savingsContributions: [],
      signedInUserId: "user-a",
      currentStartDate,
      proposedStartDate,
    });

    expect(preview.expenses.total).toBe(1);
    expect(preview.debtPayments.total).toBe(1);
  });

  it("counts only the signed-in user savings contributions", () => {
    const preview = buildCashflowStartImpactPreview({
      billInstances: [],
      manualExpenses: [],
      debtPayments: [],
      savingsContributions: [
        makeContribution({
          id: "mine-between",
          user_id: "user-a",
          contribution_date: "2026-06-20",
        }),
        makeContribution({
          id: "other-between",
          user_id: "user-b",
          contribution_date: "2026-06-20",
        }),
      ],
      signedInUserId: "user-a",
      currentStartDate,
      proposedStartDate,
    });

    expect(preview.savingsContributions.total).toBe(1);
  });

  it("uses privacy-safe labels without raw UUIDs", () => {
    const preview = buildCashflowStartImpactPreview({
      billInstances: [],
      manualExpenses: [],
      debtPayments: [],
      savingsContributions: [],
      signedInUserId: "user-a",
      currentStartDate,
      proposedStartDate,
    });

    const labels = [
      preview.labels.bills,
      preview.labels.expenses,
      preview.labels.debtPayments,
      preview.labels.savingsContributions,
      IMPACT_PREVIEW_BILLS_LABEL,
      IMPACT_PREVIEW_EXPENSES_LABEL,
      IMPACT_PREVIEW_DEBT_PAYMENTS_LABEL,
      IMPACT_PREVIEW_SAVINGS_LABEL,
      formatImpactPreviewCount(preview.bills),
    ];

    for (const label of labels) {
      expect(cashflowStartAdminLabelContainsRawUuid(label)).toBe(false);
    }
  });
});

describe("formatImpactPreviewCount", () => {
  it("describes rows becoming active or pre-start", () => {
    expect(
      formatImpactPreviewCount({
        total: 2,
        becomingActive: 1,
        becomingPreStart: 1,
      })
    ).toBe("2 (1 would become active, 1 would become pre-start)");
  });
});
