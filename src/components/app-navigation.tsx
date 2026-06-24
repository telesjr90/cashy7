import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  CreditCard,
  FileText,
  Home,
  Printer,
  Receipt,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_NAV_ITEMS,
  type AppNavItemId,
  isNavItemActive,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<AppNavItemId, LucideIcon> = {
  dashboard: Home,
  bills: FileText,
  expenses: Receipt,
  debt: CreditCard,
  calendar: CalendarDays,
  reports: Printer,
  settings: Settings,
};

interface AppNavigationProps {
  className?: string;
}

export function AppNavigation({ className }: AppNavigationProps) {
  const location = useLocation();

  return (
    <nav
      data-testid="desktop-app-nav"
      aria-label="Main navigation"
      className={cn("items-center gap-1", className)}
    >
      {APP_NAV_ITEMS.map((item) => {
        const Icon = NAV_ICONS[item.id];
        const active = isNavItemActive(location.pathname, item.path);

        return (
          <Link key={item.id} to={item.path} aria-current={active ? "page" : undefined}>
            <Button variant={active ? "secondary" : "ghost"} size="sm">
              <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
              {item.label}
            </Button>
          </Link>
        );
      })}
    </nav>
  );
}

export { NAV_ICONS };
