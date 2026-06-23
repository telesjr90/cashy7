import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getHouseholdSettings,
  upsertHouseholdCashflowStartDate,
  getMyLatestCashSnapshot,
  addMyCashSnapshot,
} from "@/lib/cashflow-settings";
import {
  DEFAULT_CASH_ADJUSTMENT_CREDIT_HISTORY_LIMIT,
  getMyCashAdjustmentTransactions,
  mapCashAdjustmentCreditsForDisplay,
  buildManualExpenseDescriptionLookup as buildAdjustmentManualExpenseDescriptionLookup,
} from "@/lib/cash-adjustments";
import { getManualExpenses } from "@/lib/expenses";
import {
  buildBillInstanceNameLookup,
  buildDebtPaymentDescriptionLookup,
  buildManualExpenseDescriptionLookup,
  DEFAULT_CASH_PAYMENT_DEDUCTION_HISTORY_LIMIT,
  getBillInstancesByIds,
  getDebtPaymentsByIds,
  getMyCashPaymentTransactions,
  mapCashPaymentDeductionsForDisplay,
} from "@/lib/payments";
import {
  getHouseholdPeople,
  getMyHouseholdMemberProfile,
  updateMyPersonMapping,
} from "@/lib/user-person";
import {
  addMySavingsContributionWithCashAction,
  createSavingsGoal,
  filterMyContributionsForGoal,
  getMySavingsContributions,
  getMySavingsGoalParticipants,
  getMySavingsGoalTargetPeriodSummary,
  getParticipantSummaryMonthHint,
  getSavingsGoals,
} from "@/lib/savings";
import {
  buildSavingsContributionGoalNameLookup,
  buildContributionListCashDeductionLabel,
  getSavingsContributionCashDeductionSourceIds,
  SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT,
  SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY,
  SAVINGS_CONTRIBUTION_DEDUCT_PRIVACY_COPY,
  SAVINGS_CONTRIBUTION_LOG_AND_DEDUCT_LABEL,
  SAVINGS_CONTRIBUTION_LOG_AND_DEDUCT_SUCCESS,
  SAVINGS_CONTRIBUTION_LOG_ONLY_LABEL,
  SAVINGS_CONTRIBUTION_LOG_ONLY_SUCCESS,
  SAVINGS_CONTRIBUTION_OTHER_USER_PRIVACY_COPY,
  type SavingsContributionCashAction,
} from "@/lib/savings-cash-actions";
import {
  buildPrivacySafeSharedGoalDisplay,
  canUserEditGoal,
  OTHER_USER_TARGET_PRIVACY_LABEL,
  SHARED_GOAL_METADATA_ONLY_COPY,
} from "@/lib/savings-edit";
import { SavingsContributionEditDialog } from "@/components/savings-contribution-edit-dialog";
import { SavingsDetailPanel } from "@/components/savings-detail-panel";
import { SavingsGoalEditDialog } from "@/components/savings-goal-edit-dialog";
import {
  SavingsContinuePeriodDialog,
  SavingsRolloverPanel,
} from "@/components/savings-rollover-panel";
import { SavingsTargetEditDialog } from "@/components/savings-target-edit-dialog";
import { PaycheckScheduleSettingsPanel } from "@/components/paycheck-schedule-settings";
import { getMyPaycheckSchedule } from "@/lib/paycheck-schedule";
import { buildSavingsGoalDetailView } from "@/lib/savings-detail";
import { buildSavingsRolloverDisplayView } from "@/lib/savings-rollover";
import {
  filterSavingsContributionsByCashflowStart,
  getSavingsContributionPreStartLabel,
  getSavingsPageVisibleContributions,
  isSavingsContributionPreStart,
  SAVINGS_ACTIVE_TOTAL_EXCLUDES_PRE_START_NOTICE,
  SAVINGS_CONTRIBUTIONS_PRE_START_HIDDEN_NOTICE,
  SAVINGS_PRE_START_LABEL,
  SHOW_PRE_START_SAVINGS_CONTRIBUTIONS_LABEL,
  sumActiveSavingsContributionAmounts,
} from "@/lib/savings-cashflow-start";
import type {
  CashSnapshot,
  HouseholdSettings,
  PaycheckSchedule,
  Person,
  SavingsContribution,
  SavingsContributionPeriod,
  SavingsGoal,
  SavingsGoalParticipant,
  SavingsGoalType,
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader as Loader2, Settings } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

function todayIsoDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

const CONTRIBUTION_PERIOD_LABELS: Record<SavingsContributionPeriod, string> = {
  "1_14": "1st–14th of month",
  "15_eom": "15th–end of month",
  monthly: "Monthly",
};

function goalTypeLabel(goalType: SavingsGoalType): string {
  return goalType === "private" ? "Private" : "Shared";
}

interface SavingsGoalPanelProps {
  goal: SavingsGoal;
  participant: SavingsGoalParticipant | undefined;
  contributions: SavingsContribution[];
  cashDeductionSourceIds: ReadonlySet<string>;
  personId: string | null;
  householdId: string;
  userId: string;
  cashflowStartDate: string | null;
  showPreStartSavingsContributions: boolean;
  onRefresh: () => Promise<void>;
  onCashDataRefresh: () => Promise<void>;
}

