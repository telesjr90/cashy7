import { Button } from "@/components/ui/button";
import {
  OWNER_VIEW_ADMIN_LABEL,
  OWNER_VIEW_PERSONAL_LABEL,
  OWNER_VIEW_TOGGLE_LABEL,
  type OwnerViewMode,
} from "@/lib/owner-view-mode";
import { ShieldCheck, User } from "lucide-react";

interface OwnerViewToggleProps {
  canUseAdmin: boolean;
  mode: OwnerViewMode;
  onModeChange: (mode: OwnerViewMode) => void;
}

/**
 * Owner-only Personal/Admin toggle. Renders nothing for non-owners so the
 * control never appears for members, removed, or invited users.
 */
export function OwnerViewToggle({
  canUseAdmin,
  mode,
  onModeChange,
}: OwnerViewToggleProps) {
  if (!canUseAdmin) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="owner-view-toggle"
    >
      <span className="text-sm font-medium text-muted-foreground">
        {OWNER_VIEW_TOGGLE_LABEL}
      </span>
      <div className="inline-flex rounded-md border p-0.5">
        <Button
          type="button"
          size="sm"
          variant={mode === "personal" ? "default" : "ghost"}
          aria-pressed={mode === "personal"}
          data-testid="owner-view-personal"
          onClick={() => onModeChange("personal")}
        >
          <User className="mr-2 h-4 w-4" aria-hidden="true" />
          {OWNER_VIEW_PERSONAL_LABEL}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "admin" ? "default" : "ghost"}
          aria-pressed={mode === "admin"}
          data-testid="owner-view-admin"
          onClick={() => onModeChange("admin")}
        >
          <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
          {OWNER_VIEW_ADMIN_LABEL}
        </Button>
      </div>
    </div>
  );
}
