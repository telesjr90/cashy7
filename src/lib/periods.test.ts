import { describe, expect, it } from "vitest";
import {
  activePeriodBucket,
  activePeriodView,
  defaultPeriodViewForMonth,
  isCurrentCalendarMonth,
} from "./periods";

function calendarDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

describe("activePeriodBucket", () => {
  it("returns 1_14 on day 1", () => {
    expect(activePeriodBucket(calendarDate(2026, 6, 1))).toBe("1_14");
  });

  it("returns 1_14 on day 14", () => {
    expect(activePeriodBucket(calendarDate(2026, 6, 14))).toBe("1_14");
  });

  it("returns 15_eom on day 15", () => {
    expect(activePeriodBucket(calendarDate(2026, 6, 15))).toBe("15_eom");
  });

  it("returns 15_eom on the last day of the month", () => {
    expect(activePeriodBucket(lastDayOfMonth(2026, 2))).toBe("15_eom");
    expect(activePeriodBucket(lastDayOfMonth(2026, 1))).toBe("15_eom");
  });
});

describe("activePeriodView", () => {
  it("returns 1_14 on day 14", () => {
    expect(activePeriodView(calendarDate(2026, 6, 14))).toBe("1_14");
  });

  it("returns 15_eom on day 15", () => {
    expect(activePeriodView(calendarDate(2026, 6, 15))).toBe("15_eom");
  });
});

describe("isCurrentCalendarMonth", () => {
  const today = calendarDate(2026, 6, 19);

  it("returns true when viewed date is in the same year and month", () => {
    expect(isCurrentCalendarMonth(calendarDate(2026, 6, 1), today)).toBe(true);
    expect(isCurrentCalendarMonth(calendarDate(2026, 6, 30), today)).toBe(true);
  });

  it("returns false for a past month", () => {
    expect(isCurrentCalendarMonth(calendarDate(2026, 5, 15), today)).toBe(false);
  });

  it("returns false for a future month", () => {
    expect(isCurrentCalendarMonth(calendarDate(2026, 7, 1), today)).toBe(false);
  });

  it("returns false for the same month number in a different year", () => {
    expect(isCurrentCalendarMonth(calendarDate(2025, 6, 19), today)).toBe(false);
  });
});

describe("defaultPeriodViewForMonth", () => {
  it("returns 1_14 for the current month when today is day 14", () => {
    const today = calendarDate(2026, 6, 14);
    const viewedDate = calendarDate(2026, 6, 1);

    expect(defaultPeriodViewForMonth(viewedDate, today)).toBe("1_14");
  });

  it("returns 15_eom for the current month when today is day 15", () => {
    const today = calendarDate(2026, 6, 15);
    const viewedDate = calendarDate(2026, 6, 30);

    expect(defaultPeriodViewForMonth(viewedDate, today)).toBe("15_eom");
  });

  it("returns full for a past month", () => {
    const today = calendarDate(2026, 6, 19);
    const viewedDate = calendarDate(2026, 5, 10);

    expect(defaultPeriodViewForMonth(viewedDate, today)).toBe("full");
  });

  it("returns full for a future month", () => {
    const today = calendarDate(2026, 6, 19);
    const viewedDate = calendarDate(2026, 7, 1);

    expect(defaultPeriodViewForMonth(viewedDate, today)).toBe("full");
  });
});
