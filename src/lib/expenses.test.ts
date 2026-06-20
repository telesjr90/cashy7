import { describe, expect, it } from "vitest";
import {
  calculateExpenseSplit,
  getExpensePeriodBucket,
  validateCustomExpenseSplit,
} from "@/lib/expenses";

describe("getExpensePeriodBucket", () => {
  it("returns 1_14 for the 1st of the month", () => {
    expect(getExpensePeriodBucket("2026-06-01")).toBe("1_14");
  });

  it("returns 1_14 for the 14th of the month", () => {
    expect(getExpensePeriodBucket("2026-06-14")).toBe("1_14");
  });

  it("returns 15_eom for the 15th of the month", () => {
    expect(getExpensePeriodBucket("2026-06-15")).toBe("15_eom");
  });

  it("returns 15_eom for the last day of the month", () => {
    expect(getExpensePeriodBucket("2026-02-28")).toBe("15_eom");
    expect(getExpensePeriodBucket("2026-01-31")).toBe("15_eom");
  });
});

describe("calculateExpenseSplit equal", () => {
  it("splits evenly with cents preserved", () => {
    expect(calculateExpenseSplit(100, "equal")).toEqual({
      amounts: { telesAmount: 50, nicoleAmount: 50 },
      error: null,
    });
  });

  it("assigns odd-cent remainder to Nicole", () => {
    expect(calculateExpenseSplit(10.01, "equal")).toEqual({
      amounts: { telesAmount: 5.01, nicoleAmount: 5 },
      error: null,
    });
  });
});

describe("calculateExpenseSplit 51_49", () => {
  it("splits Teles 51% and Nicole 49% with rounding", () => {
    expect(calculateExpenseSplit(100, "51_49")).toEqual({
      amounts: { telesAmount: 51, nicoleAmount: 49 },
      error: null,
    });
  });

  it("keeps split amounts summing to the total", () => {
    const result = calculateExpenseSplit(33.33, "51_49");
    expect(result.error).toBeNull();
    expect(result.amounts.telesAmount + result.amounts.nicoleAmount).toBe(33.33);
    expect(result.amounts.telesAmount).toBe(17);
    expect(result.amounts.nicoleAmount).toBe(16.33);
  });
});

describe("calculateExpenseSplit personal", () => {
  it("assigns the full amount to Teles for a Teles profile", () => {
    expect(
      calculateExpenseSplit(42.5, "personal", { person: { name: "Teles" } })
    ).toEqual({
      amounts: { telesAmount: 42.5, nicoleAmount: 0 },
      error: null,
    });
  });

  it("assigns the full amount to Nicole for a Nicole profile", () => {
    expect(
      calculateExpenseSplit(42.5, "personal", { person: { name: "Nicole" } })
    ).toEqual({
      amounts: { telesAmount: 0, nicoleAmount: 42.5 },
      error: null,
    });
  });

  it("blocks personal split when no mapped profile is recognized", () => {
    expect(calculateExpenseSplit(25, "personal")).toEqual({
      amounts: { telesAmount: 0, nicoleAmount: 0 },
      error:
        "Choose a budget profile in Settings before recording a personal expense.",
    });
  });
});

describe("calculateExpenseSplit custom", () => {
  it("accepts custom amounts that sum to the total", () => {
    expect(
      calculateExpenseSplit(100, "custom", {
        customTelesAmount: 60,
        customNicoleAmount: 40,
      })
    ).toEqual({
      amounts: { telesAmount: 60, nicoleAmount: 40 },
      error: null,
    });
  });

  it("rejects custom amounts that do not sum to the total", () => {
    expect(
      calculateExpenseSplit(100, "custom", {
        customTelesAmount: 60,
        customNicoleAmount: 30,
      })
    ).toEqual({
      amounts: { telesAmount: 0, nicoleAmount: 0 },
      error: "Teles and Nicole amounts must sum to 100.00.",
    });
  });
});

describe("validateCustomExpenseSplit", () => {
  it("returns null when amounts sum to the total", () => {
    expect(validateCustomExpenseSplit(50, 30, 20)).toBeNull();
  });

  it("returns an error when amounts do not sum to the total", () => {
    expect(validateCustomExpenseSplit(50, 30, 19)).toBe(
      "Teles and Nicole amounts must sum to 50.00."
    );
  });
});
