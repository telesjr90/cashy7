import { useEffect, useState } from "react";
import { Loader as Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  defaultPaycheckScheduleSettings,
  mapPaycheckScheduleRow,
  PAYCHECK_LAST_BUSINESS_DAY_LIMITATION_LABEL,
  PAYCHECK_SCHEDULE_PRIVACY_COPY,
  PAYCHECK_SCHEDULE_TYPE_LABELS,
  PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY,
  PAYCHECK_SETTINGS_DISABLED_LABEL,
  PAYCHECK_SETTINGS_FORECAST_ONLY_COPY,
  PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY,
  PAYCHECK_SETTINGS_NO_SCHEDULE_LABEL,
  type PaycheckScheduleSettings,
  type PaycheckScheduleType,
  upsertMyPaycheckSchedule,
  validatePaycheckScheduleSettings,
} from "@/lib/paycheck-schedule";
import type { PaycheckSchedule } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PaycheckScheduleSettingsPanelProps = {
  householdId: string;
  userId: string;
  initialSchedule: PaycheckSchedule | null;
  loading?: boolean;
  onSaved?: (schedule: PaycheckSchedule | null) => void;
};

export function PaycheckScheduleSettingsPanel({
  householdId,
  userId,
  initialSchedule,
  loading = false,
  onSaved,
}: PaycheckScheduleSettingsPanelProps) {
  const [settings, setSettings] = useState<PaycheckScheduleSettings>(
    defaultPaycheckScheduleSettings()
  );
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialSchedule) {
      const mapped = mapPaycheckScheduleRow(initialSchedule);
      setSettings(mapped);
      setAmountInput(mapped.amount > 0 ? String(mapped.amount) : "");
      return;
    }

    setSettings(defaultPaycheckScheduleSettings());
    setAmountInput("");
  }, [initialSchedule]);

  const handleScheduleTypeChange = (value: PaycheckScheduleType) => {
    setSettings((current) => ({
      ...current,
      scheduleType: value,
      isActive: value !== "disabled",
    }));
    setSaveSuccess(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(null);

    const parsedAmount = amountInput.trim() === "" ? 0 : Number(amountInput);
    if (
      settings.scheduleType !== "disabled" &&
      amountInput.trim() !== "" &&
      !Number.isFinite(parsedAmount)
    ) {
      setSaveError("Paycheck amount must be zero or greater.");
      return;
    }

    const nextSettings: PaycheckScheduleSettings = {
      ...settings,
      amount: parsedAmount,
    };
    const validationError = validatePaycheckScheduleSettings(nextSettings);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaving(true);
    const { schedule, error } = await upsertMyPaycheckSchedule({
      householdId,
      userId,
      settings: nextSettings,
    });
    setSaving(false);

    if (error) {
      setSaveError(error);
      return;
    }

    setSaveSuccess("Paycheck schedule saved.");
    if (schedule) {
      const mapped = mapPaycheckScheduleRow(schedule);
      setSettings(mapped);
      setAmountInput(mapped.amount > 0 ? String(mapped.amount) : "");
    }
    onSaved?.(schedule);
  };

  const showNoScheduleState = !loading && !initialSchedule;
  const showDisabledState =
    !loading && settings.scheduleType === "disabled" && Boolean(initialSchedule);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your paycheck schedule</CardTitle>
        <CardDescription>
          Configure expected paycheck income for your private forecast. {PAYCHECK_SCHEDULE_PRIVACY_COPY}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your paycheck schedule...
          </div>
        ) : (
          <>
            <Alert>
              <AlertDescription className="space-y-1">
                <p>{PAYCHECK_SETTINGS_AMOUNT_PRIVACY_COPY}</p>
                <p>{PAYCHECK_SETTINGS_FORECAST_ONLY_COPY}</p>
                <p>{PAYCHECK_SETTINGS_HOUSEHOLD_PRIVACY_COPY}</p>
              </AlertDescription>
            </Alert>

            {showNoScheduleState ? (
              <p className="text-sm text-muted-foreground">
                {PAYCHECK_SETTINGS_NO_SCHEDULE_LABEL}
              </p>
            ) : null}

            {showDisabledState ? (
              <Alert>
                <AlertDescription>{PAYCHECK_SETTINGS_DISABLED_LABEL}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="paycheck-schedule-type">Schedule</Label>
              <Select
                value={settings.scheduleType}
                onValueChange={(value) =>
                  handleScheduleTypeChange(value as PaycheckScheduleType)
                }
              >
                <SelectTrigger id="paycheck-schedule-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYCHECK_SCHEDULE_TYPE_LABELS) as PaycheckScheduleType[]).map(
                    (scheduleType) => (
                      <SelectItem key={scheduleType} value={scheduleType}>
                        {PAYCHECK_SCHEDULE_TYPE_LABELS[scheduleType]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {settings.scheduleType === "semi_monthly_15_last_business_day" ? (
              <p className="text-xs text-muted-foreground">
                {PAYCHECK_LAST_BUSINESS_DAY_LIMITATION_LABEL}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="paycheck-amount">Amount per paycheck (CA$)</Label>
              <Input
                id="paycheck-amount"
                type="number"
                min="0"
                step="0.01"
                value={amountInput}
                onChange={(event) => {
                  setAmountInput(event.target.value);
                  setSaveSuccess(null);
                  setSaveError(null);
                }}
                disabled={settings.scheduleType === "disabled"}
              />
              {settings.scheduleType !== "disabled" && amountInput ? (
                <p className="text-xs text-muted-foreground">
                  Forecast will add {formatCurrency(Number(amountInput) || 0)} on each expected pay
                  date in the selected window.
                </p>
              ) : null}
            </div>

            {saveError ? (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}
            {saveSuccess ? (
              <Alert>
                <AlertDescription>{saveSuccess}</AlertDescription>
              </Alert>
            ) : null}

            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save paycheck schedule
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
