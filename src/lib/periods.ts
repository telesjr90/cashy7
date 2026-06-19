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

export const TELES_PAYCHECK = 2127.08;
export const NICOLE_PAYCHECK = 1990.11;

export function activePeriodBucket(date = new Date()): PeriodBucket {
  return date.getDate() <= 14 ? "1_14" : "15_eom";
}

export function activePeriodView(date = new Date()): PeriodView {
  return activePeriodBucket(date);
}

export function paycheckIncome(view: PeriodView): { teles: number; nicole: number } {
  if (view === "full") {
    return { teles: TELES_PAYCHECK * 2, nicole: NICOLE_PAYCHECK * 2 };
  }
  return { teles: TELES_PAYCHECK, nicole: NICOLE_PAYCHECK };
}
