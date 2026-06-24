import { describe, expect, it } from "vitest";
import {
  buildAdminMemberLabel,
  buildOwnerAdminOverview,
  OWNER_ADMIN_FALLBACK_MEMBER_LABEL,
  paycheckScheduleLabel,
} from "./owner-admin-overview";
import type {
  CashSnapshot,
  HouseholdMember,
  PaycheckSchedule,
  Person,
} from "./types";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const TELES_PERSON = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NICOLE_PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TELES_USER = "11111111-1111-4111-8111-111111111111";
const NICOLE_USER = "22222222-2222-4222-8222-222222222222";
const REMOVED_USER = "33333333-3333-4333-8333-333333333333";

const PEOPLE: Person[] = [
  {
    id: TELES_PERSON,
    household_id: "hh",
    name: "Teles",
    color: null,
    pay_schedule: "x",
    pay_schedule_description: null,
    paycheck_amount: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: NICOLE_PERSON,
    household_id: "hh",
    name: "Nicole",
    color: null,
    pay_schedule: "x",
    pay_schedule_description: null,
    paycheck_amount: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function makeMember(overrides: Partial<HouseholdMember>): HouseholdMember {
  return {
    id: "m",
    household_id: "hh",
    user_id: "u",
    person_id: null,
    email: null,
    display_name: null,
    role: "member",
    status: "active",
    is_owner: false,
    is_active: true,
    removed_at: null,
    removed_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function snap(overrides: Partial<CashSnapshot>): CashSnapshot {
  return {
    id: "s",
    household_id: "hh",
    user_id: TELES_USER,
    amount: 0,
    snapshot_date: "2026-06-01",
    notes: null,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

const PAYCHECKS: PaycheckSchedule[] = [
  {
    id: "p1",
    household_id: "hh",
    user_id: TELES_USER,
    amount: 2000,
    schedule_type: "semi_monthly_15_30",
    first_pay_day: 15,
    second_pay_day: 30,
    use_last_business_day: false,
    is_active: true,
    effective_from: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("owner admin overview builder", () => {
  it("summarizes only active members with their private data", () => {
    const overview = buildOwnerAdminOverview({
      members: [
        makeMember({
          id: "m-teles",
          user_id: TELES_USER,
          person_id: TELES_PERSON,
          role: "owner",
          is_owner: true,
          email: "teles@example.com",
        }),
        makeMember({
          id: "m-nicole",
          user_id: NICOLE_USER,
          person_id: NICOLE_PERSON,
          email: "nicole@example.com",
        }),
        makeMember({
          id: "m-removed",
          user_id: REMOVED_USER,
          person_id: null,
          status: "removed",
          is_active: false,
        }),
      ],
      people: PEOPLE,
      cashSnapshots: [
        snap({ user_id: TELES_USER, amount: 100, snapshot_date: "2026-06-01" }),
        snap({
          id: "s2",
          user_id: TELES_USER,
          amount: 250,
          snapshot_date: "2026-06-10",
        }),
        snap({ id: "s3", user_id: NICOLE_USER, amount: 75 }),
      ],
      paycheckSchedules: PAYCHECKS,
      savingsParticipants: [
        {
          id: "sp1",
          savings_goal_id: "g1",
          household_id: "hh",
          user_id: NICOLE_USER,
          person_id: NICOLE_PERSON,
          target_contribution_amount: 500,
          contribution_period: "monthly",
          period_start: null,
          period_end: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      savingsContributions: [
        {
          id: "c1",
          savings_goal_id: "g1",
          household_id: "hh",
          user_id: NICOLE_USER,
          person_id: NICOLE_PERSON,
          amount: 120,
          contribution_date: "2026-06-01",
          notes: null,
          created_at: "2026-06-01T00:00:00Z",
        },
      ],
      receiptUploads: [
        { uploaded_by: TELES_USER, status: "uploaded" },
        { uploaded_by: TELES_USER, status: "deleted" },
      ],
      cashPaymentTransactions: [
        { user_id: TELES_USER, amount: 40 },
        { user_id: TELES_USER, amount: 60 },
      ],
    });

    expect(overview.members).toHaveLength(2);

    const teles = overview.members.find((m) => m.label === "Teles");
    const nicole = overview.members.find((m) => m.label === "Nicole");

    expect(teles?.roleLabel).toBe("Owner");
    expect(teles?.currentCash).toBe(250); // latest snapshot wins
    expect(teles?.currentCashAsOf).toBe("2026-06-10");
    expect(teles?.paycheckAmount).toBe(2000);
    expect(teles?.receiptCount).toBe(1); // deleted excluded
    expect(teles?.cashPaymentCount).toBe(2);
    expect(teles?.cashPaymentTotal).toBe(100);

    expect(nicole?.roleLabel).toBe("Member");
    expect(nicole?.currentCash).toBe(75);
    expect(nicole?.paycheckAmount).toBeNull();
    expect(nicole?.savingsGoalCount).toBe(1);
    expect(nicole?.savingsTargetTotal).toBe(500);
    expect(nicole?.savingsContributedTotal).toBe(120);

    expect(overview.householdCashTotal).toBe(325);

    // No raw UUIDs in the rendered-facing label fields.
    const labelText = overview.members
      .map((m) => `${m.label} ${m.roleLabel} ${m.paycheckScheduleLabel}`)
      .join(" ");
    expect(UUID_RE.test(labelText)).toBe(false);
  });

  it("falls back to display name, email, then generic label", () => {
    const lookup = new Map<string, string>();
    expect(
      buildAdminMemberLabel(
        { person_id: null, display_name: "Nickname", email: "x@y.com" },
        lookup
      )
    ).toBe("Nickname");
    expect(
      buildAdminMemberLabel(
        { person_id: null, display_name: null, email: "x@y.com" },
        lookup
      )
    ).toBe("x@y.com");
    expect(
      buildAdminMemberLabel(
        { person_id: null, display_name: null, email: null },
        lookup
      )
    ).toBe(OWNER_ADMIN_FALLBACK_MEMBER_LABEL);
  });

  it("labels paycheck schedules", () => {
    expect(paycheckScheduleLabel("disabled")).toMatch(/no paycheck/i);
    expect(paycheckScheduleLabel("semi_monthly_15_30")).toMatch(/15th & 30th/);
    expect(paycheckScheduleLabel(null)).toMatch(/no paycheck/i);
  });
});
