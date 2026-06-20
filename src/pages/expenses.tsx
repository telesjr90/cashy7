import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  ADJUSTMENT_PAY_DISABLED_MESSAGE,
  buildManualExpenseDetailView,
  PAID_THROUGH_APP_DELETE_MESSAGE,
  PAID_THROUGH_APP_EDIT_MESSAGE,
} from "@/lib/expense-detail";
import {
  DEFAULT_MANUAL_EXPENSE_FILTERS,
  filterManualExpenses,
  isManualExpenseFiltersActive,
  type ManualExpenseFilters,
} from "@/lib/expense-filters";
import {
  adjustmentDirectionLabel,
  calculateExpenseSplit,
  canDeleteManualExpense,
  createManualExpense,
  deleteManualExpense,
  expenseScopeLabel,
  expenseSplitTypeLabel,
  formatExpensePeriodBucket,
  getExpensePeriodBucket,
  getManualExpenses,
  getMyExpenseShareAmount,
  isManualExpenseAdjustment,
  isManualExpensePaidThroughApp,
  markManualExpensePaid,
  updateManualExpense,
  validateCustomExpenseSplit,
  validateManualExpenseAdjustmentInput,
  validateManualExpenseUpdate,
} from "@/lib/expenses";
import {
  resolveBillShareKeyForPerson,
} from "@/lib/bill-share";
import { getHouseholdPeople } from "@/lib/user-person";
import {
  getMyCashPaymentTransactions,
  getPaidManualExpenseSourceIds,
  paySourceFromCurrentCash,
  getCashDeductionStatus,
  cashDeductionStatusLabel,
  PAYMENT_UX_EXPLANATION,
} from "@/lib/payments";
import {
  CASH_CREDIT_UX_NOTE,
  canShowCashCreditActionForAdjustment,
  creditManualExpenseAdjustmentToCurrentCash,
  getCreditedManualExpenseAdjustmentSourceIds,
  getManualExpenseAdjustmentCashCreditAmount,
  getMyCashAdjustmentTransactions,
  isAdjustmentAlreadyCredited,
  isDecreaseManualExpenseAdjustment,
} from "@/lib/cash-adjustments";
import type {
  CashAdjustmentTransaction,
  CashPaymentTransaction,
  ManualExpense,
  ManualExpenseAdjustmentDirection,
  ManualExpenseScope,
  ManualExpenseSplitType,
  Person,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, Loader as Loader2, Pencil, Receipt, Search, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

function todayIsoDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

export function ExpensesPage() {
  const { user, household, membership } = useAuth();
  const [expenses, setExpenses] = useState<ManualExpense[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<
    CashPaymentTransaction[]
  >([]);
  const [cashAdjustmentTransactions, setCashAdjustmentTransactions] = useState<
    CashAdjustmentTransaction[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);
  const [creditingAdjustmentId, setCreditingAdjustmentId] = useState<
    string | null
  >(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    description: "",
    category: "",
    amountInput: "",
    expenseDate: todayIsoDate(),
    expenseScope: "private" as ManualExpenseScope,
    splitType: "personal" as ManualExpenseSplitType,
    customTelesInput: "",
    customNicoleInput: "",
    notes: "",
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [adjustingOriginalExpense, setAdjustingOriginalExpense] =
    useState<ManualExpense | null>(null);
  const [adjustmentFormError, setAdjustmentFormError] = useState<string | null>(null);
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    adjustmentDirection: "increase" as ManualExpenseAdjustmentDirection,
    amountInput: "",
    expenseDate: todayIsoDate(),
    splitType: "personal" as ManualExpenseSplitType,
    customTelesInput: "",
    customNicoleInput: "",
    adjustmentReason: "",
    description: "",
    notes: "",
  });
  const [detailExpenseId, setDetailExpenseId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ManualExpenseFilters>(
    DEFAULT_MANUAL_EXPENSE_FILTERS
  );

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [expenseScope, setExpenseScope] = useState<ManualExpenseScope>("private");
  const [splitType, setSplitType] = useState<ManualExpenseSplitType>("personal");
  const [customTelesInput, setCustomTelesInput] = useState("");
  const [customNicoleInput, setCustomNicoleInput] = useState("");
  const [notes, setNotes] = useState("");

  const mappedPerson = useMemo(() => {
    if (!membership?.person_id) {
      return null;
    }
    return people.find((person) => person.id === membership.person_id) ?? null;
  }, [membership?.person_id, people]);

  const previewSplit = useMemo(() => {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      return null;
    }

    if (splitType === "custom") {
      const telesAmount = Number(customTelesInput);
      const nicoleAmount = Number(customNicoleInput);
      if (!Number.isFinite(telesAmount) || !Number.isFinite(nicoleAmount)) {
        return null;
      }
      const validationError = validateCustomExpenseSplit(
        amount,
        telesAmount,
        nicoleAmount
      );
      if (validationError) {
        return { amounts: null, error: validationError };
      }
      return {
        amounts: { telesAmount, nicoleAmount },
        error: null,
      };
    }

    return calculateExpenseSplit(amount, splitType, { person: mappedPerson });
  }, [
    amountInput,
    splitType,
    customTelesInput,
    customNicoleInput,
    mappedPerson,
  ]);

  const periodBucket = useMemo(
    () => getExpensePeriodBucket(expenseDate),
    [expenseDate]
  );

  const shareKey = useMemo(
    () => resolveBillShareKeyForPerson(mappedPerson),
    [mappedPerson]
  );

  const paymentByExpenseId = useMemo(() => {
    const map = new Map<string, CashPaymentTransaction>();
    for (const tx of paymentTransactions) {
      if (tx.source_type === "manual_expense") {
        map.set(tx.source_id, tx);
      }
    }
    return map;
  }, [paymentTransactions]);

  const paidManualExpenseIds = useMemo(
    () => getPaidManualExpenseSourceIds(paymentTransactions),
    [paymentTransactions]
  );

  const filtersActive = useMemo(
    () => isManualExpenseFiltersActive(filters),
    [filters]
  );

  const filteredExpenses = useMemo(
    () =>
      filterManualExpenses(expenses, filters, {
        paidManualExpenseIds,
      }),
    [expenses, filters, paidManualExpenseIds]
  );

  const creditedAdjustmentIds = useMemo(
    () =>
      getCreditedManualExpenseAdjustmentSourceIds(cashAdjustmentTransactions),
    [cashAdjustmentTransactions]
  );

  const expenseById = useMemo(
    () => new Map(expenses.map((expense) => [expense.id, expense])),
    [expenses]
  );

  const creditTransactionByAdjustmentId = useMemo(() => {
    const map = new Map<string, CashAdjustmentTransaction>();
    for (const tx of cashAdjustmentTransactions) {
      if (tx.source_type === "manual_expense_adjustment") {
        map.set(tx.source_id, tx);
      }
    }
    return map;
  }, [cashAdjustmentTransactions]);

  const detailExpense =
    detailExpenseId !== null
      ? (expenseById.get(detailExpenseId) ?? null)
      : null;

  const detailView = useMemo(() => {
    if (!detailExpense || !user) {
      return null;
    }

    return buildManualExpenseDetailView({
      expense: detailExpense,
      visibleExpenses: expenses,
      userId: user.id,
      shareKey,
      paidManualExpenseIds: paidManualExpenseIds,
      paymentTransaction: paymentByExpenseId.get(detailExpense.id) ?? null,
      creditTransaction:
        creditTransactionByAdjustmentId.get(detailExpense.id) ?? null,
      creditedAdjustmentIds,
    });
  }, [
    creditTransactionByAdjustmentId,
    creditedAdjustmentIds,
    detailExpense,
    expenses,
    paidManualExpenseIds,
    paymentByExpenseId,
    shareKey,
    user,
  ]);

  const editingExpense =
    expenses.find((expense) => expense.id === editingExpenseId) ?? null;

  const editPreviewSplit = useMemo(() => {
    const amount = Number(editForm.amountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      return null;
    }

    if (editForm.splitType === "custom") {
      const telesAmount = Number(editForm.customTelesInput);
      const nicoleAmount = Number(editForm.customNicoleInput);
      if (!Number.isFinite(telesAmount) || !Number.isFinite(nicoleAmount)) {
        return null;
      }
      const validationError = validateCustomExpenseSplit(
        amount,
        telesAmount,
        nicoleAmount
      );
      if (validationError) {
        return { amounts: null, error: validationError };
      }
      return {
        amounts: { telesAmount, nicoleAmount },
        error: null,
      };
    }

    return calculateExpenseSplit(amount, editForm.splitType, {
      person: mappedPerson,
    });
  }, [
    editForm.amountInput,
    editForm.splitType,
    editForm.customTelesInput,
    editForm.customNicoleInput,
    mappedPerson,
  ]);

  const editPeriodBucket = useMemo(
    () => getExpensePeriodBucket(editForm.expenseDate),
    [editForm.expenseDate]
  );

  const adjustmentPreviewSplit = useMemo(() => {
    const amount = Number(adjustmentForm.amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    if (adjustmentForm.splitType === "custom") {
      const telesAmount = Number(adjustmentForm.customTelesInput);
      const nicoleAmount = Number(adjustmentForm.customNicoleInput);
      if (!Number.isFinite(telesAmount) || !Number.isFinite(nicoleAmount)) {
        return null;
      }
      const validationError = validateCustomExpenseSplit(
        amount,
        telesAmount,
        nicoleAmount
      );
      if (validationError) {
        return { amounts: null, error: validationError };
      }
      return {
        amounts: { telesAmount, nicoleAmount },
        error: null,
      };
    }

    return calculateExpenseSplit(amount, adjustmentForm.splitType, {
      person: mappedPerson,
    });
  }, [
    adjustmentForm.amountInput,
    adjustmentForm.splitType,
    adjustmentForm.customTelesInput,
    adjustmentForm.customNicoleInput,
    mappedPerson,
  ]);

  const adjustmentPeriodBucket = useMemo(
    () => getExpensePeriodBucket(adjustmentForm.expenseDate),
    [adjustmentForm.expenseDate]
  );

  const fetchData = useCallback(async () => {
    if (!household || !user) {
      return;
    }

    setLoading(true);
    setError(null);

    const [expensesResult, peopleResult, paymentsResult, adjustmentsResult] =
      await Promise.all([
        getManualExpenses(household.id),
        getHouseholdPeople(household.id),
        getMyCashPaymentTransactions(household.id, user.id),
        getMyCashAdjustmentTransactions(household.id, user.id),
      ]);

    if (expensesResult.error) {
      setError(expensesResult.error);
      setExpenses([]);
    } else {
      setExpenses(expensesResult.expenses);
    }

    if (peopleResult.error) {
      setError((current) => current ?? peopleResult.error);
      setPeople([]);
    } else {
      setPeople(peopleResult.people);
    }

    if (paymentsResult.error) {
      setError((current) => current ?? paymentsResult.error);
      setPaymentTransactions([]);
    } else {
      setPaymentTransactions(paymentsResult.transactions);
    }

    if (adjustmentsResult.error) {
      setError((current) => current ?? adjustmentsResult.error);
      setCashAdjustmentTransactions([]);
    } else {
      setCashAdjustmentTransactions(adjustmentsResult.transactions);
    }

    setLoading(false);
  }, [household, user]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setDescription("");
    setCategory("");
    setAmountInput("");
    setExpenseDate(todayIsoDate());
    setExpenseScope("private");
    setSplitType("personal");
    setCustomTelesInput("");
    setCustomNicoleInput("");
    setNotes("");
    setFormError(null);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_MANUAL_EXPENSE_FILTERS);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!household || !user) {
      setFormError("You must be signed in with an active household.");
      return;
    }

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setFormError("Description is required.");
      return;
    }

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError("Enter a valid non-negative amount.");
      return;
    }

    const splitOptions =
      splitType === "custom"
        ? {
            customTelesAmount: Number(customTelesInput),
            customNicoleAmount: Number(customNicoleInput),
          }
        : { person: mappedPerson };

    const splitResult = calculateExpenseSplit(amount, splitType, splitOptions);
    if (splitResult.error) {
      setFormError(splitResult.error);
      return;
    }

    setSubmitting(true);

    const { expense, error: createError } = await createManualExpense({
      household_id: household.id,
      created_by_user_id: user.id,
      person_id: membership?.person_id ?? null,
      expense_scope: expenseScope,
      description: trimmedDescription,
      category: category.trim() || null,
      amount,
      expense_date: expenseDate,
      period_bucket: getExpensePeriodBucket(expenseDate),
      split_type: splitType,
      teles_amount: splitResult.amounts.telesAmount,
      nicole_amount: splitResult.amounts.nicoleAmount,
      notes: notes.trim() || null,
    });

    setSubmitting(false);

    if (createError || !expense) {
      setFormError(createError ?? "Could not create expense.");
      return;
    }

    resetForm();
    await fetchData();
  };

  const handleDelete = async (expenseId: string) => {
    const { error: deleteError } = await deleteManualExpense(expenseId);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    await fetchData();
  };

  const startEditExpense = (expense: ManualExpense) => {
    setEditingExpenseId(expense.id);
    setEditFormError(null);
    setEditForm({
      description: expense.description,
      category: expense.category ?? "",
      amountInput: String(expense.amount),
      expenseDate: expense.expense_date.slice(0, 10),
      expenseScope: expense.expense_scope,
      splitType: expense.split_type,
      customTelesInput: String(expense.teles_amount),
      customNicoleInput: String(expense.nicole_amount),
      notes: expense.notes ?? "",
    });
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEditFormError(null);

    if (!editingExpense) {
      return;
    }

    if (
      isManualExpensePaidThroughApp(editingExpense.id, paidManualExpenseIds)
    ) {
      setEditFormError(PAID_THROUGH_APP_EDIT_MESSAGE);
      return;
    }

    const validation = validateManualExpenseUpdate({
      description: editForm.description,
      amount: editForm.amountInput,
      expenseDate: editForm.expenseDate,
      splitType: editForm.splitType,
      customTelesAmount:
        editForm.splitType === "custom"
          ? Number(editForm.customTelesInput)
          : undefined,
      customNicoleAmount:
        editForm.splitType === "custom"
          ? Number(editForm.customNicoleInput)
          : undefined,
      person: mappedPerson,
      category: editForm.category,
      notes: editForm.notes,
      expenseScope: editForm.expenseScope,
    });

    if (validation.error || !validation.payload) {
      setEditFormError(validation.error ?? "Could not validate expense update.");
      return;
    }

    setSavingEdit(true);

    const { expense: updated, error: updateError } = await updateManualExpense(
      editingExpense.id,
      validation.payload
    );

    setSavingEdit(false);

    if (updateError || !updated) {
      setEditFormError(updateError ?? "Could not update expense.");
      return;
    }

    setEditingExpenseId(null);
    await fetchData();
  };

  const startCreateAdjustment = (expense: ManualExpense) => {
    setAdjustingOriginalExpense(expense);
    setAdjustmentFormError(null);
    setAdjustmentForm({
      adjustmentDirection: "increase",
      amountInput: "",
      expenseDate: todayIsoDate(),
      splitType: expense.split_type,
      customTelesInput: String(expense.teles_amount),
      customNicoleInput: String(expense.nicole_amount),
      adjustmentReason: "",
      description: `Adjustment for: ${expense.description}`,
      notes: "",
    });
  };

  const handleCreateAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdjustmentFormError(null);

    if (!household || !user || !adjustingOriginalExpense) {
      return;
    }

    const validation = validateManualExpenseAdjustmentInput({
      originalExpenseId: adjustingOriginalExpense.id,
      originalDescription: adjustingOriginalExpense.description,
      adjustmentDirection: adjustmentForm.adjustmentDirection,
      amount: adjustmentForm.amountInput,
      expenseDate: adjustmentForm.expenseDate,
      splitType: adjustmentForm.splitType,
      adjustmentReason: adjustmentForm.adjustmentReason,
      description: adjustmentForm.description,
      customTelesAmount:
        adjustmentForm.splitType === "custom"
          ? Number(adjustmentForm.customTelesInput)
          : undefined,
      customNicoleAmount:
        adjustmentForm.splitType === "custom"
          ? Number(adjustmentForm.customNicoleInput)
          : undefined,
      person: mappedPerson,
      expenseScope: adjustingOriginalExpense.expense_scope,
      notes: adjustmentForm.notes,
    });

    if (validation.error || !validation.payload) {
      setAdjustmentFormError(
        validation.error ?? "Could not validate adjustment."
      );
      return;
    }

    setSubmittingAdjustment(true);

    const { expense, error: createError } = await createManualExpense({
      household_id: household.id,
      created_by_user_id: user.id,
      person_id: membership?.person_id ?? null,
      ...validation.payload,
    });

    setSubmittingAdjustment(false);

    if (createError || !expense) {
      setAdjustmentFormError(createError ?? "Could not create adjustment.");
      return;
    }

    setAdjustingOriginalExpense(null);
    await fetchData();
  };

  const handleMarkPaid = async (expense: ManualExpense) => {
    if (expense.is_paid) {
      return;
    }

    setActionError(null);
    setMarkingPaidId(expense.id);

    const { expense: updated, error: markError } = await markManualExpensePaid(
      expense.id
    );

    setMarkingPaidId(null);

    if (markError || !updated) {
      setActionError(markError ?? "Could not mark expense as paid.");
      return;
    }

    setExpenses((prev) =>
      prev.map((row) => (row.id === expense.id ? updated : row))
    );
  };

  const handlePay = async (expense: ManualExpense) => {
    if (!household || !user) {
      return;
    }

    if (isManualExpenseAdjustment(expense)) {
      setActionError(ADJUSTMENT_PAY_DISABLED_MESSAGE);
      return;
    }

    setActionError(null);

    const shareAmount = getMyExpenseShareAmount(expense, shareKey);
    if (shareAmount === null) {
      setActionError("Choose your budget profile in Settings before paying from cash.");
      return;
    }

    if (shareAmount <= 0) {
      setActionError("Your share for this expense is zero.");
      return;
    }

    if (paymentByExpenseId.has(expense.id)) {
      setActionError("This item has already been deducted from your current amount.");
      return;
    }

    setPayingExpenseId(expense.id);

    const { result, error: payError } = await paySourceFromCurrentCash({
      householdId: household.id,
      userId: user.id,
      personId: membership?.person_id ?? null,
      sourceType: "manual_expense",
      sourceId: expense.id,
      amount: shareAmount,
      notes: `Paid expense: ${expense.description}`,
    });

    setPayingExpenseId(null);

    if (payError || !result) {
      setActionError(payError ?? "Could not pay expense from current cash.");
      return;
    }

    if (result.transaction) {
      setPaymentTransactions((prev) => [result.transaction!, ...prev]);
    }

    setExpenses((prev) =>
      prev.map((row) =>
        row.id === expense.id
          ? { ...row, is_paid: true, paid_at: new Date().toISOString() }
          : row
      )
    );
  };

  const handleCreditAdjustment = async (expense: ManualExpense) => {
    if (!household || !user) {
      return;
    }

    if (!isDecreaseManualExpenseAdjustment(expense)) {
      return;
    }

    if (isAdjustmentAlreadyCredited(expense.id, creditedAdjustmentIds)) {
      setActionError(
        "This adjustment has already been credited to your current amount."
      );
      return;
    }

    setActionError(null);

    const creditAmount = getManualExpenseAdjustmentCashCreditAmount(
      expense,
      shareKey
    );
    if (creditAmount === null) {
      setActionError(
        "Choose your budget profile in Settings before crediting cash."
      );
      return;
    }

    if (creditAmount <= 0) {
      setActionError("Your share for this adjustment is zero.");
      return;
    }

    setCreditingAdjustmentId(expense.id);

    const { result, error: creditError } =
      await creditManualExpenseAdjustmentToCurrentCash({
        householdId: household.id,
        userId: user.id,
        adjustmentManualExpenseId: expense.id,
        amount: creditAmount,
        notes: `Cash credit for adjustment: ${expense.description}`,
      });

    setCreditingAdjustmentId(null);

    if (creditError || !result) {
      setActionError(creditError ?? "Could not credit adjustment to current cash.");
      return;
    }

    if (result.transaction) {
      setCashAdjustmentTransactions((prev) => [result.transaction!, ...prev]);
    }
  };

  if (!household || !user) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Record manual spending. Private expenses are visible only to you;
            shared expenses are visible to household members.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Add expense</CardTitle>
            <CardDescription>
              Expenses do not change your current cash snapshot or safe-to-spend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="expense-description">Description</Label>
                <Input
                  id="expense-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Groceries, gas, dining..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense-category">Category (optional)</Label>
                <Input
                  id="expense-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Food, transport, household..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expense-amount">Amount</Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountInput}
                    onChange={(event) => setAmountInput(event.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense-date">Expense date</Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={expenseDate}
                    onChange={(event) => setExpenseDate(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Period bucket</Label>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {formatExpensePeriodBucket(periodBucket)}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expense-scope">Scope</Label>
                  <Select
                    value={expenseScope}
                    onValueChange={(value) =>
                      setExpenseScope(value as ManualExpenseScope)
                    }
                  >
                    <SelectTrigger id="expense-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense-split-type">Split type</Label>
                  <Select
                    value={splitType}
                    onValueChange={(value) =>
                      setSplitType(value as ManualExpenseSplitType)
                    }
                  >
                    <SelectTrigger id="expense-split-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="equal">Equal (50/50)</SelectItem>
                      <SelectItem value="51_49">51/49</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {splitType === "personal" && !mappedPerson && (
                <Alert>
                  <AlertDescription>
                    Choose your budget profile in Settings before recording a
                    personal expense.
                  </AlertDescription>
                </Alert>
              )}

              {splitType === "custom" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="custom-teles">Teles amount</Label>
                    <Input
                      id="custom-teles"
                      type="number"
                      min="0"
                      step="0.01"
                      value={customTelesInput}
                      onChange={(event) => setCustomTelesInput(event.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-nicole">Nicole amount</Label>
                    <Input
                      id="custom-nicole"
                      type="number"
                      min="0"
                      step="0.01"
                      value={customNicoleInput}
                      onChange={(event) => setCustomNicoleInput(event.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}

              {previewSplit?.amounts && (
                <p className="text-sm text-muted-foreground">
                  Split preview: Teles {formatCurrency(previewSplit.amounts.telesAmount)}
                  {" / "}
                  Nicole {formatCurrency(previewSplit.amounts.nicoleAmount)}
                </p>
              )}

              {previewSplit?.error && splitType === "custom" && (
                <p className="text-sm text-destructive">{previewSplit.error}</p>
              )}

              <div className="space-y-2">
                <Label htmlFor="expense-notes">Notes (optional)</Label>
                <Textarea
                  id="expense-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Any extra context..."
                  rows={3}
                />
              </div>

              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add expense
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recorded expenses</CardTitle>
            <CardDescription>
              Showing expenses visible to you under household privacy rules.{" "}
              {PAYMENT_UX_EXPLANATION}
              {filtersActive && expenses.length > 0 && (
                <>
                  {" "}
                  Showing {filteredExpenses.length} of {expenses.length} expenses.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!loading && expenses.length > 0 && (
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1 space-y-1">
                    <Label htmlFor="expense-search">Search</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="expense-search"
                        value={filters.searchText}
                        onChange={(event) =>
                          setFilters((prev) => ({
                            ...prev,
                            searchText: event.target.value,
                          }))
                        }
                        placeholder="Description, category, notes, reason..."
                        className="pl-9"
                      />
                    </div>
                  </div>
                  {filtersActive && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetFilters}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-month">Month</Label>
                    <Input
                      id="expense-filter-month"
                      type="month"
                      value={filters.filterMonth}
                      onChange={(event) =>
                        setFilters((prev) => ({
                          ...prev,
                          filterMonth: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-from">From date</Label>
                    <Input
                      id="expense-filter-from"
                      type="date"
                      value={filters.dateFrom}
                      disabled={filters.filterMonth !== ""}
                      onChange={(event) =>
                        setFilters((prev) => ({
                          ...prev,
                          dateFrom: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-to">To date</Label>
                    <Input
                      id="expense-filter-to"
                      type="date"
                      value={filters.dateTo}
                      disabled={filters.filterMonth !== ""}
                      onChange={(event) =>
                        setFilters((prev) => ({
                          ...prev,
                          dateTo: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-period">Period bucket</Label>
                    <Select
                      value={filters.periodBucket}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          periodBucket: value as ManualExpenseFilters["periodBucket"],
                        }))
                      }
                    >
                      <SelectTrigger id="expense-filter-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All periods</SelectItem>
                        <SelectItem value="1_14">1st–14th</SelectItem>
                        <SelectItem value="15_eom">15th–end of month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-paid">Paid status</Label>
                    <Select
                      value={filters.paidStatus}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          paidStatus: value as ManualExpenseFilters["paidStatus"],
                        }))
                      }
                    >
                      <SelectTrigger id="expense-filter-paid">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="marked_paid_only">
                          Marked paid — cash not deducted
                        </SelectItem>
                        <SelectItem value="deducted_from_cash">
                          Deducted from cash
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-scope">Scope</Label>
                    <Select
                      value={filters.scope}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          scope: value as ManualExpenseFilters["scope"],
                        }))
                      }
                    >
                      <SelectTrigger id="expense-filter-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All scopes</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="shared">Shared</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-category">Category</Label>
                    <Input
                      id="expense-filter-category"
                      value={filters.category}
                      onChange={(event) =>
                        setFilters((prev) => ({
                          ...prev,
                          category: event.target.value,
                        }))
                      }
                      placeholder="Match category..."
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="expense-filter-adjustment">Adjustment type</Label>
                    <Select
                      value={filters.adjustmentType}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          adjustmentType:
                            value as ManualExpenseFilters["adjustmentType"],
                        }))
                      }
                    >
                      <SelectTrigger id="expense-filter-adjustment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All rows</SelectItem>
                        <SelectItem value="originals">Originals only</SelectItem>
                        <SelectItem value="adjustments">Adjustments only</SelectItem>
                        <SelectItem value="increase">Increase adjustments</SelectItem>
                        <SelectItem value="decrease">Decrease adjustments</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : expenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No expenses recorded yet.
              </p>
            ) : filteredExpenses.length === 0 ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No expenses match your filters.
                </p>
                <Button type="button" variant="outline" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Mark paid</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Split</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44">Pay & deduct cash</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => {
                    const isAdjustment = isManualExpenseAdjustment(expense);
                    const hasPaymentTransaction = paymentByExpenseId.has(expense.id);
                    const cashStatus = getCashDeductionStatus({
                      isMarkedPaid: expense.is_paid,
                      hasPaymentTransaction,
                    });
                    const paidThroughApp = isManualExpensePaidThroughApp(
                      expense.id,
                      paidManualExpenseIds
                    );
                    const canDelete = canDeleteManualExpense({
                      createdByUserId: expense.created_by_user_id,
                      userId: user.id,
                      hasPaymentTransaction,
                    });
                    const originalExpense =
                      expense.adjusts_manual_expense_id
                        ? expenseById.get(expense.adjusts_manual_expense_id)
                        : null;

                    return (
                    <TableRow key={expense.id}>
                      <TableCell>
                        {!isAdjustment ? (
                          <Checkbox
                            checked={expense.is_paid}
                            disabled={markingPaidId === expense.id || expense.is_paid}
                            onCheckedChange={() => void handleMarkPaid(expense)}
                            aria-label="Mark paid"
                          />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {isAdjustment && expense.adjustment_direction && (
                            <p className="text-xs font-medium text-primary">
                              Adjustment ·{" "}
                              {adjustmentDirectionLabel(expense.adjustment_direction)}
                            </p>
                          )}
                          <button
                            type="button"
                            className="group flex w-full items-start gap-2 text-left"
                            onClick={() => setDetailExpenseId(expense.id)}
                            aria-label={`View details for ${expense.description}`}
                          >
                            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block font-medium underline-offset-2 group-hover:underline ${
                                  expense.is_paid && !isAdjustment
                                    ? "line-through text-muted-foreground"
                                    : ""
                                }`}
                              >
                                {expense.description}
                              </span>
                            </span>
                          </button>
                          {isAdjustment && originalExpense && (
                            <p className="text-xs text-muted-foreground">
                              For: {originalExpense.description} (
                              {formatCurrency(Number(originalExpense.amount))})
                            </p>
                          )}
                          {isAdjustment && expense.adjustment_reason && (
                            <p className="text-xs text-muted-foreground">
                              Reason: {expense.adjustment_reason}
                            </p>
                          )}
                          {expense.category && (
                            <p className="text-xs text-muted-foreground">
                              {expense.category}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {expenseSplitTypeLabel(expense.split_type)} ·{" "}
                            {formatExpensePeriodBucket(expense.period_bucket)}
                          </p>
                          {expense.notes && (
                            <p className="text-xs text-muted-foreground">
                              {expense.notes}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{expenseScopeLabel(expense.expense_scope)}</TableCell>
                      <TableCell>{formatCurrency(Number(expense.amount))}</TableCell>
                      <TableCell>{formatDisplayDate(expense.expense_date)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>Teles {formatCurrency(Number(expense.teles_amount))}</p>
                          <p>Nicole {formatCurrency(Number(expense.nicole_amount))}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isAdjustment ? (
                          <span className="text-xs text-muted-foreground">
                            Planning only
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {cashDeductionStatusLabel(cashStatus)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isAdjustment ? (
                          isDecreaseManualExpenseAdjustment(expense) ? (
                            <div className="space-y-1">
                              {canShowCashCreditActionForAdjustment(
                                expense,
                                creditedAdjustmentIds
                              ) ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={creditingAdjustmentId === expense.id}
                                  onClick={() => void handleCreditAdjustment(expense)}
                                >
                                  Credit current amount
                                </Button>
                              ) : isAdjustmentAlreadyCredited(
                                  expense.id,
                                  creditedAdjustmentIds
                                ) ? (
                                <p className="text-xs font-medium text-muted-foreground">
                                  Credited to current amount
                                </p>
                              ) : null}
                              <p className="max-w-[12rem] text-xs text-muted-foreground">
                                {CASH_CREDIT_UX_NOTE}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {ADJUSTMENT_PAY_DISABLED_MESSAGE}
                            </p>
                          )
                        ) : cashStatus === "unpaid" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={payingExpenseId === expense.id}
                            onClick={() => void handlePay(expense)}
                          >
                            Pay & deduct cash
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {expense.created_by_user_id === user.id ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center justify-end gap-1">
                              {paidThroughApp ? (
                                <div className="flex flex-col items-end gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startCreateAdjustment(expense)}
                                  >
                                    Create adjustment
                                  </Button>
                                  <p className="max-w-[10rem] text-right text-xs text-muted-foreground">
                                    {PAID_THROUGH_APP_EDIT_MESSAGE}
                                  </p>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Edit expense"
                                  onClick={() => startEditExpense(expense)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete ? (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="Delete expense"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete expense?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This removes &quot;{expense.description}&quot; from your
                                        expense history.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => void handleDelete(expense.id)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              ) : null}
                            </div>
                            {paidThroughApp ? (
                              <p className="max-w-[10rem] text-right text-xs text-muted-foreground">
                                {PAID_THROUGH_APP_DELETE_MESSAGE}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
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
        open={editingExpenseId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingExpenseId(null);
            setEditFormError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle>Edit expense</DialogTitle>
              <DialogDescription>
                {editingExpense
                  ? `Update "${editingExpense.description}".`
                  : "Update expense details."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {editFormError && (
                <Alert variant="destructive">
                  <AlertDescription>{editFormError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="edit-expense-description">Description</Label>
                <Input
                  id="edit-expense-description"
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  required
                  disabled={savingEdit}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-expense-category">Category (optional)</Label>
                <Input
                  id="edit-expense-category"
                  value={editForm.category}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      category: event.target.value,
                    }))
                  }
                  disabled={savingEdit}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-expense-amount">Amount</Label>
                  <Input
                    id="edit-expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.amountInput}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        amountInput: event.target.value,
                      }))
                    }
                    required
                    disabled={savingEdit}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-expense-date">Expense date</Label>
                  <Input
                    id="edit-expense-date"
                    type="date"
                    value={editForm.expenseDate}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        expenseDate: event.target.value,
                      }))
                    }
                    required
                    disabled={savingEdit}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Period bucket</Label>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {formatExpensePeriodBucket(editPeriodBucket)}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-expense-scope">Scope</Label>
                  <Select
                    value={editForm.expenseScope}
                    onValueChange={(value) =>
                      setEditForm((prev) => ({
                        ...prev,
                        expenseScope: value as ManualExpenseScope,
                      }))
                    }
                    disabled={savingEdit}
                  >
                    <SelectTrigger id="edit-expense-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-expense-split-type">Split type</Label>
                  <Select
                    value={editForm.splitType}
                    onValueChange={(value) =>
                      setEditForm((prev) => ({
                        ...prev,
                        splitType: value as ManualExpenseSplitType,
                      }))
                    }
                    disabled={savingEdit}
                  >
                    <SelectTrigger id="edit-expense-split-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="equal">Equal (50/50)</SelectItem>
                      <SelectItem value="51_49">51/49</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editForm.splitType === "personal" && !mappedPerson && (
                <Alert>
                  <AlertDescription>
                    Choose your budget profile in Settings before recording a
                    personal expense.
                  </AlertDescription>
                </Alert>
              )}

              {editForm.splitType === "custom" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-custom-teles">Teles amount</Label>
                    <Input
                      id="edit-custom-teles"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.customTelesInput}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customTelesInput: event.target.value,
                        }))
                      }
                      disabled={savingEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-custom-nicole">Nicole amount</Label>
                    <Input
                      id="edit-custom-nicole"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.customNicoleInput}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          customNicoleInput: event.target.value,
                        }))
                      }
                      disabled={savingEdit}
                    />
                  </div>
                </div>
              )}

              {editPreviewSplit?.amounts && (
                <p className="text-sm text-muted-foreground">
                  Split preview: Teles{" "}
                  {formatCurrency(editPreviewSplit.amounts.telesAmount)}
                  {" / "}
                  Nicole {formatCurrency(editPreviewSplit.amounts.nicoleAmount)}
                </p>
              )}

              {editPreviewSplit?.error && editForm.splitType === "custom" && (
                <p className="text-sm text-destructive">{editPreviewSplit.error}</p>
              )}

              <div className="space-y-2">
                <Label htmlFor="edit-expense-notes">Notes (optional)</Label>
                <Textarea
                  id="edit-expense-notes"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  disabled={savingEdit}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingExpenseId(null)}
                disabled={savingEdit}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={adjustingOriginalExpense !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdjustingOriginalExpense(null);
            setAdjustmentFormError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={handleCreateAdjustment}>
            <DialogHeader>
              <DialogTitle>Create adjustment</DialogTitle>
              <DialogDescription>
                {adjustingOriginalExpense
                  ? `Correct planning totals for "${adjustingOriginalExpense.description}" without editing the original paid expense.`
                  : "Create an adjustment for a paid expense."}
              </DialogDescription>
            </DialogHeader>

            {adjustingOriginalExpense && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">{adjustingOriginalExpense.description}</p>
                <p>
                  Original amount:{" "}
                  {formatCurrency(Number(adjustingOriginalExpense.amount))}
                </p>
                <p>
                  Original date:{" "}
                  {formatDisplayDate(adjustingOriginalExpense.expense_date)}
                </p>
              </div>
            )}

            <div className="grid gap-4 py-4">
              {adjustmentFormError && (
                <Alert variant="destructive">
                  <AlertDescription>{adjustmentFormError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="adjustment-direction">Adjustment direction</Label>
                <Select
                  value={adjustmentForm.adjustmentDirection}
                  onValueChange={(value) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      adjustmentDirection: value as ManualExpenseAdjustmentDirection,
                    }))
                  }
                  disabled={submittingAdjustment}
                >
                  <SelectTrigger id="adjustment-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">
                      Increase (more planning impact)
                    </SelectItem>
                    <SelectItem value="decrease">
                      Decrease (less planning impact)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment-description">Description</Label>
                <Input
                  id="adjustment-description"
                  value={adjustmentForm.description}
                  onChange={(event) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  disabled={submittingAdjustment}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="adjustment-amount">Adjustment amount</Label>
                  <Input
                    id="adjustment-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={adjustmentForm.amountInput}
                    onChange={(event) =>
                      setAdjustmentForm((prev) => ({
                        ...prev,
                        amountInput: event.target.value,
                      }))
                    }
                    placeholder="0.00"
                    required
                    disabled={submittingAdjustment}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adjustment-date">Adjustment date</Label>
                  <Input
                    id="adjustment-date"
                    type="date"
                    value={adjustmentForm.expenseDate}
                    onChange={(event) =>
                      setAdjustmentForm((prev) => ({
                        ...prev,
                        expenseDate: event.target.value,
                      }))
                    }
                    required
                    disabled={submittingAdjustment}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Period bucket</Label>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {formatExpensePeriodBucket(adjustmentPeriodBucket)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment-split-type">Split type</Label>
                <Select
                  value={adjustmentForm.splitType}
                  onValueChange={(value) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      splitType: value as ManualExpenseSplitType,
                    }))
                  }
                  disabled={submittingAdjustment}
                >
                  <SelectTrigger id="adjustment-split-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="equal">Equal (50/50)</SelectItem>
                    <SelectItem value="51_49">51/49</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {adjustmentForm.splitType === "personal" && !mappedPerson && (
                <Alert>
                  <AlertDescription>
                    Choose your budget profile in Settings before recording a
                    personal expense.
                  </AlertDescription>
                </Alert>
              )}

              {adjustmentForm.splitType === "custom" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="adjustment-custom-teles">Teles amount</Label>
                    <Input
                      id="adjustment-custom-teles"
                      type="number"
                      min="0"
                      step="0.01"
                      value={adjustmentForm.customTelesInput}
                      onChange={(event) =>
                        setAdjustmentForm((prev) => ({
                          ...prev,
                          customTelesInput: event.target.value,
                        }))
                      }
                      disabled={submittingAdjustment}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustment-custom-nicole">Nicole amount</Label>
                    <Input
                      id="adjustment-custom-nicole"
                      type="number"
                      min="0"
                      step="0.01"
                      value={adjustmentForm.customNicoleInput}
                      onChange={(event) =>
                        setAdjustmentForm((prev) => ({
                          ...prev,
                          customNicoleInput: event.target.value,
                        }))
                      }
                      disabled={submittingAdjustment}
                    />
                  </div>
                </div>
              )}

              {adjustmentPreviewSplit?.amounts && (
                <p className="text-sm text-muted-foreground">
                  Split preview: Teles{" "}
                  {formatCurrency(adjustmentPreviewSplit.amounts.telesAmount)}
                  {" / "}
                  Nicole {formatCurrency(adjustmentPreviewSplit.amounts.nicoleAmount)}
                </p>
              )}

              {adjustmentPreviewSplit?.error &&
                adjustmentForm.splitType === "custom" && (
                  <p className="text-sm text-destructive">
                    {adjustmentPreviewSplit.error}
                  </p>
                )}

              <div className="space-y-2">
                <Label htmlFor="adjustment-reason">Reason</Label>
                <Textarea
                  id="adjustment-reason"
                  value={adjustmentForm.adjustmentReason}
                  onChange={(event) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      adjustmentReason: event.target.value,
                    }))
                  }
                  placeholder="Why is this adjustment needed?"
                  rows={2}
                  required
                  disabled={submittingAdjustment}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment-notes">Notes (optional)</Label>
                <Textarea
                  id="adjustment-notes"
                  value={adjustmentForm.notes}
                  onChange={(event) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  rows={2}
                  disabled={submittingAdjustment}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Adjustments affect planning totals only. They do not change cash
                snapshots or payment transactions.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustingOriginalExpense(null)}
                disabled={submittingAdjustment}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingAdjustment}>
                {submittingAdjustment && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create adjustment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet
        open={detailExpenseId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailExpenseId(null);
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {detailView && detailExpense ? (
            <>
              <SheetHeader>
                <SheetTitle>{detailView.description}</SheetTitle>
                <SheetDescription>
                  {detailView.isAdjustment
                    ? `Adjustment · ${detailView.adjustmentDirectionLabel ?? "Adjustment"}`
                    : "Manual expense details"}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Details</h3>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Scope</dt>
                      <dd>{detailView.scopeLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd>{detailView.amountLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Date</dt>
                      <dd>{detailView.dateLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Period bucket</dt>
                      <dd>{detailView.periodBucketLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Split type</dt>
                      <dd>{detailView.splitTypeLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Teles</dt>
                      <dd>{detailView.telesAmountLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Nicole</dt>
                      <dd>{detailView.nicoleAmountLabel}</dd>
                    </div>
                    {detailView.category && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Category</dt>
                        <dd>{detailView.category}</dd>
                      </div>
                    )}
                    {detailView.notes && (
                      <div className="space-y-1">
                        <dt className="text-muted-foreground">Notes</dt>
                        <dd>{detailView.notes}</dd>
                      </div>
                    )}
                    {detailView.createdAtLabel && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Created</dt>
                        <dd className="text-right">{detailView.createdAtLabel}</dd>
                      </div>
                    )}
                    {detailView.updatedAtLabel && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Updated</dt>
                        <dd className="text-right">{detailView.updatedAtLabel}</dd>
                      </div>
                    )}
                  </dl>
                </section>

                {(detailView.isAdjustment ||
                  detailView.relatedAdjustments.length > 0) && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Adjustments</h3>
                    {detailView.isAdjustment && detailView.linkedOriginalDescription && (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <p className="font-medium">Linked original</p>
                        <p>{detailView.linkedOriginalDescription}</p>
                        {detailView.linkedOriginalAmountLabel && (
                          <p className="text-muted-foreground">
                            Original amount: {detailView.linkedOriginalAmountLabel}
                          </p>
                        )}
                        {detailView.adjustmentReason && (
                          <p className="text-muted-foreground">
                            Reason: {detailView.adjustmentReason}
                          </p>
                        )}
                      </div>
                    )}
                    {detailView.relatedAdjustments.length > 0 ? (
                      <ul className="space-y-2">
                        {detailView.relatedAdjustments.map((adjustment) => (
                          <li
                            key={adjustment.id}
                            className="rounded-md border px-3 py-2 text-sm"
                          >
                            <p className="font-medium">
                              {adjustment.directionLabel} · {adjustment.amountLabel}
                            </p>
                            <p>{adjustment.description}</p>
                            <p className="text-muted-foreground">
                              {adjustment.dateLabel}
                              {adjustment.reason ? ` · ${adjustment.reason}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No other adjustments for this original expense.
                      </p>
                    )}
                  </section>
                )}

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Cash & payment</h3>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Mark paid</dt>
                      <dd className="text-right">{detailView.paymentAudit.markPaidLabel}</dd>
                    </div>
                    {detailView.paymentAudit.markPaidAt && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Marked paid at</dt>
                        <dd className="text-right">
                          {detailView.paymentAudit.markPaidAt}
                        </dd>
                      </div>
                    )}
                    {detailView.paymentAudit.cashDeductionStatusLabel && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Cash deduction</dt>
                        <dd className="text-right">
                          {detailView.paymentAudit.cashDeductionStatusLabel}
                        </dd>
                      </div>
                    )}
                    {detailView.paymentAudit.hasPaymentTransaction && (
                      <>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Pay & deduct cash</dt>
                          <dd className="text-right">Deducted from your current amount</dd>
                        </div>
                        {detailView.paymentAudit.paymentAmountLabel && (
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">Payment amount</dt>
                            <dd>{detailView.paymentAudit.paymentAmountLabel}</dd>
                          </div>
                        )}
                        {detailView.paymentAudit.paymentDateLabel && (
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">Payment date</dt>
                            <dd className="text-right">
                              {detailView.paymentAudit.paymentDateLabel}
                            </dd>
                          </div>
                        )}
                        {detailView.paymentAudit.paymentNotes && (
                          <div className="space-y-1">
                            <dt className="text-muted-foreground">Payment notes</dt>
                            <dd>{detailView.paymentAudit.paymentNotes}</dd>
                          </div>
                        )}
                      </>
                    )}
                    {detailView.paymentAudit.creditApplied !== null && (
                      <>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Cash credit</dt>
                          <dd className="text-right">
                            {detailView.paymentAudit.creditApplied
                              ? "Credited to current amount"
                              : "Not credited yet"}
                          </dd>
                        </div>
                        {detailView.paymentAudit.creditApplied &&
                          detailView.paymentAudit.creditAmountLabel && (
                            <>
                              <div className="flex justify-between gap-4">
                                <dt className="text-muted-foreground">Credit amount</dt>
                                <dd>{detailView.paymentAudit.creditAmountLabel}</dd>
                              </div>
                              {detailView.paymentAudit.creditDateLabel && (
                                <div className="flex justify-between gap-4">
                                  <dt className="text-muted-foreground">Credit date</dt>
                                  <dd className="text-right">
                                    {detailView.paymentAudit.creditDateLabel}
                                  </dd>
                                </div>
                              )}
                              {detailView.paymentAudit.creditNotes && (
                                <div className="space-y-1">
                                  <dt className="text-muted-foreground">Credit notes</dt>
                                  <dd>{detailView.paymentAudit.creditNotes}</dd>
                                </div>
                              )}
                            </>
                          )}
                      </>
                    )}
                  </dl>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Actions</h3>
                  <ul className="space-y-3">
                    {detailView.actions.map((action) => (
                      <li
                        key={action.action}
                        className="rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{action.label}</p>
                          <span
                            className={
                              action.available
                                ? "text-xs font-medium text-primary"
                                : "text-xs text-muted-foreground"
                            }
                          >
                            {action.available ? "Available" : "Unavailable"}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {action.explanation}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          ) : (
            <SheetHeader>
              <SheetTitle>Expense details</SheetTitle>
              <SheetDescription>This expense is no longer visible.</SheetDescription>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
