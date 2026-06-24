import { describe, expect, it } from "vitest";
import {
  adjustToPreviousBusinessDay,
  buildDashboardPaycheckIncomeByPerson,
  buildFixedPayDate,
  buildForecastPaycheckDateDisplay,
  buildForecastPaycheckDateDisplayFromIncomeEvents,
  buildPaycheckDatePreview,
  buildPaycheckForecastIncomeEvents,
  buildPaycheckScheduleUpsertPayload,
  clampFixedPayDay,
  computeMyPaycheckIncomeForPeriodView,
  computePayDatesForMonth,
  computePayDatesInRange,
  filterOwnPaycheckIncomeEvents,
  formatDashboardPaycheckIncomeAmount,
  formatPaycheckDisplayDate,
  getBcStatutoryHolidayDates,
  getFixedFifteenthAndThirtiethPayDates,
  getFifteenthAndLastBusinessDayPayDates,
  getLastBusinessDayOfMonth,
  getPaycheckDatesForSchedule,
  isBusinessDay,
  isKnownPaycheckScheduleType,
  isPaycheckScheduleConfigured,
  isWeekendDate,
  normalizePaycheckScheduleSettings,
  paycheckScheduleDisplayLabelsArePrivacySafe,
  PAYCHECK_DATE_ADJUSTMENT_COPY,
  PAYCHECK_DATE_PREVIEW_TITLE,
  PAYCHECK_DASHBOARD_INCOME_NOT_CONFIGURED_LABEL,
  PAYCHECK_OTHER_USER_INCOME_LABEL,
  PAYCHECK_SCHEDULE_TYPE_LABELS,
  PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY,
  PAYCHECK_SETTINGS_FORECAST_ONLY_COPY,
  PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY,
  PAYCHECK_SETTINGS_NO_SCHEDULE_LABEL,
  validatePaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import { BC_FORECAST_SUPPORTED_YEARS } from "@/lib/bc-statutory-holidays";
import * as periodsModule from "@/lib/periods";

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

  it("rejects unknown schedule type", () => {
    expect(
      validatePaycheckScheduleSettings({
        amount: 100,
        scheduleType: "weekly_friday" as never,
        firstPayDay: null,
        secondPayDay: null,
        useLastBusinessDay: false,
        isActive: true,
        effectiveFrom: null,
      })
    ).toBe("Choose a valid paycheck schedule type.");
    expect(isKnownPaycheckScheduleType("semi_monthly_15_30")).toBe(true);
    expect(isKnownPaycheckScheduleType("unknown")).toBe(false);
  });

  it("includes required privacy copy", () => {
    expect(PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY).toMatch(/Only you can see your paycheck amount/i);
    expect(PAYCHECK_SETTINGS_FORECAST_ONLY_COPY).toMatch(/forecast only/i);
    expect(PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY).toMatch(
      /Other household members cannot see your paycheck settings/i
    );
  });
});

