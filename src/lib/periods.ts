export type PeriodBucket = "1_14" | "15_eom";
export type PeriodView = PeriodBucket | "full";

export const PERIOD_LABELS: Record<PeriodBucket, string> = {
  "1_14": "1st - 14th",
  "15_eom": "15th - End of Month",
};

export const FUNDING_LABELS: Record<PeriodView, string> = {
  "15_eom": "Funded by the 15th paycheck",
  "1_14": "Funded by the end-of-month paycheck",
  full: "Includes both paycheck periods",
};

export function activePeriodBucket(date = new Date()): PeriodBucket {
  return date.getDate() <= 14 ? "1_14" : "15_eom";
}

export function activePeriodView(date = new Date()): PeriodView {
  return activePeriodBucket(date);
}

export function isCurrentCalendarMonth(
  viewedDate: Date,
  today = new Date()
): boolean {
  return (
    viewedDate.getFullYear() === today.getFullYear() &&
    viewedDate.getMonth() === today.getMonth()
  );
}

export function defaultPeriodViewForMonth(
  viewedDate: Date,
  today = new Date()
): PeriodView {
  return isCurrentCalendarMonth(viewedDate, today)
    ? activePeriodView(today)
    : "full";
}
