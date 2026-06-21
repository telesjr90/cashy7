import { describe, expect, it } from "vitest";
import {
  apply5149SplitToBillEditForm,
  billEditFormFromInstance,
  billUsesDefault5149Split,
  buildBillInstanceEditUpdate,
  canEditRegularBill,
  handleBillEditAmountChange,
  validateBillEditForm,
} from "@/lib/bill-edit";

describe("canEditRegularBill", () => {
  it("allows edit for regular bills", () => {
    expect(canEditRegularBill(false)).toBe(true);
  });

  it("blocks edit for debt-linked bills", () => {
    expect(canEditRegularBill(true)).toBe(false);
  });
});

describe("billUsesDefault5149Split", () => {
  it("detects default 51/49 split", () => {
    expect(billUsesDefault5149Split(100, 51, 49)).toBe(true);
  });

  it("detects custom split", () => {
    expect(billUsesDefault5149Split(100, 60, 40)).toBe(false);
  });
});

describe("handleBillEditAmountChange", () => {
  it("recalculates Teles and Nicole when default split is active", () => {
    const form = billEditFormFromInstance({
      name: "Electric",
      amount: 100,
      teles_amount: 51,
      nicole_amount: 49,
      period_bucket: "1_14",
      due_date: null,
      notes: null,
    });

    const next = handleBillEditAmountChange(form, "200", true);
    expect(next.amount).toBe("200");
    expect(next.telesAmount).toBe("102.00");
    expect(next.nicoleAmount).toBe("98.00");
  });

  it("preserves custom split amounts when default split is inactive", () => {
    const form = billEditFormFromInstance({
      name: "Electric",
      amount: 100,
      teles_amount: 60,
      nicole_amount: 40,
      period_bucket: "1_14",
      due_date: null,
      notes: null,
    });

    const next = handleBillEditAmountChange(form, "200", false);
    expect(next.amount).toBe("200");
    expect(next.telesAmount).toBe("60");
    expect(next.nicoleAmount).toBe("40");
  });
});

describe("apply5149SplitToBillEditForm", () => {
  it("uses existing rounding behavior", () => {
    expect(apply5149SplitToBillEditForm(33.33)).toEqual({
      telesAmount: "17.00",
      nicoleAmount: "16.33",
    });
  });
});

describe("validateBillEditForm", () => {
  const validForm = {
    name: "Internet",
    amount: "100",
    telesAmount: "51",
    nicoleAmount: "49",
    periodBucket: "15_eom" as const,
    dueDate: "2026-06-15",
    notes: "Monthly",
  };

  it("accepts valid form values", () => {
    const result = validateBillEditForm(validForm);
    expect(result.error).toBeNull();
    expect(result.values).toEqual({
      name: "Internet",
      amount: 100,
      telesAmount: 51,
      nicoleAmount: 49,
      periodBucket: "15_eom",
      dueDate: "2026-06-15",
      notes: "Monthly",
    });
  });

  it("rejects empty total amount", () => {
    const result = validateBillEditForm({ ...validForm, amount: "" });
    expect(result.error).toBe("Please enter a valid total amount.");
    expect(result.values).toBeNull();
  });

  it("rejects negative amounts", () => {
    const result = validateBillEditForm({ ...validForm, amount: "-5" });
    expect(result.error).toBe("Please enter a valid total amount.");
    expect(result.values).toBeNull();
  });

  it("rejects split totals that do not add up", () => {
    const result = validateBillEditForm({
      ...validForm,
      telesAmount: "55",
      nicoleAmount: "40",
    });
    expect(result.error).toBe(
      "Teles and Nicole amounts must add up to the total amount."
    );
    expect(result.values).toBeNull();
  });
});

describe("buildBillInstanceEditUpdate", () => {
  it("maps validated values to bill instance update payload", () => {
    const validated = validateBillEditForm({
      name: "Water",
      amount: "50",
      telesAmount: "25.50",
      nicoleAmount: "24.50",
      periodBucket: "1_14",
      dueDate: "",
      notes: "",
    }).values!;

    expect(buildBillInstanceEditUpdate(validated)).toEqual({
      name: "Water",
      amount: 50,
      teles_amount: 25.5,
      nicole_amount: 24.5,
      period_bucket: "1_14",
      due_date: null,
      notes: null,
    });
  });
});
