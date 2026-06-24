import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  calculateExpenseSplit,
  createManualExpense,
  getExpensePeriodBucket,
} from "@/lib/expenses";
import { formatCurrency } from "@/lib/format";
import type {
  Household,
  ManualExpenseScope,
  ManualExpenseSplitType,
  Person,
} from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Alert, AlertDescription } from "@/components/ui/alert";

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface QuickAddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  household: Household;
  user: User;
  usablePersonId: string | null;
  mappedPerson: Person | null;
  /** Called after a successful create so the caller can refresh dashboard data. */
  onCreated: () => void | Promise<void>;
}

export function QuickAddExpenseDialog({
  open,
  onOpenChange,
  household,
  user,
  usablePersonId,
  mappedPerson,
  onCreated,
}: QuickAddExpenseDialogProps) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [expenseScope, setExpenseScope] =
    useState<ManualExpenseScope>("private");
  const [splitType, setSplitType] =
    useState<ManualExpenseSplitType>("personal");
  const [customTelesInput, setCustomTelesInput] = useState("");
  const [customNicoleInput, setCustomNicoleInput] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitting) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const previewAmount = Number(amountInput);
  const previewSplit =
    amountInput.trim() !== "" && Number.isFinite(previewAmount)
      ? calculateExpenseSplit(
          previewAmount,
          splitType,
          splitType === "custom"
            ? {
                customTelesAmount: Number(customTelesInput),
                customNicoleAmount: Number(customNicoleInput),
              }
            : { person: mappedPerson }
        )
      : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

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
      person_id: usablePersonId,
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
    onOpenChange(false);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        data-testid="quick-add-expense-dialog"
      >
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            Quickly record a manual expense. No cash is deducted here.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="quick-expense-description">Description</Label>
            <Input
              id="quick-expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Groceries, gas, dining..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-expense-category">Category (optional)</Label>
            <Input
              id="quick-expense-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Food, transport, household..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-expense-amount">Amount</Label>
              <Input
                id="quick-expense-amount"
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
              <Label htmlFor="quick-expense-date">Expense date</Label>
              <Input
                id="quick-expense-date"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-expense-scope">Scope</Label>
              <Select
                value={expenseScope}
                onValueChange={(value) =>
                  setExpenseScope(value as ManualExpenseScope)
                }
              >
                <SelectTrigger id="quick-expense-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="shared">Shared</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-expense-split-type">Split type</Label>
              <Select
                value={splitType}
                onValueChange={(value) =>
                  setSplitType(value as ManualExpenseSplitType)
                }
              >
                <SelectTrigger id="quick-expense-split-type">
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
                <Label htmlFor="quick-custom-teles">Teles amount</Label>
                <Input
                  id="quick-custom-teles"
                  type="number"
                  min="0"
                  step="0.01"
                  value={customTelesInput}
                  onChange={(event) => setCustomTelesInput(event.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-custom-nicole">Nicole amount</Label>
                <Input
                  id="quick-custom-nicole"
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

          {previewSplit?.amounts && !previewSplit.error && (
            <p className="text-sm text-muted-foreground">
              Split preview: Teles{" "}
              {formatCurrency(previewSplit.amounts.telesAmount)}
              {" / "}
              Nicole {formatCurrency(previewSplit.amounts.nicoleAmount)}
            </p>
          )}

          {previewSplit?.error && splitType === "custom" && (
            <p className="text-sm text-destructive">{previewSplit.error}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="quick-expense-notes">Notes (optional)</Label>
            <Textarea
              id="quick-expense-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Any extra context..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
