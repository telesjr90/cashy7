import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveBillShareKeyForPerson } from "@/lib/bill-share";
import { filterBillInstancesByCashflowStart } from "@/lib/cashflow-filter";
import { getHouseholdSettings, getMyLatestCashSnapshot } from "@/lib/cashflow-settings";
import { buildCashflowCalendar } from "@/lib/cashflow-calendar";
import { filterActiveDebtAccounts } from "@/lib/debt-accounts";
import { filterDebtPaymentsByCashflowStart } from "@/lib/debt-cashflow-start";
import { getManualExpenses } from "@/lib/expenses";
import {
  getMyPaycheckSchedule,
  mapPaycheckScheduleRow,
  type PaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import { getPaidManualExpenseSourceIds, getMyCashPaymentTransactions } from "@/lib/payments";
import {
  getMySavingsContributions,
  getMySavingsGoalParticipants,
  getSavingsGoals,
} from "@/lib/savings";
import { fetchDebtLinkedBillContext } from "@/lib/sync-bill-paid-status";
import { getHouseholdPeople } from "@/lib/user-person";
import { buildBillTemplateLookup } from "@/lib/variable-bills";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type {
  Bill,
  BillInstance,
  CashSnapshot,
  DebtAccount,
  DebtPayment,
  ManualExpense,
  Person,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import { CashflowCalendar } from "@/components/cashflow-calendar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isEligibleBillTemplate } from "@/lib/bill-templates";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function CalendarPage() {
  const { household, user, usablePersonId } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bills, setBills] = useState<BillInstance[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [savingsParticipants, setSavingsParticipants] = useState<SavingsGoalParticipant[]>([]);
  const [savingsContributions, setSavingsContributions] = useState<SavingsContribution[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<Pick<SavingsGoal, "id" | "name">[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [cashSnapshot, setCashSnapshot] = useState<CashSnapshot | null>(null);
  const [paycheckScheduleSettings, setPaycheckScheduleSettings] =
    useState<PaycheckScheduleSettings | null>(null);
  const [cashflowStartDate, setCashflowStartDate] = useState<string | null>(null);
  const [debtLinkedBillIds, setDebtLinkedBillIds] = useState<Set<string>>(new Set());
  const [billTemplates, setBillTemplates] = useState<
    Pick<Bill, "id" | "is_variable" | "default_amount">[]
  >([]);
  const [deductedManualExpenseIds, setDeductedManualExpenseIds] = useState<Set<string>>(
    new Set()
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const loadData = useCallback(async () => {
    if (!household || !user) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        settingsResult,
        snapshotResult,
        paycheckResult,
        peopleResult,
        billsResult,
        debtAccountsResult,
        debtPaymentsResult,
        expensesResult,
        participantsResult,
        contributionsResult,
        goalsResult,
        templatesResult,
        transactionsResult,
      ] = await Promise.all([
        getHouseholdSettings(household.id),
        getMyLatestCashSnapshot(household.id, user.id),
        getMyPaycheckSchedule(household.id, user.id),
        getHouseholdPeople(household.id),
        supabase
          .from("bill_instances")
          .select("*")
          .eq("household_id", household.id)
          .eq("year", year)
          .eq("month", month),
        supabase.from("debt_accounts").select("*").eq("household_id", household.id),
        supabase.from("debt_payments").select("*").eq("household_id", household.id),
        getManualExpenses(household.id),
        getMySavingsGoalParticipants(household.id, user.id),
        getMySavingsContributions(household.id, user.id),
        getSavingsGoals(household.id),
        supabase
          .from("bills")
          .select("id, is_variable, default_amount")
          .eq("household_id", household.id)
          .eq("recurring", true),
        getMyCashPaymentTransactions(household.id, user.id),
      ]);

      if (settingsResult.error) {
        throw new Error(settingsResult.error);
      }
      if (snapshotResult.error) {
        throw new Error(snapshotResult.error);
      }
      if (peopleResult.error) {
        throw new Error(peopleResult.error);
      }
      if (billsResult.error) {
        throw new Error(billsResult.error.message);
      }
      if (debtAccountsResult.error) {
        throw new Error(debtAccountsResult.error.message);
      }
      if (debtPaymentsResult.error) {
        throw new Error(debtPaymentsResult.error.message);
      }
      if (expensesResult.error) {
        throw new Error(expensesResult.error);
      }
      if (participantsResult.error) {
        throw new Error(participantsResult.error);
      }
      if (contributionsResult.error) {
        throw new Error(contributionsResult.error);
      }
      if (goalsResult.error) {
        throw new Error(goalsResult.error);
      }
      if (templatesResult.error) {
        throw new Error(templatesResult.error.message);
      }
      if (transactionsResult.error) {
        throw new Error(transactionsResult.error);
      }

      const startDate = settingsResult.settings?.cashflow_start_date ?? null;
      const monthBills = filterBillInstancesByCashflowStart(
        (billsResult.data ?? []) as BillInstance[],
        startDate
      );
      const linkedContext = await fetchDebtLinkedBillContext(
        monthBills.map((bill) => bill.id)
      );

      setCashflowStartDate(startDate);
      setCashSnapshot(snapshotResult.snapshot);
      setPaycheckScheduleSettings(
        paycheckResult.schedule ? mapPaycheckScheduleRow(paycheckResult.schedule) : null
      );
      setPeople(peopleResult.people);
      setBills(monthBills);
      setDebtAccounts((debtAccountsResult.data ?? []) as DebtAccount[]);
      setDebtPayments(
        filterDebtPaymentsByCashflowStart(
          (debtPaymentsResult.data ?? []) as DebtPayment[],
          startDate
        )
      );
      setManualExpenses(expensesResult.expenses);
      setSavingsParticipants(participantsResult.participants);
      setSavingsContributions(contributionsResult.contributions);
      setSavingsGoals(
        (goalsResult.goals ?? []).map((goal) => ({ id: goal.id, name: goal.name }))
      );
      setBillTemplates(
        ((templatesResult.data ?? []) as Bill[]).filter(isEligibleBillTemplate).map(
          (template) => ({
            id: template.id,
            is_variable: template.is_variable,
            default_amount: template.default_amount,
          })
        )
      );
      setDeductedManualExpenseIds(
        getPaidManualExpenseSourceIds(transactionsResult.transactions)
      );
      setDebtLinkedBillIds(linkedContext.linkedIds);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load calendar data"
      );
    } finally {
      setLoading(false);
    }
  }, [household, user, year, month]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const mappedPerson =
    usablePersonId != null
      ? people.find((person) => person.id === usablePersonId) ?? null
      : null;
  const shareKey = resolveBillShareKeyForPerson(mappedPerson);

  const debtAccountNames = useMemo(
    () =>
      new Map(
        filterActiveDebtAccounts(debtAccounts).map((account) => [account.id, account.name])
      ),
    [debtAccounts]
  );

  const calendar = useMemo(() => {
    if (!user) {
      return null;
    }

    return buildCashflowCalendar({
      selectedYear: year,
      selectedMonth: month,
      shareKey,
      signedInUserId: user.id,
      bills,
      debtPayments,
      debtLinkedBillIds,
      debtAccountNames,
      debtAccounts: filterActiveDebtAccounts(debtAccounts),
      manualExpenses,
      deductedManualExpenseIds,
      savingsParticipants,
      savingsContributions,
      savingsGoals,
      variableBillContext: {
        templateByBillId: buildBillTemplateLookup(billTemplates),
        debtLinkedBillIds,
      },
      paycheckSchedule: paycheckScheduleSettings,
      cashflowStartDate,
      startingCash: cashSnapshot ? Number(cashSnapshot.amount) : null,
      snapshotDate: cashSnapshot?.snapshot_date ?? null,
    });
  }, [
    user,
    year,
    month,
    shareKey,
    bills,
    debtPayments,
    debtLinkedBillIds,
    debtAccountNames,
    debtAccounts,
    manualExpenses,
    deductedManualExpenseIds,
    savingsParticipants,
    savingsContributions,
    savingsGoals,
    billTemplates,
    paycheckScheduleSettings,
    cashflowStartDate,
    cashSnapshot,
  ]);

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const goToCurrentMonth = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="container mx-auto min-w-0 overflow-x-hidden px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="mt-1 text-muted-foreground">
          Monthly household planning events and your private forecast effects.
        </p>
      </div>

      <div
        className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        data-testid="calendar-month-selector"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
            <Select
              value={month.toString()}
              onValueChange={(value) => {
                const newDate = new Date(currentDate);
                newDate.setMonth(parseInt(value, 10) - 1);
                setCurrentDate(newDate);
              }}
            >
              <SelectTrigger className="w-[7.5rem] sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((monthName, index) => (
                  <SelectItem key={monthName} value={(index + 1).toString()}>
                    {monthName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={year.toString()}
              onValueChange={(value) => {
                const newDate = new Date(currentDate);
                newDate.setFullYear(parseInt(value, 10));
                setCurrentDate(newDate);
              }}
            >
              <SelectTrigger className="w-[5.5rem] sm:w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, index) => year - 2 + index).map((optionYear) => (
                  <SelectItem key={optionYear} value={optionYear.toString()}>
                    {optionYear}
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

      <div data-testid="cashflow-calendar-view">
        <CashflowCalendar calendar={calendar} loading={loading} error={error} />
      </div>
    </div>
  );
}
