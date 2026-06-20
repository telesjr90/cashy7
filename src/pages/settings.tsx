import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getHouseholdSettings,
  upsertHouseholdCashflowStartDate,
  getMyLatestCashSnapshot,
  addMyCashSnapshot,
} from "@/lib/cashflow-settings";
import {
  getHouseholdPeople,
  getMyHouseholdMemberProfile,
  updateMyPersonMapping,
} from "@/lib/user-person";
import {
  addMySavingsContribution,
  createSavingsGoal,
  filterMyContributionsForGoal,
  getMySavingsContributions,
  getMySavingsGoalParticipants,
  getSavingsGoals,
  sumMyContributionsForGoal,
  upsertMySavingsGoalParticipant,
} from "@/lib/savings";
import type {
  CashSnapshot,
  HouseholdSettings,
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
import { Loader as Loader2, Settings } from "lucide-react";
import { format, parseISO } from "date-fns";

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
  personId: string | null;
  householdId: string;
  userId: string;
  onRefresh: () => Promise<void>;
}

function SavingsGoalPanel({
  goal,
  participant,
  contributions,
  personId,
  householdId,
  userId,
  onRefresh,
}: SavingsGoalPanelProps) {
  const [targetAmountInput, setTargetAmountInput] = useState(
    participant ? String(participant.target_contribution_amount) : ""
  );
  const [contributionPeriod, setContributionPeriod] = useState<
    SavingsContributionPeriod | ""
  >(participant?.contribution_period ?? "");
  const [periodStartInput, setPeriodStartInput] = useState(
    participant?.period_start ?? ""
  );
  const [periodEndInput, setPeriodEndInput] = useState(
    participant?.period_end ?? ""
  );
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetSuccess, setTargetSuccess] = useState<string | null>(null);

  const [contributionAmountInput, setContributionAmountInput] = useState("");
  const [contributionDateInput, setContributionDateInput] = useState(todayIsoDate());
  const [contributionNotesInput, setContributionNotesInput] = useState("");
  const [contributionSaving, setContributionSaving] = useState(false);
  const [contributionError, setContributionError] = useState<string | null>(null);
  const [contributionSuccess, setContributionSuccess] = useState<string | null>(
    null
  );

  useEffect(() => {
    setTargetAmountInput(
      participant ? String(participant.target_contribution_amount) : ""
    );
    setContributionPeriod(participant?.contribution_period ?? "");
    setPeriodStartInput(participant?.period_start ?? "");
    setPeriodEndInput(participant?.period_end ?? "");
  }, [participant]);

  const goalContributions = useMemo(
    () => filterMyContributionsForGoal(contributions, goal.id),
    [contributions, goal.id]
  );
  const myTotalContributed = useMemo(
    () => sumMyContributionsForGoal(contributions, goal.id),
    [contributions, goal.id]
  );
  const recentContributions = goalContributions.slice(0, 5);

  const handleSaveTarget = async () => {
    setTargetError(null);
    setTargetSuccess(null);

    const targetAmount = Number.parseFloat(targetAmountInput);
    if (targetAmountInput.trim() === "" || Number.isNaN(targetAmount)) {
      setTargetError("Please enter a valid target contribution amount.");
      return;
    }
    if (targetAmount < 0) {
      setTargetError("Target contribution amount must be zero or greater.");
      return;
    }
    if (
      contributionPeriod !== "1_14" &&
      contributionPeriod !== "15_eom" &&
      contributionPeriod !== "monthly"
    ) {
      setTargetError("Please select a contribution period.");
      return;
    }

    setTargetSaving(true);

    const { error } = await upsertMySavingsGoalParticipant(householdId, userId, {
      savingsGoalId: goal.id,
      targetContributionAmount: targetAmount,
      contributionPeriod,
      personId,
      periodStart: periodStartInput.trim() || null,
      periodEnd: periodEndInput.trim() || null,
    });

    setTargetSaving(false);

    if (error) {
      setTargetError(error);
      return;
    }

    await onRefresh();
    setTargetSuccess("Your contribution target saved.");
  };

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

    const { error } = await addMySavingsContribution(householdId, userId, {
      savingsGoalId: goal.id,
      amount,
      contributionDate: contributionDateInput,
      personId,
      notes: contributionNotesInput.trim() || null,
    });

    setContributionSaving(false);

    if (error) {
      setContributionError(error);
      return;
    }

    await onRefresh();
    setContributionAmountInput("");
    setContributionDateInput(todayIsoDate());
    setContributionNotesInput("");
    setContributionSuccess("Contribution logged.");
  };

  return (
    <div className="space-y-6 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="text-lg font-medium">{goal.name}</h3>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>Type: {goalTypeLabel(goal.goal_type)}</p>
          <p>Target: {formatCurrency(Number(goal.target_amount))}</p>
          <p>
            {formatDisplayDate(goal.start_date)} – {formatDisplayDate(goal.end_date)}
          </p>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <div>
          <h4 className="text-sm font-medium">My contribution target</h4>
          {!participant && (
            <p className="mt-1 text-sm text-muted-foreground">
              No target set for you yet.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`target-amount-${goal.id}`}>Target contribution amount</Label>
          <Input
            id={`target-amount-${goal.id}`}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={targetAmountInput}
            onChange={(e) => setTargetAmountInput(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`contribution-period-${goal.id}`}>Contribution period</Label>
          <Select
            value={contributionPeriod || undefined}
            onValueChange={(value) =>
              setContributionPeriod(value as SavingsContributionPeriod)
            }
          >
            <SelectTrigger id={`contribution-period-${goal.id}`} className="w-full">
              <SelectValue placeholder="Select contribution period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1_14">{CONTRIBUTION_PERIOD_LABELS["1_14"]}</SelectItem>
              <SelectItem value="15_eom">
                {CONTRIBUTION_PERIOD_LABELS["15_eom"]}
              </SelectItem>
              <SelectItem value="monthly">{CONTRIBUTION_PERIOD_LABELS.monthly}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`period-start-${goal.id}`}>Period start (optional)</Label>
            <Input
              id={`period-start-${goal.id}`}
              type="date"
              value={periodStartInput}
              onChange={(e) => setPeriodStartInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`period-end-${goal.id}`}>Period end (optional)</Label>
            <Input
              id={`period-end-${goal.id}`}
              type="date"
              value={periodEndInput}
              onChange={(e) => setPeriodEndInput(e.target.value)}
            />
          </div>
        </div>

        {targetError && (
          <Alert variant="destructive">
            <AlertDescription>{targetError}</AlertDescription>
          </Alert>
        )}
        {targetSuccess && (
          <Alert>
            <AlertDescription>{targetSuccess}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSaveTarget} disabled={targetSaving}>
          {targetSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save my target
        </Button>
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
          Log contribution
        </Button>
      </div>

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
              My total contributed:{" "}
              <span className="font-medium">{formatCurrency(myTotalContributed)}</span>
            </p>
          )}
        </div>

        {recentContributions.length > 0 && (
          <ul className="space-y-2 text-sm">
            {recentContributions.map((contribution) => (
              <li
                key={contribution.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
              >
                <span className="font-medium">
                  {formatCurrency(Number(contribution.amount))}
                </span>
                <span className="text-muted-foreground">
                  {formatDisplayDate(contribution.contribution_date)}
                </span>
                {contribution.notes && (
                  <span className="w-full text-muted-foreground">{contribution.notes}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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

  const [latestSnapshot, setLatestSnapshot] = useState<CashSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [snapshotDateInput, setSnapshotDateInput] = useState(todayIsoDate);
  const [notesInput, setNotesInput] = useState("");
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotSaveError, setSnapshotSaveError] = useState<string | null>(null);
  const [snapshotSuccess, setSnapshotSuccess] = useState<string | null>(null);

  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [myParticipants, setMyParticipants] = useState<SavingsGoalParticipant[]>([]);
  const [myContributions, setMyContributions] = useState<SavingsContribution[]>([]);
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

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadBudgetProfile();
  }, [loadBudgetProfile]);

  useEffect(() => {
    loadLatestSnapshot();
  }, [loadLatestSnapshot]);

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
                {savingsGoals.map((goal) => (
                  <SavingsGoalPanel
                    key={goal.id}
                    goal={goal}
                    participant={participantsByGoalId.get(goal.id)}
                    contributions={myContributions}
                    personId={membership?.person_id ?? null}
                    householdId={household.id}
                    userId={user.id}
                    onRefresh={loadSavings}
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
