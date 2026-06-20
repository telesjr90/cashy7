import { useState, useEffect, useCallback } from "react";
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
import type { CashSnapshot, HouseholdSettings, Person } from "@/lib/types";
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

export function SettingsPage() {
  const { user, household, refreshHousehold } = useAuth();

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

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadBudgetProfile();
  }, [loadBudgetProfile]);

  useEffect(() => {
    loadLatestSnapshot();
  }, [loadLatestSnapshot]);

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
      </div>
    </div>
  );
}
