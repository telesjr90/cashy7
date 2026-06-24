import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardWarning, DashboardWarningSeverity } from "@/lib/dashboard-warnings";
import type { DashboardDrilldownKind } from "@/components/dashboard-drilldown-panel";

type DashboardWarningsProps = {
  warnings: DashboardWarning[];
  onOpenDrilldown?: (kind: DashboardDrilldownKind) => void;
};

const SEVERITY_META: Record<
  DashboardWarningSeverity,
  {
    label: string;
    badgeVariant: "destructive" | "secondary" | "outline";
    icon: typeof AlertTriangle;
    rowClassName: string;
  }
> = {
  critical: {
    label: "Critical",
    badgeVariant: "destructive",
    icon: ShieldAlert,
    rowClassName: "border-destructive/40 bg-destructive/5",
  },
  warning: {
    label: "Warning",
    badgeVariant: "secondary",
    icon: AlertTriangle,
    rowClassName:
      "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100",
  },
  info: {
    label: "Info",
    badgeVariant: "outline",
    icon: Info,
    rowClassName: "border-border bg-muted/30",
  },
};

function WarningAction({
  warning,
  onOpenDrilldown,
}: {
  warning: DashboardWarning;
  onOpenDrilldown?: (kind: DashboardDrilldownKind) => void;
}) {
  if (warning.drilldownKind && onOpenDrilldown) {
    return (
      <Button
        variant="link"
        className="h-auto min-h-10 p-0 text-sm"
        onClick={() => onOpenDrilldown(warning.drilldownKind!)}
      >
        {warning.actionLabel ?? "Review details"}
      </Button>
    );
  }

  if (warning.actionPath && warning.actionLabel) {
    return (
      <Link
        to={warning.actionPath}
        className="inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4"
      >
        {warning.actionLabel}
      </Link>
    );
  }

  return null;
}

function WarningRow({
  warning,
  onOpenDrilldown,
}: {
  warning: DashboardWarning;
  onOpenDrilldown?: (kind: DashboardDrilldownKind) => void;
}) {
  const meta = SEVERITY_META[warning.severity];
  const Icon = meta.icon;

  return (
    <div className={`rounded-lg border p-4 ${meta.rowClassName}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{warning.title}</p>
            <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
            <Badge variant="outline">{warning.affectedArea}</Badge>
          </div>
          <p className="text-sm leading-relaxed">{warning.description}</p>
          <WarningAction warning={warning} onOpenDrilldown={onOpenDrilldown} />
        </div>
      </div>
    </div>
  );
}

export function DashboardWarnings({
  warnings,
  onOpenDrilldown,
}: DashboardWarningsProps) {
  if (warnings.length === 0) {
    return null;
  }

  const criticalCount = warnings.filter((warning) => warning.severity === "critical").length;
  const warningCount = warnings.filter((warning) => warning.severity === "warning").length;

  return (
    <Card className="mb-6" data-testid="dashboard-warnings">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Dashboard warnings
        </CardTitle>
        <CardDescription>
          {criticalCount > 0
            ? `${criticalCount} critical issue${criticalCount === 1 ? "" : "s"} need attention.`
            : warningCount > 0
              ? `${warningCount} setup or data warning${warningCount === 1 ? "" : "s"} may affect totals.`
              : "Informational reminders about unpaid obligations in this view."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {warnings.map((warning) => (
          <WarningRow
            key={warning.id}
            warning={warning}
            onOpenDrilldown={onOpenDrilldown}
          />
        ))}
      </CardContent>
    </Card>
  );
}
