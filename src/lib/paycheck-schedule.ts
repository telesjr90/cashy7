import type { BillShareKey } from "@/lib/bill-share";
import {
  adjustToPreviousBusinessDay,
  getBcStatutoryHolidaySet,
} from "@/lib/bc-statutory-holidays";
import { supabase } from "@/lib/supabase";
import type { PeriodView } from "@/lib/periods";
import type { ForecastDateRange } from "@/lib/safe-to-spend-forecast";
import type { PaycheckSchedule } from "@/lib/types";

export {
  adjustToPreviousBusinessDay,
  getBcStatutoryHolidayDates,
  getBcStatutoryHolidayDatesForYear,
  isBusinessDay,
  isWeekendDate,
} from "@/lib/bc-statutory-holidays";

export type PaycheckScheduleType =
  | "disabled"
  | "semi_monthly_15_30"
  | "semi_monthly_15_last_business_day";

export interface PaycheckScheduleSettings {
  amount: number;
  scheduleType: PaycheckScheduleType;
  firstPayDay: number | null;
  secondPayDay: number | null;
  useLastBusinessDay: boolean;
  isActive: boolean;
  effectiveFrom: string | null;
}

export interface PaycheckForecastIncomeEvent {
  id: string;
  userId: string;
  date: string;
  amount: number;
  label: string;
  sourceLabel: string;
}

export const PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY =
  "Only you can see your paycheck amount.";

export const PAYCHECK_SETTINGS_FORECAST_ONLY_COPY =
  "This is used for your forecast only.";

export const PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY =
  "Other household members cannot see your paycheck settings.";

export const PAYCHECK_SCHEDULE_PRIVACY_COPY =
  `${PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY} ${PAYCHECK_SETTINGS_FORECAST_ONLY_COPY} ${PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY}`;

export const PAYCHECK_OTHER_USER_INCOME_LABEL = "Private";

export const PAYCHECK_DASHBOARD_INCOME_NOT_CONFIGURED_LABEL = "Not configured";

export const PAYCHECK_SETTINGS_NO_SCHEDULE_LABEL =
  "No paycheck schedule saved yet. Choose a schedule and amount to include expected income in your forecast.";

export const PAYCHECK_SETTINGS_DISABLED_LABEL =
  "Paycheck income is disabled. Your forecast will not include expected paychecks until you enable a schedule.";

const PAYCHECK_SCHEDULE_TYPES: PaycheckScheduleType[] = [
  "disabled",
  "semi_monthly_15_30",
  "semi_monthly_15_last_business_day",
];

export const PAYCHECK_LAST_BUSINESS_DAY_LIMITATION_LABEL =
  "Last business day uses weekend-aware logic only (not holiday-aware).";

export const FORECAST_INCOME_NOT_CONFIGURED_LABEL =
  "Paycheck income is not configured. Add your schedule in Settings to include expected paychecks.";

