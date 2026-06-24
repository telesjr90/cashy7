import { describe, expect, it } from "vitest";
import {
  APP_NAV_ITEMS,
  PUBLIC_ROUTE_PATHS,
  getActiveNavItem,
  getMobilePrimaryNavItems,
  getMobileSecondaryNavItems,
  isNavItemActive,
  navLabelsContainUuid,
} from "./navigation";

const REQUIRED_LABELS = [
  "Dashboard",
  "Bills",
  "Expenses",
  "Debt",
  "Calendar",
  "Reports",
  "Settings",
];

describe("APP_NAV_ITEMS", () => {
  it("includes all required authenticated routes", () => {
    const labels = APP_NAV_ITEMS.map((item) => item.label);
    for (const label of REQUIRED_LABELS) {
      expect(labels).toContain(label);
    }
  });

  it("does not include public or unauthenticated routes", () => {
    const paths = APP_NAV_ITEMS.map((item) => item.path);
    for (const publicPath of PUBLIC_ROUTE_PATHS) {
      expect(paths).not.toContain(publicPath);
    }
  });

  it("uses stable labels without raw UUIDs", () => {
    const labels = APP_NAV_ITEMS.map((item) => item.label);
    expect(navLabelsContainUuid(labels)).toBe(false);
  });
});

describe("isNavItemActive", () => {
  it("marks dashboard active only on root path", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/bills", "/")).toBe(false);
  });

  it("marks exact and nested paths active for non-root routes", () => {
    expect(isNavItemActive("/bills", "/bills")).toBe(true);
    expect(isNavItemActive("/bills/new", "/bills")).toBe(true);
    expect(isNavItemActive("/expenses", "/bills")).toBe(false);
  });

  it("supports all primary app destinations", () => {
    const cases: Array<[string, string]> = [
      ["/", "/"],
      ["/bills", "/bills"],
      ["/expenses", "/expenses"],
      ["/debt", "/debt"],
      ["/calendar", "/calendar"],
      ["/reports/monthly", "/reports/monthly"],
      ["/settings", "/settings"],
    ];

    for (const [pathname, itemPath] of cases) {
      expect(isNavItemActive(pathname, itemPath)).toBe(true);
    }
  });
});

describe("getActiveNavItem", () => {
  it("returns the matching nav item for known paths", () => {
    expect(getActiveNavItem("/")?.label).toBe("Dashboard");
    expect(getActiveNavItem("/reports/monthly")?.label).toBe("Reports");
    expect(getActiveNavItem("/bills/new")?.label).toBe("Bills");
  });
});

describe("mobile nav groups", () => {
  it("keeps primary and secondary groups stable", () => {
    const primary = getMobilePrimaryNavItems();
    const secondary = getMobileSecondaryNavItems();

    expect(primary.map((item) => item.id)).toEqual([
      "dashboard",
      "bills",
      "expenses",
      "calendar",
    ]);
    expect(secondary.map((item) => item.id)).toEqual(["debt", "reports", "settings"]);
  });

  it("covers every authenticated nav item across primary and secondary", () => {
    const groupedIds = [
      ...getMobilePrimaryNavItems(),
      ...getMobileSecondaryNavItems(),
    ].map((item) => item.id);

    expect(new Set(groupedIds)).toEqual(new Set(APP_NAV_ITEMS.map((item) => item.id)));
  });
});

describe("navLabelsContainUuid", () => {
  it("detects UUID-shaped labels", () => {
    expect(
      navLabelsContainUuid(["Dashboard", "a1b2c3d4-e5f6-4178-9abc-def012345678"])
    ).toBe(true);
    expect(navLabelsContainUuid(REQUIRED_LABELS)).toBe(false);
  });
});
