/** MVP B.C. statutory holiday calendar for paycheck anchor adjustment (C114/C116). */

export interface ForecastYearRange {
  startYear: number;
  endYear: number;
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoDateParts(isoDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

export function toLocalDate(isoDate: string): Date {
  const { year, month, day } = parseIsoDateParts(isoDate);
  return new Date(year, month - 1, day);
}

export function formatIsoDateFromLocal(date: Date): string {
  return formatIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function isWeekendDate(isoDate: string): boolean {
  const weekday = toLocalDate(isoDate).getDay();
  return weekday === 0 || weekday === 6;
}

function computeWesternEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(isoDate: string, days: number): string {
  const date = toLocalDate(isoDate);
  date.setDate(date.getDate() + days);
  return formatIsoDateFromLocal(date);
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number
): string {
  const date = new Date(year, month - 1, 1);
  let count = 0;

  while (date.getMonth() === month - 1) {
    if (date.getDay() === weekday) {
      count += 1;
      if (count === occurrence) {
        return formatIsoDateFromLocal(date);
      }
    }
    date.setDate(date.getDate() + 1);
  }

  throw new Error(`Could not find weekday ${weekday} occurrence ${occurrence} in ${year}-${month}`);
}

function mondayOnOrBefore(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - offset);
  return formatIsoDateFromLocal(date);
}

export function getBcStatutoryHolidayDatesForYear(year: number): string[] {
  const easter = computeWesternEasterSunday(year);
  const easterSunday = formatIsoDate(year, easter.month, easter.day);
  const holidays = new Set<string>([
    formatIsoDate(year, 1, 1),
    nthWeekdayOfMonth(year, 2, 1, 3),
    addDays(easterSunday, -2),
    mondayOnOrBefore(year, 5, 24),
    formatIsoDate(year, 7, 1),
    nthWeekdayOfMonth(year, 8, 1, 1),
    nthWeekdayOfMonth(year, 9, 1, 1),
    formatIsoDate(year, 11, 11),
    nthWeekdayOfMonth(year, 10, 1, 2),
    formatIsoDate(year, 12, 25),
  ]);

  if (year >= 2021) {
    holidays.add(formatIsoDate(year, 9, 30));
  }

  return [...holidays].sort();
}

export function getBcStatutoryHolidayDates(range: ForecastYearRange): string[] {
  const holidays = new Set<string>();
  for (let year = range.startYear; year <= range.endYear; year += 1) {
    for (const holiday of getBcStatutoryHolidayDatesForYear(year)) {
      holidays.add(holiday);
    }
  }
  return [...holidays].sort();
}

export function getBcStatutoryHolidaySet(range: ForecastYearRange): ReadonlySet<string> {
  return new Set(getBcStatutoryHolidayDates(range));
}

export function isBcStatutoryHoliday(
  isoDate: string,
  holidays?: ReadonlySet<string>
): boolean {
  if (holidays) {
    return holidays.has(isoDate);
  }

  const { year } = parseIsoDateParts(isoDate);
  return getBcStatutoryHolidaySet({ startYear: year, endYear: year }).has(isoDate);
}

export function isBusinessDay(
  isoDate: string,
  holidays?: ReadonlySet<string>
): boolean {
  return !isWeekendDate(isoDate) && !isBcStatutoryHoliday(isoDate, holidays);
}

export function adjustToPreviousBusinessDay(
  isoDate: string,
  holidays?: ReadonlySet<string>
): string {
  const { year } = parseIsoDateParts(isoDate);
  const holidaySet =
    holidays ?? getBcStatutoryHolidaySet({ startYear: year - 1, endYear: year });

  let current = isoDate;
  while (!isBusinessDay(current, holidaySet)) {
    current = addDays(current, -1);
  }

  return current;
}
