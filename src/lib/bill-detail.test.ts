import { describe, expect, it } from "vitest";
import {
  BILL_DETAIL_CASH_DEDUCTED_BULK_PROTECTED_MESSAGE,
  BILL_DETAIL_DEBT_MANAGED_MESSAGE,
  BILL_DETAIL_MARKED_PAID_ONLY_LABEL,
  BILL_DETAIL_RECURRING_EDIT_SCOPE_MESSAGE,
  billDetailViewContainsRawUuid,
  buildBillInstanceDetailView,
  collectBillDetailUserFacingStrings,
  extractGeneratedNoteLabel,
  formatBillInstanceSourceDisplayLabel,
  resolveBillPaymentTransaction,
  resolveDebtLinkedLabel,
} from "@/lib/bill-detail";
import { GENERATED_BILL_INSTANCE_NOTE_PREFIX } from "@/lib/bill-templates";
import type { Bill, BillInstance, CashPaymentTransaction } from "@/lib/types";
import type { VariableBillContext } from "@/lib/variable-bills";

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const BILL_ID = "22222222-2222-4222-8222-222222222222";
const DEBT_PAYMENT_ID = "33333333-3333-4333-8333-333333333333";

function makeBill(overrides: Partial<BillInstance> = {}): BillInstance {
  return {
    id: BILL_ID,
    bill_id: null,
    household_id: "household-1",
    year: 2026,
    month: 6,
    period_bucket: "1_14",
    name: "Electric",
    amount: 100,
    teles_amount: 51,
    nicole_amount: 49,
    due_date: "2026-06-10",
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

function makeTemplate(overrides: Partial<Bill> = {}): Bill {
  return {
    id: TEMPLATE_ID,
    household_id: "household-1",
    name: "Electric template",
    category: "utilities",
    default_amount: 100,
    due_day: "10",
    is_variable: false,
    period_bucket: "1_14",
    recurring: true,
    active_from: "2026-01-01",
    active_until: null,
    notes: "Template note",
    is_active: true,
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeVariableContext(
  template?: Bill | null
): VariableBillContext {
  const templates = template ? [template] : [];
  return {
    templateByBillId: new Map(
      templates.map((row) => [
        row.id,
        { is_variable: row.is_variable, default_amount: row.default_amount },
      ])
    ),
    debtLinkedBillIds: new Set(),
  };
}

function buildDetail(
  bill: BillInstance,
  options?: Partial<Parameters<typeof buildBillInstanceDetailView>[0]>
) {
  const template =
    options?.template ??
    (bill.bill_id ? makeTemplate({ id: bill.bill_id, name: bill.name }) : null);

  return buildBillInstanceDetailView({
    bill,
    template,
    templateCategory: options?.templateCategory ?? template?.category ?? null,
    isDebtLinked: options?.isDebtLinked ?? false,
    isDebtAccountArchived: options?.isDebtAccountArchived ?? false,
    hasCashDeduction: options?.hasCashDeduction ?? false,
    paymentTransaction: options?.paymentTransaction ?? null,
    debtPaymentId: options?.debtPaymentId ?? null,
    variableBillContext:
      options?.variableBillContext ?? makeVariableContext(template),
    referenceDate: options?.referenceDate,
  });
}

describe("formatBillInstanceSourceDisplayLabel", () => {
  it("returns readable source labels", () => {
    expect(formatBillInstanceSourceDisplayLabel("manual instance")).toBe(
      "Manual instance"
    );
    expect(formatBillInstanceSourceDisplayLabel("generated from template")).toBe(
      "Generated from template"
    );
  });
});

describe("extractGeneratedNoteLabel", () => {
  it("extracts readable generated note prefix", () => {
    const notes = `${GENERATED_BILL_INSTANCE_NOTE_PREFIX}June 2026]`;
    expect(extractGeneratedNoteLabel(notes)).toBe("Generated for June 2026");
  });
});

describe("resolveDebtLinkedLabel", () => {
  it("strips Debt prefix for linked bills", () => {
    expect(resolveDebtLinkedLabel({ name: "Debt: RBC Credit Card" })).toBe(
      "RBC Credit Card"
    );
  });
});

describe("resolveBillPaymentTransaction", () => {
  it("resolves direct and debt-linked payment transactions", () => {
    const directTx = {
      id: "pay-direct",
    } as CashPaymentTransaction;
    const debtTx = {
      id: "pay-debt",
    } as CashPaymentTransaction;

    const paymentByBillId = new Map([[BILL_ID, directTx]]);
    const debtPaymentIdByBillId = new Map([[BILL_ID, DEBT_PAYMENT_ID]]);
    const paymentByDebtPaymentId = new Map([[DEBT_PAYMENT_ID, debtTx]]);

    expect(
      resolveBillPaymentTransaction(
        BILL_ID,
        paymentByBillId,
        debtPaymentIdByBillId,
        paymentByDebtPaymentId
      )
    ).toBe(directTx);

    expect(
      resolveBillPaymentTransaction(
        BILL_ID,
        new Map(),
        debtPaymentIdByBillId,
        paymentByDebtPaymentId
      )
    ).toBe(debtTx);
  });
});

describe("buildBillInstanceDetailView", () => {
  it("maps manual instance detail summary", () => {
    const bill = makeBill({ notes: "Manual note" });
    const detail = buildDetail(bill, { template: null, templateCategory: null });

    expect(detail.sourceLabel).toBe("Manual instance");
    expect(detail.userNotes).toBe("Manual note");
    expect(detail.templateName).toBeNull();
    expect(detail.isGeneratedFromTemplate).toBe(false);
  });

  it("maps generated-from-template detail summary", () => {
    const template = makeTemplate();
    const bill = makeBill({
      bill_id: template.id,
      name: template.name,
      notes: `${GENERATED_BILL_INSTANCE_NOTE_PREFIX}June 2026]\nTemplate note`,
    });
    const detail = buildDetail(bill, { template });

    expect(detail.sourceLabel).toBe("Generated from template");
    expect(detail.isGeneratedFromTemplate).toBe(true);
    expect(detail.templateName).toBe("Electric template");
    expect(detail.generatedNoteLabel).toBe("Generated for June 2026");
    expect(detail.recurringEditExplanation).toBe(
      BILL_DETAIL_RECURRING_EDIT_SCOPE_MESSAGE
    );
  });

  it("maps debt-linked detail summary", () => {
    const bill = makeBill({
      bill_id: null,
      name: "Debt: Store card",
    });
    const detail = buildDetail(bill, {
      template: null,
      templateCategory: null,
      isDebtLinked: true,
    });

    expect(detail.sourceLabel).toBe("Debt-linked");
    expect(detail.debtLinkedLabel).toBe("Store card");
    expect(detail.debtManagedExplanation).toBe(BILL_DETAIL_DEBT_MANAGED_MESSAGE);

    const editGuard = detail.actionGuards.find((row) => row.action === "edit");
    expect(editGuard?.available).toBe(false);
  });

  it("shows archived debt account context when provided", () => {
    const bill = makeBill({
      bill_id: null,
      name: "Debt: Store card",
    });
    const detail = buildDetail(bill, {
      template: null,
      templateCategory: null,
      isDebtLinked: true,
      isDebtAccountArchived: true,
    });

    expect(detail.debtAccountArchivedLabel).toBe("Debt account archived");
    expect(detail.informationalGuards.some((guard) => guard.includes("archived"))).toBe(
      true
    );
  });

  it("maps variable bill needing confirmation detail", () => {
    const template = makeTemplate({
      is_variable: true,
      default_amount: 80,
    });
    const bill = makeBill({
      bill_id: template.id,
      amount: 80,
      teles_amount: 40.8,
      nicole_amount: 39.2,
      notes: `${GENERATED_BILL_INSTANCE_NOTE_PREFIX}June 2026]`,
    });
    const detail = buildDetail(bill, {
      template,
      variableBillContext: {
        templateByBillId: new Map([
          [template.id, { is_variable: true, default_amount: 80 }],
        ]),
        debtLinkedBillIds: new Set(),
      },
    });

    expect(detail.needsAmountConfirmation).toBe(true);
    expect(detail.variableAmountStatusLabel).toBe("Needs confirmation");
    expect(detail.needsConfirmationMessage).toContain("Forecast is incomplete");
  });

  it("maps paid bill status label", () => {
    const bill = makeBill({
      is_paid: true,
      paid_status: "paid",
      paid_at: "2026-06-12T12:00:00.000Z",
    });
    const detail = buildDetail(bill, { template: null, templateCategory: null });

    expect(detail.paymentAudit.paidStatusLabel).toBe("Paid");
    expect(detail.paymentAudit.paymentMethodLabel).toBe(
      BILL_DETAIL_MARKED_PAID_ONLY_LABEL
    );
  });

  it("maps cash-deducted status label when payment context is provided", () => {
    const bill = makeBill({
      is_paid: true,
      paid_status: "paid",
    });
    const paymentTransaction: CashPaymentTransaction = {
      id: "pay-1",
      household_id: "household-1",
      user_id: "user-1",
      person_id: null,
      source_type: "bill_instance",
      source_id: BILL_ID,
      amount: 51,
      previous_cash_snapshot_id: "snap-old",
      new_cash_snapshot_id: "snap-new",
      paid_at: "2026-06-12T12:30:00.000Z",
      notes: "Paid bill: Electric",
      created_at: "2026-06-12T12:30:00.000Z",
    };

    const detail = buildDetail(bill, {
      template: null,
      templateCategory: null,
      hasCashDeduction: true,
      paymentTransaction,
    });

    expect(detail.paymentAudit.cashDeductionStatusLabel).toBe("Deducted from cash");
    expect(detail.paymentAudit.hasPaymentTransaction).toBe(true);
    expect(detail.paymentAudit.paymentAmountLabel).toBe("− CA$51.00");
    expect(detail.informationalGuards).toContain(
      BILL_DETAIL_CASH_DEDUCTED_BULK_PROTECTED_MESSAGE
    );
  });

  it("includes edit/delete guard reasons", () => {
    const bill = makeBill({
      bill_id: TEMPLATE_ID,
      notes: `${GENERATED_BILL_INSTANCE_NOTE_PREFIX}June 2026]`,
    });
    const detail = buildDetail(bill, { template: makeTemplate() });

    expect(detail.actionGuards).toHaveLength(2);
    expect(detail.actionGuards.every((row) => row.explanation.length > 0)).toBe(
      true
    );
  });

  it("does not include raw UUIDs in user-facing detail fields", () => {
    const bill = makeBill({
      bill_id: TEMPLATE_ID,
      notes: `${GENERATED_BILL_INSTANCE_NOTE_PREFIX}June 2026]`,
    });
    const detail = buildDetail(bill, { template: makeTemplate() });
    const strings = collectBillDetailUserFacingStrings(detail);

    expect(strings.some((value) => value.includes(TEMPLATE_ID))).toBe(false);
    expect(strings.some((value) => value.includes(BILL_ID))).toBe(false);
    expect(billDetailViewContainsRawUuid(detail)).toBe(false);
  });

  it("falls back to readable labels when optional context is missing", () => {
    const bill = makeBill({ due_date: null, notes: null });
    const detail = buildDetail(bill, {
      template: null,
      templateCategory: null,
      paymentTransaction: null,
    });

    expect(detail.dueDateLabel).toBe("Not set");
    expect(detail.categoryLabel).toBeNull();
    expect(detail.paymentAudit.paymentAmountLabel).toBeNull();
    expect(detail.paymentAudit.paymentSourceLabel).toBeNull();
    expect(detail.templateStatusLabel).toBeNull();
  });
});