describe("fixed pay day schedules", () => {
  const settings = normalizePaycheckScheduleSettings({
    amount: 2000,
    scheduleType: "semi_monthly_15_30",
    firstPayDay: 15,
    secondPayDay: 30,
    useLastBusinessDay: false,
    isActive: true,
    effectiveFrom: null,
  });

  it("produces 15th and 30th pay dates", () => {
    expect(computePayDatesForMonth(settings, 2026, 6)).toEqual([
      "2026-06-15",
      "2026-06-30",
    ]);
  });

  it("includes January 15 and January 30", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2026, 1)).toEqual([
      "2026-01-15",
      "2026-01-30",
    ]);
    expect(computePayDatesForMonth(settings, 2026, 1)).toEqual([
      "2026-01-15",
      "2026-01-30",
    ]);
  });

  it("includes April 15 and April 30", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2026, 4)).toEqual([
      "2026-04-15",
      "2026-04-30",
    ]);
    expect(computePayDatesForMonth(settings, 2026, 4)).toEqual([
      "2026-04-15",
      "2026-04-30",
    ]);
  });

  it("clamps day 30 to February month end in non-leap years before business-day adjustment", () => {
    expect(clampFixedPayDay(2026, 2, 30)).toBe(28);
    expect(buildFixedPayDate(2026, 2, 30)).toBe("2026-02-28");
    expect(getFixedFifteenthAndThirtiethPayDates(2026, 2)).toEqual([
      "2026-02-13",
      "2026-02-27",
    ]);
    expect(computePayDatesForMonth(settings, 2026, 2)).toEqual([
      "2026-02-13",
      "2026-02-27",
    ]);
  });

  it("clamps day 30 to February 29 in leap years then adjusts if needed", () => {
    expect(clampFixedPayDay(2028, 2, 30)).toBe(29);
    expect(buildFixedPayDate(2028, 2, 30)).toBe("2028-02-29");
    expect(getFixedFifteenthAndThirtiethPayDates(2028, 2)).toEqual([
      "2028-02-15",
      "2028-02-29",
    ]);
    expect(computePayDatesForMonth(settings, 2028, 2)).toEqual([
      "2028-02-15",
      "2028-02-29",
    ]);
  });

  it("adjusts a Saturday 15th anchor to the previous Friday", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2026, 8)).toEqual([
      "2026-08-14",
      "2026-08-28",
    ]);
  });

  it("adjusts a Sunday 15th anchor to the previous Friday", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2026, 3)).toEqual([
      "2026-03-13",
      "2026-03-30",
    ]);
  });

  it("adjusts a holiday 30th anchor to the previous business day", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2026, 9)).toEqual([
      "2026-09-15",
      "2026-09-29",
    ]);
  });

  it("adjusts a Friday holiday 15th anchor to Thursday", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2022, 4)).toEqual([
      "2022-04-14",
      "2022-04-29",
    ]);
  });

  it("includes B.C. statutory holidays needed by forecast windows", () => {
    const holidays = getBcStatutoryHolidayDates({ startYear: 2026, endYear: 2027 });
    expect(holidays).toContain("2026-09-30");
    expect(holidays).toContain("2026-07-01");
    expect(holidays).toContain("2027-07-01");
  });

  it("includes only the adjusted 30th/last-day date when the window starts after the 15th", () => {
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-06-16", end: "2026-06-30" })
    ).toEqual(["2026-06-30"]);
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-02-16", end: "2026-02-28" })
    ).toEqual(["2026-02-27"]);
  });

  it("includes only the 15th when the window ends before the 30th", () => {
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-01-01", end: "2026-01-20" })
    ).toEqual(["2026-01-15"]);
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-04-10", end: "2026-04-29" })
    ).toEqual(["2026-04-15"]);
  });

  it("returns no dates for disabled schedule", () => {
    const disabled = normalizePaycheckScheduleSettings({
      amount: 0,
      scheduleType: "disabled",
      firstPayDay: null,
      secondPayDay: null,
      useLastBusinessDay: false,
      isActive: false,
      effectiveFrom: null,
    });

    expect(
      getPaycheckDatesForSchedule(disabled, { start: "2026-01-01", end: "2026-01-31" })
    ).toEqual([]);
    expect(computePayDatesInRange(disabled, { start: "2026-01-01", end: "2026-01-31" })).toEqual(
      []
    );
  });

  it("returns no dates for missing schedule", () => {
    expect(
      getPaycheckDatesForSchedule(null, { start: "2026-01-01", end: "2026-01-31" })
    ).toEqual([]);
    expect(
      getPaycheckDatesForSchedule(undefined, { start: "2026-01-01", end: "2026-01-31" })
    ).toEqual([]);
  });
});

