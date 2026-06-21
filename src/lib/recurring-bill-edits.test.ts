import { describe, expect, it } from "vitest";
import { buildBillInstanceEditUpdate, validateBillEditForm } from "@/lib/bill-edit";
import type { Bill, BillInstance } from "@/lib/types";
import {
  buildBillTemplateUpdateFromInstanceEdit,
  buildBulkGeneratedInstanceUpdate,
  buildInstanceOnlyEditPlan,
  buildTemplateAndFutureEditPlan,
  extractDueDayFromDate,
  isEligibleForRecurringBulkInstanceUpdate,
  requiresRecurringEditBranching,
  selectRecurringBulkInstanceUpdateCandidates,
  stripGeneratedBillInstanceNotePrefix,
} from "@/lib/recurring-bill-edits";

function makeInstance(overrides: Partial<BillInstance> = {}): BillInstance {
  return {
    id: "instance-1",
    bill_id: "template-1",
    household_id: "household-1",
    year: 2026,
    month: 6,
    period_bucket: "1_14",
    name: "Electric",
    amount: 100,
    teles_amount: 51,
    nicole_amount: 49,
    due_date: "2026-06-15",
    is_paid: false,
    paid_status: "unpaid",
    paid_at: null,
    paid_by_user_id: null,
    notes: "[Generated for June 2026]",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "template-1",
    household_id: "household-1",
    name: "Electric",
    category: "utilities",
    default_amount: 100,
    due_day: "15",
    is_variable: false,
    period_bucket: "1_14",
    recurring: true,
    active_from: "2026-01-01",
    active_until: null,
    notes: "Monthly utility",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("requiresRecurringEditBranching", () => {
  it("does not require branching for manual instances", () => {
    expect(
      requiresRecurringEditBranching(
        { bill_id: null, notes: "Manual bill" },
        false
      )
    ).toBe(false);
  });

  it("requires branching for generated recurring instances", () => {
    expect(
      requiresRecurringEditBranching(
        {
          bill_id: "template-1",
          notes: "[Generated for June 2026]",
        },
        false
      )
    ).toBe(true);
  });

  it("excludes debt-linked instances from branching", () => {
    expect(
      requiresRecurringEditBranching(
        {
          bill_id: "template-1",
          notes: "[Generated for June 2026]",
        },
        true
      )
    ).toBe(false);
  });
});

describe("buildInstanceOnlyEditPlan", () => {
  it("updates only the selected instance payload", () => {
    const validated = validateBillEditForm({
      name: "Internet",
      amount: "120",
      telesAmount: "61.20",
      nicoleAmount: "58.80",
      periodBucket: "15_eom",
      dueDate: "2026-06-20",
      notes: "One-off note",
    }).values!;

    const plan = buildInstanceOnlyEditPlan(
      buildBillInstanceEditUpdate(validated)
    );

    expect(plan.scope).toBe("instance_only");
    expect(plan.instanceUpdate).toEqual({
      name: "Internet",
      amount: 120,
      teles_amount: 61.2,
      nicole_amount: 58.8,
      period_bucket: "15_eom",
      due_date: "2026-06-20",
      notes: "One-off note",
    });
  });
});

describe("buildTemplateAndFutureEditPlan", () => {
  const validated = validateBillEditForm({
    name: "Internet",
    amount: "120",
    telesAmount: "61.20",
    nicoleAmount: "58.80",
    periodBucket: "15_eom",
    dueDate: "2026-06-20",
    notes: "[Generated for June 2026]\nUpdated note",
  }).values!;

  it("builds template update payload from instance edit values", () => {
    const plan = buildTemplateAndFutureEditPlan({
      validated,
      template: makeTemplate(),
      editingInstance: makeInstance(),
      instances: [makeInstance()],
      context: {
        debtLinkedBillIds: new Set(),
        cashDeductedBillIds: new Set(),
      },
    });

    expect(plan.templateUpdate).toEqual({
      name: "Internet",
      category: "utilities",
      default_amount: 120,
      due_day: "20",
      period_bucket: "15_eom",
      active_from: "2026-01-01",
      active_until: null,
      notes: "Updated note",
      is_variable: false,
    });
  });

  it("excludes paid future instances from bulk update candidates", () => {
    const instances = [
      makeInstance({ id: "current", month: 6, paid_status: "unpaid" }),
      makeInstance({
        id: "paid-future",
        month: 7,
        paid_status: "paid",
        is_paid: true,
      }),
      makeInstance({ id: "future-unpaid", month: 8, paid_status: "unpaid" }),
    ];

    const plan = buildTemplateAndFutureEditPlan({
      validated,
      template: makeTemplate(),
      editingInstance: makeInstance({ id: "current", month: 6 }),
      instances,
      context: {
        debtLinkedBillIds: new Set(),
        cashDeductedBillIds: new Set(),
      },
    });

    expect(plan.instanceUpdates.map((row) => row.id)).toEqual([
      "current",
      "future-unpaid",
    ]);
  });

  it("excludes cash-deducted and debt-linked instances", () => {
    const instances = [
      makeInstance({ id: "current", month: 6 }),
      makeInstance({ id: "cash-deducted", month: 7 }),
      makeInstance({ id: "debt-linked", month: 8 }),
      makeInstance({ id: "manual", month: 9, bill_id: null, notes: null }),
    ];

    const candidates = selectRecurringBulkInstanceUpdateCandidates(
      instances,
      makeInstance({ id: "current", month: 6 }),
      "template-1",
      {
        debtLinkedBillIds: new Set(["debt-linked"]),
        cashDeductedBillIds: new Set(["cash-deducted"]),
      }
    );

    expect(candidates.map((row) => row.id)).toEqual(["current"]);
  });
});

describe("isEligibleForRecurringBulkInstanceUpdate", () => {
  it("excludes manual instances even when bill_id is set", () => {
    expect(
      isEligibleForRecurringBulkInstanceUpdate(
        makeInstance({
          id: "manual-like",
          bill_id: "template-1",
          notes: "Edited manually without generated prefix",
        }),
        makeInstance(),
        "template-1",
        {
          debtLinkedBillIds: new Set(),
          cashDeductedBillIds: new Set(),
        }
      )
    ).toBe(false);
  });
});

describe("buildBulkGeneratedInstanceUpdate", () => {
  it("recalculates due dates per month and preserves generated note prefix", () => {
    const update = buildBulkGeneratedInstanceUpdate(
      {
        name: "Internet",
        amount: 120,
        periodBucket: "15_eom",
      },
      { year: 2026, month: 2 },
      "15",
      "Monthly utility"
    );

    expect(update.due_date).toBe("2026-02-15");
    expect(update.notes).toBe(
      "[Generated for February 2026]\nMonthly utility"
    );
    expect((update.teles_amount ?? 0) + (update.nicole_amount ?? 0)).toBeCloseTo(
      120,
      2
    );
  });
});

describe("extractDueDayFromDate", () => {
  it("extracts due day from ISO date", () => {
    expect(extractDueDayFromDate("2026-06-20")).toBe("20");
  });

  it("returns null for empty due date", () => {
    expect(extractDueDayFromDate(null)).toBeNull();
  });
});

describe("stripGeneratedBillInstanceNotePrefix", () => {
  it("removes generated prefix and keeps user notes", () => {
    expect(
      stripGeneratedBillInstanceNotePrefix(
        "[Generated for June 2026]\nMonthly utility"
      )
    ).toBe("Monthly utility");
  });
});

describe("buildBillTemplateUpdateFromInstanceEdit", () => {
  it("preserves 51/49 split behavior via default amount only on template", () => {
    const update = buildBillTemplateUpdateFromInstanceEdit(
      {
        name: "Water",
        amount: 100,
        periodBucket: "1_14",
        dueDate: "2026-06-15",
        notes: "[Generated for June 2026]",
      },
      makeTemplate()
    );

    expect(update.default_amount).toBe(100);
    expect(update.due_day).toBe("15");
  });
});

describe("validateBillEditForm integration", () => {
  it("blocks invalid amounts before any edit plan is built", () => {
    const result = validateBillEditForm({
      name: "Internet",
      amount: "-1",
      telesAmount: "51",
      nicoleAmount: "49",
      periodBucket: "1_14",
      dueDate: "",
      notes: "",
    });

    expect(result.error).toBe("Please enter a valid total amount.");
    expect(result.values).toBeNull();
  });
});
