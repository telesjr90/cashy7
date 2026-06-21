import { useEffect, useState } from "react";
import type { BillInstance } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  apply5149SplitToBillEditForm,
  billEditFormFromInstance,
  billUsesDefault5149Split,
  buildBillInstanceEditUpdate,
  handleBillEditAmountChange,
  type BillEditFormValues,
  validateBillEditForm,
} from "@/lib/bill-edit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Loader as Loader2 } from "lucide-react";

type BillEditPanelProps = {
  bill: BillInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updatedBill: BillInstance) => void;
};

export function BillEditPanel({
  bill,
  open,
  onOpenChange,
  onSaved,
}: BillEditPanelProps) {
  const [form, setForm] = useState<BillEditFormValues>({
    name: "",
    amount: "",
    telesAmount: "",
    nicoleAmount: "",
    periodBucket: "1_14",
    dueDate: "",
    notes: "",
  });
  const [usesDefaultSplit, setUsesDefaultSplit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !bill) {
      return;
    }

    setForm(billEditFormFromInstance(bill));
    setUsesDefaultSplit(
      billUsesDefault5149Split(
        Number(bill.amount),
        Number(bill.teles_amount),
        Number(bill.nicole_amount)
      )
    );
    setError(null);
    setSaving(false);
  }, [open, bill]);

  const handleApplyDefaultSplit = () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid total amount before applying 51/49 split.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      ...apply5149SplitToBillEditForm(amount),
    }));
    setUsesDefaultSplit(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!bill) {
      return;
    }

    setError(null);
    const validation = validateBillEditForm(form);
    if (!validation.values) {
      setError(validation.error ?? "Could not validate bill update.");
      return;
    }

    setSaving(true);

    const updatePayload = buildBillInstanceEditUpdate(validation.values);
    const { data, error: updateError } = await supabase
      .from("bill_instances")
      .update(updatePayload)
      .eq("id", bill.id)
      .select("*")
      .single();

    setSaving(false);

    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update bill.");
      return;
    }

    onSaved(data as BillInstance);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit bill</DialogTitle>
          <DialogDescription>
            {bill
              ? `Update "${bill.name}" for this month. Paid status is unchanged.`
              : "Update bill details for this month."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-bill-name">Bill name</Label>
            <Input
              id="edit-bill-name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-bill-amount">Total amount (CA$)</Label>
            <Input
              id="edit-bill-amount"
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(event) =>
                setForm((prev) =>
                  handleBillEditAmountChange(
                    prev,
                    event.target.value,
                    usesDefaultSplit
                  )
                )
              }
              disabled={saving}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-bill-teles">Teles amount (CA$)</Label>
              <Input
                id="edit-bill-teles"
                type="number"
                step="0.01"
                min="0"
                value={form.telesAmount}
                onChange={(event) => {
                  setUsesDefaultSplit(false);
                  setForm((prev) => ({
                    ...prev,
                    telesAmount: event.target.value,
                  }));
                }}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bill-nicole">Nicole amount (CA$)</Label>
              <Input
                id="edit-bill-nicole"
                type="number"
                step="0.01"
                min="0"
                value={form.nicoleAmount}
                onChange={(event) => {
                  setUsesDefaultSplit(false);
                  setForm((prev) => ({
                    ...prev,
                    nicoleAmount: event.target.value,
                  }));
                }}
                disabled={saving}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={handleApplyDefaultSplit}
            disabled={saving}
          >
            Apply 51/49 split
          </Button>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-bill-period">Pay period</Label>
              <Select
                value={form.periodBucket}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    periodBucket: value as BillEditFormValues["periodBucket"],
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger id="edit-bill-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1_14">1st - 14th</SelectItem>
                  <SelectItem value="15_eom">15th - EOM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bill-due-date">Due date (optional)</Label>
              <Input
                id="edit-bill-due-date"
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dueDate: event.target.value }))
                }
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-bill-notes">Notes (optional)</Label>
            <Textarea
              id="edit-bill-notes"
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
