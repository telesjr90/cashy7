import { useEffect, useState } from "react";
import type { Bill } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  apply5149SplitToTemplateForm,
  billTemplateFormFromBill,
  buildBillTemplateInsert,
  buildBillTemplateUpdate,
  emptyBillTemplateForm,
  handleBillTemplateAmountChange,
  templateUsesDefault5149Split,
  type BillTemplateFormValues,
  validateBillTemplateForm,
} from "@/lib/bill-templates";
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
import { Switch } from "@/components/ui/switch";
import { Loader as Loader2 } from "lucide-react";

type BillTemplatePanelProps = {
  template: Bill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (template: Bill) => void;
};

export function BillTemplatePanel({
  template,
  open,
  onOpenChange,
  onSaved,
}: BillTemplatePanelProps) {
  const { household } = useAuth();
  const isEdit = template !== null;
  const [form, setForm] = useState<BillTemplateFormValues>(emptyBillTemplateForm());
  const [usesDefaultSplit, setUsesDefaultSplit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (template) {
      const nextForm = billTemplateFormFromBill(template);
      setForm(nextForm);
      const amount = template.default_amount ?? 0;
      setUsesDefaultSplit(
        amount <= 0 ||
          templateUsesDefault5149Split(
            amount,
            Number(nextForm.telesAmount),
            Number(nextForm.nicoleAmount)
          )
      );
    } else {
      setForm(emptyBillTemplateForm());
      setUsesDefaultSplit(true);
    }

    setError(null);
    setSaving(false);
  }, [open, template]);

  const handleApplyDefaultSplit = () => {
    const amount = Number(form.defaultAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid default amount before applying 51/49 split.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      ...apply5149SplitToTemplateForm(amount),
    }));
    setUsesDefaultSplit(true);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    const validation = validateBillTemplateForm(form);
    if (!validation.values) {
      setError(validation.error ?? "Could not validate template.");
      return;
    }

    setSaving(true);

    if (isEdit && template) {
      const updatePayload = buildBillTemplateUpdate(validation.values);
      const { data, error: updateError } = await supabase
        .from("bills")
        .update(updatePayload)
        .eq("id", template.id)
        .select("*")
        .single();

      setSaving(false);

      if (updateError || !data) {
        setError(updateError?.message ?? "Could not update template.");
        return;
      }

      onSaved(data as Bill);
      onOpenChange(false);
      return;
    }

    if (!household) {
      setSaving(false);
      setError("No household found.");
      return;
    }

    const insertPayload = buildBillTemplateInsert(household.id, validation.values);
    const { data, error: insertError } = await supabase
      .from("bills")
      .insert(insertPayload)
      .select("*")
      .single();

    setSaving(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create template.");
      return;
    }

    onSaved(data as Bill);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bill template" : "New bill template"}</DialogTitle>
          <DialogDescription>
            Recurring templates define default bill settings. Monthly bill instances are
            generated separately and can differ per month.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              disabled={saving}
              placeholder="e.g., Electric bill"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Variable amount</Label>
              <p className="text-sm text-muted-foreground">
                Amount changes each month; default can be left blank.
              </p>
            </div>
            <Switch
              checked={form.isVariable}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, isVariable: checked }))
              }
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-amount">
              Default amount (CA$){form.isVariable ? " — optional" : ""}
            </Label>
            <Input
              id="template-amount"
              type="number"
              step="0.01"
              min="0"
              value={form.defaultAmount}
              onChange={(event) =>
                setForm((prev) =>
                  handleBillTemplateAmountChange(
                    prev,
                    event.target.value,
                    usesDefaultSplit
                  )
                )
              }
              disabled={saving}
              placeholder={form.isVariable ? "Optional placeholder" : "0.00"}
            />
          </div>

          {!form.isVariable && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-teles">Teles amount (CA$)</Label>
                  <Input
                    id="template-teles"
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
                  <Label htmlFor="template-nicole">Nicole amount (CA$)</Label>
                  <Input
                    id="template-nicole"
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
            </>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-due-day">Due day</Label>
              <Input
                id="template-due-day"
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dueDay: event.target.value }))
                }
                disabled={saving}
                placeholder="1–31"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-period">Pay period</Label>
              <Select
                value={form.periodBucket}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    periodBucket: value as BillTemplateFormValues["periodBucket"],
                  }))
                }
                disabled={saving}
              >
                <SelectTrigger id="template-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1_14">1st - 14th</SelectItem>
                  <SelectItem value="15_eom">15th - EOM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-active-from">Active from</Label>
              <Input
                id="template-active-from"
                type="date"
                value={form.activeFrom}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, activeFrom: event.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-active-until">Active until (optional)</Label>
              <Input
                id="template-active-until"
                type="date"
                value={form.activeUntil}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, activeUntil: event.target.value }))
                }
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-category">Category</Label>
            <Input
              id="template-category"
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, category: event.target.value }))
              }
              disabled={saving}
              placeholder="e.g., utilities"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-notes">Notes (optional)</Label>
            <Textarea
              id="template-notes"
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
            {saving ? "Saving..." : isEdit ? "Save template" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
