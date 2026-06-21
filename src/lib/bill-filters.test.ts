import { describe, expect, it } from "vitest";
import {
  DEFAULT_BILL_INSTANCE_FILTERS,
  extractDistinctBillCategories,
  filterBillInstances,
  getActiveBillFilterLabels,
  isBillInstanceFiltersActive,
  matchesBillInstanceCashDeducted,
  matchesBillInstanceCategory,
  matchesBillInstanceDebtLinked,
  matchesBillInstancePaidStatus,
  matchesBillInstancePeriodBucket,
  matchesBillInstanceSearchText,
  matchesBillInstanceSource,
  matchesBillInstanceVariable,
  type BillInstanceFilterContext,
  type BillInstanceFilters,
} from "@/lib/bill-filters";
import { buildBillTemplateLookup } from "@/lib/variable-bills";
import type { Bill, BillInstance } from "@/lib/types";

function makeTemplate(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "template-1",
    household_id: "household-1",
    name: "Electric",
    category: "utilities",
    default_amount: 100,
    due_day: "10",
    is_variable: false,
    period_bucket: "1_14",
    recurring: true,
    active_from: "2026-01-01",
    active_until: null,
    notes: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

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
    due_date: "2026-06-10",
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

const templates = [makeTemplate(), makeTemplate({ id: "template-2", category: "housing" })];
const templateCategoryByBillId = new Map(
  templates.map((template) => [template.id, template.category ?? "other"])
);

const generatedBill = makeInstance();
const manualBill = makeInstance({
  id: "instance-2",
  bill_id: null,
  name: "One-off repair",
  notes: "Emergency plumber",
});
const paidBill = makeInstance({
  id: "instance-3",
  is_paid: true,
  paid_status: "paid",
});
const period2Bill = makeInstance({
  id: "instance-4",
  period_bucket: "15_eom",
  name: "Internet",
});
const debtBill = makeInstance({
  id: "instance-5",
  bill_id: null,
  name: "Debt: Credit card",
});
const variableBill = makeInstance({
  id: "instance-6",
  bill_id: "template-2",
  name: "Water",
  amount: 0,
  notes: "[Generated for June 2026]",
});

const variableTemplates = [
  makeTemplate({
    id: "template-2",
    name: "Water",
    category: "utilities",
    is_variable: true,
    default_amount: null,
  }),
];

const variableContext = {
  templateByBillId: buildBillTemplateLookup(variableTemplates),
  debtLinkedBillIds: new Set<string>(),
};

const allBills = [
  generatedBill,
  manualBill,
  paidBill,
  period2Bill,
  debtBill,
  variableBill,
];

function makeContext(
  overrides: Partial<BillInstanceFilterContext> = {}
): BillInstanceFilterContext {
  return {
    debtLinkedBillIds: new Set(["instance-5"]),
    cashDeductedBillIds: new Set(["instance-3"]),
    templateCategoryByBillId,
    variableBillContext: variableContext,
    ...overrides,
  };
}

describe("matchesBillInstanceSearchText", () => {
  it("matches name, category, notes, and source label case-insensitively", () => {
    expect(
      matchesBillInstanceSearchText(generatedBill, "electric", templateCategoryByBillId)
    ).toBe(true);
    expect(
      matchesBillInstanceSearchText(generatedBill, "utilities", templateCategoryByBillId)
    ).toBe(true);
    expect(
      matchesBillInstanceSearchText(manualBill, "plumber", templateCategoryByBillId)
    ).toBe(true);
    expect(
      matchesBillInstanceSearchText(generatedBill, "generated", templateCategoryByBillId)
    ).toBe(true);
  });

  it("passes when search text is empty", () => {
    expect(matchesBillInstanceSearchText(generatedBill, "", templateCategoryByBillId)).toBe(
      true
    );
    expect(
      matchesBillInstanceSearchText(generatedBill, "   ", templateCategoryByBillId)
    ).toBe(true);
  });
});

describe("matchesBillInstancePeriodBucket", () => {
  it("filters by period bucket", () => {
    expect(matchesBillInstancePeriodBucket(generatedBill, "1_14")).toBe(true);
    expect(matchesBillInstancePeriodBucket(period2Bill, "1_14")).toBe(false);
    expect(matchesBillInstancePeriodBucket(period2Bill, "all")).toBe(true);
  });
});

describe("matchesBillInstancePaidStatus", () => {
  it("filters paid and unpaid rows", () => {
    expect(matchesBillInstancePaidStatus(paidBill, "paid")).toBe(true);
    expect(matchesBillInstancePaidStatus(generatedBill, "paid")).toBe(false);
    expect(matchesBillInstancePaidStatus(generatedBill, "unpaid")).toBe(true);
    expect(matchesBillInstancePaidStatus(paidBill, "all")).toBe(true);
  });
});

describe("matchesBillInstanceCashDeducted", () => {
  it("filters cash-deducted and not cash-deducted rows", () => {
    const cashDeductedBillIds = new Set(["instance-3"]);

    expect(
      matchesBillInstanceCashDeducted(paidBill, "cash_deducted", cashDeductedBillIds)
    ).toBe(true);
    expect(
      matchesBillInstanceCashDeducted(generatedBill, "cash_deducted", cashDeductedBillIds)
    ).toBe(false);
    expect(
      matchesBillInstanceCashDeducted(generatedBill, "not_cash_deducted", cashDeductedBillIds)
    ).toBe(true);
    expect(
      matchesBillInstanceCashDeducted(paidBill, "all", cashDeductedBillIds)
    ).toBe(true);
  });
});

describe("matchesBillInstanceDebtLinked", () => {
  it("filters debt-linked and regular rows", () => {
    const debtLinkedBillIds = new Set(["instance-5"]);

    expect(
      matchesBillInstanceDebtLinked(debtBill, "debt_linked", debtLinkedBillIds)
    ).toBe(true);
    expect(
      matchesBillInstanceDebtLinked(generatedBill, "debt_linked", debtLinkedBillIds)
    ).toBe(false);
    expect(
      matchesBillInstanceDebtLinked(generatedBill, "regular_only", debtLinkedBillIds)
    ).toBe(true);
    expect(
      matchesBillInstanceDebtLinked(debtBill, "all", debtLinkedBillIds)
    ).toBe(true);
  });
});

describe("matchesBillInstanceSource", () => {
  it("filters generated and manual source rows", () => {
    expect(matchesBillInstanceSource(generatedBill, "generated_from_template")).toBe(
      true
    );
    expect(matchesBillInstanceSource(manualBill, "generated_from_template")).toBe(
      false
    );
    expect(matchesBillInstanceSource(manualBill, "manual_instance")).toBe(true);
    expect(matchesBillInstanceSource(generatedBill, "manual_instance")).toBe(false);
    expect(matchesBillInstanceSource(generatedBill, "all")).toBe(true);
  });
});

describe("matchesBillInstanceVariable", () => {
  it("filters variable, fixed, and needs-confirmation rows", () => {
    expect(matchesBillInstanceVariable(variableBill, "variable", variableContext)).toBe(
      true
    );
    expect(matchesBillInstanceVariable(generatedBill, "variable", variableContext)).toBe(
      false
    );
    expect(matchesBillInstanceVariable(generatedBill, "fixed", variableContext)).toBe(
      true
    );
    expect(
      matchesBillInstanceVariable(variableBill, "needs_confirmation", variableContext)
    ).toBe(true);
    expect(
      matchesBillInstanceVariable(paidBill, "needs_confirmation", variableContext)
    ).toBe(false);
  });
});

describe("matchesBillInstanceCategory", () => {
  it("filters by category", () => {
    expect(
      matchesBillInstanceCategory(generatedBill, "utilities", templateCategoryByBillId)
    ).toBe(true);
    expect(
      matchesBillInstanceCategory(manualBill, "utilities", templateCategoryByBillId)
    ).toBe(false);
    expect(
      matchesBillInstanceCategory(manualBill, "other", templateCategoryByBillId)
    ).toBe(true);
    expect(
      matchesBillInstanceCategory(generatedBill, "", templateCategoryByBillId)
    ).toBe(true);
  });
});

describe("filterBillInstances", () => {
  it("returns all rows when filters are default", () => {
    expect(
      filterBillInstances(allBills, DEFAULT_BILL_INSTANCE_FILTERS, makeContext())
    ).toHaveLength(allBills.length);
  });

  it("combines filters with AND semantics", () => {
    const filters: BillInstanceFilters = {
      ...DEFAULT_BILL_INSTANCE_FILTERS,
      searchText: "electric",
      paidStatus: "unpaid",
      periodBucket: "1_14",
    };

    const result = filterBillInstances(allBills, filters, makeContext());
    expect(result).toEqual([generatedBill]);
  });

  it("filters by combined source and variable state", () => {
    const filters: BillInstanceFilters = {
      ...DEFAULT_BILL_INSTANCE_FILTERS,
      source: "generated_from_template",
      variable: "needs_confirmation",
    };

    const result = filterBillInstances(allBills, filters, makeContext());
    expect(result).toEqual([variableBill]);
  });
});

describe("isBillInstanceFiltersActive and getActiveBillFilterLabels", () => {
  it("detects default and active filter state", () => {
    expect(isBillInstanceFiltersActive(DEFAULT_BILL_INSTANCE_FILTERS)).toBe(false);
    expect(
      isBillInstanceFiltersActive({
        ...DEFAULT_BILL_INSTANCE_FILTERS,
        paidStatus: "unpaid",
      })
    ).toBe(true);
  });

  it("returns readable active filter labels", () => {
    expect(
      getActiveBillFilterLabels({
        ...DEFAULT_BILL_INSTANCE_FILTERS,
        searchText: "water",
        variable: "needs_confirmation",
      })
    ).toEqual(["Search: water", "Needs confirmation"]);
  });
});

describe("extractDistinctBillCategories", () => {
  it("derives categories from templates and visible bill instances", () => {
    expect(
      extractDistinctBillCategories(allBills, templateCategoryByBillId, templates)
    ).toEqual(["housing", "other", "utilities"]);
  });
});
