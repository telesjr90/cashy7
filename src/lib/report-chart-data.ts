/**
 * Pure data helpers that transform ManualExpense rows into chart-ready datasets.
 *
 * These helpers are side-effect free. They do NOT call Supabase. Privacy and
 * RLS filtering must be applied by the caller before passing rows here.
 * No raw user_id, household_id, or UUIDs appear in any chart-facing label.
 */
import type { ManualExpense } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ExpenseChartPeriodBucket = "month" | "pay_period";

export type ExpenseCategoryChartRow = {
  categoryId: null;
  categoryName: string;
  amount: number;
  transactionCount: number;
  percentage: number;
};

export type ExpenseMonthlyChartRow = {
  monthKey: string;
  monthLabel: string;
  amount: number;
  transactionCount: number;
};

export type ExpensePayPeriodChartRow = {
  periodKey: string;
  periodLabel: string;
  monthKey: string;
  periodBucket: "1_14" | "15_eom";
  amount: number;
  transactionCount: number;
};

export type ExpenseStackedCategoryPeriodRow = {
  periodKey: string;
  periodLabel: string;
  [categoryName: string]: string | number;
};

export type ExpenseChartDataOptions = {
  startDate?: string;
  endDate?: string;
  cashflowStartDate?: string;
  includeEmptyPeriods?: boolean;
  topCategoryCount?: number;
  includeOtherCategory?: boolean;
  categoryNameById?: Record<string, string>;
  now?: Date;
};

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDateOnly(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function toMonthKey(dateStr: string): string | null {
  const d = parseDateOnly(dateStr);
  return d ? d.slice(0, 7) : null;
}

function monthKeyToLabel(monthKey: string): string {
  const parts = monthKey.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const name = SHORT_MONTH_NAMES[month - 1] ?? parts[1];
  return `${name} ${year}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildPayPeriodKey(
  yearStr: string,
  monthStr: string,
  bucket: "1_14" | "15_eom"
): string {
  return `${yearStr}-${monthStr}-${bucket}`;
}

function buildPayPeriodLabel(
  yearStr: string,
  monthStr: string,
  bucket: "1_14" | "15_eom"
): string {
  const month = Number(monthStr);
  const year = Number(yearStr);
  const name = SHORT_MONTH_NAMES[month - 1] ?? monthStr;
  if (bucket === "1_14") {
    return `${name} 1\u201314`;
  }
  const lastDay = lastDayOfMonth(year, month);
  return `${name} 15\u2013${lastDay}`;
}

function payPeriodBucketForDate(dateStr: string): "1_14" | "15_eom" {
  const d = parseDateOnly(dateStr);
  if (!d) return "15_eom";
  const day = Number(d.slice(8, 10));
  return day <= 14 ? "1_14" : "15_eom";
}

/** Compute the effective start/end dates for filtering, respecting both
 *  cashflowStartDate and explicit startDate/endDate. */
function effectiveDateBounds(options: ExpenseChartDataOptions): {
  start: string | null;
  end: string | null;
} {
  const candidates: string[] = [];
  if (options.cashflowStartDate) candidates.push(options.cashflowStartDate);
  if (options.startDate) candidates.push(options.startDate);

  const start = candidates.length > 0 ? candidates.sort()[candidates.length - 1] : null;
  const end = options.endDate ?? null;
  return { start, end };
}

function applyDateFilters(
  expenses: ReadonlyArray<ManualExpense>,
  options: ExpenseChartDataOptions
): ManualExpense[] {
  const { start, end } = effectiveDateBounds(options);
  if (!start && !end) return [...expenses];
  return expenses.filter((expense) => {
    const d = parseDateOnly(expense.expense_date);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

/** Signed amount: decrease-adjustments are negative, all others positive. */
function signedAmount(expense: ManualExpense): number {
  return expense.adjustment_direction === "decrease"
    ? -expense.amount
    : expense.amount;
}

/** Advance a YYYY-MM key by one calendar month. */
function nextMonthKey(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Generate all YYYY-MM keys from startKey to endKey inclusive. */
function generateMonthKeyRange(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  let current = startKey;
  while (current <= endKey) {
    keys.push(current);
    current = nextMonthKey(current);
  }
  return keys;
}

/** Generate all (monthKey, bucket) pay period keys from startKey to endKey inclusive. */
function generatePayPeriodKeyRange(
  startKey: string,
  endKey: string
): Array<{ monthKey: string; bucket: "1_14" | "15_eom" }> {
  const months = generateMonthKeyRange(startKey, endKey);
  const pairs: Array<{ monthKey: string; bucket: "1_14" | "15_eom" }> = [];
  for (const mk of months) {
    pairs.push({ monthKey: mk, bucket: "1_14" });
    pairs.push({ monthKey: mk, bucket: "15_eom" });
  }
  return pairs;
}

/** Compare pay period keys so that "1_14" always precedes "15_eom" within the
 *  same month. Plain lexicographic order is wrong because "15_eom" < "1_14"
 *  (ASCII "5" < "_"). */
function comparePayPeriodKeys(a: string, b: string): number {
  const aMonth = a.slice(0, 7);
  const bMonth = b.slice(0, 7);
  if (aMonth !== bMonth) return aMonth < bMonth ? -1 : 1;
  const aBucket = a.slice(8);
  const bBucket = b.slice(8);
  if (aBucket === bBucket) return 0;
  return aBucket === "1_14" ? -1 : 1;
}

const UNCATEGORIZED_LABEL = "Uncategorized";
const OTHER_LABEL = "Other";

function resolveCategoryName(expense: ManualExpense): string {
  const raw = expense.category?.trim();
  return raw || UNCATEGORIZED_LABEL;
}

// ---------------------------------------------------------------------------
// Helper 1 — expenses by category
// ---------------------------------------------------------------------------

/**
 * Groups ManualExpense rows by category and returns rows sorted descending
 * by net amount. Decrease-adjustments reduce the category total.
 *
 * Optionally limits to topCategoryCount, collapsing the rest into "Other".
 * percentages sum to ~100 of the rows returned (including Other if present).
 */
export function buildExpensesByCategoryChartData(
  expenses: ReadonlyArray<ManualExpense>,
  options: ExpenseChartDataOptions = {}
): ExpenseCategoryChartRow[] {
  const filtered = applyDateFilters(expenses, options);

  const totals = new Map<string, { amount: number; count: number }>();

  for (const expense of filtered) {
    const name = resolveCategoryName(expense);
    const amt = signedAmount(expense);
    const existing = totals.get(name) ?? { amount: 0, count: 0 };
    totals.set(name, {
      amount: roundCents(existing.amount + amt),
      count: existing.count + 1,
    });
  }

  let rows: ExpenseCategoryChartRow[] = [...totals.entries()]
    .map(([name, { amount, count }]) => ({
      categoryId: null as null,
      categoryName: name,
      amount,
      transactionCount: count,
      percentage: 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topN = options.topCategoryCount;
  if (topN && topN > 0 && rows.length > topN) {
    const top = rows.slice(0, topN);
    const rest = rows.slice(topN);
    if (options.includeOtherCategory !== false) {
      const otherAmount = roundCents(rest.reduce((sum, r) => sum + r.amount, 0));
      const otherCount = rest.reduce((sum, r) => sum + r.transactionCount, 0);
      top.push({
        categoryId: null,
        categoryName: OTHER_LABEL,
        amount: otherAmount,
        transactionCount: otherCount,
        percentage: 0,
      });
    }
    rows = top;
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  if (total !== 0) {
    rows = rows.map((r) => ({
      ...r,
      percentage: roundCents((r.amount / total) * 100),
    }));
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Helper 2 — expenses by month
// ---------------------------------------------------------------------------

/**
 * Groups ManualExpense rows by calendar month (YYYY-MM), sorted ascending.
 * Optionally fills empty months between the range start and end.
 */
export function buildExpensesByMonthChartData(
  expenses: ReadonlyArray<ManualExpense>,
  options: ExpenseChartDataOptions = {}
): ExpenseMonthlyChartRow[] {
  const filtered = applyDateFilters(expenses, options);

  const totals = new Map<string, { amount: number; count: number }>();

  for (const expense of filtered) {
    const mk = toMonthKey(expense.expense_date);
    if (!mk) continue;
    const existing = totals.get(mk) ?? { amount: 0, count: 0 };
    totals.set(mk, {
      amount: roundCents(existing.amount + signedAmount(expense)),
      count: existing.count + 1,
    });
  }

  if (totals.size === 0 && !options.includeEmptyPeriods) {
    return [];
  }

  const sortedKeys = [...totals.keys()].sort();

  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;

  const { start: filterStart, end: filterEnd } = effectiveDateBounds(options);

  if (options.includeEmptyPeriods) {
    rangeStart =
      filterStart
        ? toMonthKey(filterStart)
        : sortedKeys[0] ?? null;
    rangeEnd =
      filterEnd
        ? toMonthKey(filterEnd)
        : sortedKeys[sortedKeys.length - 1] ?? null;
  }

  const keys =
    options.includeEmptyPeriods && rangeStart && rangeEnd
      ? generateMonthKeyRange(rangeStart, rangeEnd)
      : sortedKeys;

  return keys.map((mk) => {
    const data = totals.get(mk);
    return {
      monthKey: mk,
      monthLabel: monthKeyToLabel(mk),
      amount: data?.amount ?? 0,
      transactionCount: data?.count ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Helper 3 — expenses by pay period
// ---------------------------------------------------------------------------

/**
 * Groups ManualExpense rows by the app's "1_14" / "15_eom" pay period
 * buckets within each month, sorted ascending.
 * Uses the expense's stored period_bucket field.
 */
export function buildExpensesByPayPeriodChartData(
  expenses: ReadonlyArray<ManualExpense>,
  options: ExpenseChartDataOptions = {}
): ExpensePayPeriodChartRow[] {
  const filtered = applyDateFilters(expenses, options);

  const totals = new Map<
    string,
    { monthKey: string; bucket: "1_14" | "15_eom"; amount: number; count: number }
  >();

  for (const expense of filtered) {
    const mk = toMonthKey(expense.expense_date);
    if (!mk) continue;
    const bucket = expense.period_bucket ?? payPeriodBucketForDate(expense.expense_date);
    const [yearStr, monthStr] = mk.split("-");
    const pk = buildPayPeriodKey(yearStr, monthStr, bucket);
    const existing = totals.get(pk) ?? { monthKey: mk, bucket, amount: 0, count: 0 };
    totals.set(pk, {
      ...existing,
      amount: roundCents(existing.amount + signedAmount(expense)),
      count: existing.count + 1,
    });
  }

  if (totals.size === 0 && !options.includeEmptyPeriods) {
    return [];
  }

  const sortedKeys = [...totals.keys()].sort(comparePayPeriodKeys);

  let rangeMonthStart: string | null = null;
  let rangeMonthEnd: string | null = null;

  const { start: filterStart, end: filterEnd } = effectiveDateBounds(options);

  if (options.includeEmptyPeriods) {
    rangeMonthStart =
      filterStart
        ? toMonthKey(filterStart)
        : totals.size > 0
          ? [...totals.values()].map((v) => v.monthKey).sort()[0]
          : null;
    rangeMonthEnd =
      filterEnd
        ? toMonthKey(filterEnd)
        : totals.size > 0
          ? [...totals.values()].map((v) => v.monthKey).sort().pop() ?? null
          : null;
  }

  let periodPairs: Array<{ monthKey: string; bucket: "1_14" | "15_eom" }>;

  if (options.includeEmptyPeriods && rangeMonthStart && rangeMonthEnd) {
    periodPairs = generatePayPeriodKeyRange(rangeMonthStart, rangeMonthEnd);
  } else {
    periodPairs = sortedKeys.map((pk) => {
      const data = totals.get(pk)!;
      return { monthKey: data.monthKey, bucket: data.bucket };
    });
  }

  return periodPairs.map(({ monthKey, bucket }) => {
    const [yearStr, monthStr] = monthKey.split("-");
    const pk = buildPayPeriodKey(yearStr, monthStr, bucket);
    const data = totals.get(pk);
    return {
      periodKey: pk,
      periodLabel: buildPayPeriodLabel(yearStr, monthStr, bucket),
      monthKey,
      periodBucket: bucket,
      amount: data?.amount ?? 0,
      transactionCount: data?.count ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Helper 4 — stacked category by month
// ---------------------------------------------------------------------------

/**
 * Returns one row per calendar month with category amounts as series keys,
 * suitable for a Recharts stacked bar chart. Categories beyond topCategoryCount
 * are folded into "Other". All period/month ranges follow the same rules as
 * buildExpensesByMonthChartData.
 */
export function buildExpenseCategoryByMonthChartData(
  expenses: ReadonlyArray<ManualExpense>,
  options: ExpenseChartDataOptions = {}
): ExpenseStackedCategoryPeriodRow[] {
  const filtered = applyDateFilters(expenses, options);

  const monthCategoryTotals = new Map<string, Map<string, number>>();

  for (const expense of filtered) {
    const mk = toMonthKey(expense.expense_date);
    if (!mk) continue;
    const cat = resolveCategoryName(expense);
    const amt = signedAmount(expense);
    if (!monthCategoryTotals.has(mk)) {
      monthCategoryTotals.set(mk, new Map());
    }
    const catMap = monthCategoryTotals.get(mk)!;
    catMap.set(cat, roundCents((catMap.get(cat) ?? 0) + amt));
  }

  const topCategories = resolveTopCategories(filtered, options);

  const { start: filterStart, end: filterEnd } = effectiveDateBounds(options);
  const allMonthKeys = [...monthCategoryTotals.keys()].sort();

  let keys: string[];
  if (options.includeEmptyPeriods) {
    const rangeStart =
      filterStart ? toMonthKey(filterStart) : allMonthKeys[0] ?? null;
    const rangeEnd =
      filterEnd ? toMonthKey(filterEnd) : allMonthKeys[allMonthKeys.length - 1] ?? null;
    keys = rangeStart && rangeEnd ? generateMonthKeyRange(rangeStart, rangeEnd) : allMonthKeys;
  } else {
    keys = allMonthKeys;
  }

  return keys.map((mk) => {
    const catMap = monthCategoryTotals.get(mk) ?? new Map<string, number>();
    const row: ExpenseStackedCategoryPeriodRow = {
      periodKey: mk,
      periodLabel: monthKeyToLabel(mk),
    };

    for (const cat of topCategories) {
      row[cat] = catMap.get(cat) ?? 0;
    }

    const hasOtherSlot =
      options.topCategoryCount && options.includeOtherCategory !== false;
    if (hasOtherSlot) {
      let otherAmount = 0;
      for (const [cat, amt] of catMap.entries()) {
        if (!topCategories.includes(cat)) {
          otherAmount = roundCents(otherAmount + amt);
        }
      }
      if (otherAmount !== 0) {
        row[OTHER_LABEL] = otherAmount;
      }
    }

    return row;
  });
}

// ---------------------------------------------------------------------------
// Helper 5 — stacked category by pay period
// ---------------------------------------------------------------------------

/**
 * Returns one row per pay period with category amounts as series keys,
 * suitable for a Recharts stacked bar chart. Follows the same rules as
 * buildExpensesByPayPeriodChartData but adds category series keys.
 */
export function buildExpenseCategoryByPayPeriodChartData(
  expenses: ReadonlyArray<ManualExpense>,
  options: ExpenseChartDataOptions = {}
): ExpenseStackedCategoryPeriodRow[] {
  const filtered = applyDateFilters(expenses, options);

  const periodCategoryTotals = new Map<
    string,
    { monthKey: string; bucket: "1_14" | "15_eom"; catMap: Map<string, number> }
  >();

  for (const expense of filtered) {
    const mk = toMonthKey(expense.expense_date);
    if (!mk) continue;
    const bucket = expense.period_bucket ?? payPeriodBucketForDate(expense.expense_date);
    const [yearStr, monthStr] = mk.split("-");
    const pk = buildPayPeriodKey(yearStr, monthStr, bucket);
    const cat = resolveCategoryName(expense);
    const amt = signedAmount(expense);

    if (!periodCategoryTotals.has(pk)) {
      periodCategoryTotals.set(pk, { monthKey: mk, bucket, catMap: new Map() });
    }
    const entry = periodCategoryTotals.get(pk)!;
    entry.catMap.set(cat, roundCents((entry.catMap.get(cat) ?? 0) + amt));
  }

  const topCategories = resolveTopCategories(filtered, options);

  const { start: filterStart, end: filterEnd } = effectiveDateBounds(options);
  const sortedPeriodKeys = [...periodCategoryTotals.keys()].sort(comparePayPeriodKeys);

  let periodPairs: Array<{ monthKey: string; bucket: "1_14" | "15_eom" }>;

  if (options.includeEmptyPeriods) {
    const allMonthKeys = [...periodCategoryTotals.values()].map((v) => v.monthKey).sort();
    const rangeMonthStart =
      filterStart ? toMonthKey(filterStart) : allMonthKeys[0] ?? null;
    const rangeMonthEnd =
      filterEnd ? toMonthKey(filterEnd) : allMonthKeys[allMonthKeys.length - 1] ?? null;
    periodPairs =
      rangeMonthStart && rangeMonthEnd
        ? generatePayPeriodKeyRange(rangeMonthStart, rangeMonthEnd)
        : sortedPeriodKeys.map((pk) => {
            const entry = periodCategoryTotals.get(pk)!;
            return { monthKey: entry.monthKey, bucket: entry.bucket };
          });
  } else {
    periodPairs = sortedPeriodKeys.map((pk) => {
      const entry = periodCategoryTotals.get(pk)!;
      return { monthKey: entry.monthKey, bucket: entry.bucket };
    });
  }

  return periodPairs.map(({ monthKey, bucket }) => {
    const [yearStr, monthStr] = monthKey.split("-");
    const pk = buildPayPeriodKey(yearStr, monthStr, bucket);
    const entry = periodCategoryTotals.get(pk);
    const catMap = entry?.catMap ?? new Map<string, number>();

    const row: ExpenseStackedCategoryPeriodRow = {
      periodKey: pk,
      periodLabel: buildPayPeriodLabel(yearStr, monthStr, bucket),
    };

    for (const cat of topCategories) {
      row[cat] = catMap.get(cat) ?? 0;
    }

    const hasOtherSlot =
      options.topCategoryCount && options.includeOtherCategory !== false;
    if (hasOtherSlot) {
      let otherAmount = 0;
      for (const [cat, amt] of catMap.entries()) {
        if (!topCategories.includes(cat)) {
          otherAmount = roundCents(otherAmount + amt);
        }
      }
      if (otherAmount !== 0) {
        row[OTHER_LABEL] = otherAmount;
      }
    }

    return row;
  });
}

// ---------------------------------------------------------------------------
// Internal: resolve top categories across all expenses for stacked charts
// ---------------------------------------------------------------------------

function resolveTopCategories(
  expenses: ReadonlyArray<ManualExpense>,
  options: ExpenseChartDataOptions
): string[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    const cat = resolveCategoryName(expense);
    totals.set(cat, roundCents((totals.get(cat) ?? 0) + signedAmount(expense)));
  }

  const sorted = [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([cat]) => cat);

  if (options.topCategoryCount && options.topCategoryCount > 0) {
    return sorted.slice(0, options.topCategoryCount);
  }

  return sorted;
}
