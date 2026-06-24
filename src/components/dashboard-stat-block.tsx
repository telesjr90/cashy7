import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardStatBlockProps {
  title: string;
  /** Pre-rendered amount node: a formatted value, skeleton, or placeholder. */
  amountNode: React.ReactNode;
  /** High-priority blocks receive a subtle accent border. */
  priority?: "high" | "normal";
  /** Callback to open the full drilldown panel. When omitted, the block is static. */
  onOpenPanel?: () => void;
  "data-testid"?: string;
  /** data-testid for the open-panel button (only rendered when interactive). */
  openPanelTestId?: string;
  className?: string;
}

/**
 * Compact dashboard stat block: title + primary amount, designed to sit in a
 * responsive grid of quick-summary blocks. When `onOpenPanel` is provided the
 * whole block becomes a button that opens the matching drilldown panel.
 */
export function DashboardStatBlock({
  title,
  amountNode,
  priority = "normal",
  onOpenPanel,
  "data-testid": dataTestId,
  openPanelTestId,
  className,
}: DashboardStatBlockProps) {
  const interactive = typeof onOpenPanel === "function";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-xs font-medium leading-tight sm:text-sm",
            priority === "high" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {title}
        </p>
        {interactive && (
          <ArrowRight
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <div
        className="mt-2"
        data-testid={dataTestId ? `${dataTestId}-amount` : undefined}
      >
        {amountNode}
      </div>
    </>
  );

  return (
    <Card
      data-testid={dataTestId}
      className={cn(
        "min-w-0 gap-0 overflow-hidden p-0 py-0",
        priority === "high" && "border-primary/50 shadow-sm",
        className
      )}
    >
      {interactive ? (
        <button
          type="button"
          onClick={onOpenPanel}
          data-testid={openPanelTestId}
          aria-label={`Open ${title} details panel`}
          className={cn(
            "flex h-full w-full flex-col items-stretch px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            priority === "high" && "bg-muted/20 hover:bg-muted/40"
          )}
        >
          {body}
        </button>
      ) : (
        <div
          className={cn(
            "flex h-full flex-col px-4 py-3",
            priority === "high" && "bg-muted/20"
          )}
        >
          {body}
        </div>
      )}
    </Card>
  );
}
