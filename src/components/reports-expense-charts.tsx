/**
 * CASHFLOW-CURSOR-131D — Expense charts for the Reports page.
 *
 * All chart data is derived from the five pure C131C helpers.
 * No Supabase reads or writes. No financial formula changes.
 * Privacy: helpers receive only the caller's already-filtered expenses.
 */
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import {
  buildExpensesByCategoryChartData,
  buildExpensesByMonthChartData,
  buildExpensesByPayPeriodChartData,
  buildExpenseCategoryByMonthChartData,
  buildExpenseCategoryByPayPeriodChartData,
} from "@/lib/report-chart-data";
import type {
  ExpenseCategoryChartRow,
  ExpenseMonthlyChartRow,
  ExpensePayPeriodChartRow,
  ExpenseStackedCategoryPeriodRow,
} from "@/lib/report-chart-data";
import type { ManualExpense } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import {
  ChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum categories shown before grouping into "Other". */
const TOP_CATEGORY_LIMIT = 10;

/**
 * Ten-color palette using shadcn CSS chart vars plus supplemental colors.
 * hsl(var(--chart-N)) resolves via the global theme; supplemental colors are
 * absolute so they work regardless of theme config.
 */
const PALETTE: readonly string[] = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8b5cf6",
  "#f59e0b",
  "#14b8a6",
  "#f43f5e",
  "#64748b",
];

// ---------------------------------------------------------------------------
// Stacked-data preparation
// ---------------------------------------------------------------------------

function sanitizedCatKey(index: number): string {
  return `cat${index}`;
}

function extractCatNamesFromRows(rows: ExpenseStackedCategoryPeriodRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== "periodKey" && key !== "periodLabel") {
        seen.add(key);
      }
    }
  }
  return [...seen];
}

type StackedDataRow = { periodLabel: string } & Record<string, number | string>;

interface PreparedStackedData {
  data: StackedDataRow[];
  catNames: string[];
  keys: string[];
  config: ChartConfig;
}

