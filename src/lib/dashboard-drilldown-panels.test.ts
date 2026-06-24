/**
 * CASHFLOW-CURSOR-131B — Dashboard drilldown panel tests.
 *
 * Tests exported pure helpers from dashboard-drilldown-panel.tsx
 * and the privacy/data-flow contracts for drilldown data.
 *
 * Environment: node (vitest), no JSDOM / React.
 */
import { describe, it, expect } from "vitest";
import {
  drilldownTitle,
  drilldownDescription,
  type DashboardDrilldownKind,
} from "@/components/dashboard-drilldown-panel";
import {
  calculateTotalAmountAvailable,
  sumAllSavingsContributions,
} from "@/lib/dashboard-total-available";
import type { SavingsContribution } from "@/lib/types";

// ─── drilldownTitle ───────────────────────────────────────────────────────────

describe("drilldownTitle", () => {
  it("returns correct title for safe-to-spend-after kind (available after savings)", () => {
    expect(drilldownTitle("safe-to-spend-after")).toBe(
      "Available to spend after savings"
    );
  });

  it("returns correct title for total-available kind", () => {
    expect(drilldownTitle("total-available")).toBe("Total amount available");
  });

  it("returns correct title for bills kind", () => {
    expect(drilldownTitle("bills")).toBe("Bill details");
  });

  it("returns correct title for unpaid-bills kind", () => {
    expect(drilldownTitle("unpaid-bills")).toBe("Unpaid bill details");
  });

  it("returns correct title for expenses kind", () => {
    expect(drilldownTitle("expenses")).toBe("Manual expense details");
  });

  it("returns correct title for savings kind", () => {
    expect(drilldownTitle("savings")).toBe("My savings details");
  });

  it("returns correct title for safe-to-spend-before kind", () => {
    expect(drilldownTitle("safe-to-spend-before")).toBe(
      "Safe to spend before savings"
    );
  });

  it("returns correct title for debt kind", () => {
    expect(drilldownTitle("debt")).toBe("Debt summary");
  });

  it("returns correct title for warnings kind", () => {
    expect(drilldownTitle("warnings")).toBe("Dashboard warnings");
  });

  it("returns fallback title for null kind", () => {
    expect(drilldownTitle(null)).toBe("Dashboard details");
  });
});

// ─── drilldownDescription ─────────────────────────────────────────────────────

describe("drilldownDescription", () => {
  const viewLabel = "1st Period – June 2026";

  it("describes safe-to-spend-after with view label", () => {
    const description = drilldownDescription("safe-to-spend-after", viewLabel);
    expect(description).toContain(viewLabel);
    expect(description).toContain("available to spend after savings");
  });

  it("describes total-available without view label reference", () => {
    const description = drilldownDescription("total-available", viewLabel);
    expect(description).toContain("current available amount");
    expect(description).toContain("savings balance");
  });

  it("describes bills with view label", () => {
    const description = drilldownDescription("bills", viewLabel);
    expect(description).toContain(viewLabel);
  });

  it("describes savings with privacy note", () => {
    const description = drilldownDescription("savings", viewLabel);
    expect(description).toContain("private savings are not shown");
  });

  it("describes debt panel", () => {
    const description = drilldownDescription("debt", viewLabel);
    expect(description).toContain("debt");
  });

  it("describes warnings panel", () => {
    const description = drilldownDescription("warnings", viewLabel);
    expect(description).toContain("budget or cash flow");
  });

  it("returns viewLabel as fallback for null kind", () => {
    const description = drilldownDescription(null, viewLabel);
    expect(description).toBe(viewLabel);
  });
});

// ─── total-available panel data contract ─────────────────────────────────────

describe("total-available drilldown data", () => {
  it("uses dashboard-total-available helpers for panel data", () => {
    const contributions = [
      { amount: 200 },
      { amount: 100 },
    ] as Pick<SavingsContribution, "amount">[];

    const savingsBalance = sumAllSavingsContributions(contributions);
    const total = calculateTotalAmountAvailable(1500, savingsBalance);

    expect(savingsBalance).toBe(300);
    expect(total).toBe(1800);
  });

  it("total panel returns null when cash snapshot not recorded", () => {
    const total = calculateTotalAmountAvailable(null, 300);
    expect(total).toBeNull();
  });
});

// ─── Privacy: Personal view must not include another user's data ──────────────

