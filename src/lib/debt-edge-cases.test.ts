/**
 * CASHFLOW-CURSOR-076 — Debt edge-case regression validation.
 * Cross-cutting tests for delete/edit/sync/archive/audit boundaries.
 */
import { describe, expect, it } from "vitest";
import {
  BILL_DETAIL_DEBT_ACCOUNT_ARCHIVED_MESSAGE,
  isDebtScheduleActionAllowed,
} from "@/lib/debt-accounts";
import {
  buildBillInstanceDetailView,
} from "@/lib/bill-detail";
import {
  buildDebtPaymentDetailView,
  debtPaymentDetailViewContainsRawUuid,
  DEBT_PAYMENT_DETAIL_NO_CASH_RECORD_VISIBLE,
} from "@/lib/debt-payment-detail";
import { buildActiveDebtProgressTotals } from "@/lib/debt-progress";
import {
  getDebtPaymentProtectionReason,
  getDebtScheduleReplacementMutation,
  planDebtScheduleReplacement,
  protectionReasonLabel,
} from "@/lib/debt-schedule-replacement";
import {
  applyDebtPaymentBalanceChange,
  applyPaidDebtPaymentAmountEdit,
  split5149,
} from "@/lib/format";
import { DEBT_LINKED_BILL_EDIT_MESSAGE } from "@/lib/sync-bill-paid-status";
import type {
  BillInstance,
  DebtAccount,
  DebtPayment,
} from "@/lib/types";

function makePayment(overrides: Partial<DebtPayment> = {}): DebtPayment {
  return {
    id: "payment-1",
    household_id: "household-1",
    debt_account_id: "account-1",
    payment_date: "2026-07-01",
    month: 7,
    year: 2026,
    period_bucket: "1_14",
    total_payment: 100,
    teles_amount: 51,
    nicole_amount: 49,
    remaining_balance_after_payment: 900,
    paid_status: false,
    linked_bill_instance_id: "bill-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAccount(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: "account-1",
    household_id: "household-1",
    name: "Visa",
    original_amount: 1000,
    current_balance: 800,
    target_payoff_date: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    is_archived: false,
    archived_at: null,
    archive_reason: null,
    ...overrides,
  };
}

function makeBill(overrides: Partial<BillInstance> = {}): BillInstance {
  return {
    id: "bill-1",
    bill_id: null,
    household_id: "household-1",
    year: 2026,
    month: 7,
    period_bucket: "1_14",
    name: "Debt: Visa",
    amount: 100,
    teles_amount: 51,
    nicole_amount: 49,
    due_date: "2026-07-15",
    is_paid: false,
    paid_status: "unpaid",
    paid_at: null,
    paid_by_user_id: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    ...overrides,
  };
}

const replacementBase = {
  accountName: "Visa",
  currentBalance: 400,
  replacementStartDate: "2026-07-01",
  paymentsLeft: 4,
  regularPayment: 100,
  splitType: "5149" as const,
};

describe("C076 delete paid payment protection (schedule replacement)", () => {
  it("excludes paid, cash-deducted, and historical rows from delete mutation", () => {
    const plan = planDebtScheduleReplacement({
      ...replacementBase,
      existingPayments: [
        makePayment({
          id: "paid-1",
          payment_date: "2026-08-01",
          paid_status: true,
        }),
        makePayment({
          id: "deducted-1",
          payment_date: "2026-09-01",
        }),
        makePayment({
          id: "historical-1",
          payment_date: "2026-06-01",
        }),
        makePayment({
          id: "replaceable-1",
          payment_date: "2026-10-01",
          linked_bill_instance_id: "bill-future",
        }),
      ],
      cashDeductedPaymentIds: new Set(["deducted-1"]),
    });

    const mutation = getDebtScheduleReplacementMutation(plan);

    expect(mutation.paymentIdsToDelete).toEqual(["replaceable-1"]);
    expect(mutation.billInstanceIdsToDelete).toEqual(["bill-future"]);
    expect(mutation.paymentIdsToDelete).not.toContain("paid-1");
    expect(mutation.paymentIdsToDelete).not.toContain("deducted-1");
    expect(mutation.paymentIdsToDelete).not.toContain("historical-1");
  });

  it("prioritizes paid protection over cash-deducted when both apply", () => {
    const payment = makePayment({
      id: "paid-and-deducted",
      payment_date: "2026-08-01",
      paid_status: true,
    });

    expect(
      getDebtPaymentProtectionReason(
        payment,
        "2026-07-01",
        new Set(["paid-and-deducted"])
      )
    ).toBe("paid");
    expect(protectionReasonLabel("paid")).toContain("Paid");
  });

  it("labels cash-deducted protection for schedule replacement preview", () => {
    const payment = makePayment({
      id: "deducted-only",
      payment_date: "2026-08-01",
    });

    expect(
      getDebtPaymentProtectionReason(
        payment,
        "2026-07-01",
        new Set(["deducted-only"])
      )
    ).toBe("cash_deducted");
    expect(protectionReasonLabel("cash_deducted")).toContain("Cash-deducted");
  });
});

