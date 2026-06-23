import { describe, expect, it } from "vitest";
import {
  buildFixedPayDate,
  buildPaycheckForecastIncomeEvents,
  clampFixedPayDay,
  computePayDatesForMonth,
  computePayDatesInRange,
  filterOwnPaycheckIncomeEvents,
  getWeekendAwareLastBusinessDay,
  isPaycheckScheduleConfigured,
  normalizePaycheckScheduleSettings,
  paycheckScheduleDisplayLabelsArePrivacySafe,
  PAYCHECK_SCHEDULE_TYPE_LABELS,
  validatePaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";

const USER_ID = "user-teles";
const OTHER_USER_ID = "user-nicole";

describe("paycheck schedule validation", () => {
  it("rejects negative or NaN amount", () => {
    expect(
      validatePaycheckScheduleSettings({
        amount: -1,
        scheduleType: "semi_monthly_15_30",
        firstPayDay: 15,
        secondPayDay: 30,
        useLastBusinessDay: false,
        isActive: true,
        effectiveFrom: null,
      })
    ).toBe("Paycheck amount must be zero or greater.");

    expect(
      validatePaycheckScheduleSettings({
        amount: Number.NaN,
        scheduleType: "semi_monthly_15_30",
        firstPayDay: 15,
        secondPayDay: 30,
        useLastBusinessDay: false,
        isActive: true,
        effectiveFrom: null,
      })
    ).toBe("Paycheck amount must be zero or greater.");
  });

  it("allows disabled schedule without amount", () => {
    expect(
      validatePaycheckScheduleSettings({
        amount: 0,
        scheduleType: "disabled",
        firstPayDay: null,
        secondPayDay: null,
        useLastBusinessDay: false,
        isActive: false,
        effectiveFrom: null,
      })
    ).toBeNull();
  });
});

describe("fixed pay day schedules", () => {
  it("produces 15th and 30th pay dates", () => {
    const settings = normalizePaycheckScheduleSettings({
      amount: 2000,
      scheduleType: "semi_monthly_15_30",
      firstPayDay: 15,
      secondPayDay: 30,
      useLastBusinessDay: false,
      isActive: true,
      effectiveFrom: null,
    });

    expect(computePayDatesForMonth(settings, 2026, 6)).toEqual([
      "2026-06-15",
      "2026-06-30",
    ]);
  });

  it("clamps day 30 to February month end", () => {
    expect(clampFixedPayDay(2026, 2, 30)).toBe(28);
    expect(buildFixedPayDate(2026, 2, 30)).toBe("2026-02-28");
  });
});

describe("last business day schedule", () => {
  it("produces 15th and last business day dates", () => {
    const settings = normalizePaycheckScheduleSettings({
      amount: 1990,
      scheduleType: "semi_monthly_15_last_business_day",
      firstPayDay: 15,
      secondPayDay: null,
      useLastBusinessDay: true,
      isActive: true,
      effectiveFrom: null,
    });

    expect(computePayDatesForMonth(settings, 2026, 6)).toEqual([
      "2026-06-15",
      "2026-06-30",
    ]);
  });

  it("skips weekend last business day to Friday", () => {
    expect(getWeekendAwareLastBusinessDay(2026, 8)).toBe("2026-08-31");
    expect(getWeekendAwareLastBusinessDay(2026, 5)).toBe("2026-05-29");
  });
});

describe("paycheck forecast income events", () => {
  const activeSettings = normalizePaycheckScheduleSettings({
    amount: 2127.08,
    scheduleType: "semi_monthly_15_30",
    firstPayDay: 15,
    secondPayDay: 30,
    useLastBusinessDay: false,
    isActive: true,
    effectiveFrom: null,
  });

  it("returns no events for inactive schedule", () => {
    expect(
      buildPaycheckForecastIncomeEvents({
        settings: {
          ...activeSettings,
          scheduleType: "disabled",
          isActive: false,
        },
        range: { start: "2026-06-22", end: "2026-06-30" },
        signedInUserId: USER_ID,
        snapshotDate: "2026-06-20",
      })
    ).toEqual([]);
  });

  it("includes only pay dates inside the selected window after snapshot", () => {
    const events = buildPaycheckForecastIncomeEvents({
      settings: activeSettings,
      range: { start: "2026-06-22", end: "2026-06-30" },
      signedInUserId: USER_ID,
      snapshotDate: "2026-06-20",
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: "2026-06-30",
      amount: 2127.08,
      label: "Expected paycheck",
      userId: USER_ID,
    });
  });

  it("filters pay dates to the forecast window", () => {
    const dates = computePayDatesInRange(activeSettings, {
      start: "2026-06-22",
      end: "2026-07-15",
    });

    expect(dates).toEqual(["2026-06-30", "2026-07-15"]);
  });

  it("excludes other-user events when filtered", () => {
    const events = [
      {
        id: "mine",
        userId: USER_ID,
        date: "2026-06-30",
        amount: 100,
        label: "Expected paycheck",
        sourceLabel: PAYCHECK_SCHEDULE_TYPE_LABELS.semi_monthly_15_30,
      },
      {
        id: "other",
        userId: OTHER_USER_ID,
        date: "2026-06-30",
        amount: 999,
        label: "Expected paycheck",
        sourceLabel: PAYCHECK_SCHEDULE_TYPE_LABELS.semi_monthly_15_30,
      },
    ];

    expect(filterOwnPaycheckIncomeEvents(events, USER_ID)).toHaveLength(1);
    expect(filterOwnPaycheckIncomeEvents(events, USER_ID)[0]?.userId).toBe(USER_ID);
  });

  it("uses privacy-safe labels without raw UUIDs", () => {
    const events = buildPaycheckForecastIncomeEvents({
      settings: activeSettings,
      range: { start: "2026-06-22", end: "2026-06-30" },
      signedInUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      snapshotDate: "2026-06-20",
    });

    expect(
      paycheckScheduleDisplayLabelsArePrivacySafe(
        events.flatMap((event) => [event.label, event.sourceLabel])
      )
    ).toBe(true);
    expect(events[0]?.id.includes("bbbb")).toBe(true);
    expect(events[0]?.label.includes("bbbb")).toBe(false);
  });

  it("reports configured schedule state", () => {
    expect(isPaycheckScheduleConfigured(activeSettings)).toBe(true);
    expect(
      isPaycheckScheduleConfigured({
        ...activeSettings,
        amount: 0,
      })
    ).toBe(false);
  });
});
