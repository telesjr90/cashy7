import { useCallback, useEffect, useState } from "react";
import {
  loadOwnerAdminOverview,
  OWNER_ADMIN_NO_DATA_COPY,
  OWNER_ADMIN_OVERVIEW_DESCRIPTION,
  OWNER_ADMIN_OVERVIEW_TITLE,
  type OwnerAdminOverview,
} from "@/lib/owner-admin-overview";
import {
  OWNER_ADMIN_BANNER_COPY,
  OWNER_ADMIN_READ_ONLY_COPY,
} from "@/lib/owner-view-mode";
import { formatCurrency } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader as Loader2, ShieldCheck } from "lucide-react";
import { format, parseISO } from "date-fns";

interface HouseholdAdminOverviewCardProps {
  householdId: string;
  active: boolean;
}

function formatAsOf(isoDate: string | null): string {
  if (!isoDate) {
    return "";
  }
  try {
    return format(parseISO(isoDate), "MMMM d, yyyy");
  } catch {
    return "";
  }
}

export function HouseholdAdminOverviewCard({
  householdId,
  active,
}: HouseholdAdminOverviewCardProps) {
  const [overview, setOverview] = useState<OwnerAdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { overview: data, error: loadError } = await loadOwnerAdminOverview(
      householdId
    );
    if (loadError) {
      setError(loadError);
      setOverview(null);
    } else {
      setOverview(data);
    }
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    if (active) {
      void load();
    }
  }, [active, load]);

  if (!active) {
    return null;
  }

  return (
    <Card data-testid="household-admin-overview">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          <CardTitle>{OWNER_ADMIN_OVERVIEW_TITLE}</CardTitle>
        </div>
        <CardDescription>{OWNER_ADMIN_OVERVIEW_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert data-testid="owner-admin-banner">
          <AlertTitle>{OWNER_ADMIN_BANNER_COPY}</AlertTitle>
          <AlertDescription>{OWNER_ADMIN_READ_ONLY_COPY}</AlertDescription>
        </Alert>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading household admin overview...
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !overview || overview.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active household members to display.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">Household total cash: </span>
              {formatCurrency(overview.householdCashTotal)}
            </div>

            {overview.members.map((member) => (
              <div
                key={member.memberKey}
                className="space-y-2 rounded-lg border p-4"
                data-testid="admin-member-section"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-medium">{member.label}</h3>
                  <Badge variant="outline">{member.roleLabel}</Badge>
                </div>
                {member.email && (
                  <p className="break-all text-xs text-muted-foreground">
                    {member.email}
                  </p>
                )}

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Current cash</dt>
                    <dd className="font-medium">
                      {member.currentCash === null
                        ? OWNER_ADMIN_NO_DATA_COPY
                        : `${formatCurrency(member.currentCash)}${
                            member.currentCashAsOf
                              ? ` (as of ${formatAsOf(member.currentCashAsOf)})`
                              : ""
                          }`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Paycheck</dt>
                    <dd className="font-medium">
                      {member.paycheckAmount === null
                        ? member.paycheckScheduleLabel
                        : `${formatCurrency(member.paycheckAmount)} · ${
                            member.paycheckScheduleLabel
                          }`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Savings targets</dt>
                    <dd className="font-medium">
                      {member.savingsGoalCount === 0
                        ? OWNER_ADMIN_NO_DATA_COPY
                        : `${member.savingsGoalCount} goal${
                            member.savingsGoalCount === 1 ? "" : "s"
                          } · target ${formatCurrency(
                            member.savingsTargetTotal
                          )} · saved ${formatCurrency(
                            member.savingsContributedTotal
                          )}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Receipts</dt>
                    <dd className="font-medium">
                      {member.receiptCount} on file
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cash deductions</dt>
                    <dd className="font-medium">
                      {member.cashPaymentCount === 0
                        ? OWNER_ADMIN_NO_DATA_COPY
                        : `${member.cashPaymentCount} payment${
                            member.cashPaymentCount === 1 ? "" : "s"
                          } · ${formatCurrency(member.cashPaymentTotal)}`}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
