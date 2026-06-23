import { describe, expect, it } from "vitest";
import type { SavingsContribution } from "@/lib/types";
import {
  filterSavingsContributionsByCashflowStart,
  getSavingsContributionPreStartLabel,
  getSavingsPageVisibleContributions,
  isSavingsContributionPreStart,
  SAVINGS_CONTRIBUTIONS_PRE_START_HIDDEN_NOTICE,
  SAVINGS_PRE_START_LABEL,
  savingsCashflowStartLabelContainsRawUuid,
  SHOW_PRE_START_SAVINGS_CONTRIBUTIONS_LABEL,
  splitSavingsContributionsByCashflowStart,
  sumActiveSavingsContributionAmounts,
  sumPreStartSavingsContributionAmounts,
} from "./savings-cashflow-start";

function makeContribution(
  overrides: Partial<SavingsContribution> &
    Pick<SavingsContribution, "id" | "contribution_date">
): SavingsContribution {
  return {
    household_id: "household-1",
    savings_goal_id: "goal-1",
    user_id: "user-a",
    person_id: null,
    amount: 50,
    notes: null,
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const START_DATE = "2026-06-15";

const beforeStart = makeContribution({
  id: "before",
  contribution_date: "2026-06-14",
  amount: 25,
});
const onStart = makeContribution({
  id: "on-start",
  contribution_date: "2026-06-15",
  amount: 40,
});
const afterStart = makeContribution({
  id: "after",
  contribution_date: "2026-06-20",
  amount: 75,
});
const unparseableDate = makeContribution({
  id: "bad-date",
  contribution_date: "not-a-date",
  amount: 10,
});

const allContributions = [beforeStart, onStart, afterStart, unparseableDate];

describe("isSavingsContributionPreStart", () => {
  it("classifies savings contributions before the start date as pre-start", () => {
    expect(isSavingsContributionPreStart(beforeStart, START_DATE)).toBe(true);
  });

  it("does not classify savings contributions on the start date as pre-start", () => {
    expect(isSavingsContributionPreStart(onStart, START_DATE)).toBe(false);
  });

  it("does not classify savings contributions after the start date as pre-start", () => {
    expect(isSavingsContributionPreStart(afterStart, START_DATE)).toBe(false);
  });

  it("keeps all savings contributions visible when no start date is configured", () => {
    expect(isSavingsContributionPreStart(beforeStart, null)).toBe(false);
    expect(isSavingsContributionPreStart(beforeStart, undefined)).toBe(false);
  });

  it("treats unparseable contribution dates as active (not pre-start)", () => {
    expect(isSavingsContributionPreStart(unparseableDate, START_DATE)).toBe(false);
  });
});

describe("getSavingsContributionPreStartLabel", () => {
  it("returns a readable pre-start label", () => {
    expect(getSavingsContributionPreStartLabel(beforeStart, START_DATE)).toBe(
      SAVINGS_PRE_START_LABEL
    );
    expect(getSavingsContributionPreStartLabel(onStart, START_DATE)).toBeNull();
  });

  it("does not include raw UUIDs in user-facing labels", () => {
    expect(
      savingsCashflowStartLabelContainsRawUuid(SAVINGS_PRE_START_LABEL)
    ).toBe(false);
    expect(
      savingsCashflowStartLabelContainsRawUuid(
        SAVINGS_CONTRIBUTIONS_PRE_START_HIDDEN_NOTICE
      )
    ).toBe(false);
    expect(
      savingsCashflowStartLabelContainsRawUuid(
        SHOW_PRE_START_SAVINGS_CONTRIBUTIONS_LABEL
      )
    ).toBe(false);
  });
});

describe("splitSavingsContributionsByCashflowStart", () => {
  it("splits active and pre-start contributions when a start date is set", () => {
    const { activeContributions, preStartContributions } =
      splitSavingsContributionsByCashflowStart(allContributions, START_DATE);

    expect(activeContributions.map((row) => row.id)).toEqual([
      "on-start",
      "after",
      "bad-date",
    ]);
    expect(preStartContributions.map((row) => row.id)).toEqual(["before"]);
  });

  it("keeps all contributions active when no start date is configured", () => {
    const { activeContributions, preStartContributions } =
      splitSavingsContributionsByCashflowStart(allContributions, null);

    expect(activeContributions).toHaveLength(4);
    expect(preStartContributions).toHaveLength(0);
  });
});

describe("getSavingsPageVisibleContributions", () => {
  it("excludes pre-start contributions from the default visible list", () => {
    const visible = getSavingsPageVisibleContributions(
      allContributions,
      START_DATE,
      false
    );

    expect(visible.map((row) => row.id)).toEqual(["on-start", "after", "bad-date"]);
  });

  it("includes pre-start contributions when show-pre-start mode is on", () => {
    const visible = getSavingsPageVisibleContributions(
      allContributions,
      START_DATE,
      true
    );

    expect(visible).toHaveLength(4);
  });

  it("keeps current behavior when no start date is configured", () => {
    expect(
      getSavingsPageVisibleContributions(allContributions, null, false)
    ).toHaveLength(4);
  });
});

describe("filterSavingsContributionsByCashflowStart", () => {
  it("filters to active planning contributions only", () => {
    const active = filterSavingsContributionsByCashflowStart(
      allContributions,
      START_DATE
    );

    expect(active.map((row) => row.id)).toEqual(["on-start", "after", "bad-date"]);
  });
});

describe("active and pre-start contribution totals", () => {
  it("calculates active contribution total excluding pre-start rows by default", () => {
    expect(
      sumActiveSavingsContributionAmounts(allContributions, START_DATE)
    ).toBe(125);
  });

  it("calculates optional pre-start historical total from own visible rows", () => {
    expect(
      sumPreStartSavingsContributionAmounts(allContributions, START_DATE)
    ).toBe(25);
  });

  it("uses all contributions for active totals when no start date is configured", () => {
    expect(sumActiveSavingsContributionAmounts(allContributions, null)).toBe(150);
    expect(sumPreStartSavingsContributionAmounts(allContributions, null)).toBe(0);
  });
});
