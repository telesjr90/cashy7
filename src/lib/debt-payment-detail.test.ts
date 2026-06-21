import { describe, expect, it } from "vitest";
import {
  buildDebtPaymentBalanceImpact,
  buildDebtPaymentDetailView,
  collectDebtPaymentDetailUserFacingStrings,
  debtPaymentDetailViewContainsRawUuid,
  DEBT_PAYMENT_DETAIL_BALANCE_FALLBACK,
  DEBT_PAYMENT_DETAIL_NO_CASH_RECORD_VISIBLE,
  resolveDebtPaymentSourceLabel,
} from "@/lib/debt-payment-detail";
import type {
  BillInstance,
  CashPaymentTransaction,
  DebtAccount,
  DebtPayment,
} from "@/lib/types";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAYMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BILL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_PAYMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function makeAccount(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: ACCOUNT_ID,
    household_id: "household-1",
    name: "Visa",
    original_amount: 1000,
    current_balance: 800,
    target_payoff_date: null,
    notes: null,
    is_archived: false,
    archived_at: null,
    archive_reason: null,
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

function makePayment(overrides: Partial<DebtPayment> = {}): DebtPayment {
  return {
    id: PAYMENT_ID,
    household_id: "household-1",
    debt_account_id: ACCOUNT_ID,
    payment_date: "2026-06-01",
    month: 6,
    year: 2026,
    period_bucket: "1_14",
    total_payment: 200,
    teles_amount: 102,
    nicole_amount: 98,
    remaining_balance_after_payment: 800,
    paid_status: false,
    linked_bill_instance_id: BILL_ID,
    created_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeBill(overrides: Partial<BillInstance> = {}): BillInstance {
  return {
    id: BILL_ID,
    bill_id: null,
    household_id: "household-1",
    year: 2026,
    month: 6,
    period_bucket: "1_14",
    name: "Debt: Visa",
    amount: 200,
    teles_amount: 102,
    nicole_amount: 98,
    due_date: null,
    is_paid: false,
    paid_status: "unpaid",
    paid_at: null,
    paid_by_user_id: null,
    notes: null,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: null,
    ...overrides,
  };
}

function makeTransaction(
  overrides: Partial<CashPaymentTransaction> = {}
): CashPaymentTransaction {
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    household_id: "household-1",
    user_id: "user-1",
    person_id: "person-1",
    amount: 102,
    paid_at: "2026-06-02T14:30:00.000Z",
    source_type: "debt_payment",
    source_id: PAYMENT_ID,
    previous_cash_snapshot_id: "snap-1",
    new_cash_snapshot_id: "snap-2",
    notes: "Paid from current cash",
    created_at: "2026-06-02T14:30:00.000Z",
    ...overrides,
  };
}

function buildDetail(
  payment: DebtPayment,
  options?: Partial<Parameters<typeof buildDebtPaymentDetailView>[0]>
) {
  return buildDebtPaymentDetailView({
    payment,
    account: options?.account ?? makeAccount(),
    linkedBill: options?.linkedBill ?? makeBill(),
    paymentTransaction: options?.paymentTransaction ?? null,
    accountPayments: options?.accountPayments ?? [payment],
    cashDeductedPaymentIds: options?.cashDeductedPaymentIds ?? new Set(),
    replacementStartDate: options?.replacementStartDate,
  });
}

describe("resolveDebtPaymentSourceLabel", () => {
  it("labels scheduled payments with debt-linked bills", () => {
    expect(
      resolveDebtPaymentSourceLabel(
        { linked_bill_instance_id: BILL_ID },
        makeBill()
      )
    ).toBe("Scheduled payment with linked bill");
  });

  it("labels manual payments without linked bills", () => {
    expect(
      resolveDebtPaymentSourceLabel({ linked_bill_instance_id: null }, null)
    ).toBe("Manual payment");
  });
});

describe("buildDebtPaymentBalanceImpact", () => {
  it("derives paid-through and remaining balance for paid payments", () => {
    const priorPaid = makePayment({
      id: OTHER_PAYMENT_ID,
      payment_date: "2026-05-01",
      created_at: "2026-05-01T10:00:00.000Z",
      total_payment: 100,
      paid_status: true,
      remaining_balance_after_payment: 900,
    });
    const current = makePayment({
      paid_status: true,
      remaining_balance_after_payment: 800,
    });

    const impact = buildDebtPaymentBalanceImpact(makeAccount(), current, [
      priorPaid,
      current,
    ]);

    expect(impact.totalPaidBeforeLabel).toBe("CA$100.00");
    expect(impact.totalPaidThroughLabel).toBe("CA$300.00");
    expect(impact.remainingAfterLabel).toBe("CA$800.00");
    expect(impact.balanceFallbackExplanation).toBeNull();
  });

  it("shows fallback when payment is missing from loaded account rows", () => {
    const impact = buildDebtPaymentBalanceImpact(
      makeAccount(),
      makePayment(),
      []
    );

    expect(impact.balanceFallbackExplanation).toBe(
      DEBT_PAYMENT_DETAIL_BALANCE_FALLBACK
    );
  });
});

describe("buildDebtPaymentDetailView", () => {
  it("builds unpaid scheduled payment detail", () => {
    const detail = buildDetail(makePayment());

    expect(detail.subtitle).toContain("scheduled");
    expect(detail.cashAudit.paidStatusLabel).toBe("Unpaid scheduled payment");
    expect(detail.cashAudit.cashDeductionStatusLabel).toBe("Unpaid");
    expect(detail.linkedBill.hasLinkedBill).toBe(true);
    expect(detail.linkedBill.billNameLabel).toBe("Debt: Visa");
  });

  it("builds paid payment detail", () => {
    const detail = buildDetail(makePayment({ paid_status: true }));

    expect(detail.subtitle).toContain("paid");
    expect(detail.cashAudit.paidStatusLabel).toBe("Paid");
    expect(detail.informationalGuards).toContain(
      "Paid payment history is preserved and is not removed from this audit view."
    );
  });

  it("builds cash-deducted payment detail with visible transaction", () => {
    const detail = buildDetail(
      makePayment({ paid_status: true }),
      {
        paymentTransaction: makeTransaction(),
        cashDeductedPaymentIds: new Set([PAYMENT_ID]),
      }
    );

    expect(detail.cashAudit.cashDeductionStatusLabel).toBe("Deducted from cash");
    expect(detail.cashAudit.hasVisiblePaymentTransaction).toBe(true);
    expect(detail.cashAudit.paymentAmountLabel).toBeTruthy();
    expect(detail.cashAudit.paymentSourceLabel).toContain("Debt payment");
  });

  it("shows linked bill context when available", () => {
    const detail = buildDetail(makePayment(), {
      linkedBill: makeBill({ due_date: "2026-06-15", is_paid: true }),
    });

    expect(detail.linkedBill.dueDateLabel).toBe("June 15, 2026");
    expect(detail.linkedBill.paidStatusLabel).toBe("Paid");
  });

  it("handles payment without linked bill fallback", () => {
    const detail = buildDetail(
      makePayment({ linked_bill_instance_id: null }),
      { linkedBill: null }
    );

    expect(detail.linkedBill.hasLinkedBill).toBe(false);
    expect(detail.sourceLabel).toBe("Manual payment");
  });

  it("shows archived account label", () => {
    const detail = buildDetail(makePayment(), {
      account: makeAccount({ is_archived: true, current_balance: 0 }),
    });

    expect(detail.isAccountArchived).toBe(true);
    expect(detail.archivedAccountLabel).toBeTruthy();
    expect(detail.actionGuards.find((row) => row.action === "replace")?.available).toBe(
      false
    );
  });

  it("shows privacy-safe cash fallback when no transaction is visible for a paid payment", () => {
    const detail = buildDetail(makePayment({ paid_status: true }));

    expect(detail.cashAudit.privacyFallbackLabel).toBe(
      DEBT_PAYMENT_DETAIL_NO_CASH_RECORD_VISIBLE
    );
  });

  it("includes edit/delete/replacement guard reason labels", () => {
    const detail = buildDetail(makePayment({ paid_status: true }), {
      cashDeductedPaymentIds: new Set([PAYMENT_ID]),
      replacementStartDate: "2026-06-01",
    });

    const labels = detail.actionGuards.map((row) => row.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Edit payment", "Delete payment", "Schedule replacement"])
    );
    expect(
      detail.informationalGuards.some((message) =>
        message.includes("Cash-deducted")
      )
    ).toBe(true);
  });

  it("does not expose raw UUIDs in user-facing fields", () => {
    const detail = buildDetail(makePayment(), {
      paymentTransaction: makeTransaction(),
      cashDeductedPaymentIds: new Set([PAYMENT_ID]),
    });

    expect(debtPaymentDetailViewContainsRawUuid(detail)).toBe(false);
    expect(collectDebtPaymentDetailUserFacingStrings(detail).join(" ")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });
});
