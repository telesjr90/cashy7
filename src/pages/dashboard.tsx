import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { BillInstance } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  DollarSign,
  User,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import {
  activePeriodView,
  defaultPeriodViewForMonth,
  FUNDING_LABELS,
  paycheckIncome,
  PERIOD_LABELS,
  type PeriodView,
} from "@/lib/periods";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface PeriodSummary {
  bills: BillInstance[];
  telesTotal: number;
  nicoleTotal: number;
  householdTotal: number;
}

export function DashboardPage() {
  const { household } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bills, setBills] = useState<BillInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodView, setPeriodView] = useState<PeriodView>(() =>
    defaultPeriodViewForMonth(new Date())
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const fetchBills = useCallback(async () => {
    if (!household) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("bill_instances")
      .select("*")
      .eq("household_id", household.id)
      .eq("year", year)
      .eq("month", month);

    if (!error && data) {
      setBills(data as BillInstance[]);
    }
    setLoading(false);
  }, [household, year, month]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const togglePaid = async (bill: BillInstance) => {
    const { error } = await supabase
      .from("bill_instances")
      .update({ is_paid: !bill.is_paid })
      .eq("id", bill.id);

    if (!error) {
      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, is_paid: !b.is_paid } : b))
      );
    }
  };

  const getPeriodSummary = (periodBucket: "1_14" | "15_eom"): PeriodSummary => {
    const periodBills = bills.filter((b) => b.period_bucket === periodBucket);
    const telesTotal = periodBills.reduce((sum, b) => sum + Number(b.teles_amount), 0);
    const nicoleTotal = periodBills.reduce((sum, b) => sum + Number(b.nicole_amount), 0);
    const householdTotal = periodBills.reduce((sum, b) => sum + Number(b.amount), 0);

    return {
      bills: periodBills,
      telesTotal,
      nicoleTotal,
      householdTotal,
    };
  };

  const setViewedMonth = (newDate: Date) => {
    setCurrentDate(newDate);
    setPeriodView(defaultPeriodViewForMonth(newDate));
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setViewedMonth(newDate);
  };

  const goToCurrentMonth = () => {
    const now = new Date();
    setCurrentDate(now);
    setPeriodView(activePeriodView(now));
  };

  const isFirstPeriod = () => {
    const now = new Date();
    return now.getDate() <= 14;
  };

  const period1 = getPeriodSummary("1_14");
  const period2 = getPeriodSummary("15_eom");

  const showFirstPeriod = periodView === "1_14" || periodView === "full";
  const showSecondPeriod = periodView === "15_eom" || periodView === "full";

  const summaryTelesTotal =
    periodView === "full"
      ? period1.telesTotal + period2.telesTotal
      : periodView === "1_14"
        ? period1.telesTotal
        : period2.telesTotal;
  const summaryNicoleTotal =
    periodView === "full"
      ? period1.nicoleTotal + period2.nicoleTotal
      : periodView === "1_14"
        ? period1.nicoleTotal
        : period2.nicoleTotal;
  const summaryHouseholdTotal =
    periodView === "full"
      ? period1.householdTotal + period2.householdTotal
      : periodView === "1_14"
        ? period1.householdTotal
        : period2.householdTotal;
  const summaryIncome = paycheckIncome(periodView === "full" ? "full" : periodView);

  const summaryTitle =
    periodView === "full" ? "Monthly Summary" : `${PERIOD_LABELS[periodView]} Summary`;
  const summaryDescription =
    periodView === "full"
      ? `Total bills for ${MONTHS[month - 1]} ${year}`
      : `Bills for ${PERIOD_LABELS[periodView].toLowerCase()}, ${MONTHS[month - 1]} ${year}`;

  const periodCardCount = periodView === "full" ? 2 : 1;

  if (!household) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {household.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Household Cashflow Dashboard
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/bills/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Bill
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateMonth("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-4">
              <Select
                value={month.toString()}
                onValueChange={(value) => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(parseInt(value) - 1);
                  setViewedMonth(newDate);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={(i + 1).toString()}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={year.toString()}
                onValueChange={(value) => {
                  const newDate = new Date(currentDate);
                  newDate.setFullYear(parseInt(value));
                  setViewedMonth(newDate);
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" onClick={() => navigateMonth("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" onClick={goToCurrentMonth}>
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
          {(["1_14", "15_eom", "full"] as PeriodView[]).map((view) => (
            <Button
              key={view}
              size="sm"
              variant={periodView === view ? "default" : "outline"}
              onClick={() => setPeriodView(view)}
            >
              {view === "full" ? "Full month" : PERIOD_LABELS[view]}
            </Button>
          ))}
          <span className="text-xs italic text-muted-foreground">
            {FUNDING_LABELS[periodView]}
          </span>
        </div>

        {loading ? (
          <div className={`grid gap-6 ${periodView === "full" ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
            {Array.from({ length: periodCardCount }, (_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className={`grid gap-6 ${periodView === "full" ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
            {showFirstPeriod && (
              <PeriodCard
                title="1st - 14th"
                period="1_14"
                summary={period1}
                formatCurrency={formatCurrency}
                togglePaid={togglePaid}
                isCurrentPeriod={year === new Date().getFullYear() && month === new Date().getMonth() + 1 && isFirstPeriod()}
                paycheck={paycheckIncome("1_14")}
                fundingLabel={FUNDING_LABELS["1_14"]}
              />
            )}
            {showSecondPeriod && (
              <PeriodCard
                title="15th - End of Month"
                period="15_eom"
                summary={period2}
                formatCurrency={formatCurrency}
                togglePaid={togglePaid}
                isCurrentPeriod={year === new Date().getFullYear() && month === new Date().getMonth() + 1 && !isFirstPeriod()}
                paycheck={paycheckIncome("15_eom")}
                fundingLabel={FUNDING_LABELS["15_eom"]}
              />
            )}
          </div>
        )}

        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{summaryTitle}</CardTitle>
              <CardDescription>{summaryDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-3 rounded-lg border p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Teles Total</p>
                    <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                      {formatCurrency(summaryTelesTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Income {formatCurrency(summaryIncome.teles)}
                    </p>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      Leftover {formatCurrency(summaryIncome.teles - summaryTelesTotal)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Nicole Total</p>
                    <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                      {formatCurrency(summaryNicoleTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Income {formatCurrency(summaryIncome.nicole)}
                    </p>
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">
                      Leftover {formatCurrency(summaryIncome.nicole - summaryNicoleTotal)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Household Total</p>
                    <p className="text-2xl font-semibold">
                      {formatCurrency(summaryHouseholdTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Income {formatCurrency(summaryIncome.teles + summaryIncome.nicole)}
                    </p>
                    <p className="text-xs font-medium">
                      Leftover {formatCurrency(summaryIncome.teles + summaryIncome.nicole - summaryHouseholdTotal)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface PeriodCardProps {
  title: string;
  period: "1_14" | "15_eom";
  summary: PeriodSummary;
  formatCurrency: (amount: number) => string;
  togglePaid: (bill: BillInstance) => void;
  isCurrentPeriod: boolean;
  paycheck: { teles: number; nicole: number };
  fundingLabel: string;
}

function PeriodCard({
  title,
  summary,
  formatCurrency,
  togglePaid,
  isCurrentPeriod,
  paycheck,
  fundingLabel,
}: PeriodCardProps) {
  return (
    <Card className={isCurrentPeriod ? "ring-2 ring-primary" : ""}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>
              {summary.bills.length} bill{summary.bills.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          {isCurrentPeriod && (
            <Badge variant="default">Current Period</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground italic">{fundingLabel}</p>
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3">
          <div className="text-center">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Teles</p>
            <p className="text-sm font-semibold">{formatCurrency(summary.telesTotal)}</p>
            <p className="text-[10px] text-muted-foreground">
              Income {formatCurrency(paycheck.teles)}
            </p>
            <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
              Leftover {formatCurrency(paycheck.teles - summary.telesTotal)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-green-600 dark:text-green-400">Nicole</p>
            <p className="text-sm font-semibold">{formatCurrency(summary.nicoleTotal)}</p>
            <p className="text-[10px] text-muted-foreground">
              Income {formatCurrency(paycheck.nicole)}
            </p>
            <p className="text-[10px] font-medium text-green-600 dark:text-green-400">
              Leftover {formatCurrency(paycheck.nicole - summary.nicoleTotal)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-muted-foreground">Total</p>
            <p className="text-sm font-semibold">{formatCurrency(summary.householdTotal)}</p>
            <p className="text-[10px] text-muted-foreground">
              Income {formatCurrency(paycheck.teles + paycheck.nicole)}
            </p>
            <p className="text-[10px] font-medium">
              Leftover {formatCurrency(paycheck.teles + paycheck.nicole - summary.householdTotal)}
            </p>
          </div>
        </div>

        {summary.bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No bills for this period</p>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.bills.map((bill) => (
              <div
                key={bill.id}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  checked={bill.is_paid}
                  onCheckedChange={() => togglePaid(bill)}
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${bill.is_paid ? "line-through text-muted-foreground" : ""}`}>
                    {bill.name}
                  </p>
                  {bill.due_date && (
                    <p className="text-xs text-muted-foreground">
                      Due: {format(new Date(bill.due_date), "MMM d")}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">{formatCurrency(Number(bill.amount))}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className="text-blue-600 dark:text-blue-400">
                      {formatCurrency(Number(bill.teles_amount))}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-green-600 dark:text-green-400">
                      {formatCurrency(Number(bill.nicole_amount))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
