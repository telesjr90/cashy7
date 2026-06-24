import { describe, expect, it } from "vitest";
import {
  adjustToPreviousBusinessDay,
  getBcStatutoryHolidayDates,
  getBcStatutoryHolidayDatesForYear,
  isBusinessDay,
  isWeekendDate,
} from "@/lib/bc-statutory-holidays";

describe("B.C. statutory holidays", () => {
  it("includes fixed and computed holidays for a forecast year", () => {
    const holidays2026 = getBcStatutoryHolidayDatesForYear(2026);

    expect(holidays2026).toContain("2026-01-01");
    expect(holidays2026).toContain("2026-07-01");
    expect(holidays2026).toContain("2026-09-30");
    expect(holidays2026).toContain("2026-11-11");
    expect(holidays2026).toContain("2026-12-25");
    expect(holidays2026).toContain("2026-02-16");
    expect(holidays2026).toContain("2026-04-03");
    expect(holidays2026).toContain("2026-05-18");
    expect(holidays2026).toContain("2026-08-03");
    expect(holidays2026).toContain("2026-09-07");
    expect(holidays2026).toContain("2026-10-12");
  });

  it("returns holidays across a year range for forecast windows", () => {
    const holidays = getBcStatutoryHolidayDates({ startYear: 2026, endYear: 2027 });

    expect(holidays).toContain("2026-09-30");
    expect(holidays).toContain("2027-07-01");
    expect(holidays.filter((date) => date.startsWith("2026-"))).not.toHaveLength(0);
    expect(holidays.filter((date) => date.startsWith("2027-"))).not.toHaveLength(0);
  });

  it("omits National Day for Truth and Reconciliation before 2021", () => {
    expect(getBcStatutoryHolidayDatesForYear(2020)).not.toContain("2020-09-30");
    expect(getBcStatutoryHolidayDatesForYear(2021)).toContain("2021-09-30");
  });
});

describe("business day helpers", () => {
  it("detects weekend dates", () => {
    expect(isWeekendDate("2026-08-15")).toBe(true);
    expect(isWeekendDate("2026-03-15")).toBe(true);
    expect(isWeekendDate("2026-06-15")).toBe(false);
  });

  it("treats B.C. statutory holidays as non-business days", () => {
    expect(isBusinessDay("2026-07-01")).toBe(false);
    expect(isBusinessDay("2026-09-30")).toBe(false);
    expect(isBusinessDay("2026-06-15")).toBe(true);
  });

  it("moves a Saturday anchor to the previous Friday", () => {
    expect(adjustToPreviousBusinessDay("2026-08-15")).toBe("2026-08-14");
  });

  it("moves a Sunday anchor to the previous Friday", () => {
    expect(adjustToPreviousBusinessDay("2026-03-15")).toBe("2026-03-13");
  });

  it("moves a holiday anchor to the previous business day", () => {
    expect(adjustToPreviousBusinessDay("2026-09-30")).toBe("2026-09-29");
    expect(adjustToPreviousBusinessDay("2022-04-15")).toBe("2022-04-14");
  });

  it("moves a Friday holiday anchor to Thursday", () => {
    expect(adjustToPreviousBusinessDay("2016-07-01")).toBe("2016-06-30");
  });

  it("walks backward across consecutive non-business days", () => {
    expect(adjustToPreviousBusinessDay("2024-09-30")).toBe("2024-09-27");
  });

  it("adjusts Canada Day and Truth and Reconciliation anchors backward", () => {
    expect(adjustToPreviousBusinessDay("2026-07-01")).toBe("2026-06-30");
    expect(adjustToPreviousBusinessDay("2026-09-30")).toBe("2026-09-29");
  });
});
