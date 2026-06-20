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
  validateCustomExpenseSplit,
} from "@/lib/expenses";
import { getHouseholdPeople } from "@/lib/user-person";
import type {
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
import { Loader as Loader2, Receipt, Trash2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

  const periodBucket = useMemo(
    () => getExpensePeriodBucket(expenseDate),
    [expenseDate]
  );

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

  const fetchData = useCallback(async () => {
    if (!household) {
      return;
    }

    setLoading(true);
    setError(null);

    const [expensesResult, peopleResult] = await Promise.all([
      getManualExpenses(household.id),
      getHouseholdPeople(household.id),
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

    setLoading(false);
  }, [household]);

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
              Showing expenses visible to you under household privacy rules.
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
                    <TableHead>Description</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Split</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{expense.description}</p>
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
                        {expense.created_by_user_id === user.id && (
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
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
