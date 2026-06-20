import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  calculateExpenseSplit,
  createManualExpense,
  deleteManualExpense,
  expenseScopeLabel,
  expenseSplitTypeLabel,
  formatExpensePeriodBucket,
  getExpensePeriodBucket,
  getManualExpenses,
  getMyExpenseShareAmount,
  isManualExpensePaidThroughApp,
  markManualExpensePaid,
  updateManualExpense,
  validateCustomExpenseSplit,
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
import type {
  CashPaymentTransaction,
  ManualExpense,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader as Loader2, Pencil, Receipt, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

const PAID_THROUGH_APP_EDIT_MESSAGE =
  "Already deducted from cash. Create an adjustment instead of editing.";

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);
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

  const fetchData = useCallback(async () => {
    if (!household || !user) {
      return;
    }

    setLoading(true);
    setError(null);

    const [expensesResult, peopleResult, paymentsResult] = await Promise.all([
      getManualExpenses(household.id),
      getHouseholdPeople(household.id),
      getMyCashPaymentTransactions(household.id, user.id),
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
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : expenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No expenses recorded yet.
              </p>
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
                  {expenses.map((expense) => {
                    const cashStatus = getCashDeductionStatus({
                      isMarkedPaid: expense.is_paid,
                      hasPaymentTransaction: paymentByExpenseId.has(expense.id),
                    });

                    return (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <Checkbox
                          checked={expense.is_paid}
                          disabled={markingPaidId === expense.id || expense.is_paid}
                          onCheckedChange={() => void handleMarkPaid(expense)}
                          aria-label="Mark paid"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p
                            className={`font-medium ${
                              expense.is_paid ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {expense.description}
                          </p>
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
                        <span className="text-xs text-muted-foreground">
                          {cashDeductionStatusLabel(cashStatus)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {cashStatus === "unpaid" ? (
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
                          <div className="flex items-center justify-end gap-1">
                            {isManualExpensePaidThroughApp(
                              expense.id,
                              paidManualExpenseIds
                            ) ? (
                              <p className="max-w-[10rem] text-right text-xs text-muted-foreground">
                                {PAID_THROUGH_APP_EDIT_MESSAGE}
                              </p>
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
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Delete expense">
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
    </div>
  );
}
