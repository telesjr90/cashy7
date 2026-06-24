import { describe, expect, it } from "vitest";
import {
  adjustToPreviousBusinessDay,
  BC_FORECAST_SUPPORTED_YEARS,
  BC_STATUTORY_HOLIDAY_NAMES,
  getBcStatutoryHolidayDates,
  getBcStatutoryHolidayDatesForYear,
  isBusinessDay,
  isForecastYearInSupportedRange,
  isWeekendDate,
} from "@/lib/bc-statutory-holidays";

/** Official BC.gov 2026 dates (statutory holidays page, Jan 2026). */
const BC_GOV_2026: Record<string, string> = {
  "New Year's Day": "2026-01-01",
  "Family Day": "2026-02-16",
  "Good Friday": "2026-04-03",
  "Victoria Day": "2026-05-18",
  "Canada Day": "2026-07-01",
  "B.C. Day": "2026-08-03",
  "Labour Day": "2026-09-07",
  "National Day for Truth and Reconciliation": "2026-09-30",
  "Thanksgiving Day": "2026-10-12",
  "Remembrance Day": "2026-11-11",
  "Christmas Day": "2026-12-25",
};

describe("B.C. statutory holidays — strategy and coverage", () => {
  it("documents the MVP holiday name list", () => {
    expect(BC_STATUTORY_HOLIDAY_NAMES).toHaveLength(11);
    expect(BC_STATUTORY_HOLIDAY_NAMES).toContain("Good Friday");
    expect(BC_STATUTORY_HOLIDAY_NAMES).toContain(
      "National Day for Truth and Reconciliation"
    );
  });

  it("supports the forecast window 2022 through 2030", () => {
    expect(BC_FORECAST_SUPPORTED_YEARS).toEqual({ start: 2022, end: 2030 });
    expect(isForecastYearInSupportedRange(2022)).toBe(true);
    expect(isForecastYearInSupportedRange(2030)).toBe(true);
    expect(isForecastYearInSupportedRange(2021)).toBe(false);
    expect(isForecastYearInSupportedRange(2031)).toBe(false);
  });

  it("returns 11 holidays per year from 2021 onward within the supported window", () => {
    for (let year = BC_FORECAST_SUPPORTED_YEARS.start; year <= BC_FORECAST_SUPPORTED_YEARS.end; year += 1) {
      expect(getBcStatutoryHolidayDatesForYear(year)).toHaveLength(11);
    }
  });

  it("returns sorted, deduplicated dates for a year", () => {
    const holidays = getBcStatutoryHolidayDatesForYear(2026);
    expect(new Set(holidays).size).toBe(holidays.length);
    expect(holidays).toEqual([...holidays].sort());
  });

  it("matches official BC.gov 2026 dates for all MVP holidays", () => {
    const holidays2026 = getBcStatutoryHolidayDatesForYear(2026);
    for (const date of Object.values(BC_GOV_2026)) {
      expect(holidays2026).toContain(date);
    }
  });
});

describe("B.C. statutory holidays — individual MVP holidays (2026)", () => {
  const holidays2026 = () => getBcStatutoryHolidayDatesForYear(2026);

  it("includes New Year's Day", () => {
    expect(holidays2026()).toContain("2026-01-01");
  });

  it("includes Family Day (third Monday in February)", () => {
    expect(holidays2026()).toContain("2026-02-16");
  });

  it("includes Good Friday", () => {
    expect(holidays2026()).toContain("2026-04-03");
  });

  it("includes Victoria Day (Monday preceding May 25)", () => {
    expect(holidays2026()).toContain("2026-05-18");
  });

  it("includes Canada Day", () => {
    expect(holidays2026()).toContain("2026-07-01");
  });

  it("includes B.C. Day (first Monday in August)", () => {
    expect(holidays2026()).toContain("2026-08-03");
  });

  it("includes Labour Day (first Monday in September)", () => {
    expect(holidays2026()).toContain("2026-09-07");
  });

  it("includes National Day for Truth and Reconciliation", () => {
    expect(holidays2026()).toContain("2026-09-30");
  });

  it("includes Thanksgiving Day (second Monday in October)", () => {
    expect(holidays2026()).toContain("2026-10-12");
  });

  it("includes Remembrance Day", () => {
    expect(holidays2026()).toContain("2026-11-11");
  });

  it("includes Christmas Day", () => {
    expect(holidays2026()).toContain("2026-12-25");
  });
});

