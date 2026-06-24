import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveBillShareKeyForPerson } from "@/lib/bill-share";
import { filterBillInstancesByCashflowStart } from "@/lib/cashflow-filter";
import { getHouseholdSettings, getMyLatestCashSnapshot } from "@/lib/cashflow-settings";
import { filterActiveDebtAccounts } from "@/lib/debt-accounts";
import { filterDebtPaymentsByCashflowStart } from "@/lib/debt-cashflow-start";
import { getManualExpenses } from "@/lib/expenses";
import { buildMonthlyPrintReport } from "@/lib/monthly-print-report";
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
import { MonthlyPrintableReport } from "@/components/monthly-printable-report";
import { ReportsExpenseCharts } from "@/components/reports-expense-charts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildMonthlyReportCsv,
  buildMonthlyReportCsvFilename,
} from "@/lib/monthly-report-export";
import { downloadCsvFile } from "@/lib/csv-export";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
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

export function MonthlyReportPage() {
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
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

      setSettingsLoaded(true);
      setPeopleLoaded(true);
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
        loadError instanceof Error ? loadError.message : "Failed to load printable report data"
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

  const report = useMemo(() => {
    if (!user) {
      return null;
    }

    return buildMonthlyPrintReport({
      selectedYear: year,
      selectedMonth: month,
      householdName: household?.name ?? null,
      signedInUserId: user.id,
      shareKey,
      peopleLoaded,
      settingsLoaded,
      cashflowStartDate,
      cashSnapshot,
      bills,
      debtPayments,
      debtLinkedBillIds,
      debtAccounts: filterActiveDebtAccounts(debtAccounts),
      debtAccountNames,
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
      startingCash: cashSnapshot ? Number(cashSnapshot.amount) : null,
      snapshotDate: cashSnapshot?.snapshot_date ?? null,
      cashSnapshotReady: !loading,
      forecastReady: !loading,
    });
  }, [
    user,
    year,
    month,
    household?.name,
    shareKey,
    peopleLoaded,
    settingsLoaded,
    cashflowStartDate,
    cashSnapshot,
    bills,
    debtPayments,
    debtLinkedBillIds,
    debtAccounts,
    debtAccountNames,
    manualExpenses,
    deductedManualExpenseIds,
    savingsParticipants,
    savingsContributions,
    savingsGoals,
    billTemplates,
    paycheckScheduleSettings,
    loading,
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

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    setExportMessage(null);
    setExportError(null);

    if (loading) {
      setExportError("Report is still loading. Try again in a moment.");
      return;
    }

    if (error) {
      setExportError("Report data failed to load. Refresh and try again.");
      return;
    }

    if (!report) {
      setExportError("Report is not ready yet.");
      return;
    }

    if (report.loadingBlockedMessage) {
      setExportError(report.loadingBlockedMessage);
      return;
    }

    try {
      const rows = buildMonthlyReportCsv(report);
      if (!rows.trim()) {
        setExportError(`No export data available for ${report.header.monthLabel}.`);
        return;
      }

      const filename = buildMonthlyReportCsvFilename(year, month);
      downloadCsvFile(filename, rows);
      setExportMessage(`Exported ${filename}`);
    } catch (exportFailure) {
      setExportError(
        exportFailure instanceof Error
          ? exportFailure.message
          : "CSV export failed. Try again."
      );
    }
  };

  return (
    <div className="container mx-auto min-w-0 px-4 py-8">
      <div className="no-print mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Printable Report</h1>
        <p className="mt-1 text-muted-foreground">
          Read-only monthly cashflow summary for browser printing or save as PDF.
        </p>
      </div>

      <div
        className="no-print mb-6 flex flex-wrap items-center justify-between gap-4"
        data-testid="monthly-report-month-selector"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth("prev")} aria-label="Previous month">
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
              <SelectTrigger className="w-[7.5rem]">
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
              <SelectTrigger className="w-[5.5rem]">
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
          <Button variant="outline" size="icon" onClick={() => navigateMonth("next")} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={goToCurrentMonth}>
            Today
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={loading}
            className="no-print"
            data-testid="monthly-report-export-csv-button"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            onClick={handlePrint}
            className="no-print"
            data-testid="monthly-report-print-button"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print report
          </Button>
        </div>
      </div>

      {(exportMessage || exportError) && (
        <div className="no-print mb-4 text-sm" data-testid="monthly-report-export-status">
          {exportMessage ? (
            <p className="text-muted-foreground">{exportMessage}</p>
          ) : null}
          {exportError ? <p className="text-destructive">{exportError}</p> : null}
        </div>
      )}

      <MonthlyPrintableReport report={report} loading={loading} error={error} />

      <ReportsExpenseCharts
        expenses={manualExpenses}
        cashflowStartDate={cashflowStartDate}
        loading={loading}
      />
    </div>
  );
}