describe("last business day schedule", () => {
  const settings = normalizePaycheckScheduleSettings({
    amount: 1990,
    scheduleType: "semi_monthly_15_last_business_day",
    firstPayDay: 15,
    secondPayDay: null,
    useLastBusinessDay: true,
    isActive: true,
    effectiveFrom: null,
  });

  it("returns the 15th when it is a normal business day", () => {
    expect(getFifteenthAndLastBusinessDayPayDates(2026, 6)).toEqual([
      "2026-06-15",
      "2026-06-30",
    ]);
    expect(computePayDatesForMonth(settings, 2026, 6)).toEqual([
      "2026-06-15",
      "2026-06-30",
    ]);
  });

  it("adjusts a Saturday 15th anchor to the previous Friday", () => {
    expect(getFifteenthAndLastBusinessDayPayDates(2026, 8)).toEqual([
      "2026-08-14",
      "2026-08-31",
    ]);
  });

  it("adjusts a Sunday 15th anchor to the previous Friday", () => {
    expect(getFifteenthAndLastBusinessDayPayDates(2026, 3)).toEqual([
      "2026-03-13",
      "2026-03-31",
    ]);
  });

  it("adjusts a B.C. holiday 15th anchor to the previous business day", () => {
    expect(getFifteenthAndLastBusinessDayPayDates(2022, 4)).toEqual([
      "2022-04-14",
      "2022-04-29",
    ]);
  });

  it("adjusts month-end Saturday to the previous Friday", () => {
    expect(getLastBusinessDayOfMonth(2026, 5)).toBe("2026-05-29");
    expect(getLastBusinessDayOfMonth(2026, 8)).toBe("2026-08-31");
  });

  it("adjusts month-end Sunday to the previous Friday", () => {
    expect(getLastBusinessDayOfMonth(2023, 4)).toBe("2023-04-28");
  });

  it("adjusts month-end B.C. statutory holiday to the previous business day", () => {
    expect(getLastBusinessDayOfMonth(2026, 9)).toBe("2026-09-29");
    expect(getFifteenthAndLastBusinessDayPayDates(2026, 9)).toEqual([
      "2026-09-15",
      "2026-09-29",
    ]);
  });

  it("uses September 29 2026 when September 30 is National Day for Truth and Reconciliation", () => {
    expect(getLastBusinessDayOfMonth(2026, 9)).toBe("2026-09-29");
    expect(computePayDatesForMonth(settings, 2026, 9)).toEqual([
      "2026-09-15",
      "2026-09-29",
    ]);
  });

  it("avoids Christmas when it affects month-end business-day search in December 2027", () => {
    expect(getLastBusinessDayOfMonth(2027, 12)).toBe("2027-12-31");
    expect(getFifteenthAndLastBusinessDayPayDates(2027, 12)).toEqual([
      "2027-12-15",
      "2027-12-31",
    ]);
  });

  it("includes only the last-business-day paycheck when the window starts after the adjusted 15th", () => {
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-06-16", end: "2026-06-30" })
    ).toEqual(["2026-06-30"]);
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-09-16", end: "2026-09-30" })
    ).toEqual(["2026-09-29"]);
  });

  it("includes only the adjusted 15th when the window ends before month end", () => {
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-01-01", end: "2026-01-20" })
    ).toEqual(["2026-01-15"]);
    expect(
      getPaycheckDatesForSchedule(settings, { start: "2026-09-01", end: "2026-09-20" })
    ).toEqual(["2026-09-15"]);
  });

  it("returns no dates for disabled schedule", () => {
    const disabled = normalizePaycheckScheduleSettings({
      amount: 0,
      scheduleType: "disabled",
      firstPayDay: null,
      secondPayDay: null,
      useLastBusinessDay: false,
      isActive: false,
      effectiveFrom: null,
    });

    expect(
      getPaycheckDatesForSchedule(disabled, { start: "2026-01-01", end: "2026-01-31" })
    ).toEqual([]);
  });

  it("returns no dates for missing schedule", () => {
    expect(
      getPaycheckDatesForSchedule(null, { start: "2026-01-01", end: "2026-01-31" })
    ).toEqual([]);
  });

  it("uses signed-in user amount only in forecast income events", () => {
    const events = buildPaycheckForecastIncomeEvents({
      settings,
      range: { start: "2026-09-01", end: "2026-09-30" },
      signedInUserId: OTHER_USER_ID,
      snapshotDate: "2026-08-31",
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.date)).toEqual(["2026-09-15", "2026-09-29"]);
    expect(events.every((event) => event.amount === 1990)).toBe(true);
    expect(events.every((event) => event.userId === OTHER_USER_ID)).toBe(true);

    const mixedEvents = [
      ...events,
      {
        id: "other",
        userId: USER_ID,
        date: "2026-09-15",
        amount: 9999,
        label: "Expected paycheck",
        sourceLabel: PAYCHECK_SCHEDULE_TYPE_LABELS.semi_monthly_15_last_business_day,
      },
    ];

    const ownOnly = filterOwnPaycheckIncomeEvents(mixedEvents, OTHER_USER_ID);
    expect(ownOnly).toHaveLength(2);
    expect(ownOnly.some((event) => event.amount === 9999)).toBe(false);
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

  it("uses adjusted pay dates in forecast income events, not raw anchors", () => {
    const events = buildPaycheckForecastIncomeEvents({
      settings: activeSettings,
      range: { start: "2026-09-01", end: "2026-09-30" },
      signedInUserId: USER_ID,
      snapshotDate: "2026-08-31",
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.date)).toEqual(["2026-09-15", "2026-09-29"]);
    expect(events.every((event) => event.amount === 2127.08)).toBe(true);
    expect(events.some((event) => event.date === "2026-09-30")).toBe(false);
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

  it("uses signed-in user amount only and ignores other-user events when filtered", () => {
    const events = buildPaycheckForecastIncomeEvents({
      settings: activeSettings,
      range: { start: "2026-06-01", end: "2026-06-30" },
      signedInUserId: USER_ID,
      snapshotDate: "2026-05-31",
    });

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.amount === 2127.08)).toBe(true);
    expect(events.every((event) => event.userId === USER_ID)).toBe(true);

    const mixedEvents = [
      ...events,
      {
        id: "other",
        userId: OTHER_USER_ID,
        date: "2026-06-15",
        amount: 9999,
        label: "Expected paycheck",
        sourceLabel: PAYCHECK_SCHEDULE_TYPE_LABELS.semi_monthly_15_30,
      },
    ];

    const ownOnly = filterOwnPaycheckIncomeEvents(mixedEvents, USER_ID);
    expect(ownOnly).toHaveLength(2);
    expect(ownOnly.every((event) => event.userId === USER_ID)).toBe(true);
    expect(ownOnly.some((event) => event.amount === 9999)).toBe(false);
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
    expect(isPaycheckScheduleConfigured(null)).toBe(false);
  });
});

