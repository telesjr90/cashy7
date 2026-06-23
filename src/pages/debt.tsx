import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import type { BillInstance, CashPaymentTransaction, DebtAccount, DebtPayment, Person } from "@/lib/types";
import {
  getMyBillShareAmount,
  resolveBillShareKeyForPerson,
} from "@/lib/bill-share";
import { getHouseholdPeople } from "@/lib/user-person";
import {
  getMyCashPaymentTransactions,
  paySourceFromCurrentCash,
  getCashDeductionStatus,
  cashDeductionStatusLabel,
  PAYMENT_UX_EXPLANATION,
} from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Plus,
  Loader as Loader2,
  CreditCard,
  Trash2,
  Pencil,
  Archive,
  ArchiveRestore,
  Eye,
} from "lucide-react";
import { format, addMonths, parseISO } from "date-fns";
import {
  split5149,
  formatCurrency,
  debtBillInstanceName,
  computeRegularDebtPayment,
  computeDebtPaymentAmounts,
  computeProjectedRemainingBalances,
  splitDebtPayment,
  applyDebtPaymentBalanceChange,
  applyPaidDebtPaymentAmountEdit,
} from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DebtScheduleReplacementDialog,
  type DebtScheduleReplacementParams,
} from "@/components/debt-schedule-replacement-dialog";
import { DebtAccountArchiveDialog } from "@/components/debt-account-archive-dialog";
import { DebtProgressDashboard } from "@/components/debt-progress-dashboard";
import { DebtPaymentDetailPanel } from "@/components/debt-payment-detail-panel";
import { buildDebtPaymentDetailView } from "@/lib/debt-payment-detail";
import { Badge } from "@/components/ui/badge";
import {
  buildArchivePayload,
  buildReopenPayload,
  computeDebtAccountTotalPaid,
  filterActiveDebtAccounts,
  filterArchivedDebtAccounts,
  formatDebtAccountArchivedDate,
  getDebtAccountArchiveStatus,
  getDebtAccountArchivedBadgeLabel,
  isDebtAccountArchived,
  isDebtScheduleActionAllowed,
  DEBT_ACCOUNT_REOPEN_MESSAGE,
} from "@/lib/debt-accounts";
import {
  buildActiveDebtProgressTotals,
  buildDebtAccountProgressList,
} from "@/lib/debt-progress";
import { getHouseholdSettings } from "@/lib/cashflow-settings";
import {
  DEBT_PAYMENTS_PRE_START_HIDDEN_NOTICE,
  DEBT_PROGRESS_EXCLUDES_PRE_START_NOTICE,
  filterDebtPaymentsByCashflowStart,
  getDebtPageVisiblePayments,
  getDebtPaymentPreStartLabel,
  isDebtPaymentPreStart,
  SHOW_PRE_START_DEBT_PAYMENTS_LABEL,
  splitDebtPaymentsByCashflowStart,
} from "@/lib/debt-cashflow-start";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

type ScheduleSplitType = "5149" | "custom";

type ScheduleForm = {
  paymentsLeft: string;
  firstPaymentDate: string;
  frequency: "monthly";
  totalPaymentPerPayment: string;
  splitType: ScheduleSplitType;
  telesAmount: string;
  nicoleAmount: string;
};

function defaultFirstPaymentDate(): string {
  const now = new Date();
  return format(new Date(now.getFullYear(), now.getMonth() + 1, 1), "yyyy-MM-dd");
}

function createDefaultScheduleForm(): ScheduleForm {
  return {
    paymentsLeft: "4",
    firstPaymentDate: defaultFirstPaymentDate(),
    frequency: "monthly",
    totalPaymentPerPayment: "",
    splitType: "5149",
    telesAmount: "",
    nicoleAmount: "",
  };
}

function updateScheduleFromBalance(
  balance: number,
  paymentsLeft: string,
  splitType: ScheduleSplitType
): Pick<ScheduleForm, "totalPaymentPerPayment" | "telesAmount" | "nicoleAmount"> {
  const count = parseInt(paymentsLeft);
  if (isNaN(balance) || balance <= 0 || isNaN(count) || count <= 0) {
    return { totalPaymentPerPayment: "", telesAmount: "", nicoleAmount: "" };
  }

  const regular = computeRegularDebtPayment(balance, count);
  const { teles, nicole } = split5149(regular);
  return {
    totalPaymentPerPayment: regular.toFixed(2),
    telesAmount: splitType === "5149" ? teles.toFixed(2) : "",
    nicoleAmount: splitType === "5149" ? nicole.toFixed(2) : "",
  };
}