function SavingsGoalPanel({
  goal,
  participant,
  contributions,
  cashDeductionSourceIds,
  personId,
  householdId,
  userId,
  cashflowStartDate,
  showPreStartSavingsContributions,
  onRefresh,
  onCashDataRefresh,
}: SavingsGoalPanelProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [targetEditOpen, setTargetEditOpen] = useState(false);
  const [contributionEditOpen, setContributionEditOpen] = useState(false);
  const [continuePeriodOpen, setContinuePeriodOpen] = useState(false);
  const [editingContribution, setEditingContribution] =
    useState<SavingsContribution | null>(null);

  const [contributionAmountInput, setContributionAmountInput] = useState("");
  const [contributionDateInput, setContributionDateInput] = useState(todayIsoDate());
  const [contributionNotesInput, setContributionNotesInput] = useState("");
  const [contributionCashAction, setContributionCashAction] =
    useState<SavingsContributionCashAction>(SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY);
  const [contributionSaving, setContributionSaving] = useState(false);
  const [contributionError, setContributionError] = useState<string | null>(null);
  const [contributionSuccess, setContributionSuccess] = useState<string | null>(
    null
  );

  const goalContributions = useMemo(
    () => filterMyContributionsForGoal(contributions, goal.id, userId),
    [contributions, goal.id, userId]
  );
  const planningContributions = useMemo(
    () =>
      filterSavingsContributionsByCashflowStart(goalContributions, cashflowStartDate),
    [goalContributions, cashflowStartDate]
  );
  const visibleContributions = useMemo(
    () =>
      getSavingsPageVisibleContributions(
        goalContributions,
        cashflowStartDate,
        showPreStartSavingsContributions
      ),
    [goalContributions, cashflowStartDate, showPreStartSavingsContributions]
  );
  const myActiveContributed = useMemo(
    () => sumActiveSavingsContributionAmounts(goalContributions, cashflowStartDate),
    [goalContributions, cashflowStartDate]
  );
  const hasPreStartContributions = useMemo(
    () =>
      cashflowStartDate != null &&
      goalContributions.some((row) =>
        isSavingsContributionPreStart(row, cashflowStartDate)
      ),
    [goalContributions, cashflowStartDate]
  );
  const targetPeriodSummary = useMemo(
    () =>
      participant
        ? getMySavingsGoalTargetPeriodSummary(
            participant,
            planningContributions
          )
        : null,
    [participant, planningContributions]
  );
  const targetPeriodMonthHint = useMemo(
    () => (participant ? getParticipantSummaryMonthHint(participant) : null),
    [participant]
  );
  const recentContributions = visibleContributions.slice(0, 5);
  const isGoalCreator = canUserEditGoal(goal, userId);
  const sharedGoalDisplay = useMemo(
    () =>
      goal.goal_type === "shared"
        ? buildPrivacySafeSharedGoalDisplay({
            goal,
            myParticipant: participant,
            mySavedAmount: myActiveContributed,
          })
        : null,
    [goal, participant, myActiveContributed]
  );
  const detailView = useMemo(
    () =>
      buildSavingsGoalDetailView({
        goal,
        participant,
        contributions,
        userId,
        cashDeductionSourceIds,
        cashflowStartDate,
        showPreStartSavingsContributions,
      }),
    [
      goal,
      participant,
      contributions,
      userId,
      cashDeductionSourceIds,
      cashflowStartDate,
      showPreStartSavingsContributions,
    ]
  );
  const rolloverDisplay = useMemo(
    () =>
      participant
        ? buildSavingsRolloverDisplayView({
            goal,
            participant,
            contributions: planningContributions,
            userId,
            cashflowStartDate,
          })
        : null,
    [goal, participant, planningContributions, userId, cashflowStartDate]
  );

  const handleLogContribution = async () => {
    setContributionError(null);
    setContributionSuccess(null);

    const amount = Number.parseFloat(contributionAmountInput);
    if (contributionAmountInput.trim() === "" || Number.isNaN(amount)) {
      setContributionError("Please enter a valid contribution amount.");
      return;
    }
    if (amount < 0) {
      setContributionError("Contribution amount must be zero or greater.");
      return;
    }
    if (!contributionDateInput.trim()) {
      setContributionError("Please select a contribution date.");
      return;
    }

    setContributionSaving(true);

    const { cashDeducted, error } = await addMySavingsContributionWithCashAction(
      householdId,
      userId,
      {
        savingsGoalId: goal.id,
        amount,
        contributionDate: contributionDateInput,
        personId,
        notes: contributionNotesInput.trim() || null,
        goalName: goal.name,
        cashAction: contributionCashAction,
      }
    );

    setContributionSaving(false);

    if (error) {
      setContributionError(error);
      await onRefresh();
      return;
    }

    await onRefresh();
    if (cashDeducted) {
      await onCashDataRefresh();
    }
    setContributionAmountInput("");
    setContributionDateInput(todayIsoDate());
    setContributionNotesInput("");
    setContributionCashAction(SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY);
    setContributionSuccess(
      cashDeducted
        ? SAVINGS_CONTRIBUTION_LOG_AND_DEDUCT_SUCCESS
        : SAVINGS_CONTRIBUTION_LOG_ONLY_SUCCESS
    );
  };

  return (
    <div className="space-y-6 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-medium">{goal.name}</h3>
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>Type: {goalTypeLabel(goal.goal_type)}</p>
            <p>
              {goal.goal_type === "shared" ? "Household target" : "Target"}:{" "}
              {formatCurrency(Number(goal.target_amount))}
            </p>
            {goal.goal_type === "shared" && (
              <p className="text-xs">{SHARED_GOAL_METADATA_ONLY_COPY}</p>
            )}
            <p>
              {formatDisplayDate(goal.start_date)} – {formatDisplayDate(goal.end_date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDetailOpen(true)}
          >
            View details
          </Button>
          {isGoalCreator && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGoalEditOpen(true)}
            >
              Edit goal
            </Button>
          )}
        </div>
      </div>

      {sharedGoalDisplay && (
        <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <p>{sharedGoalDisplay.privacyCopy}</p>
          <p>{OTHER_USER_TARGET_PRIVACY_LABEL}</p>
        </div>
      )}

      <div className="space-y-4 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-medium">My contribution target</h4>
            {!participant && (
              <p className="mt-1 text-sm text-muted-foreground">
                No target set for you yet.
              </p>
            )}
            {participant && (
              <p className="mt-1 text-sm text-muted-foreground">
                Target: {formatCurrency(Number(participant.target_contribution_amount))}{" "}
                · {CONTRIBUTION_PERIOD_LABELS[participant.contribution_period]}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTargetEditOpen(true)}
          >
            Edit my target
          </Button>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h4 className="text-sm font-medium">Log my contribution</h4>

        <div className="space-y-2">
          <Label htmlFor={`contribution-amount-${goal.id}`}>Amount</Label>
          <Input
            id={`contribution-amount-${goal.id}`}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={contributionAmountInput}
            onChange={(e) => setContributionAmountInput(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`contribution-date-${goal.id}`}>Contribution date</Label>
          <Input
            id={`contribution-date-${goal.id}`}
            type="date"
            value={contributionDateInput}
            onChange={(e) => setContributionDateInput(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`contribution-notes-${goal.id}`}>Notes (optional)</Label>
          <Textarea
            id={`contribution-notes-${goal.id}`}
            placeholder="Optional notes about this contribution"
            value={contributionNotesInput}
            onChange={(e) => setContributionNotesInput(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-3">
          <Label>Cash action</Label>
          <RadioGroup
            value={contributionCashAction}
            onValueChange={(value) =>
              setContributionCashAction(value as SavingsContributionCashAction)
            }
            className="space-y-2"
          >
            <div className="flex items-start gap-2 rounded-md border px-3 py-2">
              <RadioGroupItem
                value={SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_ONLY}
                id={`contribution-cash-log-only-${goal.id}`}
                className="mt-0.5"
              />
              <Label
                htmlFor={`contribution-cash-log-only-${goal.id}`}
                className="cursor-pointer space-y-1 font-normal"
              >
                <span className="block font-medium">
                  {SAVINGS_CONTRIBUTION_LOG_ONLY_LABEL}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Records the contribution without changing your current cash.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2 rounded-md border px-3 py-2">
              <RadioGroupItem
                value={SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT}
                id={`contribution-cash-deduct-${goal.id}`}
                className="mt-0.5"
              />
              <Label
                htmlFor={`contribution-cash-deduct-${goal.id}`}
                className="cursor-pointer space-y-1 font-normal"
              >
                <span className="block font-medium">
                  {SAVINGS_CONTRIBUTION_LOG_AND_DEDUCT_LABEL}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {SAVINGS_CONTRIBUTION_DEDUCT_PRIVACY_COPY}{" "}
                  {SAVINGS_CONTRIBUTION_OTHER_USER_PRIVACY_COPY}
                </span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {contributionError && (
          <Alert variant="destructive">
            <AlertDescription>{contributionError}</AlertDescription>
          </Alert>
        )}
        {contributionSuccess && (
          <Alert>
            <AlertDescription>{contributionSuccess}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleLogContribution} disabled={contributionSaving}>
          {contributionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {contributionCashAction === SAVINGS_CONTRIBUTION_CASH_ACTION_LOG_AND_DEDUCT
            ? SAVINGS_CONTRIBUTION_LOG_AND_DEDUCT_LABEL
            : SAVINGS_CONTRIBUTION_LOG_ONLY_LABEL}
        </Button>
      </div>

      {participant && targetPeriodSummary && (
        <div className="space-y-2 border-t pt-4">
          <h4 className="text-sm font-medium">
            Your contributions for this target period
          </h4>
          {cashflowStartDate && hasPreStartContributions && (
            <p className="text-xs text-muted-foreground">
              {SAVINGS_ACTIVE_TOTAL_EXCLUDES_PRE_START_NOTICE}
            </p>
          )}
          {targetPeriodMonthHint && (
            <p className="text-xs text-muted-foreground">{targetPeriodMonthHint}</p>
          )}
          <div className="grid gap-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
            <p>
              Contribution period:{" "}
              <span className="font-medium">
                {CONTRIBUTION_PERIOD_LABELS[targetPeriodSummary.contributionPeriod]}
              </span>
            </p>
            <p>
              Target amount:{" "}
              <span className="font-medium">
                {formatCurrency(targetPeriodSummary.targetAmount)}
              </span>
            </p>
            {targetPeriodSummary.periodStart && (
              <p>
                Period start:{" "}
                <span className="font-medium">
                  {formatDisplayDate(targetPeriodSummary.periodStart)}
                </span>
              </p>
            )}
            {targetPeriodSummary.periodEnd && (
              <p>
                Period end:{" "}
                <span className="font-medium">
                  {formatDisplayDate(targetPeriodSummary.periodEnd)}
                </span>
              </p>
            )}
            <p>
              Your contributions in this period:{" "}
              <span className="font-medium">
                {formatCurrency(targetPeriodSummary.contributedAmount)}
              </span>
            </p>
            <p>
              Remaining for this period:{" "}
              <span className="font-medium">
                {formatCurrency(targetPeriodSummary.remainingObligation)}
              </span>
            </p>
          </div>
        </div>
      )}

      {participant && rolloverDisplay && (
        <SavingsRolloverPanel
          display={rolloverDisplay}
          continueDialog={
            <SavingsContinuePeriodDialog
              participant={participant}
              contributions={planningContributions}
              householdId={householdId}
              userId={userId}
              personId={personId}
              display={rolloverDisplay}
              open={continuePeriodOpen}
              onOpenChange={setContinuePeriodOpen}
              onSaved={onRefresh}
            />
          }
        />
      )}

      <div className="space-y-3 border-t pt-4">
        <div>
          <h4 className="text-sm font-medium">
            {goal.goal_type === "shared" ? "My contributions only" : "My contributions"}
          </h4>
          {goalContributions.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No contributions recorded by you yet.
            </p>
          ) : (
            <p className="mt-1 text-sm">
              {cashflowStartDate ? "My active contributions" : "My all-time contributions"}
              :{" "}
              <span className="font-medium">
                {formatCurrency(myActiveContributed)}
              </span>
            </p>
          )}
        </div>

        {recentContributions.length > 0 && (
          <ul className="space-y-2 text-sm">
            {recentContributions.map((contributionRow) => {
              const cashDeductionLabel = buildContributionListCashDeductionLabel(
                contributionRow.id,
                cashDeductionSourceIds
              );
              const preStartLabel = getSavingsContributionPreStartLabel(
                contributionRow,
                cashflowStartDate
              );
              const isPreStart =
                preStartLabel != null && showPreStartSavingsContributions;

              return (
              <li
                key={contributionRow.id}
                className={`flex flex-wrap items-baseline justify-between gap-2 rounded-md px-3 py-2 ${
                  isPreStart ? "border border-dashed bg-muted/20" : "bg-muted/40"
                }`}
              >
                <span className="font-medium">
                  {formatCurrency(Number(contributionRow.amount))}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2 text-muted-foreground">
                  {isPreStart && (
                    <Badge variant="outline" className="text-xs">
                      {SAVINGS_PRE_START_LABEL}
                    </Badge>
                  )}
                  <span>{formatDisplayDate(contributionRow.contribution_date)}</span>
                </span>
                {contributionRow.notes && (
                  <span className="w-full text-muted-foreground">
                    {contributionRow.notes}
                  </span>
                )}
                {cashDeductionLabel && (
                  <span className="w-full text-xs text-muted-foreground">
                    {cashDeductionLabel}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-8 px-2"
                  onClick={() => {
                    setEditingContribution(contributionRow);
                    setContributionEditOpen(true);
                  }}
                >
                  Edit contribution
                </Button>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <SavingsDetailPanel
        detail={detailView}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEditGoal={() => {
          setDetailOpen(false);
          setGoalEditOpen(true);
        }}
        onEditTarget={() => {
          setDetailOpen(false);
          setTargetEditOpen(true);
        }}
      />

      <SavingsGoalEditDialog
        goal={goal}
        userId={userId}
        open={goalEditOpen}
        onOpenChange={setGoalEditOpen}
        onSaved={onRefresh}
        onDeleted={onRefresh}
      />

      <SavingsTargetEditDialog
        participant={participant ?? null}
        savingsGoalId={goal.id}
        householdId={householdId}
        userId={userId}
        personId={personId}
        open={targetEditOpen}
        onOpenChange={setTargetEditOpen}
        onSaved={onRefresh}
      />

      <SavingsContributionEditDialog
        contribution={editingContribution}
        hasCashDeduction={
          editingContribution
            ? cashDeductionSourceIds.has(editingContribution.id)
            : false
        }
        householdId={householdId}
        userId={userId}
        open={contributionEditOpen}
        onOpenChange={(open) => {
          setContributionEditOpen(open);
          if (!open) {
            setEditingContribution(null);
          }
        }}
        onSaved={onRefresh}
        onDeleted={onRefresh}
      />
    </div>
  );
}

export function SettingsPage() {
  const { user, household, membership, refreshHousehold } = useAuth();

  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [cashflowStartDateInput, setCashflowStartDateInput] = useState("");
  const [cashflowSaving, setCashflowSaving] = useState(false);
  const [cashflowSaveError, setCashflowSaveError] = useState<string | null>(null);
  const [cashflowSuccess, setCashflowSuccess] = useState<string | null>(null);

  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const [paycheckSchedule, setPaycheckSchedule] = useState<PaycheckSchedule | null>(null);
  const [paycheckScheduleLoading, setPaycheckScheduleLoading] = useState(true);

  const [latestSnapshot, setLatestSnapshot] = useState<CashSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [snapshotDateInput, setSnapshotDateInput] = useState(todayIsoDate);
  const [notesInput, setNotesInput] = useState("");
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotSaveError, setSnapshotSaveError] = useState<string | null>(null);
  const [snapshotSuccess, setSnapshotSuccess] = useState<string | null>(null);

  const [cashAdjustmentCreditsLoading, setCashAdjustmentCreditsLoading] =
    useState(true);
  const [cashAdjustmentCreditsError, setCashAdjustmentCreditsError] = useState<
    string | null
  >(null);
  const [cashAdjustmentCreditRows, setCashAdjustmentCreditRows] = useState<
    ReturnType<typeof mapCashAdjustmentCreditsForDisplay>
  >([]);

  const [cashPaymentDeductionsLoading, setCashPaymentDeductionsLoading] =
    useState(true);
  const [cashPaymentDeductionsError, setCashPaymentDeductionsError] = useState<
    string | null
  >(null);
  const [cashPaymentDeductionRows, setCashPaymentDeductionRows] = useState<
    ReturnType<typeof mapCashPaymentDeductionsForDisplay>
  >([]);

  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [myParticipants, setMyParticipants] = useState<SavingsGoalParticipant[]>([]);
  const [myContributions, setMyContributions] = useState<SavingsContribution[]>([]);
  const [savingsCashDeductionSourceIds, setSavingsCashDeductionSourceIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [savingsLoading, setSavingsLoading] = useState(true);
  const [savingsError, setSavingsError] = useState<string | null>(null);
  const [goalNameInput, setGoalNameInput] = useState("");
  const [goalTypeInput, setGoalTypeInput] = useState<SavingsGoalType | "">("");
  const [goalTargetAmountInput, setGoalTargetAmountInput] = useState("");
  const [goalStartDateInput, setGoalStartDateInput] = useState("");
  const [goalEndDateInput, setGoalEndDateInput] = useState("");
  const [goalCreating, setGoalCreating] = useState(false);
  const [goalCreateError, setGoalCreateError] = useState<string | null>(null);
  const [goalCreateSuccess, setGoalCreateSuccess] = useState<string | null>(null);
  const [showPreStartSavingsContributions, setShowPreStartSavingsContributions] =
    useState(false);

  const cashflowStartDate = settings?.cashflow_start_date ?? null;

  const hasPreStartSavingsContributions = useMemo(
    () =>
      cashflowStartDate != null &&
      myContributions.some((row) =>
        isSavingsContributionPreStart(row, cashflowStartDate)
      ),
    [myContributions, cashflowStartDate]
  );

  const participantsByGoalId = useMemo(() => {
    const map = new Map<string, SavingsGoalParticipant>();
    for (const participant of myParticipants) {
      map.set(participant.savings_goal_id, participant);
    }
    return map;
  }, [myParticipants]);

  const loadSettings = useCallback(async () => {
    if (!household) return;

    setSettingsLoading(true);
    setSettingsError(null);

    const { settings: data, error } = await getHouseholdSettings(household.id);

    if (error) {
      setSettingsError(error);
      setSettings(null);
    } else {
      setSettings(data);
      if (data?.cashflow_start_date) {
        setCashflowStartDateInput(data.cashflow_start_date);
      }
    }

    setSettingsLoading(false);
  }, [household]);

  const loadBudgetProfile = useCallback(async () => {
    if (!household || !user) return;

    setPeopleLoading(true);
    setPeopleError(null);

    const [peopleResult, membershipResult] = await Promise.all([
      getHouseholdPeople(household.id),
      getMyHouseholdMemberProfile(household.id, user.id),
    ]);

    if (peopleResult.error) {
      setPeopleError(peopleResult.error);
      setPeople([]);
    } else {
      setPeople(peopleResult.people);
    }

    if (membershipResult.error) {
      setPeopleError((current) => current ?? membershipResult.error);
    } else {
      setSelectedPersonId(membershipResult.membership?.person_id ?? "");
    }

    setPeopleLoading(false);
  }, [household, user]);

  const loadPaycheckSchedule = useCallback(async () => {
    if (!household || !user) return;

    setPaycheckScheduleLoading(true);
    const { schedule } = await getMyPaycheckSchedule(household.id, user.id);
    setPaycheckSchedule(schedule);
    setPaycheckScheduleLoading(false);
  }, [household, user]);

  const loadLatestSnapshot = useCallback(async () => {
    if (!household || !user) return;

    setSnapshotLoading(true);
    setSnapshotError(null);

    const { snapshot, error } = await getMyLatestCashSnapshot(household.id, user.id);

    if (error) {
      setSnapshotError(error);
      setLatestSnapshot(null);
    } else {
      setLatestSnapshot(snapshot);
    }

    setSnapshotLoading(false);
  }, [household, user]);

  const loadCashAdjustmentCredits = useCallback(async () => {
    if (!household || !user) return;

    setCashAdjustmentCreditsLoading(true);
    setCashAdjustmentCreditsError(null);

    const [transactionsResult, expensesResult] = await Promise.all([
      getMyCashAdjustmentTransactions(
        household.id,
        user.id,
        DEFAULT_CASH_ADJUSTMENT_CREDIT_HISTORY_LIMIT
      ),
      getManualExpenses(household.id),
    ]);

    const errors = [transactionsResult.error, expensesResult.error].filter(Boolean);
    if (errors.length > 0) {
      setCashAdjustmentCreditsError(errors[0] ?? "Failed to load cash adjustment credits.");
      setCashAdjustmentCreditRows([]);
    } else {
      const descriptionById = buildAdjustmentManualExpenseDescriptionLookup(
        expensesResult.expenses
      );
      setCashAdjustmentCreditRows(
        mapCashAdjustmentCreditsForDisplay(
          transactionsResult.transactions,
          descriptionById,
          { limit: DEFAULT_CASH_ADJUSTMENT_CREDIT_HISTORY_LIMIT }
        )
      );
    }

    setCashAdjustmentCreditsLoading(false);
  }, [household, user]);

  const loadCashPaymentDeductions = useCallback(async () => {
    if (!household || !user) return;

    setCashPaymentDeductionsLoading(true);
    setCashPaymentDeductionsError(null);

    const [transactionsResult, expensesResult] = await Promise.all([
      getMyCashPaymentTransactions(
        household.id,
        user.id,
        DEFAULT_CASH_PAYMENT_DEDUCTION_HISTORY_LIMIT
      ),
      getManualExpenses(household.id),
    ]);

    const errors = [transactionsResult.error, expensesResult.error].filter(Boolean);
    if (errors.length > 0) {
      setCashPaymentDeductionsError(
        errors[0] ?? "Failed to load cash payment deductions."
      );
      setCashPaymentDeductionRows([]);
      setCashPaymentDeductionsLoading(false);
      return;
    }

    const billInstanceIds = transactionsResult.transactions
      .filter((transaction) => transaction.source_type === "bill_instance")
      .map((transaction) => transaction.source_id);
    const uniqueBillInstanceIds = [...new Set(billInstanceIds)];

    const debtPaymentIds = transactionsResult.transactions
      .filter((transaction) => transaction.source_type === "debt_payment")
      .map((transaction) => transaction.source_id);
    const uniqueDebtPaymentIds = [...new Set(debtPaymentIds)];

    const [billInstancesResult, debtPaymentsResult] = await Promise.all([
      getBillInstancesByIds(household.id, uniqueBillInstanceIds),
      getDebtPaymentsByIds(household.id, uniqueDebtPaymentIds),
    ]);

    const lookupErrors = [billInstancesResult.error, debtPaymentsResult.error].filter(
      Boolean
    );
    if (lookupErrors.length > 0) {
      setCashPaymentDeductionsError(lookupErrors[0] ?? "Failed to load cash payment deductions.");
      setCashPaymentDeductionRows([]);
    } else {
      setCashPaymentDeductionRows(
        mapCashPaymentDeductionsForDisplay(
          transactionsResult.transactions,
          {
            billInstanceNameById: buildBillInstanceNameLookup(
              billInstancesResult.billInstances
            ),
            debtPaymentDescriptionById: buildDebtPaymentDescriptionLookup(
              debtPaymentsResult.debtPayments
            ),
            manualExpenseDescriptionById: buildManualExpenseDescriptionLookup(
              expensesResult.expenses
            ),
            savingsContributionGoalNameById: buildSavingsContributionGoalNameLookup(
              myContributions,
              savingsGoals
            ),
          },
          { limit: DEFAULT_CASH_PAYMENT_DEDUCTION_HISTORY_LIMIT }
        )
      );
      setSavingsCashDeductionSourceIds(
        getSavingsContributionCashDeductionSourceIds(transactionsResult.transactions)
      );
    }

    setCashPaymentDeductionsLoading(false);
  }, [household, user, myContributions, savingsGoals]);

  const loadSavings = useCallback(async () => {
    if (!household || !user) return;

    setSavingsLoading(true);
    setSavingsError(null);

    const [goalsResult, participantsResult, contributionsResult] = await Promise.all([
      getSavingsGoals(household.id),
      getMySavingsGoalParticipants(household.id, user.id),
      getMySavingsContributions(household.id, user.id),
    ]);

    const errors = [
      goalsResult.error,
      participantsResult.error,
      contributionsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      setSavingsError(errors[0] ?? "Failed to load savings data.");
    }

    setSavingsGoals(goalsResult.goals);
    setMyParticipants(participantsResult.participants);
    setMyContributions(contributionsResult.contributions);
    setSavingsLoading(false);
  }, [household, user]);

  const refreshCashData = useCallback(async () => {
    await Promise.all([loadLatestSnapshot(), loadCashPaymentDeductions()]);
  }, [loadLatestSnapshot, loadCashPaymentDeductions]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadBudgetProfile();
  }, [loadBudgetProfile]);

  useEffect(() => {
    loadPaycheckSchedule();
  }, [loadPaycheckSchedule]);

  useEffect(() => {
    loadLatestSnapshot();
  }, [loadLatestSnapshot]);

  useEffect(() => {
    loadCashAdjustmentCredits();
  }, [loadCashAdjustmentCredits]);

  useEffect(() => {
    loadCashPaymentDeductions();
  }, [loadCashPaymentDeductions]);

  useEffect(() => {
    loadSavings();
  }, [loadSavings]);

  const handleCreateSavingsGoal = async () => {
    if (!household || !user) return;

    setGoalCreateError(null);
    setGoalCreateSuccess(null);

    if (!goalNameInput.trim()) {
      setGoalCreateError("Please enter a goal name.");
      return;
    }

    const targetAmount = Number.parseFloat(goalTargetAmountInput);
    if (goalTargetAmountInput.trim() === "" || Number.isNaN(targetAmount)) {
      setGoalCreateError("Please enter a valid target amount.");
      return;
    }
    if (targetAmount < 0) {
      setGoalCreateError("Target amount must be zero or greater.");
      return;
    }
    if (!goalStartDateInput.trim()) {
      setGoalCreateError("Please select a start date.");
      return;
    }
    if (!goalEndDateInput.trim()) {
      setGoalCreateError("Please select an end date.");
      return;
    }
    if (goalEndDateInput < goalStartDateInput) {
      setGoalCreateError("End date must be on or after the start date.");
      return;
    }
    if (goalTypeInput !== "private" && goalTypeInput !== "shared") {
      setGoalCreateError("Please select a goal type.");
      return;
    }

    setGoalCreating(true);

    const { error } = await createSavingsGoal(household.id, user.id, {
      name: goalNameInput.trim(),
      goalType: goalTypeInput,
      targetAmount,
      startDate: goalStartDateInput,
      endDate: goalEndDateInput,
    });

    setGoalCreating(false);

    if (error) {
      setGoalCreateError(error);
      return;
    }

    setGoalNameInput("");
    setGoalTypeInput("");
    setGoalTargetAmountInput("");
    setGoalStartDateInput("");
    setGoalEndDateInput("");
    await loadSavings();
    setGoalCreateSuccess("Savings goal created.");
  };

  const handleSaveCashflowStartDate = async () => {
    if (!household) return;

    setCashflowSaveError(null);
    setCashflowSuccess(null);

    if (!cashflowStartDateInput.trim()) {
      setCashflowSaveError("Please select a cashflow start date.");
      return;
    }

    setCashflowSaving(true);

    const { settings: updated, error } = await upsertHouseholdCashflowStartDate(
      household.id,
      cashflowStartDateInput
    );

    setCashflowSaving(false);

    if (error) {
      setCashflowSaveError(error);
      return;
    }

    setSettings(updated);
    setCashflowSuccess("Cashflow start date saved.");
  };

  const handleSaveBudgetProfile = async () => {
    if (!household || !user) return;

    setProfileSaveError(null);
    setProfileSuccess(null);

    if (!selectedPersonId.trim()) {
      setProfileSaveError("Please select a budget profile.");
      return;
    }

    setProfileSaving(true);

    const { membership, error } = await updateMyPersonMapping(
      household.id,
      user.id,
      selectedPersonId
    );

    setProfileSaving(false);

    if (error) {
      setProfileSaveError(error);
      return;
    }

    setSelectedPersonId(membership?.person_id ?? selectedPersonId);
    await refreshHousehold();
    setProfileSuccess("Budget profile saved.");
  };

  const handleSaveCashSnapshot = async () => {
    if (!household || !user) return;

    setSnapshotSaveError(null);
    setSnapshotSuccess(null);

    const amount = Number.parseFloat(amountInput);
    if (amountInput.trim() === "" || Number.isNaN(amount)) {
      setSnapshotSaveError("Please enter a valid amount.");
      return;
    }
    if (amount < 0) {
      setSnapshotSaveError("Amount must be zero or greater.");
      return;
    }
    if (!snapshotDateInput.trim()) {
      setSnapshotSaveError("Please select a snapshot date.");
      return;
    }

    setSnapshotSaving(true);

    const { error: insertError } = await addMyCashSnapshot(
      household.id,
      user.id,
      amount,
      snapshotDateInput,
      notesInput.trim() || undefined
    );

    if (insertError) {
      setSnapshotSaving(false);
      setSnapshotSaveError(insertError);
      return;
    }

    const { snapshot, error: reloadError } = await getMyLatestCashSnapshot(
      household.id,
      user.id
    );

    setSnapshotSaving(false);

    if (reloadError) {
      setSnapshotSaveError(reloadError);
      return;
    }

    setLatestSnapshot(snapshot);
    setAmountInput("");
    setSnapshotDateInput(todayIsoDate());
    setNotesInput("");
    setSnapshotSuccess("Current amount saved.");
  };

  if (!household || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Household cashflow preferences and your private balance
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Cashflow start date</CardTitle>
            <CardDescription>
              The household date when cashflow tracking begins. Shared for all members.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading settings...
              </div>
            ) : settingsError ? (
              <Alert variant="destructive">
                <AlertDescription>{settingsError}</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="text-sm">
                  {settings?.cashflow_start_date ? (
                    <p>
                      Current start date:{" "}
                      <span className="font-medium">
                        {formatDisplayDate(settings.cashflow_start_date)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      No cashflow start date set yet.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cashflow-start-date">Start date</Label>
                  <Input
                    id="cashflow-start-date"
                    type="date"
                    value={cashflowStartDateInput}
                    onChange={(e) => setCashflowStartDateInput(e.target.value)}
                  />
                </div>

                {cashflowSaveError && (
                  <Alert variant="destructive">
                    <AlertDescription>{cashflowSaveError}</AlertDescription>
                  </Alert>
                )}
                {cashflowSuccess && (
                  <Alert>
                    <AlertDescription>{cashflowSuccess}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleSaveCashflowStartDate}
                  disabled={cashflowSaving}
                >
                  {cashflowSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save start date
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your budget profile</CardTitle>
            <CardDescription>
              This determines which bill share is used for your private calculations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {peopleLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading budget profiles...
              </div>
            ) : peopleError ? (
              <Alert variant="destructive">
                <AlertDescription>{peopleError}</AlertDescription>
              </Alert>
            ) : people.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No household budget profiles found yet. Add Teles and Nicole in setup
                before choosing your profile.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="budget-profile">Profile</Label>
                  <Select
                    value={selectedPersonId || undefined}
                    onValueChange={setSelectedPersonId}
                  >
                    <SelectTrigger id="budget-profile" className="w-full">
                      <SelectValue placeholder="Select your budget profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {profileSaveError && (
                  <Alert variant="destructive">
                    <AlertDescription>{profileSaveError}</AlertDescription>
                  </Alert>
                )}
                {profileSuccess && (
                  <Alert>
                    <AlertDescription>{profileSuccess}</AlertDescription>
                  </Alert>
                )}

                <Button onClick={handleSaveBudgetProfile} disabled={profileSaving}>
                  {profileSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save budget profile
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {user ? (
          <PaycheckScheduleSettingsPanel
            householdId={household.id}
            userId={user.id}
            initialSchedule={paycheckSchedule}
            loading={paycheckScheduleLoading}
            onSaved={setPaycheckSchedule}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>My current available amount</CardTitle>
            <CardDescription>
              Your private balance snapshot. Only you can see this amount.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshotLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your latest amount...
              </div>
            ) : snapshotError ? (
              <Alert variant="destructive">
                <AlertDescription>{snapshotError}</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="text-sm">
                  {latestSnapshot ? (
                    <div className="space-y-1">
                      <p>
                        Latest amount:{" "}
                        <span className="font-medium">
                          {formatCurrency(Number(latestSnapshot.amount))}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        As of {formatDisplayDate(latestSnapshot.snapshot_date)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      No current amount recorded yet.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cash-amount">Amount</Label>
                  <Input
                    id="cash-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="snapshot-date">Snapshot date</Label>
                  <Input
                    id="snapshot-date"
                    type="date"
                    value={snapshotDateInput}
                    onChange={(e) => setSnapshotDateInput(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="snapshot-notes">Notes (optional)</Label>
                  <Textarea
                    id="snapshot-notes"
                    placeholder="Optional notes about this snapshot"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={2}
                  />
                </div>

                {snapshotSaveError && (
                  <Alert variant="destructive">
                    <AlertDescription>{snapshotSaveError}</AlertDescription>
                  </Alert>
                )}
                {snapshotSuccess && (
                  <Alert>
                    <AlertDescription>{snapshotSuccess}</AlertDescription>
                  </Alert>
                )}

                <Button onClick={handleSaveCashSnapshot} disabled={snapshotSaving}>
                  {snapshotSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save current amount
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cash payment deductions</CardTitle>
            <CardDescription>
              Amounts deducted from your current amount when you used Pay & deduct
              cash.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cashPaymentDeductionsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading cash payment deductions...
              </div>
            ) : cashPaymentDeductionsError ? (
              <Alert variant="destructive">
                <AlertDescription>{cashPaymentDeductionsError}</AlertDescription>
              </Alert>
            ) : cashPaymentDeductionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cash payment deductions yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {cashPaymentDeductionRows.map((deduction) => (
                  <li
                    key={deduction.id}
                    className="rounded-md bg-muted/40 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{deduction.formattedAmount}</span>
                      <span className="text-muted-foreground">
                        {formatDisplayDate(deduction.paidAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {deduction.sourceTypeLabel} · {deduction.sourceDescription}
                    </p>
                    {deduction.notes && (
                      <p className="mt-1 text-muted-foreground">{deduction.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cash adjustment credits</CardTitle>
            <CardDescription>
              Credits added to your current amount from decrease expense adjustments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cashAdjustmentCreditsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading cash adjustment credits...
              </div>
            ) : cashAdjustmentCreditsError ? (
              <Alert variant="destructive">
                <AlertDescription>{cashAdjustmentCreditsError}</AlertDescription>
              </Alert>
            ) : cashAdjustmentCreditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cash adjustment credits yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {cashAdjustmentCreditRows.map((credit) => (
                  <li
                    key={credit.id}
                    className="rounded-md bg-muted/40 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {formatCurrency(credit.amount)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDisplayDate(credit.creditedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {credit.adjustmentDescription}
                    </p>
                    {credit.notes && (
                      <p className="mt-1 text-muted-foreground">{credit.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Savings goals</CardTitle>
            <CardDescription>
              Create household savings goals and track your own contribution targets and
              logged amounts. Other members&apos; private contribution details stay hidden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium">Create savings goal</h3>

              <div className="space-y-2">
                <Label htmlFor="savings-goal-name">Goal name</Label>
                <Input
                  id="savings-goal-name"
                  placeholder="Emergency fund"
                  value={goalNameInput}
                  onChange={(e) => setGoalNameInput(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="savings-goal-type">Goal type</Label>
                <Select
                  value={goalTypeInput || undefined}
                  onValueChange={(value) => setGoalTypeInput(value as SavingsGoalType)}
                >
                  <SelectTrigger id="savings-goal-type" className="w-full">
                    <SelectValue placeholder="Select goal type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="savings-goal-target">Target amount</Label>
                <Input
                  id="savings-goal-target"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={goalTargetAmountInput}
                  onChange={(e) => setGoalTargetAmountInput(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="savings-goal-start">Start date</Label>
                  <Input
                    id="savings-goal-start"
                    type="date"
                    value={goalStartDateInput}
                    onChange={(e) => setGoalStartDateInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="savings-goal-end">End date</Label>
                  <Input
                    id="savings-goal-end"
                    type="date"
                    value={goalEndDateInput}
                    onChange={(e) => setGoalEndDateInput(e.target.value)}
                  />
                </div>
              </div>

              {goalCreateError && (
                <Alert variant="destructive">
                  <AlertDescription>{goalCreateError}</AlertDescription>
                </Alert>
              )}
              {goalCreateSuccess && (
                <Alert>
                  <AlertDescription>{goalCreateSuccess}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleCreateSavingsGoal} disabled={goalCreating}>
                {goalCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create savings goal
              </Button>
            </div>

            {savingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading savings goals...
              </div>
            ) : savingsError ? (
              <Alert variant="destructive">
                <AlertDescription>{savingsError}</AlertDescription>
              </Alert>
            ) : savingsGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No savings goals yet.</p>
            ) : (
              <div className="space-y-4">
                {!settingsLoading &&
                  cashflowStartDate &&
                  hasPreStartSavingsContributions && (
                    <Alert>
                      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span>{SAVINGS_CONTRIBUTIONS_PRE_START_HIDDEN_NOTICE}</span>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="show-pre-start-savings-contributions"
                            checked={showPreStartSavingsContributions}
                            onCheckedChange={(checked) =>
                              setShowPreStartSavingsContributions(checked === true)
                            }
                          />
                          <Label
                            htmlFor="show-pre-start-savings-contributions"
                            className="text-sm font-normal"
                          >
                            {SHOW_PRE_START_SAVINGS_CONTRIBUTIONS_LABEL}
                          </Label>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                {savingsGoals.map((goal) => (
                  <SavingsGoalPanel
                    key={goal.id}
                    goal={goal}
                    participant={participantsByGoalId.get(goal.id)}
                    contributions={myContributions}
                    cashDeductionSourceIds={savingsCashDeductionSourceIds}
                    personId={membership?.person_id ?? null}
                    householdId={household.id}
                    userId={user.id}
                    cashflowStartDate={cashflowStartDate}
                    showPreStartSavingsContributions={showPreStartSavingsContributions}
                    onRefresh={loadSavings}
                    onCashDataRefresh={refreshCashData}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