describe("dashboard paycheck income display", () => {
  const configuredSettings = normalizePaycheckScheduleSettings({
    amount: 2500,
    scheduleType: "semi_monthly_15_30",
    firstPayDay: 15,
    secondPayDay: 30,
    useLastBusinessDay: false,
    isActive: true,
    effectiveFrom: null,
  });

  it("shows only the signed-in user's income in their column", () => {
    const telesView = buildDashboardPaycheckIncomeByPerson({
      settings: configuredSettings,
      periodView: "1_14",
      shareKey: "teles_amount",
    });

    expect(telesView.teles).toBe(2500);
    expect(telesView.nicole).toBe("private");
    expect(telesView.householdTotal).toBe(2500);
  });

  it("hides other-user income even when settings are passed in", () => {
    const nicoleView = buildDashboardPaycheckIncomeByPerson({
      settings: configuredSettings,
      periodView: "15_eom",
      shareKey: "nicole_amount",
    });

    expect(nicoleView.nicole).toBe(2500);
    expect(nicoleView.teles).toBe("private");
  });

  it("uses not configured when schedule is missing or disabled", () => {
    const missing = buildDashboardPaycheckIncomeByPerson({
      settings: null,
      periodView: "full",
      shareKey: "teles_amount",
    });

    expect(missing.teles).toBe("not_configured");
    expect(missing.householdTotal).toBe(0);
    expect(computeMyPaycheckIncomeForPeriodView(null, "full")).toBe(0);
  });

  it("doubles income for full-month view", () => {
    expect(computeMyPaycheckIncomeForPeriodView(configuredSettings, "full")).toBe(5000);
    expect(computeMyPaycheckIncomeForPeriodView(configuredSettings, "1_14")).toBe(2500);
  });

  it("formats privacy-safe income labels without raw UUIDs", () => {
    expect(
      formatDashboardPaycheckIncomeAmount("private", (value) => `$${value}`)
    ).toBe(PAYCHECK_OTHER_USER_INCOME_LABEL);
    expect(
      formatDashboardPaycheckIncomeAmount("not_configured", (value) => `$${value}`)
    ).toBe(PAYCHECK_DASHBOARD_INCOME_NOT_CONFIGURED_LABEL);
    expect(formatDashboardPaycheckIncomeAmount(100, (value) => `$${value}`)).toBe("$100");
  });

  it("builds upsert payload for enabled and disabled schedules", () => {
    expect(
      buildPaycheckScheduleUpsertPayload({
        householdId: "household-id",
        userId: "user-id",
        settings: configuredSettings,
      })
    ).toMatchObject({
      household_id: "household-id",
      user_id: "user-id",
      amount: 2500,
      schedule_type: "semi_monthly_15_30",
      is_active: true,
    });

    expect(
      buildPaycheckScheduleUpsertPayload({
        householdId: "household-id",
        userId: "user-id",
        settings: normalizePaycheckScheduleSettings({
          amount: 0,
          scheduleType: "disabled",
          firstPayDay: null,
          secondPayDay: null,
          useLastBusinessDay: false,
          isActive: false,
          effectiveFrom: null,
        }),
      }).is_active
    ).toBe(false);
  });
});

