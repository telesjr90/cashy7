import { describe, expect, it } from "vitest";
import {
  buildDashboardPaycheckIncomeByPerson,
  buildFixedPayDate,
  buildPaycheckForecastIncomeEvents,
  buildPaycheckScheduleUpsertPayload,
  clampFixedPayDay,
  computeMyPaycheckIncomeForPeriodView,
  computePayDatesForMonth,
  computePayDatesInRange,
  filterOwnPaycheckIncomeEvents,
  formatDashboardPaycheckIncomeAmount,
  getWeekendAwareLastBusinessDay,
  isKnownPaycheckScheduleType,
  isPaycheckScheduleConfigured,
  normalizePaycheckScheduleSettings,
  paycheckScheduleDisplayLabelsArePrivacySafe,
  PAYCHECK_DASHBOARD_INCOME_NOT_CONFIGURED_LABEL,
  PAYCHECK_OTHER_USER_INCOME_LABEL,
  PAYCHECK_SCHEDULE_TYPE_LABELS,
  PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY,
  PAYCHECK_SETTINGS_FORECAST_ONLY_COPY,
  PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY,
  validatePaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
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

describe("no hardcoded paycheck runtime constants", () => {
  it("does not export Teles/Nicole paycheck fallbacks from periods module", () => {
    expect("TELES_PAYCHECK" in periodsModule).toBe(false);
    expect("NICOLE_PAYCHECK" in periodsModule).toBe(false);
    expect("paycheckIncome" in periodsModule).toBe(false);
  });
});