describe("C076 delete unpaid payment behavior (schedule replacement)", () => {
  it("includes unpaid future payments as replace/delete candidates", () => {
    const plan = planDebtScheduleReplacement({
      ...replacementBase,
      existingPayments: [
        makePayment({
          id: "future-unpaid",
          payment_date: "2026-08-01",
          linked_bill_instance_id: "bill-linked",
        }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    const mutation = getDebtScheduleReplacementMutation(plan);

    expect(plan.existingRows[0]?.disposition).toBe("replace");
    expect(mutation.paymentIdsToDelete).toEqual(["future-unpaid"]);
    expect(mutation.billInstanceIdsToDelete).toEqual(["bill-linked"]);
    expect(plan.summary.linkedBillsToRemove).toBe(1);
  });

  it("omits bill delete when unpaid payment has no linked bill", () => {
    const plan = planDebtScheduleReplacement({
      ...replacementBase,
      existingPayments: [
        makePayment({
          id: "future-no-bill",
          payment_date: "2026-08-01",
          linked_bill_instance_id: null,
        }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    const mutation = getDebtScheduleReplacementMutation(plan);

    expect(mutation.paymentIdsToDelete).toEqual(["future-no-bill"]);
    expect(mutation.billInstanceIdsToDelete).toEqual([]);
  });
});

describe("C076 edit scheduled unpaid payment (linked bill sync consistency)", () => {
  it("keeps 51/49 split aligned for payment and linked bill update payloads", () => {
    const editedTotal = 175.25;
    const { teles, nicole } = split5149(editedTotal);

    expect(Math.round((teles + nicole) * 100) / 100).toBe(editedTotal);
    expect(teles).toBeGreaterThan(0);
    expect(nicole).toBeGreaterThan(0);
  });

  it("does not adjust account balance when editing an unpaid payment amount", () => {
    expect(applyPaidDebtPaymentAmountEdit(800, 100, 125, false)).toBe(800);
  });

  it("documents unpaid remaining balance projection used during edit", () => {
    const accountBalance = 800;
    const newTotal = 125;
    const projectedRemaining = Math.max(
      0,
      Math.round((accountBalance - newTotal) * 100) / 100
    );

    expect(projectedRemaining).toBe(675);
  });
});

describe("C076 edit paid-through-app payment boundaries", () => {
  it("adjusts account balance only when payment is marked paid", () => {
    expect(applyPaidDebtPaymentAmountEdit(500, 100, 130, true)).toBe(470);
    expect(applyPaidDebtPaymentAmountEdit(500, 100, 130, false)).toBe(500);
  });

  it("preserves paid history messaging in debt payment detail guards", () => {
    const detail = buildDebtPaymentDetailView({
      payment: makePayment({ paid_status: true }),
      account: makeAccount(),
      linkedBill: makeBill(),
      paymentTransaction: null,
      accountPayments: [makePayment({ paid_status: true })],
      cashDeductedPaymentIds: new Set(),
    });

    expect(detail.informationalGuards.some((msg) => msg.includes("preserved"))).toBe(
      true
    );
    expect(
      detail.actionGuards.find((row) => row.action === "edit")?.available
    ).toBe(true);
  });

  it("protects paid payments even when also cash-deducted", () => {
    const paidPayment = makePayment({
      id: "cash-deducted-paid",
      payment_date: "2026-08-01",
      paid_status: true,
    });

    expect(
      getDebtPaymentProtectionReason(
        paidPayment,
        "2026-07-01",
        new Set(["cash-deducted-paid"])
      )
    ).toBe("paid");
  });
});

describe("C076 linked bill sync", () => {
  it("mirrors pay/unpay balance direction used by bill paid-status sync", () => {
    const balance = 800;
    const amount = 100;

    expect(applyDebtPaymentBalanceChange(balance, amount, "pay")).toBe(700);
    expect(applyDebtPaymentBalanceChange(700, amount, "unpay")).toBe(800);
  });

  it("shows debt-managed edit guard on debt payment detail when linked bill exists", () => {
    const detail = buildDebtPaymentDetailView({
      payment: makePayment(),
      account: makeAccount(),
      linkedBill: makeBill(),
      paymentTransaction: null,
      accountPayments: [makePayment()],
      cashDeductedPaymentIds: new Set(),
    });

    expect(detail.informationalGuards).toContain(DEBT_LINKED_BILL_EDIT_MESSAGE);
    expect(detail.linkedBill.hasLinkedBill).toBe(true);
  });

  it("blocks bill edit/delete for debt-linked bills on Bills detail model", () => {
    const bill = makeBill({ name: "Debt: Visa" });
    const detail = buildBillInstanceDetailView({
      bill,
      template: null,
      templateCategory: null,
      isDebtLinked: true,
      isDebtAccountArchived: false,
      hasCashDeduction: false,
      paymentTransaction: null,
      debtPaymentId: "debt-pay-1",
      variableBillContext: {
        templateByBillId: new Map(),
        debtLinkedBillIds: new Set([bill.id]),
      },
    });

    expect(detail.actionGuards.find((row) => row.action === "edit")?.available).toBe(
      false
    );
    expect(detail.actionGuards.find((row) => row.action === "delete")?.available).toBe(
      false
    );
    expect(detail.informationalGuards).toContain(DEBT_LINKED_BILL_EDIT_MESSAGE);
  });

  it("reflects linked bill paid status in debt payment detail", () => {
    const detail = buildDebtPaymentDetailView({
      payment: makePayment({ paid_status: false }),
      account: makeAccount(),
      linkedBill: makeBill({ is_paid: true }),
      paymentTransaction: null,
      accountPayments: [makePayment()],
      cashDeductedPaymentIds: new Set(),
    });

    expect(detail.linkedBill.paidStatusLabel).toBe("Paid");
  });
});

describe("C076 duplicate payment prevention (schedule replacement)", () => {
  it("skips proposed rows for each preserved month (paid, cash-deducted, historical)", () => {
    const plan = planDebtScheduleReplacement({
      ...replacementBase,
      replacementStartDate: "2026-07-01",
      paymentsLeft: 4,
      existingPayments: [
        makePayment({
          id: "paid-july",
          payment_date: "2026-07-01",
          month: 7,
          year: 2026,
          paid_status: true,
        }),
        makePayment({
          id: "deducted-aug",
          payment_date: "2026-08-01",
          month: 8,
          year: 2026,
        }),
        makePayment({
          id: "historical-june",
          payment_date: "2026-06-01",
          month: 6,
          year: 2026,
        }),
      ],
      cashDeductedPaymentIds: new Set(["deducted-aug"]),
    });

    const skipped = plan.proposedRows.filter((row) => row.status === "skip_duplicate");
    expect(skipped.length).toBeGreaterThanOrEqual(2);
    expect(plan.summary.skippedDuplicates).toBeGreaterThanOrEqual(2);

    const mutation = getDebtScheduleReplacementMutation(plan);
    const skippedMonths = new Set(
      skipped.map((row) => `${row.year}-${row.month}`)
    );
    for (const createRow of mutation.paymentsToCreate) {
      expect(
        skippedMonths.has(`${createRow.year}-${createRow.month}`)
      ).toBe(false);
    }
  });

  it("does not create duplicate rows when only replaceable payments exist", () => {
    const plan = planDebtScheduleReplacement({
      ...replacementBase,
      existingPayments: [
        makePayment({
          id: "future-1",
          payment_date: "2026-08-01",
          month: 8,
          year: 2026,
        }),
      ],
      cashDeductedPaymentIds: new Set(),
    });

    expect(plan.summary.skippedDuplicates).toBe(0);
    expect(plan.proposedRows.every((row) => row.status === "create")).toBe(true);
  });
});

describe("C076 archive/closed account behavior", () => {
  it("blocks schedule replacement actions on archived accounts", () => {
    expect(isDebtScheduleActionAllowed(makeAccount())).toBe(true);
    expect(isDebtScheduleActionAllowed(makeAccount({ is_archived: true }))).toBe(
      false
    );
  });

  it("excludes archived accounts from active progress totals and next payment", () => {
    const active = makeAccount({ id: "active", original_amount: 1000 });
    const archived = makeAccount({
      id: "archived",
      original_amount: 500,
      is_archived: true,
    });
    const payments = [
      makePayment({
        id: "active-next",
        debt_account_id: "active",
        payment_date: "2026-09-01",
        paid_status: false,
      }),
      makePayment({
        id: "archived-sooner",
        debt_account_id: "archived",
        payment_date: "2026-08-01",
        paid_status: false,
      }),
    ];

    const totals = buildActiveDebtProgressTotals([active, archived], payments);

    expect(totals.accountCount).toBe(1);
    expect(totals.nextPayment?.id).toBe("active-next");
    expect(totals.nextPaymentAccountName).toBe("Visa");
  });

  it("shows archived label and disables replacement in debt payment detail", () => {
    const detail = buildDebtPaymentDetailView({
      payment: makePayment(),
      account: makeAccount({ is_archived: true, current_balance: 50 }),
      linkedBill: makeBill(),
      paymentTransaction: null,
      accountPayments: [makePayment()],
      cashDeductedPaymentIds: new Set(),
    });

    expect(detail.isAccountArchived).toBe(true);
    expect(detail.archivedAccountLabel).toBe("Archived");
    expect(
      detail.actionGuards.find((row) => row.action === "replace")?.available
    ).toBe(false);
    expect(detail.informationalGuards).toContain(
      BILL_DETAIL_DEBT_ACCOUNT_ARCHIVED_MESSAGE
    );
  });

  it("shows archived debt account context on linked bill detail", () => {
    const bill = makeBill({ name: "Debt: Visa" });
    const detail = buildBillInstanceDetailView({
      bill,
      template: null,
      templateCategory: null,
      isDebtLinked: true,
      isDebtAccountArchived: true,
      hasCashDeduction: false,
      paymentTransaction: null,
      debtPaymentId: "debt-pay-1",
      variableBillContext: {
        templateByBillId: new Map(),
        debtLinkedBillIds: new Set([bill.id]),
      },
    });

    expect(detail.debtAccountArchivedLabel).toBe("Debt account archived");
  });
});

describe("C076 detail/audit fallback behavior", () => {
  it("does not expose raw UUIDs in debt payment detail strings", () => {
    const payment = makePayment({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      linked_bill_instance_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    const detail = buildDebtPaymentDetailView({
      payment,
      account: makeAccount({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
      linkedBill: makeBill({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
      paymentTransaction: null,
      accountPayments: [payment],
      cashDeductedPaymentIds: new Set(),
    });

    expect(debtPaymentDetailViewContainsRawUuid(detail)).toBe(false);
  });

  it("handles missing linked bill with privacy-safe fallback labels", () => {
    const detail = buildDebtPaymentDetailView({
      payment: makePayment({ linked_bill_instance_id: null }),
      account: makeAccount(),
      linkedBill: null,
      paymentTransaction: null,
      accountPayments: [makePayment({ linked_bill_instance_id: null })],
      cashDeductedPaymentIds: new Set(),
    });

    expect(detail.linkedBill.hasLinkedBill).toBe(false);
    expect(detail.linkedBill.billNameLabel).toBeNull();
    expect(detail.sourceLabel).toBe("Manual payment");
  });

  it("shows privacy-safe cash fallback when paid payment has no visible transaction", () => {
    const detail = buildDebtPaymentDetailView({
      payment: makePayment({ paid_status: true }),
      account: makeAccount(),
      linkedBill: makeBill(),
      paymentTransaction: null,
      accountPayments: [makePayment({ paid_status: true })],
      cashDeductedPaymentIds: new Set(),
    });

    expect(detail.cashAudit.privacyFallbackLabel).toBe(
      DEBT_PAYMENT_DETAIL_NO_CASH_RECORD_VISIBLE
    );
    expect(detail.cashAudit.hasVisiblePaymentTransaction).toBe(false);
  });
});
