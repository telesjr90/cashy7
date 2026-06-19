import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("CA$0.00");
  });

  it("formats whole dollars", () => {
    expect(formatCurrency(51)).toBe("CA$51.00");
  });

  it("formats cents", () => {
    expect(formatCurrency(214.55)).toBe("CA$214.55");
  });

  it("formats thousands with separator", () => {
    expect(formatCurrency(2127.08)).toBe("CA$2,127.08");
  });

  it("formats negative values", () => {
    expect(formatCurrency(-25)).toBe("-CA$25.00");
  });
});
