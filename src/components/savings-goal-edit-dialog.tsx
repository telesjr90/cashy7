import { useEffect, useState } from "react";
import type { SavingsGoal } from "@/lib/types";
import {
  buildGoalUpdatePayload,
  canUserEditGoal,
  getGoalDeleteStatus,
  goalEditFormFromGoal,
  validateGoalEditForm,
  type GoalEditFormValues,
} from "@/lib/savings-edit";
import { deleteSavingsGoal, updateSavingsGoal } from "@/lib/savings";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader as Loader2 } from "lucide-react";

type SavingsGoalEditDialogProps = {
  goal: SavingsGoal | null;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
};

export function SavingsGoalEditDialog({
  goal,
  userId,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: SavingsGoalEditDialogProps) {
  const [form, setForm] = useState<GoalEditFormValues>({
    name: "",
    goalType: "",
    targetAmount: "",
    startDate: "",
    endDate: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canEdit = goal ? canUserEditGoal(goal, userId) : false;
  const deleteStatus = goal ? getGoalDeleteStatus(goal, userId) : null;

  useEffect(() => {
    if (goal && open) {
      setForm(goalEditFormFromGoal(goal));
      setError(null);
      setDeleteError(null);
    }
  }, [goal, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
      setDeleteConfirmOpen(false);
      setDeleteError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!goal) {
      return;
    }

    const validated = validateGoalEditForm(form, goal, userId);
    if (validated.error || !validated.values) {
      setError(validated.error);
      return;
    }

    setSaving(true);
    setError(null);

    const payload = buildGoalUpdatePayload(validated.values);
    const { error: saveError } = await updateSavingsGoal(goal.id, {
      name: payload.name!,
      goalType: payload.goal_type!,
      targetAmount: Number(payload.target_amount),
      startDate: payload.start_date!,
      endDate: payload.end_date!,
    });

    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    await onSaved();
    handleOpenChange(false);
  };

  const handleDelete = async () => {
    if (!goal || !deleteStatus?.allowed) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const { error: removeError } = await deleteSavingsGoal(goal.id);

    setDeleting(false);

    if (removeError) {
      setDeleteError(removeError);
      return;
    }

    setDeleteConfirmOpen(false);
    handleOpenChange(false);
    await onDeleted();
  };

  if (!goal || !canEdit) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit savings goal</DialogTitle>
            <DialogDescription>
              Update goal metadata. Participant targets and contributions stay private
              per member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-goal-name">Goal name</Label>
              <Input
                id="edit-goal-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-goal-type">Goal type</Label>
              <Select
                value={form.goalType || undefined}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    goalType: value as GoalEditFormValues["goalType"],
                  }))
                }
              >
                <SelectTrigger id="edit-goal-type" className="w-full">
                  <SelectValue placeholder="Select goal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="shared">Shared</SelectItem>
                </SelectContent>
              </Select>
              {goal.goal_type === "shared" && (
                <p className="text-xs text-muted-foreground">
                  Shared goals cannot be changed back to private.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-goal-target">Household target amount</Label>
              <Input
                id="edit-goal-target"
                type="number"
                min="0"
                step="0.01"
                value={form.targetAmount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetAmount: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-goal-start">Start date</Label>
                <Input
                  id="edit-goal-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-goal-end">End date</Label>
                <Input
                  id="edit-goal-end"
                  type="date"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save goal
            </Button>

            {deleteStatus && (
              <div className="space-y-2 border-t pt-4">
                {deleteStatus.blockedReason ? (
                  <p className="text-sm text-muted-foreground">
                    {deleteStatus.blockedReason}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={saving}
                  >
                    Delete goal
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteStatus?.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteStatus?.confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete goal
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
