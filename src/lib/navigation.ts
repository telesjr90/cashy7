export type AppNavItemId =
  | "dashboard"
  | "bills"
  | "expenses"
  | "debt"
  | "calendar"
  | "reports"
  | "settings";

export interface AppNavItem {
  id: AppNavItemId;
  label: string;
  path: string;
  mobilePrimary: boolean;
}

/** Authenticated app routes shown in navigation. Public routes are excluded. */
export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/", mobilePrimary: true },
  { id: "bills", label: "Bills", path: "/bills", mobilePrimary: true },
  { id: "expenses", label: "Expenses", path: "/expenses", mobilePrimary: true },
  { id: "debt", label: "Debt", path: "/debt", mobilePrimary: false },
  { id: "calendar", label: "Calendar", path: "/calendar", mobilePrimary: true },
  { id: "reports", label: "Reports", path: "/reports/monthly", mobilePrimary: false },
  { id: "settings", label: "Settings", path: "/settings", mobilePrimary: false },
] as const;

export const PUBLIC_ROUTE_PATHS = ["/login", "/signup", "/accept-invite"] as const;

export function isNavItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === "/") {
    return pathname === "/";
  }

  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function getActiveNavItem(pathname: string): AppNavItem | undefined {
  return APP_NAV_ITEMS.find((item) => isNavItemActive(pathname, item.path));
}

export function getMobilePrimaryNavItems(): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => item.mobilePrimary);
}

export function getMobileSecondaryNavItems(): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => !item.mobilePrimary);
}

export function navLabelsContainUuid(labels: string[]): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return labels.some((label) => uuidPattern.test(label.trim()));
}
