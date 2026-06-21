import { describe, expect, it } from "vitest";
import {
  apply5149SplitToTemplateForm,
  buildBillTemplateInsert,
  getBillInstanceSourceLabel,
  getBillTemplateActiveStatus,
  handleBillTemplateAmountChange,
  isBillTemplateCurrentlyActive,
  isEligibleBillTemplate,
  templateUsesDefault5149Split,
  validateActiveDateRange,
  validateBillTemplateForm,
  validateDueDay,
} from "@/lib/bill-templates";
import type { Bill } from "@/lib/types";

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
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
    notes: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("validateBillTemplateForm", () => {
  it("requires template name", () => {
    const result = validateBillTemplateForm({
      name: "  ",
      defaultAmount: "100",
      dueDay: "15",
      periodBucket: "1_14",
      telesAmount: "51.00",
      nicoleAmount: "49.00",
      activeFrom: "2026-01-01",
      activeUntil: "",
      isVariable: false,
      category: "other",
      notes: "",
    });

    expect(result.error).toBe("Template name is required.");
    expect(result.values).toBeNull();
  });

  it("validates due day", () => {
    const result = validateBillTemplateForm({
      name: "Electric",
      defaultAmount: "100",
      dueDay: "32",
      periodBucket: "1_14",
      telesAmount: "51.00",
      nicoleAmount: "49.00",
      activeFrom: "2026-01-01",
      activeUntil: "",
      isVariable: false,
      category: "other",
      notes: "",
    });

    expect(result.error).toBe("Due day must be between 1 and 31.");
  });

  it("validates active date range", () => {
    const result = validateBillTemplateForm({
      name: "Electric",
      defaultAmount: "100",
      dueDay: "15",
      periodBucket: "1_14",
      telesAmount: "51.00",
      nicoleAmount: "49.00",
      activeFrom: "2026-06-01",
      activeUntil: "2026-05-01",
      isVariable: false,
      category: "other",
      notes: "",
    });

    expect(result.error).toBe("Active until cannot be before active from.");
  });

  it("requires fixed default amount", () => {
    const result = validateBillTemplateForm({
      name: "Electric",
      defaultAmount: "",
      dueDay: "15",
      periodBucket: "1_14",
      telesAmount: "0.00",
      nicoleAmount: "0.00",
      activeFrom: "2026-01-01",
      activeUntil: "",
      isVariable: false,
      category: "other",
      notes: "",
    });

    expect(result.error).toBe("Default amount is required for fixed-amount templates.");
  });

  it("allows variable template without default amount", () => {
    const result = validateBillTemplateForm({
      name: "Variable utility",
      defaultAmount: "",
      dueDay: "10",
      periodBucket: "15_eom",
      telesAmount: "0.00",
      nicoleAmount: "0.00",
      activeFrom: "2026-01-01",
      activeUntil: "",
      isVariable: true,
      category: "utilities",
      notes: "Amount varies monthly",
    });

    expect(result.error).toBeNull();
    expect(result.values?.isVariable).toBe(true);
    expect(result.values?.defaultAmount).toBeNull();
  });

  it("accepts valid fixed template", () => {
    const result = validateBillTemplateForm({
      name: "Internet",
      defaultAmount: "100",
      dueDay: "5",
      periodBucket: "1_14",
      telesAmount: "51.00",
      nicoleAmount: "49.00",
      activeFrom: "2026-01-01",
      activeUntil: "2026-12-31",
      isVariable: false,
      category: "utilities",
      notes: "Fiber plan",
    });

    expect(result.error).toBeNull();
    expect(result.values).toEqual({
      name: "Internet",
      defaultAmount: 100,
      dueDay: "5",
      periodBucket: "1_14",
      activeFrom: "2026-01-01",
      activeUntil: "2026-12-31",
      isVariable: false,
      category: "utilities",
      notes: "Fiber plan",
    });
  });
});

describe("validateDueDay", () => {
  it("accepts valid due day", () => {
    expect(validateDueDay("15")).toEqual({ error: null, dueDay: "15" });
  });

  it("rejects invalid due day", () => {
    expect(validateDueDay("0").error).toBe("Due day must be between 1 and 31.");
  });
});

describe("validateActiveDateRange", () => {
  it("rejects until before from", () => {
    expect(
      validateActiveDateRange("2026-06-01", "2026-05-01").error
    ).toBe("Active until cannot be before active from.");
  });
});