describe("shared business-day helpers re-export", () => {
  it("exposes weekend and business-day helpers from paycheck schedule module", () => {
    expect(isWeekendDate("2026-08-15")).toBe(true);
    expect(isBusinessDay("2026-07-01")).toBe(false);
    expect(adjustToPreviousBusinessDay("2026-07-01")).toBe("2026-06-30");
  });
});

describe("B.C. holiday hardening — both schedules share helpers", () => {
  const schedule1530 = normalizePaycheckScheduleSettings({
    amount: 2000,
    scheduleType: "semi_monthly_15_30",
    firstPayDay: 15,
    secondPayDay: 30,
    useLastBusinessDay: false,
    isActive: true,
    effectiveFrom: null,
  });

  const scheduleLastBd = normalizePaycheckScheduleSettings({
    amount: 1990,
    scheduleType: "semi_monthly_15_last_business_day",
    firstPayDay: 15,
    secondPayDay: null,
    useLastBusinessDay: true,
    isActive: true,
    effectiveFrom: null,
  });

  it("applies the same 15th holiday adjustment on both schedules (April 2022 Good Friday)", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2022, 4)[0]).toBe("2022-04-14");
    expect(getFifteenthAndLastBusinessDayPayDates(2022, 4)[0]).toBe("2022-04-14");
  });

  it("uses September 29 2026 last business day on both schedules when Sep 30 is a holiday", () => {
    expect(getFixedFifteenthAndThirtiethPayDates(2026, 9)).toEqual([
      "2026-09-15",
      "2026-09-29",
    ]);
    expect(getFifteenthAndLastBusinessDayPayDates(2026, 9)).toEqual([
      "2026-09-15",
      "2026-09-29",
    ]);
    expect(getLastBusinessDayOfMonth(2026, 9)).toBe("2026-09-29");
  });

  it("produces forecast income on adjusted dates for both schedule types", () => {
    const range = { start: "2026-09-01", end: "2026-09-30" };
    const events1530 = buildPaycheckForecastIncomeEvents({
      settings: schedule1530,
      range,
      signedInUserId: USER_ID,
      snapshotDate: "2026-08-31",
    });
    const eventsLastBd = buildPaycheckForecastIncomeEvents({
      settings: scheduleLastBd,
      range,
      signedInUserId: USER_ID,
      snapshotDate: "2026-08-31",
    });

    expect(events1530.map((event) => event.date)).toEqual(["2026-09-15", "2026-09-29"]);
    expect(eventsLastBd.map((event) => event.date)).toEqual(["2026-09-15", "2026-09-29"]);
    expect(events1530.some((event) => event.date === "2026-09-30")).toBe(false);
    expect(eventsLastBd.some((event) => event.date === "2026-09-30")).toBe(false);
  });

  it("covers supported forecast years 2022 through 2030 without errors", () => {
    const range = {
      start: `${BC_FORECAST_SUPPORTED_YEARS.start}-01-01`,
      end: `${BC_FORECAST_SUPPORTED_YEARS.end}-12-31`,
    };

    const dates1530 = getPaycheckDatesForSchedule(schedule1530, range);
    const datesLastBd = getPaycheckDatesForSchedule(scheduleLastBd, range);

    expect(dates1530.length).toBeGreaterThan(0);
    expect(datesLastBd.length).toBeGreaterThan(0);
    expect(dates1530.every((date) => isBusinessDay(date))).toBe(true);
    expect(datesLastBd.every((date) => isBusinessDay(date))).toBe(true);
    expect(dates1530.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
    expect(datesLastBd.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
  });
});

