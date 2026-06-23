import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  calculateSafeToSpendBeforeSavings,
  resolveBillShareKeyForPerson,
  sumMyBillShareTotal,
  sumMyUnpaidBillShareTotal,
} from "@/lib/bill-share";
import { getManualExpenses, sumMyManualExpenseShareForView } from "@/lib/expenses";
import {
  buildBillInstanceNameLookup,
  buildDebtPaymentDescriptionLookup,
  buildManualExpenseDescriptionLookup,
  getBillInstancesByIds,
  getDebtPaymentsByIds,
  getMyCashPaymentTransactions,
  getPaidManualExpenseSourceIds,
} from "@/lib/payments";
import { getMyCashAdjustmentTransactions } from "@/lib/cash-adjustments";
import {
  buildAdjustmentManualExpenseDescriptionLookup,
  mapRecentCashActivityForDisplay,
  RECENT_CASH_ACTIVITY_DISPLAY_LIMIT,
  RECENT_CASH_ACTIVITY_FETCH_LIMIT,
  type RecentCashActivityDisplayRow,
} from "@/lib/cash-activity";
import { getHouseholdPeople } from "@/lib/user-person";
import type { Person } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { Bill, BillInstance, CashPaymentTransaction, ManualExpense } from "@/lib/types";
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
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatCurrency, formatDeductionAmount } from "@/lib/format";
import {
  calculateRemainingSavingsObligation,
  calculateSafeToSpendAfterSavings,
  getMySavingsContributions,
  getMySavingsGoalParticipants,
  getSavingsGoals,
  sumMySavingsContributionsForView,
  sumMySavingsTargetForView,
} from "@/lib/savings";
import {
  buildBillDrilldownRows,
  filterBillsForDashboardView,
} from "@/lib/dashboard-drilldowns";
import { buildMySavingsDrilldown } from "@/lib/dashboard-savings-drilldown";
import {
  buildDashboardBillViewLabel,
  buildUnpaidBillDrilldown,
} from "@/lib/dashboard-bill-drilldown";
import { buildManualExpenseDrilldown } from "@/lib/dashboard-expense-drilldown";
import {
  DashboardDrilldownPanel,
  type DashboardDrilldownKind,
  type SafeToSpendBreakdown,
} from "@/components/dashboard-drilldown-panel";
import { fetchDebtLinkedBillContext } from "@/lib/sync-bill-paid-status";
import type { SavingsGoal } from "@/lib/types";
import type { SavingsContribution, SavingsGoalParticipant } from "@/lib/types";
import { filterBillInstancesByCashflowStart } from "@/lib/cashflow-filter";
import { getHouseholdSettings, getMyLatestCashSnapshot } from "@/lib/cashflow-settings";
import type { CashSnapshot } from "@/lib/types";
import { syncBillPaidStatusWithDebt } from "@/lib/sync-bill-paid-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isEligibleBillTemplate } from "@/lib/bill-templates";
import {
  buildBillTemplateLookup,
  countVariableBillsNeedingConfirmationForDashboardView,
  VARIABLE_AMOUNT_DASHBOARD_WARNING,
} from "@/lib/variable-bills";
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

function formatActivityDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

interface PeriodSummary {
  bills: BillInstance[];
  telesTotal: number;
  nicoleTotal: number;
  householdTotal: number;
}