describe("51/49 split behavior", () => {
  it("computes default split from amount", () => {
    expect(apply5149SplitToTemplateForm(100)).toEqual({
      telesAmount: "51.00",
      nicoleAmount: "49.00",
    });
  });

  it("detects default split", () => {
    expect(templateUsesDefault5149Split(100, 51, 49)).toBe(true);
  });

  it("detects custom split", () => {
    expect(templateUsesDefault5149Split(100, 60, 40)).toBe(false);
  });

  it("recalculates split when default split is active", () => {
    const next = handleBillTemplateAmountChange(
      {
        name: "Electric",
        defaultAmount: "100",
        dueDay: "15",
        periodBucket: "1_14",
        telesAmount: "51.00",
        nicoleAmount: "49.00",
        activeFrom: "2026-01-01",
        activeUntil: "",
        isVariable: false,
        category: "other",
        notes: "",
      },
      "200",
      true
    );

    expect(next.defaultAmount).toBe("200");
    expect(next.telesAmount).toBe("102.00");
    expect(next.nicoleAmount).toBe("98.00");
  });

  it("preserves custom split when default split is inactive", () => {
    const next = handleBillTemplateAmountChange(
      {
        name: "Electric",
        defaultAmount: "100",
        dueDay: "15",
        periodBucket: "1_14",
        telesAmount: "60.00",
        nicoleAmount: "40.00",
        activeFrom: "2026-01-01",
        activeUntil: "",
        isVariable: false,
        category: "other",
        notes: "",
      },
      "200",
      false
    );

    expect(next.telesAmount).toBe("60.00");
    expect(next.nicoleAmount).toBe("40.00");
  });
});

describe("template active status", () => {
  it("marks inactive templates", () => {
    expect(
      getBillTemplateActiveStatus(
        makeBill({ is_active: false }),
        new Date("2026-06-15")
      )
    ).toBe("inactive");
  });

  it("marks scheduled templates", () => {
    expect(
      getBillTemplateActiveStatus(
        makeBill({ active_from: "2026-07-01" }),
        new Date("2026-06-15")
      )
    ).toBe("scheduled");
  });

  it("marks expired templates", () => {
    expect(
      getBillTemplateActiveStatus(
        makeBill({ active_until: "2026-05-31" }),
        new Date("2026-06-15")
      )
    ).toBe("expired");
  });

  it("marks currently active templates", () => {
    expect(isBillTemplateCurrentlyActive(makeBill(), new Date("2026-06-15"))).toBe(
      true
    );
  });
});

describe("template eligibility", () => {
  it("includes recurring bills as templates", () => {
    expect(isEligibleBillTemplate(makeBill({ recurring: true }))).toBe(true);
  });

  it("excludes non-recurring bills", () => {
    expect(isEligibleBillTemplate(makeBill({ recurring: false }))).toBe(false);
  });
});

describe("bill instance source labels", () => {
  it("labels template-linked instances", () => {
    expect(
      getBillInstanceSourceLabel({ billId: "bill-1", name: "Electric" })
    ).toBe("template");
  });

  it("labels manual instances", () => {
    expect(
      getBillInstanceSourceLabel({ billId: null, name: "One-off bill" })
    ).toBe("manual instance");
  });

  it("labels debt instances separately from templates", () => {
    expect(
      getBillInstanceSourceLabel({
        billId: null,
        name: "Debt: RBC Credit Card",
      })
    ).toBe("debt");
  });
});

describe("buildBillTemplateInsert", () => {
  it("creates recurring active template rows", () => {
    const validated = validateBillTemplateForm({
      name: "Internet",
      defaultAmount: "80",
      dueDay: "12",
      periodBucket: "15_eom",
      telesAmount: "40.80",
      nicoleAmount: "39.20",
      activeFrom: "2026-01-01",
      activeUntil: "",
      isVariable: false,
      category: "utilities",
      notes: "",
    }).values!;

    expect(buildBillTemplateInsert("household-1", validated)).toEqual({
      household_id: "household-1",
      name: "Internet",
      category: "utilities",
      default_amount: 80,
      due_day: "12",
      period_bucket: "15_eom",
      recurring: true,
      active_from: "2026-01-01",
      active_until: null,
      notes: null,
      is_variable: false,
      is_active: true,
    });
  });
});