function prepareStackedData(rows: ExpenseStackedCategoryPeriodRow[]): PreparedStackedData {
  const catNames = extractCatNamesFromRows(rows);
  const keys = catNames.map((_, i) => sanitizedCatKey(i));
  const config: ChartConfig = {};
  catNames.forEach((name, i) => {
    config[keys[i]] = { label: name, color: PALETTE[i % PALETTE.length] };
  });
  const data: StackedDataRow[] = rows.map((row) => {
    const r: StackedDataRow = { periodLabel: row.periodLabel };
    catNames.forEach((name, i) => {
      r[keys[i]] = typeof row[name] === "number" ? (row[name] as number) : 0;
    });
    return r;
  });
  return { data, catNames, keys, config };
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      data-testid="reports-expense-chart-empty-state"
      role="status"
      aria-label="No expense data available"
      className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8 text-muted-foreground"
    >
      <BarChart2 className="h-10 w-10 opacity-25" aria-hidden="true" />
      <p className="text-sm">No expense data for this period.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip content components
// ---------------------------------------------------------------------------

/**
 * Recharts clones tooltip content elements and injects its own props
 * (active, payload, label). The index signature accepts recharts-injected
 * props without TypeScript errors.
 */
interface BaseTooltipProps {
  active?: boolean;
  [key: string]: unknown;
}

function CategoryTooltip({
  active,
  payload,
}: BaseTooltipProps & {
  payload?: Array<{ payload: ExpenseCategoryChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="grid min-w-36 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{row.categoryName}</p>
      <p className="tabular-nums">{formatCurrency(row.amount)}</p>
      {row.percentage > 0 && (
        <p className="text-muted-foreground">{row.percentage}% of total</p>
      )}
      <p className="text-muted-foreground">
        {row.transactionCount} transaction{row.transactionCount !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function MonthTooltip({
  active,
  payload,
}: BaseTooltipProps & {
  payload?: Array<{ payload: ExpenseMonthlyChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="grid min-w-32 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{row.monthLabel}</p>
      <p className="tabular-nums">{formatCurrency(row.amount)}</p>
      <p className="text-muted-foreground">
        {row.transactionCount} transaction{row.transactionCount !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function PeriodTooltip({
  active,
  payload,
}: BaseTooltipProps & {
  payload?: Array<{ payload: ExpensePayPeriodChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="grid min-w-32 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{row.periodLabel}</p>
      <p className="tabular-nums">{formatCurrency(row.amount)}</p>
      <p className="text-muted-foreground">
        {row.transactionCount} transaction{row.transactionCount !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function StackedTooltip({
  active,
  payload,
  label,
  config,
}: BaseTooltipProps & {
  payload?: Array<{ dataKey: string; value: number; color?: string }>;
  label?: string;
  config: ChartConfig;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value > 0);
  if (!items.length) return null;
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{label}</p>
      {items.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2">
          <div
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span className="max-w-32 truncate text-muted-foreground">
            {config[item.dataKey]?.label ?? item.dataKey}
          </span>
          <span className="ml-auto tabular-nums font-medium">
            {formatCurrency(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart sub-components
// ---------------------------------------------------------------------------

function ExpensesByCategoryChart({ rows }: { rows: ExpenseCategoryChartRow[] }) {
  if (rows.length === 0) return <EmptyState />;

  const config: ChartConfig = Object.fromEntries(
    rows.map((row, i) => [
      sanitizedCatKey(i),
      { label: row.categoryName, color: PALETTE[i % PALETTE.length] },
    ])
  );

  // Scale chart height with category count so bars are never cramped.
  const chartH = Math.max(240, rows.length * 42 + 32);

  return (
    <ChartContainer
      config={config}
      className="w-full"
      style={{ aspectRatio: "unset", height: chartH }}
      aria-label={`Horizontal bar chart — expenses by category, ${rows.length} categories`}
    >
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="categoryName"
          width={96}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          content={<CategoryTooltip />}
        />
        <Bar dataKey="amount" radius={[0, 3, 3, 0]}>
          {rows.map((row, i) => (
            <Cell key={row.categoryName} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

const MONTH_CONFIG: ChartConfig = {
  amount: { label: "Expenses", color: "hsl(var(--chart-1))" },
};

function ExpensesByMonthChart({ rows }: { rows: ExpenseMonthlyChartRow[] }) {
  if (rows.length === 0) return <EmptyState />;
  const angled = rows.length > 7;
  return (
    <ChartContainer
      config={MONTH_CONFIG}
      className="w-full"
      style={{ aspectRatio: "unset", minHeight: 240 }}
      aria-label={`Bar chart — expenses by month, ${rows.length} months`}
    >
      <BarChart
        data={rows}
        margin={{ top: 4, right: 8, bottom: angled ? 44 : 8, left: 4 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="monthLabel"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          angle={angled ? -30 : 0}
          textAnchor={angled ? "end" : "middle"}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          content={<MonthTooltip />}
        />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

const PAY_PERIOD_CONFIG: ChartConfig = {
  amount: { label: "Expenses", color: "hsl(var(--chart-2))" },
};

function ExpensesByPayPeriodChart({ rows }: { rows: ExpensePayPeriodChartRow[] }) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <ChartContainer
      config={PAY_PERIOD_CONFIG}
      className="w-full"
      style={{ aspectRatio: "unset", minHeight: 240 }}
      aria-label={`Bar chart — expenses by pay period, ${rows.length} periods`}
    >
      <BarChart
        data={rows}
        margin={{ top: 4, right: 8, bottom: 52, left: 4 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="periodLabel"
          tick={{ fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          angle={-30}
          textAnchor="end"
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          content={<PeriodTooltip />}
        />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

interface StackedCategoryChartProps {
  rows: ExpenseStackedCategoryPeriodRow[];
  /** Bottom margin in px for rotated tick labels. */
  bottomMargin: number;
  /** Whether to angle the X-axis tick labels. */
  angled: boolean;
  ariaLabel: string;
}

function StackedCategoryChart({
  rows,
  bottomMargin,
  angled,
  ariaLabel,
}: StackedCategoryChartProps) {
  if (rows.length === 0) return <EmptyState />;
  const { data, keys, config } = prepareStackedData(rows);
  return (
    <ChartContainer
      config={config}
      className="w-full"
      style={{ aspectRatio: "unset", minHeight: 280 }}
      aria-label={ariaLabel}
    >
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, bottom: bottomMargin, left: 4 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="periodLabel"
          tick={{ fontSize: angled ? 9 : 10 }}
          tickLine={false}
          axisLine={false}
          angle={angled ? -30 : 0}
          textAnchor={angled ? "end" : "middle"}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          content={<StackedTooltip config={config} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((key) => (
          <Bar key={key} dataKey={key} stackId="a" fill={`var(--color-${key})`} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ReportsExpenseChartsProps {
  expenses: ManualExpense[];
  cashflowStartDate: string | null;
  loading?: boolean;
}

export function ReportsExpenseCharts({
  expenses,
  cashflowStartDate,
  loading = false,
}: ReportsExpenseChartsProps) {
  const options = useMemo(
    () => ({
      cashflowStartDate: cashflowStartDate ?? undefined,
      topCategoryCount: TOP_CATEGORY_LIMIT,
      includeOtherCategory: true,
    }),
    [cashflowStartDate]
  );

  const categoryRows = useMemo(
    () => buildExpensesByCategoryChartData(expenses, options),
    [expenses, options]
  );

  const monthRows = useMemo(
    () => buildExpensesByMonthChartData(expenses, options),
    [expenses, options]
  );

  const payPeriodRows = useMemo(
    () => buildExpensesByPayPeriodChartData(expenses, options),
    [expenses, options]
  );

  const catByMonthRows = useMemo(
    () => buildExpenseCategoryByMonthChartData(expenses, options),
    [expenses, options]
  );

  const catByPeriodRows = useMemo(
    () => buildExpenseCategoryByPayPeriodChartData(expenses, options),
    [expenses, options]
  );

  return (
    <section
      data-testid="reports-expense-charts-section"
      aria-labelledby="expense-charts-heading"
      className="no-print mt-10"
    >
      <div className="mb-5">
        <h2
          id="expense-charts-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Expense Charts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual breakdown of your expenses across categories, months, and pay periods.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-60 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="category" data-testid="reports-expense-chart-tabs">
          <div className="mb-4 overflow-x-auto">
            <TabsList className="w-max">
              <TabsTrigger value="category">By Category</TabsTrigger>
              <TabsTrigger value="month">By Month</TabsTrigger>
              <TabsTrigger value="payperiod">By Pay Period</TabsTrigger>
              <TabsTrigger value="cat-by-month">Category × Month</TabsTrigger>
              <TabsTrigger value="cat-by-period">Category × Period</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="category">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Expenses by Category</CardTitle>
                <CardDescription>
                  Total spending per category, sorted largest to smallest
                  {categoryRows.length > 0
                    ? `. ${categoryRows.length} categor${categoryRows.length === 1 ? "y" : "ies"} shown.`
                    : "."}
                </CardDescription>
              </CardHeader>
              <CardContent data-testid="reports-expenses-by-category-chart">
                <ExpensesByCategoryChart rows={categoryRows} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="month">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Expenses by Month</CardTitle>
                <CardDescription>
                  Total expense amount per calendar month in chronological order.
                </CardDescription>
              </CardHeader>
              <CardContent data-testid="reports-expenses-by-month-chart">
                <ExpensesByMonthChart rows={monthRows} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payperiod">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Expenses by Pay Period</CardTitle>
                <CardDescription>
                  Total expense amount per pay period (1–14 and 15–end of month).
                </CardDescription>
              </CardHeader>
              <CardContent data-testid="reports-expenses-by-pay-period-chart">
                <ExpensesByPayPeriodChart rows={payPeriodRows} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cat-by-month">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Category Trends by Month</CardTitle>
                <CardDescription>
                  Stacked monthly totals per category. Up to {TOP_CATEGORY_LIMIT} categories
                  shown.
                </CardDescription>
              </CardHeader>
              <CardContent data-testid="reports-category-by-month-chart">
                <StackedCategoryChart
                  rows={catByMonthRows}
                  bottomMargin={catByMonthRows.length > 7 ? 44 : 8}
                  angled={catByMonthRows.length > 7}
                  ariaLabel="Stacked bar chart — category expenses by month"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cat-by-period">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Category Trends by Pay Period</CardTitle>
                <CardDescription>
                  Stacked pay-period totals per category. Up to {TOP_CATEGORY_LIMIT} categories
                  shown.
                </CardDescription>
              </CardHeader>
              <CardContent data-testid="reports-category-by-pay-period-chart">
                <StackedCategoryChart
                  rows={catByPeriodRows}
                  bottomMargin={52}
                  angled
                  ariaLabel="Stacked bar chart — category expenses by pay period"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
