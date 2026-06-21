import { describe, expect, it } from "vitest";
import {
  buildBillInstanceInsertFromTemplate,
  calculateDueDateForMonth,
  findExistingGeneratedInstance,
  isBillTemplateActiveForMonth,
  planBillInstanceGeneration,
  resolveGeneratedInstanceAmount,
} from "@/lib/bill-instance-generation";
import { isGeneratedBillInstanceNotes } from "@/lib/bill-templates";
import type { Bill, BillInstance } from "@/lib/types";

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
    notes: "Utility bill",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeExistingInstance(
  overrides: Partial<BillInstance> = {}
): Pick<BillInstance, "bill_id" | "year" | "month"> {
  return {
    bill_id: "template-1",
    year: 2026,
    month: 6,
    ...overrides,
  };
}

describe("isBillTemplateActiveForMonth", () => {
  it("includes active template for selected month", () => {
    expect(isBillTemplateActiveForMonth(makeTemplate(), 2026, 6)).toBe(true);
  });

  it("skips inactive template", () => {
    expect(
      isBillTemplateActiveForMonth(makeTemplate({ is_active: false }), 2026, 6)
    ).toBe(false);
  });

  it("skips non-recurring template", () => {
    expect(
      isBillTemplateActiveForMonth(makeTemplate({ recurring: false }), 2026, 6)
    ).toBe(false);
  });

  it("skips template before active_from month", () => {
    expect(
      isBillTemplateActiveForMonth(
        makeTemplate({ active_from: "2026-07-01" }),
        2026,
        6
      )
    ).toBe(false);
  });

  it("skips template after active_until month", () => {
    expect(
      isBillTemplateActiveForMonth(
        makeTemplate({ active_until: "2026-05-31" }),
        2026,
        6
      )
    ).toBe(false);
  });
});

describe("calculateDueDateForMonth", () => {
  it("uses due day in a normal month", () => {
    expect(calculateDueDateForMonth(2026, 6, 15)).toBe("2026-06-15");
  });

  it("uses last day when due day is 31 in February", () => {
    expect(calculateDueDateForMonth(2026, 2, 31)).toBe("2026-02-28");
  });
});

describe("buildBillInstanceInsertFromTemplate", () => {
  it("copies period bucket from template", () => {
    const built = buildBillInstanceInsertFromTemplate(
      makeTemplate({ period_bucket: "15_eom" }),
      "household-1",
      2026,
      6
    );

    expect("payload" in built && built.payload.period_bucket).toBe("15_eom");
  });

  it("applies 51/49 split for fixed default amount", () => {
    const built = buildBillInstanceInsertFromTemplate(
      makeTemplate({ default_amount: 100 }),
      "household-1",
      2026,
      6
    );

    expect("payload" in built && built.payload.amount).toBe(100);
    expect("payload" in built && built.payload.teles_amount).toBe(51);
    expect("payload" in built && built.payload.nicole_amount).toBe(49);
  });

  it("marks generated notes for source labeling", () => {
    const built = buildBillInstanceInsertFromTemplate(
      makeTemplate(),
      "household-1",
      2026,
      6
    );

    expect(
      "payload" in built &&
        isGeneratedBillInstanceNotes(built.payload.notes ?? null)
    ).toBe(true);
  });

  it("handles variable template without default amount", () => {
    expect(
      resolveGeneratedInstanceAmount(
        makeTemplate({ is_variable: true, default_amount: null })
      )
    ).toBe(0);

    const built = buildBillInstanceInsertFromTemplate(
      makeTemplate({ is_variable: true, default_amount: null }),
      "household-1",
      2026,
      6
    );

    expect("payload" in built && built.payload.amount).toBe(0);
  });

  it("uses placeholder default amount for variable templates", () => {
    const built = buildBillInstanceInsertFromTemplate(
      makeTemplate({ is_variable: true, default_amount: 75 }),
      "household-1",
      2026,
      6
    );

    expect("payload" in built && built.payload.amount).toBe(75);
  });
});

describe("planBillInstanceGeneration", () => {
  it("creates instances for eligible templates", () => {
    const plan = planBillInstanceGeneration({
      templates: [makeTemplate()],
      existingInstances: [],
      householdId: "household-1",
      year: 2026,
      month: 6,
    });

    expect(plan.summary.toCreate).toBe(1);
    expect(plan.items[0]?.status).toBe("create");
  });

  it("prevents duplicate generation for same month", () => {
    const first = planBillInstanceGeneration({
      templates: [makeTemplate()],
      existingInstances: [],
      householdId: "household-1",
      year: 2026,
      month: 6,
    });

    const createItem = first.items.find((item) => item.status === "create");
    expect(createItem?.status).toBe("create");

    const second = planBillInstanceGeneration({
      templates: [makeTemplate()],
      existingInstances: [
        makeExistingInstance({
          bill_id: createItem?.status === "create" ? createItem.template.id : "template-1",
        }),
      ],
      householdId: "household-1",
      year: 2026,
      month: 6,
    });

    expect(second.summary.toCreate).toBe(0);
    expect(second.summary.skippedExisting).toBe(1);
  });

  it("does not overwrite paid historical instances", () => {
    expect(
      findExistingGeneratedInstance(
        [makeExistingInstance()],
        "template-1",
        2026,
        6
      )
    ).toBe(true);

    const plan = planBillInstanceGeneration({
      templates: [makeTemplate()],
      existingInstances: [makeExistingInstance()],
      householdId: "household-1",
      year: 2026,
      month: 6,
    });

    expect(plan.summary.toCreate).toBe(0);
    expect(plan.summary.skippedExisting).toBe(1);
    expect(plan.items.every((item) => item.status === "skip")).toBe(true);
  });

  it("does not overwrite manual instances linked to the same template", () => {
    const plan = planBillInstanceGeneration({
      templates: [makeTemplate()],
      existingInstances: [makeExistingInstance({ bill_id: "template-1" })],
      householdId: "household-1",
      year: 2026,
      month: 6,
    });

    expect(plan.summary.skippedExisting).toBe(1);
  });

  it("skips inactive and out-of-range templates in summary", () => {
    const plan = planBillInstanceGeneration({
      templates: [
        makeTemplate({ id: "inactive", is_active: false }),
        makeTemplate({ id: "expired", active_until: "2026-05-31" }),
        makeTemplate({ id: "eligible" }),
      ],
      existingInstances: [],
      householdId: "household-1",
      year: 2026,
      month: 6,
    });

    expect(plan.summary.toCreate).toBe(1);
    expect(plan.summary.skippedInactive).toBe(1);
    expect(plan.summary.skippedOutOfRange).toBe(1);
  });
});
