import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NAV_ICONS } from "@/components/app-navigation";
import {
  getMobilePrimaryNavItems,
  getMobileSecondaryNavItems,
  isNavItemActive,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNavigation() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryItems = getMobilePrimaryNavItems();
  const secondaryItems = getMobileSecondaryNavItems();
  const isMoreActive = secondaryItems.some((item) =>
    isNavItemActive(location.pathname, item.path)
  );

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav
        data-testid="mobile-bottom-nav"
        aria-label="Main navigation"
        className="no-print fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
          {primaryItems.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const active = isNavItemActive(location.pathname, item.path);

            return (
              <Link
                key={item.id}
                to={item.path}
                data-testid={`mobile-nav-${item.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <Button
            type="button"
            variant="ghost"
            data-testid="mobile-nav-more-button"
            aria-expanded={moreOpen}
            aria-controls="mobile-nav-more-sheet"
            aria-label="More navigation options"
            aria-current={isMoreActive ? "page" : undefined}
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex h-auto min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium",
              isMoreActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Menu className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>More</span>
          </Button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          id="mobile-nav-more-sheet"
          side="bottom"
          className="no-print md:hidden"
          data-testid="mobile-nav-more-sheet"
        >
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <nav aria-label="Secondary navigation" className="flex flex-col gap-1 px-2 pb-4">
            {secondaryItems.map((item) => {
              const Icon = NAV_ICONS[item.id];
              const active = isNavItemActive(location.pathname, item.path);

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  data-testid={`mobile-nav-${item.id}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