export function DebtPage() {
  const { user, household, usablePersonId } = useAuth();
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<
    CashPaymentTransaction[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingGenerateAccountId, setPendingGenerateAccountId] = useState<
    string | null
  >(null);
  const [replacementAccountId, setReplacementAccountId] = useState<
    string | null
  >(null);
  const [replacementParams, setReplacementParams] =
    useState<DebtScheduleReplacementParams | null>(null);
  const [togglingPaymentId, setTogglingPaymentId] = useState<string | null>(
    null
  );
  const [payingPaymentId, setPayingPaymentId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState({
    totalPayment: "",
    telesAmount: "",
    nicoleAmount: "",
  });
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false);
  const [archiveDialogAccountId, setArchiveDialogAccountId] = useState<
    string | null
  >(null);
  const [reopenDialogAccountId, setReopenDialogAccountId] = useState<
    string | null
  >(null);
  const [linkedBillInstances, setLinkedBillInstances] = useState<BillInstance[]>(
    []
  );
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [cashflowStartDate, setCashflowStartDate] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showPreStartDebtPayments, setShowPreStartDebtPayments] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [accountForm, setAccountForm] = useState({
    name: "",
    originalAmount: "",
    currentBalance: "",
    targetPayoffDate: "",
    notes: "",
  });

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(createDefaultScheduleForm);

  const [paymentForm, setPaymentForm] = useState({
    debtAccountId: "",
    paymentDate: format(now, "yyyy-MM-dd"),
    month: currentMonth.toString(),
    year: currentYear.toString(),
    totalPayment: "",
    telesAmount: "",
    nicoleAmount: "",
    paidStatus: false,
  });

  const fetchData = useCallback(async () => {
    if (!household || !user) return;

    setLoading(true);
    setPayError(null);

    const [accountsRes, paymentsRes, peopleRes, paymentTxRes] = await Promise.all([
      supabase
        .from("debt_accounts")
        .select("*")
        .eq("household_id", household.id)
        .order("name"),
      supabase
        .from("debt_payments")
        .select("*")
        .eq("household_id", household.id)
        .order("created_at", { ascending: false }),
      getHouseholdPeople(household.id),
      getMyCashPaymentTransactions(household.id, user.id),
    ]);

    if (accountsRes.data) setDebtAccounts(accountsRes.data as DebtAccount[]);
    if (paymentsRes.data) {
      setDebtPayments(paymentsRes.data as DebtPayment[]);

      const linkedBillIds = [
        ...new Set(
          paymentsRes.data
            .map((payment) => payment.linked_bill_instance_id)
            .filter((id): id is string => id != null)
        ),
      ];

      if (linkedBillIds.length > 0) {
        const linkedBillsRes = await supabase
          .from("bill_instances")
          .select("*")
          .in("id", linkedBillIds);

        if (linkedBillsRes.data) {
          setLinkedBillInstances(linkedBillsRes.data as BillInstance[]);
        } else {
          setLinkedBillInstances([]);
        }
      } else {
        setLinkedBillInstances([]);
      }
    } else {
      setDebtPayments([]);
      setLinkedBillInstances([]);
    }
    if (!peopleRes.error) setPeople(peopleRes.people);
    if (!paymentTxRes.error) setPaymentTransactions(paymentTxRes.transactions);
    setLoading(false);
  }, [household, user]);

  const mappedPerson = useMemo(() => {
    if (!usablePersonId) {
      return null;
    }
    return people.find((person) => person.id === usablePersonId) ?? null;
  }, [usablePersonId, people]);

  const shareKey = useMemo(
    () => resolveBillShareKeyForPerson(mappedPerson),
    [mappedPerson]
  );

  const paymentByDebtPaymentId = useMemo(() => {
    const map = new Map<string, CashPaymentTransaction>();
    for (const tx of paymentTransactions) {
      if (tx.source_type === "debt_payment") {
        map.set(tx.source_id, tx);
      }
    }
    return map;
  }, [paymentTransactions]);

  const cashDeductedPaymentIds = useMemo(
    () => new Set(paymentByDebtPaymentId.keys()),
    [paymentByDebtPaymentId]
  );

  const linkedBillById = useMemo(() => {
    const map = new Map<string, BillInstance>();
    for (const bill of linkedBillInstances) {
      map.set(bill.id, bill);
    }
    return map;
  }, [linkedBillInstances]);

  const detailPayment = detailPaymentId
    ? (debtPayments.find((payment) => payment.id === detailPaymentId) ?? null)
    : null;

  const detailPaymentView = useMemo(() => {
    if (!detailPayment) {
      return null;
    }

    const account =
      debtAccounts.find((row) => row.id === detailPayment.debt_account_id) ??
      null;
    if (!account) {
      return null;
    }

    return buildDebtPaymentDetailView({
      payment: detailPayment,
      account,
      linkedBill: detailPayment.linked_bill_instance_id
        ? (linkedBillById.get(detailPayment.linked_bill_instance_id) ?? null)
        : null,
      paymentTransaction: paymentByDebtPaymentId.get(detailPayment.id) ?? null,
      accountPayments: debtPayments,
      cashDeductedPaymentIds,
      cashflowStartDate,
    });
  }, [
    cashDeductedPaymentIds,
    cashflowStartDate,
    debtAccounts,
    debtPayments,
    detailPayment,
    linkedBillById,
    paymentByDebtPaymentId,
  ]);

  const activeDebtAccounts = useMemo(
    () => filterActiveDebtAccounts(debtAccounts),
    [debtAccounts]
  );

  const archivedDebtAccounts = useMemo(
    () => filterArchivedDebtAccounts(debtAccounts),
    [debtAccounts]
  );

  const { preStartPayments } = useMemo(
    () => splitDebtPaymentsByCashflowStart(debtPayments, cashflowStartDate),
    [debtPayments, cashflowStartDate]
  );

  const hasPreStartDebtPayments = preStartPayments.length > 0;

  const visibleDebtPayments = useMemo(
    () =>
      getDebtPageVisiblePayments(
        debtPayments,
        cashflowStartDate,
        showPreStartDebtPayments
      ),
    [debtPayments, cashflowStartDate, showPreStartDebtPayments]
  );

  const debtProgressPayments = useMemo(
    () =>
      filterDebtPaymentsByCashflowStart(
        debtPayments.map((payment) => ({
          id: payment.id,
          debt_account_id: payment.debt_account_id,
          payment_date: payment.payment_date,
          total_payment: payment.total_payment,
          paid_status: payment.paid_status,
        })),
        cashflowStartDate
      ),
    [debtPayments, cashflowStartDate]
  );

  const activeDebtProgressTotals = useMemo(
    () => buildActiveDebtProgressTotals(debtAccounts, debtProgressPayments),
    [debtAccounts, debtProgressPayments]
  );

  const activeAccountProgress = useMemo(
    () => buildDebtAccountProgressList(activeDebtAccounts, debtProgressPayments),
    [activeDebtAccounts, debtProgressPayments]
  );

  const archivedAccountProgress = useMemo(
    () =>
      showArchivedAccounts
        ? buildDebtAccountProgressList(archivedDebtAccounts, debtProgressPayments)
        : [],
    [archivedDebtAccounts, debtProgressPayments, showArchivedAccounts]
  );

  const archiveDialogAccount = archiveDialogAccountId
    ? (debtAccounts.find((account) => account.id === archiveDialogAccountId) ??
      null)
    : null;

  const reopenDialogAccount = reopenDialogAccountId
    ? (debtAccounts.find((account) => account.id === reopenDialogAccountId) ??
      null)
    : null;

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!household) {
      return;
    }

    let cancelled = false;

    void getHouseholdSettings(household.id).then(({ settings }) => {
      if (cancelled) {
        return;
      }

      setCashflowStartDate(settings?.cashflow_start_date ?? null);
      setSettingsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [household]);

  const handlePaymentAmountChange = (value: string) => {
    const amount = parseFloat(value) || 0;
    const { teles, nicole } = split5149(amount);
    setPaymentForm((prev) => ({
      ...prev,
      totalPayment: value,
      telesAmount: teles.toFixed(2),
      nicoleAmount: nicole.toFixed(2),
    }));
  };

  const handlePaymentEditAmountChange = (value: string) => {
    const amount = parseFloat(value) || 0;
    const { teles, nicole } = split5149(amount);
    setPaymentEditForm({
      totalPayment: value,
      telesAmount: teles.toFixed(2),
      nicoleAmount: nicole.toFixed(2),
    });
  };

  const startEditPayment = (payment: DebtPayment) => {
    setError(null);
    setWarning(null);
    setEditingPaymentId(payment.id);
    setPaymentEditForm({
      totalPayment: payment.total_payment.toString(),
      telesAmount: payment.teles_amount.toString(),
      nicoleAmount: payment.nicole_amount.toString(),
    });
  };

  const updateDebtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);

    const payment = debtPayments.find((p) => p.id === editingPaymentId);
    if (!payment) {
      setError("No payment selected for editing");
      return;
    }

    const totalPayment = parseFloat(paymentEditForm.totalPayment);
    const telesAmount = parseFloat(paymentEditForm.telesAmount);
    const nicoleAmount = parseFloat(paymentEditForm.nicoleAmount);

    if (isNaN(totalPayment) || totalPayment <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    if (isNaN(telesAmount) || isNaN(nicoleAmount)) {
      setError("Please enter valid amounts for Teles and Nicole");
      return;
    }

    if (Math.abs(telesAmount + nicoleAmount - totalPayment) > 0.01) {
      setError("Teles and Nicole amounts must add up to the total payment");
      return;
    }

    const account = debtAccounts.find((a) => a.id === payment.debt_account_id);
    if (!account) {
      setError("Debt account not found");
      return;
    }

    setSubmitting(true);

    try {
      const oldTotal = Number(payment.total_payment);
      const amountChanged = Math.abs(oldTotal - totalPayment) > 0.001;

      let remainingBalance = payment.remaining_balance_after_payment;
      if (!payment.paid_status) {
        remainingBalance = Math.max(
          0,
          Math.round((account.current_balance - totalPayment) * 100) / 100
        );
      }

      const { error: paymentError } = await supabase
        .from("debt_payments")
        .update({
          total_payment: totalPayment,
          teles_amount: telesAmount,
          nicole_amount: nicoleAmount,
          remaining_balance_after_payment: remainingBalance,
        })
        .eq("id", payment.id);

      if (paymentError) throw new Error(paymentError.message);

      if (payment.linked_bill_instance_id) {
        const { error: billError } = await supabase
          .from("bill_instances")
          .update({
            amount: totalPayment,
            teles_amount: telesAmount,
            nicole_amount: nicoleAmount,
          })
          .eq("id", payment.linked_bill_instance_id);

        if (billError) throw new Error(billError.message);
      } else {
        setWarning(
          "Payment saved, but no linked bill instance was found. Bills and Dashboard totals may be incorrect for this payment."
        );
      }

      if (payment.paid_status && amountChanged) {
        const newBalance = applyPaidDebtPaymentAmountEdit(
          account.current_balance,
          oldTotal,
          totalPayment,
          true
        );

        const { error: balanceError } = await supabase
          .from("debt_accounts")
          .update({ current_balance: newBalance })
          .eq("id", account.id);

        if (balanceError) throw new Error(balanceError.message);
      }

      setEditingPaymentId(null);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedulePaymentAmountChange = (value: string) => {
    const amount = parseFloat(value) || 0;
    if (scheduleForm.splitType === "5149") {
      const { teles, nicole } = split5149(amount);
      setScheduleForm((prev) => ({
        ...prev,
        totalPaymentPerPayment: value,
        telesAmount: teles.toFixed(2),
        nicoleAmount: nicole.toFixed(2),
      }));
      return;
    }

    setScheduleForm((prev) => ({ ...prev, totalPaymentPerPayment: value }));
  };

  const resetAccountForm = () => {
    setAccountForm({
      name: "",
      originalAmount: "",
      currentBalance: "",
      targetPayoffDate: "",
      notes: "",
    });
    setScheduleForm(createDefaultScheduleForm());
    setEditingAccountId(null);
    setShowAccountForm(false);
  };

  const startEditAccount = (account: DebtAccount) => {
    setEditingAccountId(account.id);
    setShowAccountForm(false);
    setAccountForm({
      name: account.name,
      originalAmount: account.original_amount.toString(),
      currentBalance: account.current_balance.toString(),
      targetPayoffDate: account.target_payoff_date || "",
      notes: account.notes || "",
    });
    setScheduleForm({
      ...createDefaultScheduleForm(),
      ...updateScheduleFromBalance(
        account.current_balance,
        createDefaultScheduleForm().paymentsLeft,
        "5149"
      ),
    });
  };

  const insertDebtPaymentWithBill = async (params: {
    debtAccountId: string;
    debtAccountName: string;
    paymentDate: string;
    month: number;
    year: number;
    totalPayment: number;
    telesAmount: number;
    nicoleAmount: number;
    remainingBalance: number | null;
    paidStatus: boolean;
  }) => {
    if (!household) throw new Error("No household found");

    const { data: billData, error: billError } = await supabase
      .from("bill_instances")
      .insert({
        household_id: household.id,
        bill_id: null,
        year: params.year,
        month: params.month,
        period_bucket: "1_14",
        name: debtBillInstanceName(params.debtAccountName),
        amount: params.totalPayment,
        teles_amount: params.telesAmount,
        nicole_amount: params.nicoleAmount,
        due_date: null,
        is_paid: params.paidStatus,
        notes: null,
      })
      .select("id")
      .single();

    if (billError) throw new Error(billError.message);
    if (!billData) throw new Error("Failed to create bill instance");

    const { error: paymentError } = await supabase.from("debt_payments").insert({
      household_id: household.id,
      debt_account_id: params.debtAccountId,
      payment_date: params.paymentDate,
      month: params.month,
      year: params.year,
      period_bucket: "1_14",
      total_payment: params.totalPayment,
      teles_amount: params.telesAmount,
      nicole_amount: params.nicoleAmount,
      remaining_balance_after_payment: params.remainingBalance,
      paid_status: params.paidStatus,
      linked_bill_instance_id: billData.id,
    });

    if (paymentError) throw new Error(paymentError.message);
  };

  const createDebtAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!household) {
      setError("No household found");
      return;
    }

    const originalAmount = parseFloat(accountForm.originalAmount);
    const currentBalance = parseFloat(accountForm.currentBalance);

    if (isNaN(originalAmount) || isNaN(currentBalance)) {
      setError("Please enter valid amounts");
      return;
    }

    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from("debt_accounts")
        .insert({
          household_id: household.id,
          name: accountForm.name,
          original_amount: originalAmount,
          current_balance: currentBalance,
          target_payoff_date: accountForm.targetPayoffDate || null,
          notes: accountForm.notes || null,
        });

      if (insertError) throw new Error(insertError.message);

      setAccountForm({
        name: "",
        originalAmount: "",
        currentBalance: "",
        targetPayoffDate: "",
        notes: "",
      });
      setScheduleForm(createDefaultScheduleForm());
      setShowAccountForm(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const updateDebtAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!household || !editingAccountId) {
      setError("No account selected for editing");
      return;
    }

    const originalAmount = parseFloat(accountForm.originalAmount);
    const currentBalance = parseFloat(accountForm.currentBalance);

    if (isNaN(originalAmount) || isNaN(currentBalance)) {
      setError("Please enter valid amounts");
      return;
    }

    setSubmitting(true);

    try {
      const { error: updateError } = await supabase
        .from("debt_accounts")
        .update({
          name: accountForm.name,
          original_amount: originalAmount,
          current_balance: currentBalance,
          target_payoff_date: accountForm.targetPayoffDate || null,
          notes: accountForm.notes || null,
        })
        .eq("id", editingAccountId);

      if (updateError) throw new Error(updateError.message);

      resetAccountForm();
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const generatePaymentSchedule = async (
    account: DebtAccount,
    confirmOverwrite = false
  ) => {
    setError(null);

    if (!isDebtScheduleActionAllowed(account)) {
      setError("Reopen this archived account before generating a payment schedule.");
      return;
    }

    if (!household) {
      setError("No household found");
      return;
    }

    const existingPayments = debtPayments.filter(
      (payment) => payment.debt_account_id === account.id
    );
    if (existingPayments.length > 0 && !confirmOverwrite) {
      setPendingGenerateAccountId(account.id);
      return;
    }

    const paymentsLeft = parseInt(scheduleForm.paymentsLeft);
    const regularPayment = parseFloat(scheduleForm.totalPaymentPerPayment);
    const customTeles = parseFloat(scheduleForm.telesAmount);
    const customNicole = parseFloat(scheduleForm.nicoleAmount);

    if (isNaN(paymentsLeft) || paymentsLeft <= 0) {
      setError("Please enter a valid number of payments");
      return;
    }

    if (isNaN(regularPayment) || regularPayment <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    if (scheduleForm.splitType === "custom") {
      if (isNaN(customTeles) || isNaN(customNicole)) {
        setError("Please enter valid custom split amounts");
        return;
      }
      if (Math.abs(customTeles + customNicole - regularPayment) > 0.01) {
        setError("Custom split amounts must add up to the payment amount");
        return;
      }
    }

    const paymentAmounts = computeDebtPaymentAmounts(
      account.current_balance,
      paymentsLeft,
      regularPayment
    );

    if (paymentAmounts.length === 0) {
      setError("Unable to generate payments for this balance");
      return;
    }

    setSubmitting(true);
    setPendingGenerateAccountId(null);

    try {
      const firstPaymentDate = parseISO(scheduleForm.firstPaymentDate);
      const projectedRemaining = computeProjectedRemainingBalances(
        account.current_balance,
        paymentAmounts
      );

      for (let i = 0; i < paymentAmounts.length; i++) {
        const totalPayment = paymentAmounts[i];
        const { teles, nicole } = splitDebtPayment(
          totalPayment,
          scheduleForm.splitType,
          customTeles,
          customNicole,
          regularPayment
        );

        const paymentDate = format(addMonths(firstPaymentDate, i), "yyyy-MM-dd");
        const paymentDateParts = parseISO(paymentDate);

        await insertDebtPaymentWithBill({
          debtAccountId: account.id,
          debtAccountName:
            editingAccountId === account.id ? accountForm.name : account.name,
          paymentDate,
          month: paymentDateParts.getMonth() + 1,
          year: paymentDateParts.getFullYear(),
          totalPayment,
          telesAmount: teles,
          nicoleAmount: nicole,
          remainingBalance: projectedRemaining[i],
          paidStatus: false,
        });
      }

      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const createDebtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!household) {
      setError("No household found");
      return;
    }

    const totalPayment = parseFloat(paymentForm.totalPayment);
    const telesAmount = parseFloat(paymentForm.telesAmount);
    const nicoleAmount = parseFloat(paymentForm.nicoleAmount);

    if (isNaN(totalPayment) || totalPayment <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    if (isNaN(telesAmount) || isNaN(nicoleAmount)) {
      setError("Please enter valid amounts for Teles and Nicole");
      return;
    }

    if (Math.abs(telesAmount + nicoleAmount - totalPayment) > 0.01) {
      setError("Teles and Nicole amounts must add up to the total payment");
      return;
    }

    setSubmitting(true);

    try {
      const month = parseInt(paymentForm.month);
      const year = parseInt(paymentForm.year);

      const selectedAccount = debtAccounts.find(
        (a) => a.id === paymentForm.debtAccountId
      );
      if (!selectedAccount) {
        throw new Error("Please select a debt account");
      }

      const remainingBalance = Math.max(
        0,
        Math.round((selectedAccount.current_balance - totalPayment) * 100) / 100
      );

      await insertDebtPaymentWithBill({
        debtAccountId: paymentForm.debtAccountId,
        debtAccountName: selectedAccount.name,
        paymentDate: paymentForm.paymentDate,
        month,
        year,
        totalPayment,
        telesAmount,
        nicoleAmount,
        remainingBalance,
        paidStatus: paymentForm.paidStatus,
      });

      if (paymentForm.paidStatus) {
        const newBalance = applyDebtPaymentBalanceChange(
          selectedAccount.current_balance,
          totalPayment,
          "pay"
        );
        await supabase
          .from("debt_accounts")
          .update({ current_balance: newBalance })
          .eq("id", selectedAccount.id);
      }

      setPaymentForm({
        debtAccountId: "",
        paymentDate: format(new Date(), "yyyy-MM-dd"),
        month: currentMonth.toString(),
        year: currentYear.toString(),
        totalPayment: "",
        telesAmount: "",
        nicoleAmount: "",
        paidStatus: false,
      });
      setShowPaymentForm(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDebtAccount = async (accountId: string) => {
    const { error } = await supabase
      .from("debt_accounts")
      .delete()
      .eq("id", accountId);

    if (!error) {
      setDebtAccounts((prev) => prev.filter((a) => a.id !== accountId));
    }
  };

  const archiveDebtAccount = async (accountId: string, archiveReason: string) => {
    const { error } = await supabase
      .from("debt_accounts")
      .update(buildArchivePayload(archiveReason))
      .eq("id", accountId);

    if (error) {
      throw new Error(error.message);
    }

    if (editingAccountId === accountId) {
      resetAccountForm();
    }

    await fetchData();
  };

  const reopenDebtAccount = async (accountId: string) => {
    const { error } = await supabase
      .from("debt_accounts")
      .update(buildReopenPayload())
      .eq("id", accountId);

    if (error) {
      throw new Error(error.message);
    }

    await fetchData();
  };

  const toggleDebtPaymentPaidStatus = async (payment: DebtPayment) => {
    setError(null);

    const account = debtAccounts.find((a) => a.id === payment.debt_account_id);
    if (!account) {
      setError("Debt account not found");
      return;
    }

    const newPaidStatus = !payment.paid_status;
    const direction = newPaidStatus ? "pay" : "unpay";
    const newBalance = applyDebtPaymentBalanceChange(
      account.current_balance,
      payment.total_payment,
      direction
    );

    setTogglingPaymentId(payment.id);

    try {
      const { error: paymentError } = await supabase
        .from("debt_payments")
        .update({ paid_status: newPaidStatus })
        .eq("id", payment.id);

      if (paymentError) throw new Error(paymentError.message);

      if (payment.linked_bill_instance_id) {
        const { error: billError } = await supabase
          .from("bill_instances")
          .update({ is_paid: newPaidStatus })
          .eq("id", payment.linked_bill_instance_id);

        if (billError) throw new Error(billError.message);
      }

      const { error: balanceError } = await supabase
        .from("debt_accounts")
        .update({ current_balance: newBalance })
        .eq("id", account.id);

      if (balanceError) throw new Error(balanceError.message);

      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setTogglingPaymentId(null);
    }
  };

  const payDebtPayment = async (payment: DebtPayment) => {
    if (!household || !user) {
      return;
    }

    setPayError(null);

    const shareAmount = getMyBillShareAmount(payment, shareKey);
    if (shareAmount === null) {
      setPayError("Choose your budget profile in Settings before paying from cash.");
      return;
    }

    if (shareAmount <= 0) {
      setPayError("Your share for this payment is zero.");
      return;
    }

    if (paymentByDebtPaymentId.has(payment.id)) {
      setPayError("This item has already been deducted from your current amount.");
      return;
    }

    setPayingPaymentId(payment.id);

    const accountName = getAccountName(payment.debt_account_id);
    const { result, error } = await paySourceFromCurrentCash({
      householdId: household.id,
      userId: user.id,
      personId: usablePersonId,
      sourceType: "debt_payment",
      sourceId: payment.id,
      amount: shareAmount,
      notes: `Paid debt payment: ${accountName}`,
    });

    setPayingPaymentId(null);

    if (error || !result) {
      setPayError(error ?? "Could not pay debt payment from current cash.");
      return;
    }

    if (result.transaction) {
      setPaymentTransactions((prev) => [result.transaction!, ...prev]);
    }

    await fetchData();
  };

  const deleteDebtPayment = async (paymentId: string) => {
    setError(null);
    const payment = debtPayments.find((p) => p.id === paymentId);
    if (!payment) return;

    const account = debtAccounts.find((a) => a.id === payment.debt_account_id);

    try {
      if (payment.paid_status && account) {
        const restoredBalance = applyDebtPaymentBalanceChange(
          account.current_balance,
          payment.total_payment,
          "unpay"
        );
        const { error: balanceError } = await supabase
          .from("debt_accounts")
          .update({ current_balance: restoredBalance })
          .eq("id", account.id);

        if (balanceError) throw new Error(balanceError.message);
      }

      if (payment.linked_bill_instance_id) {
        const { error: billError } = await supabase
          .from("bill_instances")
          .delete()
          .eq("id", payment.linked_bill_instance_id);

        if (billError) throw new Error(billError.message);
      }

      const { error: paymentError } = await supabase
        .from("debt_payments")
        .delete()
        .eq("id", paymentId);

      if (paymentError) throw new Error(paymentError.message);

      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const getAccountName = (accountId: string) => {
    const account = debtAccounts.find((a) => a.id === accountId);
    return account?.name || "Unknown";
  };

  const renderAccountArchiveBadge = (account: DebtAccount) => {
    const badgeLabel = getDebtAccountArchivedBadgeLabel(account);
    if (!badgeLabel) {
      return null;
    }

    return (
      <Badge variant="secondary" className="ml-2">
        {badgeLabel}
      </Badge>
    );
  };

  const renderDebtAccountRow = (
    account: DebtAccount,
    options: { archived: boolean }
  ) => {
    const totalPaid = computeDebtAccountTotalPaid(account);
    const archivedDateLabel = formatDebtAccountArchivedDate(account.archived_at);
    const archiveStatus = getDebtAccountArchiveStatus(account);

    return (
      <TableRow key={account.id}>
        <TableCell className="font-medium">
          <div className="flex flex-wrap items-center gap-2">
            <span>{account.name}</span>
            {options.archived && renderAccountArchiveBadge(account)}
          </div>
          {options.archived && account.archive_reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              Reason: {account.archive_reason}
            </p>
          )}
        </TableCell>
        <TableCell className="text-right">
          {formatCurrency(account.original_amount)}
        </TableCell>
        <TableCell className="text-right">
          {formatCurrency(totalPaid)}
        </TableCell>
        <TableCell className="text-right font-semibold">
          {formatCurrency(account.current_balance)}
        </TableCell>
        <TableCell>
          {options.archived ? (
            archivedDateLabel ?? "-"
          ) : account.target_payoff_date ? (
            format(new Date(account.target_payoff_date), "MMM d, yyyy")
          ) : (
            "-"
          )}
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-1">
            {options.archived ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReopenDialogAccountId(account.id)}
              >
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Reopen
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => startEditAccount(account)}
                  aria-label={`Edit ${account.name}`}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setArchiveDialogAccountId(account.id)}
                  aria-label={archiveStatus.closeActionLabel}
                >
                  <Archive className="h-4 w-4 text-muted-foreground" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${account.name}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Debt Account</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{account.name}"? All associated
                        payments will also be deleted. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteDebtAccount(account.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const pendingGenerateAccount = pendingGenerateAccountId
    ? debtAccounts.find((account) => account.id === pendingGenerateAccountId)
    : null;

  const replacementAccount = replacementAccountId
    ? debtAccounts.find((account) => account.id === replacementAccountId)
    : null;

  const buildReplacementParams = (): DebtScheduleReplacementParams | null => {
    const paymentsLeft = parseInt(scheduleForm.paymentsLeft);
    const regularPayment = parseFloat(scheduleForm.totalPaymentPerPayment);
    const customTeles = parseFloat(scheduleForm.telesAmount);
    const customNicole = parseFloat(scheduleForm.nicoleAmount);

    if (isNaN(paymentsLeft) || paymentsLeft <= 0) {
      setError("Please enter a valid number of payments");
      return null;
    }

    if (isNaN(regularPayment) || regularPayment <= 0) {
      setError("Please enter a valid payment amount");
      return null;
    }

    if (scheduleForm.splitType === "custom") {
      if (isNaN(customTeles) || isNaN(customNicole)) {
        setError("Please enter valid custom split amounts");
        return null;
      }
      if (Math.abs(customTeles + customNicole - regularPayment) > 0.01) {
        setError("Custom split amounts must add up to the payment amount");
        return null;
      }
    }

    return {
      paymentsLeft,
      firstPaymentDate: scheduleForm.firstPaymentDate,
      regularPayment,
      splitType: scheduleForm.splitType,
      customTeles:
        scheduleForm.splitType === "custom" ? customTeles : undefined,
      customNicole:
        scheduleForm.splitType === "custom" ? customNicole : undefined,
    };
  };

  const openReplacementDialog = (account: DebtAccount) => {
    setError(null);
    if (!isDebtScheduleActionAllowed(account)) {
      setError("Reopen this archived account before replacing its payment schedule.");
      return;
    }

    const params = buildReplacementParams();
    if (!params) {
      return;
    }

    const accountPayments = debtPayments.filter(
      (payment) => payment.debt_account_id === account.id
    );
    if (accountPayments.length === 0) {
      setError("This account has no scheduled payments to replace.");
      return;
    }

    setReplacementAccountId(account.id);
    setReplacementParams(params);
  };

  const renderPaymentScheduleSection = (account?: DebtAccount) => (
    <div className="space-y-4 rounded-lg border border-dashed p-4">
      <div>
        <h3 className="text-sm font-medium">Payment Planning</h3>
        <p className="text-sm text-muted-foreground">
          Monthly payments on the 1st, assigned to period 1–14.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="paymentsLeft">Payments Left</Label>
          <Input
            id="paymentsLeft"
            type="number"
            min="1"
            step="1"
            value={scheduleForm.paymentsLeft}
            onChange={(e) => {
              const paymentsLeft = e.target.value;
              const balance = parseFloat(accountForm.currentBalance);
              setScheduleForm((prev) => ({
                ...prev,
                paymentsLeft,
                ...updateScheduleFromBalance(balance, paymentsLeft, prev.splitType),
              }));
            }}
            disabled={submitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="firstPaymentDate">First Payment Date</Label>
          <Input
            id="firstPaymentDate"
            type="date"
            value={scheduleForm.firstPaymentDate}
            onChange={(e) =>
              setScheduleForm((prev) => ({
                ...prev,
                firstPaymentDate: e.target.value,
              }))
            }
            disabled={submitting}
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Payment Frequency</Label>
          <Input value="Monthly" disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduleTotalPayment">Total Payment Per Payment (CA$)</Label>
          <Input
            id="scheduleTotalPayment"
            type="number"
            step="0.01"
            min="0"
            value={scheduleForm.totalPaymentPerPayment}
            onChange={(e) => handleSchedulePaymentAmountChange(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Split Type</Label>
          <Select
            value={scheduleForm.splitType}
            onValueChange={(value: ScheduleSplitType) => {
              const balance = parseFloat(accountForm.currentBalance);
              if (value === "5149") {
                const regular = parseFloat(scheduleForm.totalPaymentPerPayment);
                const amount = isNaN(regular)
                  ? computeRegularDebtPayment(
                      balance,
                      parseInt(scheduleForm.paymentsLeft) || 0
                    )
                  : regular;
                const { teles, nicole } = split5149(amount);
                setScheduleForm((prev) => ({
                  ...prev,
                  splitType: value,
                  telesAmount: teles.toFixed(2),
                  nicoleAmount: nicole.toFixed(2),
                }));
                return;
              }
              setScheduleForm((prev) => ({ ...prev, splitType: value }));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5149">51/49</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduleTelesAmount">Teles Amount (CA$)</Label>
          <Input
            id="scheduleTelesAmount"
            type="number"
            step="0.01"
            min="0"
            value={scheduleForm.telesAmount}
            onChange={(e) =>
              setScheduleForm((prev) => ({ ...prev, telesAmount: e.target.value }))
            }
            disabled={submitting || scheduleForm.splitType === "5149"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduleNicoleAmount">Nicole Amount (CA$)</Label>
          <Input
            id="scheduleNicoleAmount"
            type="number"
            step="0.01"
            min="0"
            value={scheduleForm.nicoleAmount}
            onChange={(e) =>
              setScheduleForm((prev) => ({ ...prev, nicoleAmount: e.target.value }))
            }
            disabled={submitting || scheduleForm.splitType === "5149"}
          />
        </div>
      </div>
      {account ? (
        <div className="flex flex-wrap justify-end gap-2">
          {isDebtAccountArchived(account) ? (
            <p className="w-full text-sm text-muted-foreground">
              This account is archived. Reopen it to generate or replace scheduled payments.
            </p>
          ) : (
            <>
              {debtPayments.some((payment) => payment.debt_account_id === account.id) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openReplacementDialog(account)}
                  disabled={submitting}
                >
                  Replace future unpaid scheduled payments
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => generatePaymentSchedule(account)}
                disabled={submitting}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Payment Schedule
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Save the account first, then edit it to generate scheduled payments.
        </p>
      )}
    </div>
  );

  if (!household) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Debt Tracker</h1>
                <p className="text-sm text-muted-foreground">
                  Manage debt accounts and payments
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {payError && (
          <Alert variant="destructive">
            <AlertDescription>{payError}</AlertDescription>
          </Alert>
        )}
        {warning && (
          <Alert>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}

        {settingsLoaded && cashflowStartDate && hasPreStartDebtPayments && (
          <Alert>
            <AlertDescription>{DEBT_PROGRESS_EXCLUDES_PRE_START_NOTICE}</AlertDescription>
          </Alert>
        )}

        <DebtProgressDashboard
          activeTotals={activeDebtProgressTotals}
          activeAccountProgress={activeAccountProgress}
          archivedAccountProgress={archivedAccountProgress}
          loading={loading}
        />

        {/* Debt Accounts Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Debt Accounts
              </CardTitle>
              <CardDescription>
                {activeDebtAccounts.length} active account
                {activeDebtAccounts.length !== 1 ? "s" : ""}
                {archivedDebtAccounts.length > 0
                  ? ` · ${archivedDebtAccounts.length} archived`
                  : ""}
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                if (showAccountForm) {
                  setShowAccountForm(false);
                  return;
                }
                setEditingAccountId(null);
                setAccountForm({
                  name: "",
                  originalAmount: "",
                  currentBalance: "",
                  targetPayoffDate: "",
                  notes: "",
                });
                setScheduleForm(createDefaultScheduleForm());
                setShowAccountForm(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </CardHeader>
          <CardContent>
            {archivedDebtAccounts.length > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <Checkbox
                  id="showArchivedAccounts"
                  checked={showArchivedAccounts}
                  onCheckedChange={(checked) =>
                    setShowArchivedAccounts(checked === true)
                  }
                />
                <Label htmlFor="showArchivedAccounts">
                  Show archived/closed accounts ({archivedDebtAccounts.length})
                </Label>
              </div>
            )}

            {showAccountForm && (
              <form onSubmit={createDebtAccount} className="mb-6 space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                      id="accountName"
                      placeholder="e.g., Chase Credit Card"
                      required
                      value={accountForm.name}
                      onChange={(e) =>
                        setAccountForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="originalAmount">Original Amount (CA$)</Label>
                    <Input
                      id="originalAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={accountForm.originalAmount}
                      onChange={(e) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          originalAmount: e.target.value,
                        }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="currentBalance">Current Balance (CA$)</Label>
                    <Input
                      id="currentBalance"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={accountForm.currentBalance}
                      onChange={(e) => {
                        const currentBalance = e.target.value;
                        setAccountForm((prev) => ({ ...prev, currentBalance }));
                        const balance = parseFloat(currentBalance);
                        setScheduleForm((prev) => ({
                          ...prev,
                          ...updateScheduleFromBalance(
                            balance,
                            prev.paymentsLeft,
                            prev.splitType
                          ),
                        }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetPayoffDate">Target Payoff Date (Optional)</Label>
                    <Input
                      id="targetPayoffDate"
                      type="date"
                      value={accountForm.targetPayoffDate}
                      onChange={(e) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          targetPayoffDate: e.target.value,
                        }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNotes">Notes (Optional)</Label>
                  <Textarea
                    id="accountNotes"
                    placeholder="Add any notes about this debt..."
                    value={accountForm.notes}
                    onChange={(e) =>
                      setAccountForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    disabled={submitting}
                  />
                </div>
                {renderPaymentScheduleSection()}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetAccountForm}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </div>
              </form>
            )}

            {editingAccountId && (
              <form onSubmit={updateDebtAccount} className="mb-6 space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Edit Debt Account</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="editAccountName">Account Name</Label>
                    <Input
                      id="editAccountName"
                      required
                      value={accountForm.name}
                      onChange={(e) =>
                        setAccountForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editOriginalAmount">Original Amount (CA$)</Label>
                    <Input
                      id="editOriginalAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={accountForm.originalAmount}
                      onChange={(e) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          originalAmount: e.target.value,
                        }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="editCurrentBalance">Current Balance (CA$)</Label>
                    <Input
                      id="editCurrentBalance"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={accountForm.currentBalance}
                      onChange={(e) => {
                        const currentBalance = e.target.value;
                        setAccountForm((prev) => ({ ...prev, currentBalance }));
                        const balance = parseFloat(currentBalance);
                        setScheduleForm((prev) => ({
                          ...prev,
                          ...updateScheduleFromBalance(
                            balance,
                            prev.paymentsLeft,
                            prev.splitType
                          ),
                        }));
                      }}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editTargetPayoffDate">Target Payoff Date (Optional)</Label>
                    <Input
                      id="editTargetPayoffDate"
                      type="date"
                      value={accountForm.targetPayoffDate}
                      onChange={(e) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          targetPayoffDate: e.target.value,
                        }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editAccountNotes">Notes (Optional)</Label>
                  <Textarea
                    id="editAccountNotes"
                    value={accountForm.notes}
                    onChange={(e) =>
                      setAccountForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    disabled={submitting}
                  />
                </div>
                {renderPaymentScheduleSection(
                  debtAccounts.find((account) => account.id === editingAccountId)
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetAccountForm}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : activeDebtAccounts.length === 0 && !showArchivedAccounts ? (
              <div className="text-center py-8 text-muted-foreground">
                {archivedDebtAccounts.length > 0
                  ? "No active debt accounts. Enable “Show archived/closed accounts” to view archived debts."
                  : 'No debt accounts yet. Click "Add Account" to create one.'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Target Payoff</TableHead>
                    <TableHead className="w-36"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeDebtAccounts.map((account) =>
                    renderDebtAccountRow(account, { archived: false })
                  )}
                </TableBody>
              </Table>
            )}

            {showArchivedAccounts && archivedDebtAccounts.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-medium">Archived / closed accounts</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Total Paid</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead>Archived</TableHead>
                      <TableHead className="w-36"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archivedDebtAccounts.map((account) =>
                      renderDebtAccountRow(account, { archived: true })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debt Payments Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Debt Payments</CardTitle>
              <CardDescription>
                {debtPayments.length} payment{debtPayments.length !== 1 ? "s" : ""} total.
                {settingsLoaded &&
                  cashflowStartDate &&
                  hasPreStartDebtPayments &&
                  !showPreStartDebtPayments && (
                    <>
                      {" "}
                      {visibleDebtPayments.length} in active list (
                      {preStartPayments.length} before cashflow start).
                    </>
                  )}{" "}
                {PAYMENT_UX_EXPLANATION}
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowPaymentForm(!showPaymentForm)}
              disabled={activeDebtAccounts.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Payment
            </Button>
          </CardHeader>
          <CardContent>
            {settingsLoaded &&
              cashflowStartDate &&
              hasPreStartDebtPayments && (
                <Alert className="mb-4">
                  <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{DEBT_PAYMENTS_PRE_START_HIDDEN_NOTICE}</span>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="show-pre-start-debt-payments"
                        checked={showPreStartDebtPayments}
                        onCheckedChange={(checked) =>
                          setShowPreStartDebtPayments(checked === true)
                        }
                      />
                      <Label
                        htmlFor="show-pre-start-debt-payments"
                        className="text-sm font-normal"
                      >
                        {SHOW_PRE_START_DEBT_PAYMENTS_LABEL}
                      </Label>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

            {activeDebtAccounts.length === 0 && (
              <div className="text-center py-4 text-muted-foreground mb-4">
                Create an active debt account first before adding payments.
              </div>
            )}

            {showPaymentForm && (
              <form onSubmit={createDebtPayment} className="mb-6 space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Debt Account</Label>
                    <Select
                      value={paymentForm.debtAccountId}
                      onValueChange={(value) =>
                        setPaymentForm((prev) => ({ ...prev, debtAccountId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeDebtAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({formatCurrency(account.current_balance)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentDate">Payment Date</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      required
                      value={paymentForm.paymentDate}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="totalPayment">Total Payment (CA$)</Label>
                    <Input
                      id="totalPayment"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={paymentForm.totalPayment}
                      onChange={(e) => handlePaymentAmountChange(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telesPayment">Teles Amount (CA$)</Label>
                    <Input
                      id="telesPayment"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={paymentForm.telesAmount}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, telesAmount: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nicolePayment">Nicole Amount (CA$)</Label>
                    <Input
                      id="nicolePayment"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                      value={paymentForm.nicoleAmount}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, nicoleAmount: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select
                      value={paymentForm.month}
                      onValueChange={(value) =>
                        setPaymentForm((prev) => ({ ...prev, month: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select
                      value={paymentForm.year}
                      onValueChange={(value) =>
                        setPaymentForm((prev) => ({ ...prev, year: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
                          <SelectItem key={y} value={y.toString()}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center pt-8">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="paidStatus"
                        checked={paymentForm.paidStatus}
                        onCheckedChange={(checked) =>
                          setPaymentForm((prev) => ({
                            ...prev,
                            paidStatus: checked === true,
                          }))
                        }
                        disabled={submitting}
                      />
                      <Label htmlFor="paidStatus" className="font-normal">
                        Mark paid
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPaymentForm(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Payment
                  </Button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : debtPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No debt payments yet.
              </div>
            ) : visibleDebtPayments.length === 0 ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {hasPreStartDebtPayments && !showPreStartDebtPayments
                    ? "All recorded debt payments are before the cashflow start date."
                    : "No debt payments match the current view."}
                </p>
                {hasPreStartDebtPayments && !showPreStartDebtPayments ? (
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => setShowPreStartDebtPayments(true)}
                  >
                    {SHOW_PRE_START_DEBT_PAYMENTS_LABEL}
                  </Button>
                ) : null}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Mark paid</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                    <TableHead className="text-right text-blue-600 dark:text-blue-400">
                      Teles
                    </TableHead>
                    <TableHead className="text-right text-green-600 dark:text-green-400">
                      Nicole
                    </TableHead>
                    <TableHead className="text-right">
                      Projected Remaining After Payment
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44">Pay & deduct cash</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleDebtPayments.map((payment) => {
                    const cashStatus = getCashDeductionStatus({
                      isMarkedPaid: payment.paid_status,
                      hasPaymentTransaction: paymentByDebtPaymentId.has(payment.id),
                    });
                    const preStartLabel = getDebtPaymentPreStartLabel(
                      payment,
                      cashflowStartDate
                    );
                    const isPreStartPayment = isDebtPaymentPreStart(
                      payment,
                      cashflowStartDate
                    );

                    return (
                    <TableRow
                      key={payment.id}
                      className={
                        isPreStartPayment && showPreStartDebtPayments
                          ? "text-muted-foreground"
                          : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={payment.paid_status}
                          onCheckedChange={() =>
                            toggleDebtPaymentPaidStatus(payment)
                          }
                          disabled={
                            submitting || togglingPaymentId === payment.id
                          }
                          aria-label="Mark paid"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{getAccountName(payment.debt_account_id)}</span>
                          {(() => {
                            const account = debtAccounts.find(
                              (row) => row.id === payment.debt_account_id
                            );
                            return account ? renderAccountArchiveBadge(account) : null;
                          })()}
                          {preStartLabel && showPreStartDebtPayments && (
                            <Badge variant="secondary">{preStartLabel}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(payment.payment_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {MONTHS.find((m) => m.value === payment.month.toString())?.label}{" "}
                        {payment.year}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.total_payment)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(payment.teles_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(payment.nicole_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {payment.remaining_balance_after_payment !== null
                          ? formatCurrency(payment.remaining_balance_after_payment)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {cashDeductionStatusLabel(cashStatus)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {cashStatus === "unpaid" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={
                              payingPaymentId === payment.id ||
                              togglingPaymentId === payment.id
                            }
                            onClick={() => void payDebtPayment(payment)}
                          >
                            Pay & deduct cash
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`View details for ${getAccountName(payment.debt_account_id)} payment`}
                            onClick={() => setDetailPaymentId(payment.id)}
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditPayment(payment)}
                            disabled={submitting || togglingPaymentId === payment.id}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Payment</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this payment? The linked bill
                                instance will also be deleted. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteDebtPayment(payment.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={editingPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPaymentId(null);
        }}
      >
        <DialogContent>
          <form onSubmit={updateDebtPayment}>
            <DialogHeader>
              <DialogTitle>Edit Payment</DialogTitle>
              <DialogDescription>
                Update the payment amount and Teles/Nicole split. Linked bill
                instances stay in sync.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="editTotalPayment">Total Payment (CA$)</Label>
                <Input
                  id="editTotalPayment"
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentEditForm.totalPayment}
                  onChange={(e) => handlePaymentEditAmountChange(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTelesAmount">Teles Amount (CA$)</Label>
                <Input
                  id="editTelesAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentEditForm.telesAmount}
                  onChange={(e) =>
                    setPaymentEditForm((prev) => ({
                      ...prev,
                      telesAmount: e.target.value,
                    }))
                  }
                  disabled={submitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editNicoleAmount">Nicole Amount (CA$)</Label>
                <Input
                  id="editNicoleAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentEditForm.nicoleAmount}
                  onChange={(e) =>
                    setPaymentEditForm((prev) => ({
                      ...prev,
                      nicoleAmount: e.target.value,
                    }))
                  }
                  disabled={submitting}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingPaymentId(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DebtScheduleReplacementDialog
        open={replacementAccountId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReplacementAccountId(null);
            setReplacementParams(null);
          }
        }}
        account={replacementAccount ?? null}
        accountPayments={
          replacementAccount
            ? debtPayments.filter(
                (payment) => payment.debt_account_id === replacementAccount.id
              )
            : []
        }
        cashDeductedPaymentIds={cashDeductedPaymentIds}
        scheduleParams={replacementParams}
        onReplaced={() => {
          void fetchData();
        }}
      />

      <AlertDialog
        open={pendingGenerateAccountId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingGenerateAccountId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Payments Already Exist</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingGenerateAccount
                ? `"${pendingGenerateAccount.name}" already has ${debtPayments.filter((payment) => payment.debt_account_id === pendingGenerateAccount.id).length} scheduled payment(s). Generating again will create duplicates. Continue anyway?`
                : "This debt account already has scheduled payments. Generating again will create duplicates. Continue anyway?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingGenerateAccount) {
                  void generatePaymentSchedule(pendingGenerateAccount, true);
                }
              }}
            >
              Generate Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DebtAccountArchiveDialog
        account={archiveDialogAccount}
        open={archiveDialogAccountId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveDialogAccountId(null);
          }
        }}
        onConfirm={async (archiveReason) => {
          if (!archiveDialogAccountId) {
            return;
          }
          await archiveDebtAccount(archiveDialogAccountId, archiveReason);
        }}
      />

      <AlertDialog
        open={reopenDialogAccountId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReopenDialogAccountId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen debt account</AlertDialogTitle>
            <AlertDialogDescription>
              {reopenDialogAccount
                ? `Restore "${reopenDialogAccount.name}" to the active debt list? ${DEBT_ACCOUNT_REOPEN_MESSAGE}`
                : DEBT_ACCOUNT_REOPEN_MESSAGE}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (reopenDialogAccountId) {
                  void reopenDebtAccount(reopenDialogAccountId).finally(() => {
                    setReopenDialogAccountId(null);
                  });
                }
              }}
            >
              Reopen account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DebtPaymentDetailPanel
        detail={detailPaymentView}
        open={detailPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailPaymentId(null);
          }
        }}
      />
    </div>
  );
}