export const FORECAST_INCOME_CONFIGURED_LABEL =
  "Includes your private expected paycheck schedule.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const PAYCHECK_SCHEDULE_TYPE_LABELS: Record<PaycheckScheduleType, string> = {
  disabled: "No paycheck schedule",
  semi_monthly_15_30:
    "15th and 30th of each month (previous business day if weekend or B.C. holiday)",
  semi_monthly_15_last_business_day:
    "15th and last business day of each month (weekend-aware)",
};

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function compareDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function dateInRange(date: string, range: ForecastDateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function clampFixedPayDay(year: number, month: number, day: number): number {
  const monthEnd = lastDayOfMonth(year, month);
  return Math.min(Math.max(day, 1), monthEnd);
}

export function buildFixedPayDate(year: number, month: number, day: number): string {
  const clampedDay = clampFixedPayDay(year, month, day);
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(clampedDay).padStart(2, "0");
  return `${year}-${monthStr}-${dayStr}`;
}

function adjustAnchorPayDate(anchorDate: string): string {
  const anchorYear = Number(anchorDate.slice(0, 4));
  const holidays = getBcStatutoryHolidaySet({
    startYear: anchorYear - 1,
    endYear: anchorYear,
  });
  return adjustToPreviousBusinessDay(anchorDate, holidays);
}

/**
 * Pay dates anchored to the 15th and 30th (30th clamped to month end), then moved to
 * the previous business day when an anchor falls on a weekend or B.C. statutory holiday.
 */
export function getFixedFifteenthAndThirtiethPayDates(
  year: number,
  month: number
): string[] {
  const firstAnchor = buildFixedPayDate(year, month, 15);
  const secondAnchor = buildFixedPayDate(year, month, 30);
  const adjusted = [
    adjustAnchorPayDate(firstAnchor),
    ...(firstAnchor === secondAnchor ? [] : [adjustAnchorPayDate(secondAnchor)]),
  ];

  return [...new Set(adjusted)].sort(compareDates);
}

export function getWeekendAwareLastBusinessDay(year: number, month: number): string {
  const lastDay = lastDayOfMonth(year, month);
  const date = new Date(year, month - 1, lastDay);
  const weekday = date.getDay();

  if (weekday === 0) {
    date.setDate(date.getDate() - 2);
  } else if (weekday === 6) {
    date.setDate(date.getDate() - 1);
  }

  return formatIsoDate(date);
}

export function getYearMonthKeysInDateRange(range: ForecastDateRange): Array<{
  year: number;
  month: number;
}> {
  const startYear = Number(range.start.slice(0, 4));
  const startMonth = Number(range.start.slice(5, 7));
  const endYear = Number(range.end.slice(0, 4));
  const endMonth = Number(range.end.slice(5, 7));

  const keys: Array<{ year: number; month: number }> = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return keys;
}

export function mapPaycheckScheduleRow(row: PaycheckSchedule): PaycheckScheduleSettings {
  return {
    amount: Number(row.amount),
    scheduleType: row.schedule_type as PaycheckScheduleType,
    firstPayDay: row.first_pay_day,
    secondPayDay: row.second_pay_day,
    useLastBusinessDay: row.use_last_business_day,
    isActive: row.is_active,
    effectiveFrom: parseDateOnly(row.effective_from),
  };
}

export function defaultPaycheckScheduleSettings(): PaycheckScheduleSettings {
  return {
    amount: 0,
    scheduleType: "disabled",
    firstPayDay: null,
    secondPayDay: null,
    useLastBusinessDay: false,
    isActive: true,
    effectiveFrom: null,
  };
}

export function normalizePaycheckScheduleSettings(
  settings: PaycheckScheduleSettings
): PaycheckScheduleSettings {
  if (settings.scheduleType === "semi_monthly_15_30") {
    return {
      ...settings,
      firstPayDay: 15,
      secondPayDay: 30,
      useLastBusinessDay: false,
      isActive: true,
    };
  }

  if (settings.scheduleType === "semi_monthly_15_last_business_day") {
    return {
      ...settings,
      firstPayDay: 15,
      secondPayDay: null,
      useLastBusinessDay: true,
      isActive: true,
    };
  }

  return {
    ...settings,
    firstPayDay: null,
    secondPayDay: null,
    useLastBusinessDay: false,
    isActive: false,
  };
}

export function isKnownPaycheckScheduleType(
  value: string
): value is PaycheckScheduleType {
  return PAYCHECK_SCHEDULE_TYPES.includes(value as PaycheckScheduleType);
}

export function validatePaycheckScheduleSettings(
  settings: PaycheckScheduleSettings
): string | null {
  if (!isKnownPaycheckScheduleType(settings.scheduleType)) {
    return "Choose a valid paycheck schedule type.";
  }

  if (settings.scheduleType === "disabled") {
    return null;
  }

  if (!Number.isFinite(settings.amount) || settings.amount < 0) {
    return "Paycheck amount must be zero or greater.";
  }

  if (settings.amount <= 0) {
    return "Enter a paycheck amount greater than zero or disable the schedule.";
  }

  return null;
}

export function buildPaycheckScheduleUpsertPayload(input: {
  householdId: string;
  userId: string;
  settings: PaycheckScheduleSettings;
}): {
  household_id: string;
  user_id: string;
  amount: number;
  schedule_type: PaycheckScheduleType;
  first_pay_day: number | null;
  second_pay_day: number | null;
  use_last_business_day: boolean;
  is_active: boolean;
  effective_from: string | null;
  updated_at: string;
} {
  const normalized = normalizePaycheckScheduleSettings(input.settings);
  return {
    household_id: input.householdId,
    user_id: input.userId,
    amount: normalized.amount,
    schedule_type: normalized.scheduleType,
    first_pay_day: normalized.firstPayDay,
    second_pay_day: normalized.secondPayDay,
    use_last_business_day: normalized.useLastBusinessDay,
    is_active: normalized.isActive,
    effective_from: normalized.effectiveFrom,
    updated_at: new Date().toISOString(),
  };
}

export type DashboardPaycheckIncomeCell = number | "private" | "not_configured";

export interface DashboardPaycheckIncomeByPerson {
  teles: DashboardPaycheckIncomeCell;
  nicole: DashboardPaycheckIncomeCell;
  householdTotal: number;
}

export function computeMyPaycheckIncomeForPeriodView(
  settings: PaycheckScheduleSettings | null | undefined,
  periodView: PeriodView
): number {
  if (!isPaycheckScheduleConfigured(settings)) {
    return 0;
  }

  const normalized = normalizePaycheckScheduleSettings(settings!);
  if (periodView === "full") {
    return normalized.amount * 2;
  }

  return normalized.amount;
}

export function buildDashboardPaycheckIncomeByPerson(input: {
  settings: PaycheckScheduleSettings | null | undefined;
  periodView: PeriodView;
  shareKey: BillShareKey | null;
}): DashboardPaycheckIncomeByPerson {
  const configured = isPaycheckScheduleConfigured(input.settings);
  const myIncome = computeMyPaycheckIncomeForPeriodView(
    input.settings,
    input.periodView
  );
  const myCell: DashboardPaycheckIncomeCell = configured
    ? myIncome
    : "not_configured";

  let teles: DashboardPaycheckIncomeCell = "private";
  let nicole: DashboardPaycheckIncomeCell = "private";

  if (input.shareKey === "teles_amount") {
    teles = myCell;
  } else if (input.shareKey === "nicole_amount") {
    nicole = myCell;
  }

  return {
    teles,
    nicole,
    householdTotal: configured ? myIncome : 0,
  };
}

export function formatDashboardPaycheckIncomeAmount(
  cell: DashboardPaycheckIncomeCell,
  formatCurrency: (amount: number) => string
): string {
  if (cell === "private") {
    return PAYCHECK_OTHER_USER_INCOME_LABEL;
  }

  if (cell === "not_configured") {
    return PAYCHECK_DASHBOARD_INCOME_NOT_CONFIGURED_LABEL;
  }

  return formatCurrency(cell);
}

export function dashboardPaycheckLeftover(
  incomeCell: DashboardPaycheckIncomeCell,
  billsTotal: number
): number | null {
  if (typeof incomeCell !== "number") {
    return null;
  }

  return incomeCell - billsTotal;
}

export function isPaycheckScheduleConfigured(
  settings: PaycheckScheduleSettings | null | undefined
): boolean {
  if (!settings) {
    return false;
  }

  const normalized = normalizePaycheckScheduleSettings(settings);
  return (
    normalized.scheduleType !== "disabled" &&
    normalized.isActive &&
    normalized.amount > 0
  );
}

export function computePayDatesForMonth(
  settings: PaycheckScheduleSettings,
  year: number,
  month: number
): string[] {
  const normalized = normalizePaycheckScheduleSettings(settings);
  if (!normalized.isActive || normalized.scheduleType === "disabled") {
    return [];
  }

  if (normalized.scheduleType === "semi_monthly_15_30") {
    return getFixedFifteenthAndThirtiethPayDates(year, month);
  }

  if (normalized.scheduleType === "semi_monthly_15_last_business_day") {
    const first = buildFixedPayDate(year, month, normalized.firstPayDay ?? 15);
    const lastBusiness = getWeekendAwareLastBusinessDay(year, month);
    return first === lastBusiness ? [first] : [first, lastBusiness];
  }

  return [];
}

export function computePayDatesInRange(
  settings: PaycheckScheduleSettings,
  range: ForecastDateRange
): string[] {
  const normalized = normalizePaycheckScheduleSettings(settings);
  if (!isPaycheckScheduleConfigured(normalized)) {
    return [];
  }

  const dates = new Set<string>();
  for (const { year, month } of getYearMonthKeysInDateRange(range)) {
    for (const payDate of computePayDatesForMonth(normalized, year, month)) {
      if (dateInRange(payDate, range)) {
        dates.add(payDate);
      }
    }
  }

  return [...dates].sort(compareDates);
}

export function getPaycheckDatesForSchedule(
  settings: PaycheckScheduleSettings | null | undefined,
  range: ForecastDateRange
): string[] {
  if (!settings) {
    return [];
  }

  return computePayDatesInRange(settings, range);
}

export function filterOwnPaycheckIncomeEvents<
  T extends { userId: string }
>(events: readonly T[], signedInUserId: string): T[] {
  return events.filter((event) => event.userId === signedInUserId);
}

export function buildPaycheckForecastIncomeEvents(input: {
  settings: PaycheckScheduleSettings;
  range: ForecastDateRange;
  signedInUserId: string;
  snapshotDate?: string | null;
}): PaycheckForecastIncomeEvent[] {
  const normalized = normalizePaycheckScheduleSettings(input.settings);
  if (!isPaycheckScheduleConfigured(normalized)) {
    return [];
  }

  const snapshotDateOnly = parseDateOnly(input.snapshotDate ?? "");
  const payDates = computePayDatesInRange(normalized, input.range).filter((payDate) => {
    if (normalized.effectiveFrom && payDate < normalized.effectiveFrom) {
      return false;
    }

    if (snapshotDateOnly && payDate <= snapshotDateOnly) {
      return false;
    }

    return true;
  });

  return payDates.map((payDate) => ({
    id: `paycheck-${input.signedInUserId}-${payDate}`,
    userId: input.signedInUserId,
    date: payDate,
    amount: normalized.amount,
    label: "Expected paycheck",
    sourceLabel: PAYCHECK_SCHEDULE_TYPE_LABELS[normalized.scheduleType],
  }));
}

export function paycheckScheduleDisplayLabelsArePrivacySafe(
  labels: ReadonlyArray<string | null | undefined>
): boolean {
  return labels.every((label) => !label || !UUID_PATTERN.test(label));
}

export async function getMyPaycheckSchedule(
  householdId: string,
  userId: string
): Promise<{ schedule: PaycheckSchedule | null; error: string | null }> {
  const { data, error } = await supabase
    .from("paycheck_schedules")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { schedule: null, error: error.message };
  }

  return { schedule: (data as PaycheckSchedule | null) ?? null, error: null };
}

export async function upsertMyPaycheckSchedule(input: {
  householdId: string;
  userId: string;
  settings: PaycheckScheduleSettings;
}): Promise<{ schedule: PaycheckSchedule | null; error: string | null }> {
  const validationError = validatePaycheckScheduleSettings(input.settings);
  if (validationError) {
    return { schedule: null, error: validationError };
  }

  const { data, error } = await supabase
    .from("paycheck_schedules")
    .upsert(buildPaycheckScheduleUpsertPayload(input), { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return { schedule: null, error: error.message };
  }

  return { schedule: data as PaycheckSchedule, error: null };
}