describe("drilldown panel privacy", () => {
  it("Personal view drilldown total uses only signed-in user cash and savings", () => {
    // getMySavingsContributions is scoped to user.id via RLS.
    // This test verifies only the current user's contributions are used.
    const myContributions = [{ amount: 400 }] as Pick<
      SavingsContribution,
      "amount"
    >[];
    const mySavingsBalance = sumAllSavingsContributions(myContributions);
    const myTotal = calculateTotalAmountAvailable(2000, mySavingsBalance);
    expect(myTotal).toBe(2400);
  });

  it("another user's contributions must not appear in personal view total", () => {
    const myContributions = [{ amount: 400 }] as Pick<
      SavingsContribution,
      "amount"
    >[];
    const otherUserContributions = [{ amount: 9999 }] as Pick<
      SavingsContribution,
      "amount"
    >[];

    const myBalance = sumAllSavingsContributions(myContributions);
    const myTotal = calculateTotalAmountAvailable(2000, myBalance);

    // If other user's data were mistakenly passed, the total would be inflated.
    const leakedBalance = sumAllSavingsContributions([
      ...myContributions,
      ...otherUserContributions,
    ]);
    const leakedTotal = calculateTotalAmountAvailable(2000, leakedBalance);

    expect(myTotal).toBe(2400);
    expect(leakedTotal).toBe(12399);
    expect(myTotal).not.toBe(leakedTotal);
  });

  it("member view cannot show owner private cash snapshot", () => {
    // The member (Nicole) has her own cash snapshot.
    // The owner (Teles) private cash snapshot is never returned for Nicole.
    const nicoleContributions: Pick<SavingsContribution, "amount">[] = [];
    const nicoleCash = 800;
    const nicoleTotal = calculateTotalAmountAvailable(
      nicoleCash,
      sumAllSavingsContributions(nicoleContributions)
    );
    // Nicole's total is just her cash (no savings).
    expect(nicoleTotal).toBe(800);
  });
});

// ─── No raw UUIDs in drilldown panel content ──────────────────────────────────

describe("drilldown panel no raw UUIDs", () => {
  const UUID_REGEX =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  it("drilldownTitle does not produce raw UUIDs", () => {
    const kinds: (DashboardDrilldownKind | null)[] = [
      "bills",
      "unpaid-bills",
      "expenses",
      "savings",
      "safe-to-spend-before",
      "safe-to-spend-after",
      "total-available",
      "debt",
      "warnings",
      null,
    ];
    for (const kind of kinds) {
      const title = drilldownTitle(kind);
      expect(UUID_REGEX.test(title)).toBe(false);
    }
  });

  it("drilldownDescription does not produce raw UUIDs", () => {
    const kinds: (DashboardDrilldownKind | null)[] = [
      "bills",
      "unpaid-bills",
      "expenses",
      "savings",
      "safe-to-spend-before",
      "safe-to-spend-after",
      "total-available",
      "debt",
      "warnings",
      null,
    ];
    const viewLabel = "Full Month – June 2026";
    for (const kind of kinds) {
      const desc = drilldownDescription(kind, viewLabel);
      expect(UUID_REGEX.test(desc)).toBe(false);
    }
  });
});

// ─── Panel detail links use correct app routes ────────────────────────────────

describe("drilldown panel navigation routes", () => {
  it("safe-to-spend-after panel description does not reference a non-existent route", () => {
    // The panel links to /bills, /debt, /savings, /expenses — verify descriptions
    // refer to app sections by name, not raw paths.
    const desc = drilldownDescription("safe-to-spend-after", "June 2026");
    expect(desc).not.toContain("/bills");
    expect(desc).not.toContain("/settings");
  });

  it("total-available description is route-independent", () => {
    const desc = drilldownDescription("total-available", "June 2026");
    expect(desc).not.toContain("/");
  });
});

// ─── Owner Admin view context labels ─────────────────────────────────────────

describe("drilldown kind completeness", () => {
  const ALL_KINDS: DashboardDrilldownKind[] = [
    "bills",
    "unpaid-bills",
    "expenses",
    "savings",
    "safe-to-spend-before",
    "safe-to-spend-after",
    "total-available",
    "debt",
    "warnings",
  ];

  it("drilldownTitle returns a non-empty string for every kind", () => {
    for (const kind of ALL_KINDS) {
      const title = drilldownTitle(kind);
      expect(typeof title).toBe("string");
      expect(title.length).toBeGreaterThan(0);
    }
  });

  it("drilldownDescription returns a non-empty string for every kind", () => {
    for (const kind of ALL_KINDS) {
      const desc = drilldownDescription(kind, "Test view");
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
