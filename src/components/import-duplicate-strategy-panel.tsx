import type { ImportDuplicateStrategy, ImportStrategyPlan } from "@/lib/import-duplicates";
import {
  IMPORT_STRATEGY_DESCRIPTIONS,
  IMPORT_STRATEGY_LABELS,
  buildStrategyPreviewGroups,
} from "@/lib/import-duplicates";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const STRATEGY_OPTIONS: ImportDuplicateStrategy[] = [
  "create_new_only",
  "update_matching",
  "replace_selected_month",
];

type ImportDuplicateStrategyPanelProps = {
  strategy: ImportDuplicateStrategy;
  onStrategyChange: (strategy: ImportDuplicateStrategy) => void;
  strategyPlan: ImportStrategyPlan | null;
  scopeLabel: string | null;
};

function PreviewList({
  title,
  items,
  emptyCopy,
}: {
  title: string;
  items: string[];
  emptyCopy: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyCopy}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
          {items.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
          ))}
          {items.length > 8 && (
            <li>…and {items.length - 8} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ImportDuplicateStrategyPanel({
  strategy,
  onStrategyChange,
  strategyPlan,
  scopeLabel,
}: ImportDuplicateStrategyPanelProps) {
  const preview = strategyPlan ? buildStrategyPreviewGroups(strategyPlan) : null;

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="space-y-2">
        <Label htmlFor="import-duplicate-strategy">Duplicate handling</Label>
        <Select
          value={strategy}
          onValueChange={(value) => onStrategyChange(value as ImportDuplicateStrategy)}
        >
          <SelectTrigger id="import-duplicate-strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STRATEGY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {IMPORT_STRATEGY_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {IMPORT_STRATEGY_DESCRIPTIONS[strategy]}
        </p>
      </div>

      {strategy === "replace_selected_month" && (
        <Alert role="note">
          <AlertDescription className="space-y-1 text-sm">
            <p>
              Replace selected month only removes previously imported records in the
              selected scope. Paid, cash-deducted, and protected records are preserved.
            </p>
            {scopeLabel && <p>Selected scope: {scopeLabel}</p>}
            <p>Full rollback tooling arrives in a later task.</p>
          </AlertDescription>
        </Alert>
      )}

      {preview && strategyPlan && (
        <div className="grid gap-4 sm:grid-cols-2">
          <PreviewList
            title={`Create (${strategyPlan.summary.toCreate})`}
            items={preview.creates}
            emptyCopy="No new records to create."
          />
          <PreviewList
            title={`Update (${strategyPlan.summary.toUpdate})`}
            items={preview.updates}
            emptyCopy="No matching records to update."
          />
          <PreviewList
            title={`Skip duplicates (${strategyPlan.summary.toSkipDuplicate})`}
            items={preview.skipDuplicates}
            emptyCopy="No exact duplicates to skip."
          />
          <PreviewList
            title={`Protected (${strategyPlan.summary.toSkipProtected})`}
            items={preview.skipProtected}
            emptyCopy="No protected matches."
          />
          <PreviewList
            title={`Ambiguous (${strategyPlan.summary.toSkipAmbiguous})`}
            items={preview.skipAmbiguous}
            emptyCopy="No ambiguous matches."
          />
          {strategy === "replace_selected_month" && (
            <PreviewList
              title={`Replace/delete (${strategyPlan.summary.toReplaceDelete})`}
              items={preview.replaceDeletes}
              emptyCopy="No previously imported records to replace in scope."
            />
          )}
        </div>
      )}
    </div>
  );
}