describe("B.C. statutory holidays — year range and edge cases", () => {
  it("returns holidays across a year range for forecast windows", () => {
    const holidays = getBcStatutoryHolidayDates({ startYear: 2026, endYear: 2027 });

    expect(holidays).toContain("2026-09-30");
    expect(holidays).toContain("2027-07-01");
    expect(holidays.filter((date) => date.startsWith("2026-"))).not.toHaveLength(0);
    expect(holidays.filter((date) => date.startsWith("2027-"))).not.toHaveLength(0);
    expect(holidays).toEqual([...holidays].sort());
    expect(new Set(holidays).size).toBe(holidays.length);
  });

  it("covers 2022 through 2030 in a single range query", () => {
    const holidays = getBcStatutoryHolidayDates({
      startYear: BC_FORECAST_SUPPORTED_YEARS.start,
      endYear: BC_FORECAST_SUPPORTED_YEARS.end,
    });

    expect(holidays.some((date) => date.startsWith("2022-"))).toBe(true);
    expect(holidays.some((date) => date.startsWith("2030-"))).toBe(true);
    expect(holidays).toContain("2022-04-15");
    expect(holidays).toContain("2030-12-25");
  });

  it("omits National Day for Truth and Reconciliation before 2021", () => {
    expect(getBcStatutoryHolidayDatesForYear(2020)).not.toContain("2020-09-30");
    expect(getBcStatutoryHolidayDatesForYear(2020)).toHaveLength(10);
    expect(getBcStatutoryHolidayDatesForYear(2021)).toContain("2021-09-30");
  });

  it("observes Canada Day on July 2 when July 1 is Sunday (BC ESA)", () => {
    expect(getBcStatutoryHolidayDatesForYear(2029)).toContain("2029-07-02");
    expect(getBcStatutoryHolidayDatesForYear(2029)).not.toContain("2029-07-01");
    expect(isBusinessDay("2029-07-02")).toBe(false);
  });
});

describe("business day helpers", () => {
  it("detects weekend dates", () => {
    expect(isWeekendDate("2026-08-15")).toBe(true);
    expect(isWeekendDate("2026-03-15")).toBe(true);
    expect(isWeekendDate("2026-06-15")).toBe(false);
  });

  it("treats a normal weekday as a business day", () => {
    expect(isBusinessDay("2026-06-15")).toBe(true);
    expect(isBusinessDay("2026-03-16")).toBe(true);
  });

  it("treats weekends as non-business days", () => {
    expect(isBusinessDay("2026-08-15")).toBe(false);
    expect(isBusinessDay("2026-03-15")).toBe(false);
  });

  it("treats B.C. statutory holidays as non-business days", () => {
    expect(isBusinessDay("2026-07-01")).toBe(false);
    expect(isBusinessDay("2026-09-30")).toBe(false);
    expect(isBusinessDay("2026-12-25")).toBe(false);
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
    expect(adjustToPreviousBusinessDay("2026-12-25")).toBe("2026-12-24");
  });

  it("walks backward across consecutive non-business days", () => {
    expect(adjustToPreviousBusinessDay("2024-09-30")).toBe("2024-09-27");
  });

  it("adjusts Canada Day and Truth and Reconciliation anchors backward", () => {
    expect(adjustToPreviousBusinessDay("2026-07-01")).toBe("2026-06-30");
    expect(adjustToPreviousBusinessDay("2026-09-30")).toBe("2026-09-29");
  });

  it("adjusts month-end holiday anchors backward", () => {
    expect(adjustToPreviousBusinessDay("2026-09-30")).toBe("2026-09-29");
    expect(adjustToPreviousBusinessDay("2026-08-31")).toBe("2026-08-31");
  });

  it("handles year-boundary adjustment safely", () => {
    expect(adjustToPreviousBusinessDay("2026-01-01")).toBe("2025-12-31");
    expect(adjustToPreviousBusinessDay("2022-01-02")).toBe("2021-12-31");
  });

  it("returns the same date when already a business day", () => {
    expect(adjustToPreviousBusinessDay("2026-06-15")).toBe("2026-06-15");
    expect(adjustToPreviousBusinessDay("2026-06-30")).toBe("2026-06-30");
  });
});
