import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DashboardSummaryCardProps {
  title: string;
  /** Pre-rendered amount node: a formatted value, skeleton, or placeholder. */
  amountNode: React.ReactNode;
  /** High-priority cards receive a subtle accent border. */
  priority?: "high" | "normal";
  /** Whether the details section starts open. Defaults to false. */
  defaultOpen?: boolean;
  "data-testid"?: string;
  /** data-testid for the expand/collapse toggle button. */
  toggleTestId?: string;
  /** data-testid for the details content area. */
  detailsTestId?: string;
  /** Details content shown when the card is expanded. */
  children?: React.ReactNode;
  className?: string;
  /** Callback to open the full drilldown panel for this card. */
  onOpenPanel?: () => void;
  /** data-testid for the open-panel button. */
  openPanelTestId?: string;
}

/**
 * Reusable collapsible dashboard card shell.
 *
 * Collapsed: title + primary amount + Details toggle.
 * Expanded: title + amount + all children detail content.
 */
export function DashboardSummaryCard({
  title,
  amountNode,
  priority = "normal",
  defaultOpen = false,
  "data-testid": dataTestId,
  toggleTestId,
  detailsTestId,
  children,
  className,
  onOpenPanel,
  openPanelTestId,
}: DashboardSummaryCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        data-testid={dataTestId}
        className={cn(
          "mb-6 gap-0 overflow-hidden py-0",
          priority === "high" && "border-primary/50 shadow-sm",
          className
        )}
      >
        {/* Always-visible collapsed header */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-6 py-4",
            priority === "high" && "bg-muted/20"
          )}
        >
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-medium leading-tight",
                priority === "high"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {title}
            </p>
            <div
              className="mt-1"
              data-testid={dataTestId ? `${dataTestId}-amount` : undefined}
            >
              {amountNode}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onOpenPanel && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                onClick={onOpenPanel}
                data-testid={openPanelTestId}
                aria-label={`Open ${title} details panel`}
              >
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Open panel</span>
              </Button>
            )}
            {children !== undefined && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  aria-expanded={open}
                  aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
                  data-testid={toggleTestId}
                >
                  Details
                  {open ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        {/* Expandable details area */}
        {children !== undefined && (
          <CollapsibleContent>
            <div
              className="border-t px-6 pb-5 pt-4"
              data-testid={detailsTestId}
            >
              {children}
            </div>
          </CollapsibleContent>
        )}
      </Card>
    </Collapsible>
  );
}
