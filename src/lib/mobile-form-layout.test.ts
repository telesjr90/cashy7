import { describe, expect, it } from "vitest";
import {
  MOBILE_DIALOG_ACTIONS,
  MOBILE_FORM_GRID_TWO_COL,
  isSafeDisplayLabel,
  mobileActionGroupStacksAtMobile,
} from "./mobile-form-layout";

describe("mobile-form-layout", () => {
  it("stacks two-column form grids on mobile", () => {
    expect(MOBILE_FORM_GRID_TWO_COL).toContain("grid-cols-1");
    expect(MOBILE_FORM_GRID_TWO_COL).toContain("md:grid-cols-2");
    expect(MOBILE_FORM_GRID_TWO_COL).toContain("min-w-0");
  });

  it("stacks dialog action groups on mobile", () => {
    expect(mobileActionGroupStacksAtMobile()).toBe(true);
    expect(MOBILE_DIALOG_ACTIONS).toContain("flex-col-reverse");
    expect(MOBILE_DIALOG_ACTIONS).toContain("sm:flex-row");
  });

  it("rejects raw UUID display labels", () => {
    expect(isSafeDisplayLabel("Rent")).toBe(true);
    expect(isSafeDisplayLabel("a1b2c3d4-e5f6-4789-a012-3456789abcde")).toBe(
      false
    );
    expect(isSafeDisplayLabel("  A1B2C3D4-E5F6-4789-A012-3456789ABCDE  ")).toBe(
      false
    );
  });
});