export function DashboardPage() {
  const { household, user, membership, refreshHousehold } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bills, setBills] = useState<BillInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashflowStartDate, setCashflowStartDate] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [cashSnapshot, setCashSnapshot] = useState<CashSnapshot | null>(null);
  const [cashSnapshotLoading, setCashSnapshotLoading] = useState(true);
  const [cashSnapshotError, setCashSnapshotError] = useState<string | null>(null);
  const [periodView, setPeriodView] = useState<PeriodView>(() =>
    defaultPeriodViewForMonth(new Date())
  );
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [savingsParticipants, setSavingsParticipants] = useState<SavingsGoalParticipant[]>([]);
  const [savingsParticipantsLoading, setSavingsParticipantsLoading] = useState(true);
  const [savingsParticipantsError, setSavingsParticipantsError] = useState<string | null>(null);
  const [savingsContributions, setSavingsContributions] = useState<SavingsContribution[]>([]);
  const [savingsContributionsLoading, setSavingsContributionsLoading] = useState(true);
  const [savingsContributionsError, setSavingsContributionsError] = useState<string | null>(null);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [manualExpensesLoading, setManualExpensesLoading] = useState(true);
  const [manualExpensesError, setManualExpensesError] = useState<string | null>(null);
  const [paymentTransactions, setPaymentTransactions] = useState<CashPaymentTransaction[]>([]);
  const [paymentTransactionsLoading, setPaymentTransactionsLoading] = useState(true);
  const [paymentTransactionsError, setPaymentTransactionsError] = useState<string | null>(null);
  const [recentCashActivityRows, setRecentCashActivityRows] = useState<
    RecentCashActivityDisplayRow[]
  >([]);
  const [recentCashActivityLoading, setRecentCashActivityLoading] = useState(true);
  const [recentCashActivityError, setRecentCashActivityError] = useState<string | null>(null);
  const [drilldownKind, setDrilldownKind] = useState<DashboardDrilldownKind | null>(
    null
  );
  const [debtLinkedBillIds, setDebtLinkedBillIds] = useState<Set<string>>(new Set());
  const [debtPaymentIdByBillId, setDebtPaymentIdByBillId] = useState<
    Map<string, string>
  >(new Map());
  const [billTemplates, setBillTemplates] = useState<
    Pick<Bill, "id" | "is_variable" | "default_amount">[]
  >([]);
  const [savingsGoalsForDrilldown, setSavingsGoalsForDrilldown] = useState<
    Pick<SavingsGoal, "id" | "name" | "goal_type">[]
  >([]);
  const [savingsGoalsForDrilldownLoading, setSavingsGoalsForDrilldownLoading] =
    useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const fetchCashSnapshot = useCallback(async () => {
    if (!household || !user) return;

    setCashSnapshotLoading(true);
    const { snapshot, error } = await getMyLatestCashSnapshot(household.id, user.id);
    if (error) {
      setCashSnapshotError(error);
      setCashSnapshot(null);
    } else {
      setCashSnapshotError(null);
      setCashSnapshot(snapshot);
    }
    setCashSnapshotLoading(false);
  }, [household, user]);

  const fetchSettings = useCallback(async () => {
    if (!household) return;

    setSettingsLoaded(false);
    const { settings, error } = await getHouseholdSettings(household.id);
    if (error) {
      setSettingsError(error);
      setCashflowStartDate(null);
      setSettingsLoaded(true);
      return;
    }

    setSettingsError(null);
    setCashflowStartDate(settings?.cashflow_start_date ?? null);
    setSettingsLoaded(true);
  }, [household]);

  const fetchBills = useCallback(async () => {
    if (!household || !settingsLoaded) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("bill_instances")
      .select("*")
      .eq("household_id", household.id)
      .eq("year", year)
      .eq("month", month);

    if (!error && data) {
      const fetchedBills = data as BillInstance[];
      setBills(filterBillInstancesByCashflowStart(fetchedBills, cashflowStartDate));
    }
    setLoading(false);
  }, [household, year, month, cashflowStartDate, settingsLoaded]);

  const fetchBillTemplates = useCallback(async () => {
    if (!household) return;

    const { data, error } = await supabase
      .from("bills")
      .select("id, is_variable, default_amount")
      .eq("household_id", household.id)
      .eq("recurring", true);

    if (!error && data) {
      setBillTemplates(
        (data as Bill[]).filter(isEligibleBillTemplate).map((template) => ({
          id: template.id,
          is_variable: template.is_variable,
          default_amount: template.default_amount,
        }))
      );
    }
  }, [household]);

  const fetchPeople = useCallback(async () => {
    if (!household) return;

    const { people: householdPeople, error } = await getHouseholdPeople(household.id);
    if (!error) {
      setPeople(householdPeople);
    }
    setPeopleLoaded(true);
  }, [household]);

  const fetchSavingsParticipants = useCallback(async () => {
    if (!household || !user) return;

    setSavingsParticipantsLoading(true);
    const { participants, error } = await getMySavingsGoalParticipants(
      household.id,
      user.id
    );
    if (error) {
      setSavingsParticipantsError(error);
      setSavingsParticipants([]);
    } else {
      setSavingsParticipantsError(null);
      setSavingsParticipants(participants);
    }
    setSavingsParticipantsLoading(false);
  }, [household, user]);

  const fetchSavingsContributions = useCallback(async () => {
    if (!household || !user) return;

    setSavingsContributionsLoading(true);
    const { contributions, error } = await getMySavingsContributions(
      household.id,
      user.id
    );
    if (error) {
      setSavingsContributionsError(error);
      setSavingsContributions([]);
    } else {
      setSavingsContributionsError(null);
      setSavingsContributions(contributions);
    }
    setSavingsContributionsLoading(false);
  }, [household, user]);

  const fetchManualExpenses = useCallback(async () => {
    if (!household) return;

    setManualExpensesLoading(true);
    const { expenses, error } = await getManualExpenses(household.id);
    if (error) {
      setManualExpensesError(error);
      setManualExpenses([]);
    } else {
      setManualExpensesError(null);
      setManualExpenses(expenses);
    }
    setManualExpensesLoading(false);
  }, [household]);

  const fetchPaymentTransactions = useCallback(async () => {
    if (!household || !user) return;

    setPaymentTransactionsLoading(true);
    const { transactions, error } = await getMyCashPaymentTransactions(
      household.id,
      user.id
    );
    if (error) {
      setPaymentTransactionsError(error);
      setPaymentTransactions([]);
    } else {
      setPaymentTransactionsError(null);
      setPaymentTransactions(transactions);
    }
    setPaymentTransactionsLoading(false);
  }, [household, user]);

  const fetchRecentCashActivity = useCallback(
    async (options?: { background?: boolean }) => {
      if (!household || !user) return;

      const background = options?.background ?? false;
      if (!background) {
        setRecentCashActivityLoading(true);
      }

      const [paymentResult, adjustmentResult, expensesResult] = await Promise.all([
        getMyCashPaymentTransactions(
          household.id,
          user.id,
          RECENT_CASH_ACTIVITY_FETCH_LIMIT
        ),
        getMyCashAdjustmentTransactions(
          household.id,
          user.id,
          RECENT_CASH_ACTIVITY_FETCH_LIMIT
        ),
        getManualExpenses(household.id),
      ]);

      const errors = [
        paymentResult.error,
        adjustmentResult.error,
        expensesResult.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        setRecentCashActivityError(
          errors[0] ?? "Failed to load recent cash activity."
        );
        if (!background) {
          setRecentCashActivityRows([]);
        }
        setRecentCashActivityLoading(false);
        return;
      }

      const billInstanceIds = paymentResult.transactions
        .filter((transaction) => transaction.source_type === "bill_instance")
        .map((transaction) => transaction.source_id);
      const uniqueBillInstanceIds = [...new Set(billInstanceIds)];

      const debtPaymentIds = paymentResult.transactions
        .filter((transaction) => transaction.source_type === "debt_payment")
        .map((transaction) => transaction.source_id);
      const uniqueDebtPaymentIds = [...new Set(debtPaymentIds)];

      const [billInstancesResult, debtPaymentsResult] = await Promise.all([
        getBillInstancesByIds(household.id, uniqueBillInstanceIds),
        getDebtPaymentsByIds(household.id, uniqueDebtPaymentIds),
      ]);

      const lookupErrors = [
        billInstancesResult.error,
        debtPaymentsResult.error,
      ].filter(Boolean);

      if (lookupErrors.length > 0) {
        setRecentCashActivityError(
          lookupErrors[0] ?? "Failed to load recent cash activity."
        );
        if (!background) {
          setRecentCashActivityRows([]);
        }
        setRecentCashActivityLoading(false);
        return;
      }

      setRecentCashActivityError(null);
      setRecentCashActivityRows(
        mapRecentCashActivityForDisplay({
          deductions: paymentResult.transactions,
          credits: adjustmentResult.transactions,
          lookups: {
            billInstanceNameById: buildBillInstanceNameLookup(
              billInstancesResult.billInstances
            ),
            debtPaymentDescriptionById: buildDebtPaymentDescriptionLookup(
              debtPaymentsResult.debtPayments
            ),
            manualExpenseDescriptionById: buildManualExpenseDescriptionLookup(
              expensesResult.expenses
            ),
            adjustmentManualExpenseDescriptionById:
              buildAdjustmentManualExpenseDescriptionLookup(expensesResult.expenses),
          },
          limit: RECENT_CASH_ACTIVITY_DISPLAY_LIMIT,
        })
      );
      setRecentCashActivityLoading(false);
    },
    [household, user]
  );

  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const skipInitialFocusRef = useRef(true);

  const refreshDashboardData = useCallback(
    async (options?: { background?: boolean }) => {
      if (!household || !user) return;
      if (refreshInFlightRef.current) return;

      const now = Date.now();
      if (now - lastRefreshAtRef.current < 500) return;

      refreshInFlightRef.current = true;
      lastRefreshAtRef.current = now;
      const background = options?.background ?? true;

      try {
        await refreshHousehold();

        const { settings, error: settingsFetchError } = await getHouseholdSettings(
          household.id
        );
        const nextCashflowStartDate = settings?.cashflow_start_date ?? null;

        const [
          snapshotResult,
          billsResult,
          expensesResult,
          transactionsResult,
          participantsResult,
          contributionsResult,
        ] = await Promise.all([
          getMyLatestCashSnapshot(household.id, user.id),
          supabase
            .from("bill_instances")
            .select("*")
            .eq("household_id", household.id)
            .eq("year", year)
            .eq("month", month),
          getManualExpenses(household.id),
          getMyCashPaymentTransactions(household.id, user.id),
          getMySavingsGoalParticipants(household.id, user.id),
          getMySavingsContributions(household.id, user.id),
        ]);

        if (settingsFetchError) {
          setSettingsError(settingsFetchError);
          if (!background) {
            setCashflowStartDate(null);
          }
        } else {
          setSettingsError(null);
          setCashflowStartDate(nextCashflowStartDate);
        }

        const { snapshot, error: snapshotError } = snapshotResult;
        if (snapshotError) {
          setCashSnapshotError(snapshotError);
          if (!background) {
            setCashSnapshot(null);
          }
        } else {
          setCashSnapshotError(null);
          setCashSnapshot(snapshot);
        }

        const { error: billsError, data: billsData } = billsResult;
        if (billsError) {
          if (!background) {
            setBills([]);
          }
        } else if (billsData) {
          const fetchedBills = billsData as BillInstance[];
          setBills(
            filterBillInstancesByCashflowStart(fetchedBills, nextCashflowStartDate)
          );
        }

        const { expenses, error: expensesError } = expensesResult;
        if (expensesError) {
          setManualExpensesError(expensesError);
          if (!background) {
            setManualExpenses([]);
          }
        } else {
          setManualExpensesError(null);
          setManualExpenses(expenses);
        }

        const { transactions, error: transactionsError } = transactionsResult;
        if (transactionsError) {
          setPaymentTransactionsError(transactionsError);
          if (!background) {
            setPaymentTransactions([]);
          }
        } else {
          setPaymentTransactionsError(null);
          setPaymentTransactions(transactions);
        }

        const { participants, error: participantsError } = participantsResult;
        if (participantsError) {
          setSavingsParticipantsError(participantsError);
          if (!background) {
            setSavingsParticipants([]);
          }
        } else {
          setSavingsParticipantsError(null);
          setSavingsParticipants(participants);
        }

        const { contributions, error: contributionsError } = contributionsResult;
        if (contributionsError) {
          setSavingsContributionsError(contributionsError);
          if (!background) {
            setSavingsContributions([]);
          }
        } else {
          setSavingsContributionsError(null);
          setSavingsContributions(contributions);
        }

        await fetchRecentCashActivity({ background: true });
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [household, user, year, month, refreshHousehold, fetchRecentCashActivity]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      skipInitialFocusRef.current = false;
    }, 0);

    const handleFocus = () => {
      if (skipInitialFocusRef.current) return;
      void refreshDashboardData({ background: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshDashboardData({ background: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshDashboardData]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  useEffect(() => {
    void fetchBillTemplates();
  }, [fetchBillTemplates]);

  useEffect(() => {
    fetchSavingsParticipants();
  }, [fetchSavingsParticipants]);

  useEffect(() => {
    fetchSavingsContributions();
  }, [fetchSavingsContributions]);

  useEffect(() => {
    fetchManualExpenses();
  }, [fetchManualExpenses]);

  useEffect(() => {
    fetchPaymentTransactions();
  }, [fetchPaymentTransactions]);

  useEffect(() => {
    fetchRecentCashActivity();
  }, [fetchRecentCashActivity]);

  useEffect(() => {
    fetchCashSnapshot();
  }, [fetchCashSnapshot]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  useEffect(() => {
    let cancelled = false;

    async function loadDebtLinkedBillIds() {
      if (bills.length === 0) {
        if (!cancelled) {
          setDebtLinkedBillIds(new Set());
        }
        return;
      }

      const { linkedIds, debtPaymentIdByBillId: linkedDebtPaymentsByBillId } =
        await fetchDebtLinkedBillContext(bills.map((bill) => bill.id));
      if (!cancelled) {
        setDebtLinkedBillIds(linkedIds);
        setDebtPaymentIdByBillId(linkedDebtPaymentsByBillId);
      }
    }

    void loadDebtLinkedBillIds();

    return () => {
      cancelled = true;
    };
  }, [bills]);

  useEffect(() => {
    if (drilldownKind !== "savings") {
      return;
    }

    const householdId = household?.id;
    if (!householdId) {
      return;
    }

    let cancelled = false;

    async function loadSavingsGoalsForDrilldown(resolvedHouseholdId: string) {
      setSavingsGoalsForDrilldownLoading(true);
      const { goals, error } = await getSavingsGoals(resolvedHouseholdId);
      if (!cancelled) {
        if (!error) {
          setSavingsGoalsForDrilldown(
            goals.map((goal) => ({
              id: goal.id,
              name: goal.name,
              goal_type: goal.goal_type,
            }))
          );
        }
        setSavingsGoalsForDrilldownLoading(false);
      }
    }

    void loadSavingsGoalsForDrilldown(householdId);

    return () => {
      cancelled = true;
    };
  }, [drilldownKind, household]);

  const variableBillContext = useMemo(
    () => ({
      templateByBillId: buildBillTemplateLookup(billTemplates),
      debtLinkedBillIds,
    }),
    [billTemplates, debtLinkedBillIds]
  );

  const variableConfirmationCountForView = useMemo(
    () =>
      countVariableBillsNeedingConfirmationForDashboardView({
        instances: bills,
        context: variableBillContext,
        periodView,
        year,
        month,
      }),
    [bills, variableBillContext, periodView, year, month]
  );

  const openDrilldown = (kind: DashboardDrilldownKind) => {
    setDrilldownKind(kind);
  };

  const togglePaid = async (bill: BillInstance) => {
    const newPaidStatus = !bill.is_paid;
    const { error } = await syncBillPaidStatusWithDebt(
      bill.id,
      bill.is_paid,
      newPaidStatus
    );

    if (!error) {
      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, is_paid: newPaidStatus } : b))
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

  const mappedPerson =
    membership?.person_id != null
      ? people.find((person) => person.id === membership.person_id) ?? null
      : null;
  const shareKey = resolveBillShareKeyForPerson(mappedPerson);
  const showBudgetProfileNote = peopleLoaded && shareKey === null;
  const myBillTotal = sumMyBillShareTotal(bills, shareKey, periodView);
  const myBillTotalViewLabel =
    periodView === "full" ? "Full Month" : PERIOD_LABELS[periodView];
  const drilldownViewLabel = buildDashboardBillViewLabel(year, month, periodView);
  const myUnpaidBillTotal = sumMyUnpaidBillShareTotal(bills, shareKey, periodView);
  const deductedManualExpenseIds = getPaidManualExpenseSourceIds(paymentTransactions);
  const myManualExpenseTotalForView = sumMyManualExpenseShareForView(
    manualExpenses,
    shareKey,
    periodView,
    year,
    month,
    cashSnapshot?.snapshot_date ?? null,
    paymentTransactionsLoading ? undefined : deductedManualExpenseIds
  );
  const safeToSpendBeforeSavings =
    cashSnapshot &&
    shareKey !== null &&
    myUnpaidBillTotal !== null &&
    myManualExpenseTotalForView !== null
      ? calculateSafeToSpendBeforeSavings(
          Number(cashSnapshot.amount),
          myUnpaidBillTotal,
          myManualExpenseTotalForView
        )
      : null;
  const safeToSpendViewLabel = myBillTotalViewLabel;
  const mySavingsTargetForView = sumMySavingsTargetForView(
    savingsParticipants,
    periodView,
    year,
    month
  );
  const myContributionsForView = sumMySavingsContributionsForView(
    savingsContributions,
    savingsParticipants,
    periodView,
    year,
    month
  );
  const remainingSavingsObligationForView = calculateRemainingSavingsObligation(
    mySavingsTargetForView,
    myContributionsForView
  );
  const safeToSpendAfterSavings =
    safeToSpendBeforeSavings !== null
      ? calculateSafeToSpendAfterSavings(
          safeToSpendBeforeSavings,
          remainingSavingsObligationForView
        )
      : null;
  const hasSavingsParticipants = savingsParticipants.length > 0;

  const paymentByBillId = useMemo(() => {
    const map = new Map<string, CashPaymentTransaction>();
    for (const transaction of paymentTransactions) {
      if (transaction.source_type === "bill_instance") {
        map.set(transaction.source_id, transaction);
      }
    }
    return map;
  }, [paymentTransactions]);

  const paymentByDebtPaymentId = useMemo(() => {
    const map = new Map<string, CashPaymentTransaction>();
    for (const transaction of paymentTransactions) {
      if (transaction.source_type === "debt_payment") {
        map.set(transaction.source_id, transaction);
      }
    }
    return map;
  }, [paymentTransactions]);

  const billCashDeductionContext = useMemo(
    () =>
      paymentTransactionsLoading
        ? null
        : {
            billPaymentSourceIds: paymentByBillId,
            debtPaymentTransactionSourceIds: paymentByDebtPaymentId,
            debtPaymentIdByBillId,
          },
    [
      paymentTransactionsLoading,
      paymentByBillId,
      paymentByDebtPaymentId,
      debtPaymentIdByBillId,
    ]
  );

  const unpaidBillDrilldown = useMemo(() => {
    if (shareKey === null) {
      return null;
    }

    return buildUnpaidBillDrilldown({
      bills,
      periodView,
      shareKey,
      debtLinkedBillIds,
      variableBillContext,
      cardTotal: myUnpaidBillTotal ?? 0,
      cashDeductionContext: billCashDeductionContext,
    });
  }, [
    bills,
    periodView,
    shareKey,
    debtLinkedBillIds,
    variableBillContext,
    myUnpaidBillTotal,
    billCashDeductionContext,
  ]);

  const manualExpenseDrilldown = useMemo(() => {
    if (shareKey === null) {
      return null;
    }

    return buildManualExpenseDrilldown({
      expenses: manualExpenses,
      periodView,
      selectedYear: year,
      selectedMonth: month,
      snapshotDate: cashSnapshot?.snapshot_date ?? null,
      shareKey,
      cardTotal: myManualExpenseTotalForView ?? 0,
      deductedManualExpenseIds: paymentTransactionsLoading
        ? undefined
        : deductedManualExpenseIds,
      people,
    });
  }, [
    manualExpenses,
    periodView,
    year,
    month,
    cashSnapshot?.snapshot_date,
    shareKey,
    myManualExpenseTotalForView,
    paymentTransactionsLoading,
    deductedManualExpenseIds,
    people,
  ]);

  const drilldownBills = filterBillsForDashboardView(bills, periodView);
  const drilldownBillRows = buildBillDrilldownRows(
    drilldownBills,
    shareKey,
    debtLinkedBillIds
  );
  const savingsDrilldown = useMemo(() => {
    if (!user) {
      return null;
    }

    return buildMySavingsDrilldown({
      participants: savingsParticipants,
      contributions: savingsContributions,
      visibleGoals: savingsGoalsForDrilldown,
      periodView,
      selectedYear: year,
      selectedMonth: month,
      signedInUserId: user.id,
      cardRemainingObligationTotal: remainingSavingsObligationForView,
      paymentTransactions,
      cashDeductionContextAvailable: !paymentTransactionsLoading,
    });
  }, [
    user,
    savingsParticipants,
    savingsContributions,
    savingsGoalsForDrilldown,
    periodView,
    year,
    month,
    remainingSavingsObligationForView,
    paymentTransactions,
    paymentTransactionsLoading,
  ]);
  const safeToSpendBreakdown: SafeToSpendBreakdown | null =
    cashSnapshot && safeToSpendBeforeSavings !== null && safeToSpendAfterSavings !== null
      ? {
          currentAmount: Number(cashSnapshot.amount),
          unpaidBillTotal: myUnpaidBillTotal ?? 0,
          manualExpenseTotal: myManualExpenseTotalForView ?? 0,
          safeToSpendBeforeSavings,
          savingsTarget: mySavingsTargetForView,
          savingsContributions: myContributionsForView,
          remainingSavingsObligation: remainingSavingsObligationForView,
          safeToSpendAfterSavings,
        }
      : null;
  const drilldownEmptyMessage =
    shareKey === null &&
    (drilldownKind === "bills" ||
      drilldownKind === "unpaid-bills" ||
      drilldownKind === "expenses" ||
      drilldownKind === "safe-to-spend-before" ||
      drilldownKind === "safe-to-spend-after")
      ? "Choose your budget profile in Settings to see private drilldown details."
      : !cashSnapshot &&
          (drilldownKind === "expenses" ||
            drilldownKind === "safe-to-spend-before" ||
            drilldownKind === "safe-to-spend-after")
        ? "Record your current amount in Settings to see expense and safe-to-spend details."
        : undefined;
  const drilldownLoading =
    drilldownKind === "savings"
      ? savingsGoalsForDrilldownLoading ||
        savingsParticipantsLoading ||
        savingsContributionsLoading
      : drilldownKind === "bills" || drilldownKind === "unpaid-bills"
        ? loading
        : drilldownKind === "expenses"
          ? manualExpensesLoading || paymentTransactionsLoading || cashSnapshotLoading
          : drilldownKind === "safe-to-spend-before" ||
              drilldownKind === "safe-to-spend-after"
            ? cashSnapshotLoading ||
              loading ||
              manualExpensesLoading ||
              paymentTransactionsLoading ||
              savingsParticipantsLoading ||
              savingsContributionsLoading
            : false;

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
        {settingsError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              Could not load cashflow settings. Dashboard totals may include bills
              before your cashflow start date. ({settingsError})
            </AlertDescription>
          </Alert>
        )}

        {cashflowStartDate && (
          <p className="mb-4 text-xs text-muted-foreground">
            Ignoring bills before {format(parseISO(cashflowStartDate), "MMM d, yyyy")}
          </p>
        )}

        {showBudgetProfileNote && (
          <Alert className="mb-4">
            <AlertDescription>
              Choose your budget profile in{" "}
              <Link to="/settings" className="font-medium underline underline-offset-4">
                Settings
              </Link>{" "}
              to enable private calculations.
            </AlertDescription>
          </Alert>
        )}

        {variableConfirmationCountForView > 0 && (
          <Alert className="mb-4 border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {variableConfirmationCountForView} variable bill
              {variableConfirmationCountForView === 1 ? "" : "s"} in this view still
              need a confirmed amount. {VARIABLE_AMOUNT_DASHBOARD_WARNING}{" "}
              <Link
                to="/bills"
                className="font-medium underline underline-offset-4 text-amber-950 dark:text-amber-100"
              >
                Confirm on Bills
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your current available amount</CardTitle>
          </CardHeader>
          <CardContent>
            {cashSnapshotError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load your current available amount. ({cashSnapshotError})
                </AlertDescription>
              </Alert>
            )}
            {cashSnapshotLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : cashSnapshot ? (
              <div className="space-y-1">
                <p className="text-2xl font-semibold">
                  {formatCurrency(Number(cashSnapshot.amount))}
                </p>
                <p className="text-sm text-muted-foreground">
                  Snapshot date: {cashSnapshot.snapshot_date}
                </p>
                {cashSnapshot.notes && (
                  <p className="text-sm text-muted-foreground">{cashSnapshot.notes}</p>
                )}
              </div>
            ) : !cashSnapshotError ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  No current amount recorded yet.
                </p>
                <Link to="/settings">
                  <Button variant="link" className="h-auto p-0">
                    Record it in Settings
                  </Button>
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent cash activity</CardTitle>
            <CardDescription>Recent changes to your current amount.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentCashActivityError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load recent cash activity. ({recentCashActivityError})
                </AlertDescription>
              </Alert>
            )}
            {recentCashActivityLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : recentCashActivityRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cash activity yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentCashActivityRows.map((activity) => (
                  <li
                    key={activity.id}
                    className="rounded-md bg-muted/40 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{activity.amountLabel}</span>
                      <span className="text-muted-foreground">
                        {formatActivityDate(activity.date)}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {activity.typeLabel} · {activity.sourceLabel} · {activity.description}
                    </p>
                    {activity.notes && (
                      <p className="mt-1 text-muted-foreground">{activity.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">My bill total for this view</CardTitle>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => openDrilldown("bills")}
              >
                View bills
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {shareKey === null ? (
              <p className="text-sm text-muted-foreground">
                Choose your budget profile in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see your bill total.
              </p>
            ) : loading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div className="space-y-1">
                <p className="text-2xl font-semibold">
                  {formatCurrency(myBillTotal ?? 0)}
                </p>
                <p className="text-sm text-muted-foreground">{myBillTotalViewLabel}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className={`mb-6 ${shareKey !== null && !loading ? "cursor-pointer transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""}`}
          role={shareKey !== null && !loading ? "button" : undefined}
          tabIndex={shareKey !== null && !loading ? 0 : undefined}
          onClick={() => {
            if (shareKey !== null && !loading) {
              openDrilldown("unpaid-bills");
            }
          }}
          onKeyDown={(event) => {
            if (
              shareKey !== null &&
              !loading &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              openDrilldown("unpaid-bills");
            }
          }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">My unpaid bills for this view</CardTitle>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  openDrilldown("unpaid-bills");
                }}
              >
                View unpaid bills
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {shareKey === null ? (
              <p className="text-sm text-muted-foreground">
                Choose your budget profile in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see your unpaid bill total.
              </p>
            ) : loading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div className="space-y-1">
                <p className="text-2xl font-semibold">
                  {formatDeductionAmount(myUnpaidBillTotal ?? 0)}
                </p>
                <p className="text-sm text-muted-foreground">{myBillTotalViewLabel}</p>
                <p className="text-xs text-muted-foreground">
                  Only bills not marked paid are included.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className={`mb-6 ${
            shareKey !== null &&
            cashSnapshot &&
            !cashSnapshotLoading &&
            !manualExpensesLoading &&
            !paymentTransactionsLoading
              ? "cursor-pointer transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : ""
          }`}
          role={
            shareKey !== null &&
            cashSnapshot &&
            !cashSnapshotLoading &&
            !manualExpensesLoading &&
            !paymentTransactionsLoading
              ? "button"
              : undefined
          }
          tabIndex={
            shareKey !== null &&
            cashSnapshot &&
            !cashSnapshotLoading &&
            !manualExpensesLoading &&
            !paymentTransactionsLoading
              ? 0
              : undefined
          }
          onClick={() => {
            if (
              shareKey !== null &&
              cashSnapshot &&
              !cashSnapshotLoading &&
              !manualExpensesLoading &&
              !paymentTransactionsLoading
            ) {
              openDrilldown("expenses");
            }
          }}
          onKeyDown={(event) => {
            if (
              shareKey !== null &&
              cashSnapshot &&
              !cashSnapshotLoading &&
              !manualExpensesLoading &&
              !paymentTransactionsLoading &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              openDrilldown("expenses");
            }
          }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">My manual expenses for this view</CardTitle>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  openDrilldown("expenses");
                }}
              >
                View expenses
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {manualExpensesError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load manual expenses. ({manualExpensesError})
                </AlertDescription>
              </Alert>
            )}
            {shareKey === null ? (
              <p className="text-sm text-muted-foreground">
                Choose your budget profile in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see your manual expense total.
              </p>
            ) : !cashSnapshot ? (
              <p className="text-sm text-muted-foreground">
                Record your current amount in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to calculate expense-adjusted safe-to-spend.
              </p>
            ) : paymentTransactionsError ? (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load your payment history. ({paymentTransactionsError})
                </AlertDescription>
              </Alert>
            ) : cashSnapshotLoading || manualExpensesLoading || paymentTransactionsLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div className="space-y-1">
                <p className="text-2xl font-semibold">
                  {formatDeductionAmount(myManualExpenseTotalForView ?? 0)}
                </p>
                <p className="text-sm text-muted-foreground">{myBillTotalViewLabel}</p>
                <p className="text-xs text-muted-foreground">
                  Only your share of manual expenses after your latest current-amount snapshot
                  is counted. Expenses paid through the app are not counted again.
                  Marked-paid-only expenses may still count until your current amount snapshot
                  reflects them.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Safe to spend before savings</CardTitle>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => openDrilldown("safe-to-spend-before")}
              >
                Why this amount?
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {manualExpensesError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load manual expenses. ({manualExpensesError})
                </AlertDescription>
              </Alert>
            )}
            {!cashSnapshot && shareKey === null ? (
              <p className="text-sm text-muted-foreground">
                Record your current amount and choose your budget profile in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see safe-to-spend.
              </p>
            ) : !cashSnapshot ? (
              <p className="text-sm text-muted-foreground">
                Record your current amount in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see safe-to-spend.
              </p>
            ) : shareKey === null ? (
              <p className="text-sm text-muted-foreground">
                Choose your budget profile in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see safe-to-spend.
              </p>
            ) : paymentTransactionsError ? (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load your payment history. ({paymentTransactionsError})
                </AlertDescription>
              </Alert>
            ) : cashSnapshotLoading || loading || manualExpensesLoading || paymentTransactionsLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-2xl font-semibold">
                    {formatCurrency(safeToSpendBeforeSavings ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">{safeToSpendViewLabel}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">How this was calculated</p>
                  <dl className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Current available amount</dt>
                      <dd className="font-medium tabular-nums">
                        {formatCurrency(Number(cashSnapshot.amount))}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Your unpaid bills in this view</dt>
                      <dd className="font-medium tabular-nums">
                        {formatDeductionAmount(myUnpaidBillTotal ?? 0)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Your manual expenses in this view</dt>
                      <dd className="font-medium tabular-nums">
                        {formatDeductionAmount(myManualExpenseTotalForView ?? 0)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
                      <dt className="font-medium">Safe to spend before savings</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatCurrency(safeToSpendBeforeSavings ?? 0)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Only expenses after your latest current-amount snapshot are counted, to avoid
                    double-counting. Expenses paid through the app are not counted again.
                    Marked-paid-only expenses may still count until your current amount snapshot
                    reflects them.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className={`mb-6 ${
            cashSnapshot &&
            shareKey !== null &&
            !cashSnapshotLoading &&
            !loading &&
            !savingsParticipantsLoading &&
            !savingsContributionsLoading &&
            !manualExpensesLoading &&
            !paymentTransactionsLoading
              ? "cursor-pointer transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : ""
          }`}
          role={
            cashSnapshot &&
            shareKey !== null &&
            !cashSnapshotLoading &&
            !loading &&
            !savingsParticipantsLoading &&
            !savingsContributionsLoading &&
            !manualExpensesLoading &&
            !paymentTransactionsLoading
              ? "button"
              : undefined
          }
          tabIndex={
            cashSnapshot &&
            shareKey !== null &&
            !cashSnapshotLoading &&
            !loading &&
            !savingsParticipantsLoading &&
            !savingsContributionsLoading &&
            !manualExpensesLoading &&
            !paymentTransactionsLoading
              ? 0
              : undefined
          }
          onClick={() => {
            if (
              cashSnapshot &&
              shareKey !== null &&
              !cashSnapshotLoading &&
              !loading &&
              !savingsParticipantsLoading &&
              !savingsContributionsLoading &&
              !manualExpensesLoading &&
              !paymentTransactionsLoading
            ) {
              openDrilldown("savings");
            }
          }}
          onKeyDown={(event) => {
            if (
              cashSnapshot &&
              shareKey !== null &&
              !cashSnapshotLoading &&
              !loading &&
              !savingsParticipantsLoading &&
              !savingsContributionsLoading &&
              !manualExpensesLoading &&
              !paymentTransactionsLoading &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              openDrilldown("savings");
            }
          }}
        >
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              <CardTitle className="mr-auto text-base">Safe to spend after savings</CardTitle>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  openDrilldown("savings");
                }}
              >
                View savings
              </Button>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => openDrilldown("safe-to-spend-after")}
              >
                Why this amount?
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {savingsParticipantsError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load your savings targets. ({savingsParticipantsError})
                </AlertDescription>
              </Alert>
            )}
            {savingsContributionsError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  Could not load your savings contributions. ({savingsContributionsError})
                </AlertDescription>
              </Alert>
            )}
            {!cashSnapshot && shareKey === null ? (
              <p className="text-sm text-muted-foreground">
                Record your current amount and choose your budget profile in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see safe-to-spend after savings.
              </p>
            ) : !cashSnapshot ? (
              <p className="text-sm text-muted-foreground">
                Record your current amount in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see safe-to-spend after savings.
              </p>
            ) : shareKey === null ? (
              <p className="text-sm text-muted-foreground">
                Choose your budget profile in{" "}
                <Link to="/settings" className="font-medium underline underline-offset-4">
                  Settings
                </Link>{" "}
                to see safe-to-spend after savings.
              </p>
            ) : cashSnapshotLoading || loading || savingsParticipantsLoading || savingsContributionsLoading || manualExpensesLoading || paymentTransactionsLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-2xl font-semibold">
                    {formatCurrency(safeToSpendAfterSavings ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">{safeToSpendViewLabel}</p>
                  {!hasSavingsParticipants && (
                    <p className="text-sm text-muted-foreground">
                      <Link to="/settings" className="font-medium underline underline-offset-4">
                        Set a savings target in Settings
                      </Link>{" "}
                      to include savings goals.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Based on safe-to-spend before savings minus your remaining savings obligation
                    for this view.
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">How this was calculated</p>
                  <dl className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Safe to spend before savings</dt>
                      <dd className="font-medium tabular-nums">
                        {formatCurrency(safeToSpendBeforeSavings ?? 0)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Your savings target in this view</dt>
                      <dd className="font-medium tabular-nums">
                        {formatCurrency(mySavingsTargetForView)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Your contributions counted in this view</dt>
                      <dd className="font-medium tabular-nums">
                        {formatCurrency(myContributionsForView)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Remaining savings obligation in this view</dt>
                      <dd className="font-medium tabular-nums">
                        {formatDeductionAmount(remainingSavingsObligationForView)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
                      <dt className="font-medium">Safe to spend after savings</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatCurrency(safeToSpendAfterSavings ?? 0)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{summaryTitle}</CardTitle>
                  <CardDescription>{summaryDescription}</CardDescription>
                </div>
                <Button
                  variant="link"
                  className="h-auto shrink-0 p-0 text-sm"
                  onClick={() => openDrilldown("bills")}
                >
                  View bills
                </Button>
              </div>
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

      <DashboardDrilldownPanel
        open={drilldownKind !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDrilldownKind(null);
          }
        }}
        kind={drilldownKind}
        viewLabel={drilldownViewLabel}
        billRows={drilldownBillRows}
        unpaidBillRows={unpaidBillDrilldown?.rows ?? []}
        unpaidBillReconciliation={unpaidBillDrilldown?.reconciliation ?? null}
        expenseRows={manualExpenseDrilldown?.rows ?? []}
        expenseReconciliation={manualExpenseDrilldown?.reconciliation ?? null}
        savingsTargetRows={savingsDrilldown?.targetRows ?? []}
        savingsSummary={savingsDrilldown?.summary ?? null}
        savingsReconciliation={savingsDrilldown?.reconciliation ?? null}
        savingsHasSharedGoals={savingsDrilldown?.hasSharedGoals ?? false}
        safeToSpendBreakdown={safeToSpendBreakdown}
        loading={drilldownLoading}
        emptyMessage={drilldownEmptyMessage}
        cashDeductionContextAvailable={!paymentTransactionsLoading}
      />
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