describe("no hardcoded paycheck runtime constants", () => {
  it("does not export Teles/Nicole paycheck fallbacks from periods module", () => {
    expect("TELES_PAYCHECK" in periodsModule).toBe(false);
    expect("NICOLE_PAYCHECK" in periodsModule).toBe(false);
    expect("paycheckIncome" in periodsModule).toBe(false);
  });
});

describe("paycheck date preview display", () => {
  const schedule1530 = normalizePaycheckScheduleSettings({
    amount: 2127.08,
    scheduleType: "semi_monthly_15_30",
    firstPayDay: 15,
    secondPayDay: 30,
    useLastBusinessDay: false,
    isActive: true,
    effectiveFrom: null,
  });

  const scheduleLastBd = normalizePaycheckScheduleSettings({
    amount: 1990,
    scheduleType: "semi_monthly_15_last_business_day",
    firstPayDay: 15,
    secondPayDay: null,
    useLastBusinessDay: true,
    isActive: true,
    effectiveFrom: null,
  });

  it("returns no preview dates and setup copy when no schedule exists", () => {
    const preview = buildPaycheckDatePreview({
      settings: null,
      savedScheduleExists: false,
    });

    expect(preview.status).toBe("no_schedule");
    expect(preview.dates).toEqual([]);
    expect(preview.statusMessage).toBe(PAYCHECK_SETTINGS_NO_SCHEDULE_LABEL);
  });

  it("returns no preview dates for a disabled saved schedule", () => {
    const preview = buildPaycheckDatePreview({
      settings: normalizePaycheckScheduleSettings({
        amount: 0,
        scheduleType: "disabled",
        firstPayDay: null,
        secondPayDay: null,
        useLastBusinessDay: false,
        isActive: false,
        effectiveFrom: null,
      }),
      savedScheduleExists: true,
    });

    expect(preview.status).toBe("disabled");
    expect(preview.dates).toEqual([]);
  });

  it("uses adjusted dates for the 15th/30th schedule preview", () => {
    const preview = buildPaycheckDatePreview({
      settings: schedule1530,
      savedScheduleExists: true,
      fromDate: "2026-09-01",
      maxDates: 4,
    });

    expect(preview.status).toBe("configured");
    expect(preview.dates.map((entry) => entry.date)).toEqual([
      "2026-09-15",
      "2026-09-29",
      "2026-10-15",
      "2026-10-30",
    ]);
    expect(preview.dates.every((entry) => entry.amount === 2127.08)).toBe(true);
    expect(formatPaycheckDisplayDate("2026-09-29")).toBe("Sep 29, 2026");
  });

  it("uses adjusted dates for the 15th and last business day schedule preview", () => {
    const preview = buildPaycheckDatePreview({
      settings: scheduleLastBd,
      savedScheduleExists: true,
      fromDate: "2026-09-01",
      maxDates: 3,
    });

    expect(preview.status).toBe("configured");
    expect(preview.dates.map((entry) => entry.date)).toEqual([
      "2026-09-15",
      "2026-09-29",
      "2026-10-15",
    ]);
  });

  it("includes a weekend-adjusted date in the preview", () => {
    const preview = buildPaycheckDatePreview({
      settings: schedule1530,
      savedScheduleExists: true,
      fromDate: "2026-08-01",
      maxDates: 2,
    });

    expect(preview.dates.map((entry) => entry.date)).toEqual(["2026-08-14", "2026-08-28"]);
  });

  it("includes a holiday-adjusted date in the preview", () => {
    const preview = buildPaycheckDatePreview({
      settings: schedule1530,
      savedScheduleExists: true,
      fromDate: "2026-09-01",
      maxDates: 2,
    });

    expect(preview.dates.map((entry) => entry.date)).toEqual(["2026-09-15", "2026-09-29"]);
    expect(preview.dates.some((entry) => entry.date === "2026-09-30")).toBe(false);
  });

  it("uses forecast income event dates for dashboard display model", () => {
    const range = { start: "2026-09-01", end: "2026-09-30" };
    const incomeEvents = buildPaycheckForecastIncomeEvents({
      settings: schedule1530,
      range,
      signedInUserId: USER_ID,
      snapshotDate: "2026-08-31",
    });
    const display = buildForecastPaycheckDateDisplay({
      incomeEvents,
      signedInUserId: USER_ID,
    });

    expect(display.incomeConfigured).toBe(true);
    expect(display.dates.map((entry) => entry.date)).toEqual(["2026-09-15", "2026-09-29"]);
    expect(
      buildForecastPaycheckDateDisplayFromIncomeEvents({
        settings: schedule1530,
        range,
        signedInUserId: USER_ID,
        snapshotDate: "2026-08-31",
      }).dates.map((entry) => entry.date)
    ).toEqual(["2026-09-15", "2026-09-29"]);
  });

  it("ignores other-user schedule events in forecast display", () => {
    const ownEvents = buildPaycheckForecastIncomeEvents({
      settings: schedule1530,
      range: { start: "2026-06-01", end: "2026-06-30" },
      signedInUserId: USER_ID,
      snapshotDate: "2026-05-31",
    });
    const otherEvents = buildPaycheckForecastIncomeEvents({
      settings: scheduleLastBd,
      range: { start: "2026-06-01", end: "2026-06-30" },
      signedInUserId: OTHER_USER_ID,
      snapshotDate: "2026-05-31",
    });
    const display = buildForecastPaycheckDateDisplay({
      incomeEvents: [...ownEvents, ...otherEvents],
      signedInUserId: USER_ID,
    });

    expect(display.dates).toHaveLength(2);
    expect(display.dates.every((entry) => entry.amount === 2127.08)).toBe(true);
    expect(display.dates.some((entry) => entry.amount === 1990)).toBe(false);
  });

  it("keeps preview labels privacy-safe without raw UUIDs", () => {
    const preview = buildPaycheckDatePreview({
      settings: schedule1530,
      savedScheduleExists: true,
      fromDate: "2026-06-01",
      maxDates: 2,
    });

    expect(
      paycheckScheduleDisplayLabelsArePrivacySafe([
        preview.title,
        preview.scheduleLabel,
        preview.adjustmentCopy,
        ...preview.dates.map((entry) => entry.formattedDate),
      ])
    ).toBe(true);
  });

  it("includes required privacy and adjustment copy", () => {
    const preview = buildPaycheckDatePreview({
      settings: schedule1530,
      savedScheduleExists: true,
      fromDate: "2026-06-01",
      maxDates: 1,
    });

    expect(preview.title).toBe(PAYCHECK_DATE_PREVIEW_TITLE);
    expect(preview.adjustmentCopy).toBe(PAYCHECK_DATE_ADJUSTMENT_COPY);
    expect(PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY).toMatch(/Only you can see your paycheck amount/i);
    expect(PAYCHECK_SETTINGS_FORECAST_ONLY_COPY).toMatch(/forecast only/i);
    expect(PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY).toMatch(
      /Other household members cannot see your paycheck settings/i
    );
  });
});
