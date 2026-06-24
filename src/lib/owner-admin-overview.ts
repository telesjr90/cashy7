import { supabase } from "@/lib/supabase";
import { isActiveHouseholdMember } from "@/lib/household-member-management";
import type {
  CashPaymentTransaction,
  CashSnapshot,
  HouseholdMember,
  PaycheckSchedule,
  Person,
  ReceiptUpload,
  SavingsContribution,
  SavingsGoalParticipant,
} from "@/lib/types";

export const OWNER_ADMIN_OVERVIEW_TITLE = "Household admin overview";

export const OWNER_ADMIN_OVERVIEW_DESCRIPTION =
  "Read-only summary of every active household member's private financial data. Only the household owner can see this.";

export const OWNER_ADMIN_NO_DATA_COPY = "No data recorded yet.";

export const OWNER_ADMIN_FALLBACK_MEMBER_LABEL = "Household member";

const PAYCHECK_SCHEDULE_LABELS: Record<
  PaycheckSchedule["schedule_type"],
  string
> = {
  disabled: "No paycheck schedule",
  semi_monthly_15_30: "Semi-monthly (15th & 30th)",
  semi_monthly_15_last_business_day:
    "Semi-monthly (15th & last business day)",
};

export interface AdminMemberFinancialSummary {
  memberKey: string;
  label: string;
  roleLabel: string;
  email: string | null;
  currentCash: number | null;
  currentCashAsOf: string | null;
  paycheckAmount: number | null;
  paycheckScheduleLabel: string;
  savingsGoalCount: number;
  savingsTargetTotal: number;
  savingsContributedTotal: number;
  receiptCount: number;
  cashPaymentCount: number;
  cashPaymentTotal: number;
}

export interface OwnerAdminOverview {
  members: AdminMemberFinancialSummary[];
  householdCashTotal: number;
}

export function buildAdminMemberLabel(
  member: Pick<HouseholdMember, "person_id" | "display_name" | "email">,
  peopleById: ReadonlyMap<string, string>
): string {
  if (member.person_id) {
    const personName = peopleById.get(member.person_id);
    if (personName && personName.trim().length > 0) {
      return personName;
    }
  }
  const displayName = member.display_name?.trim();
  if (displayName) {
    return displayName;
  }
  const email = member.email?.trim();
  if (email) {
    return email;
  }
  return OWNER_ADMIN_FALLBACK_MEMBER_LABEL;
}

export function paycheckScheduleLabel(
  scheduleType: PaycheckSchedule["schedule_type"] | null | undefined
): string {
  if (!scheduleType) {
    return PAYCHECK_SCHEDULE_LABELS.disabled;
  }
  return PAYCHECK_SCHEDULE_LABELS[scheduleType] ?? PAYCHECK_SCHEDULE_LABELS.disabled;
}

function latestSnapshotByUser(
  snapshots: ReadonlyArray<CashSnapshot>
): Map<string, CashSnapshot> {
  const latest = new Map<string, CashSnapshot>();
  for (const snapshot of snapshots) {
    const existing = latest.get(snapshot.user_id);
    if (!existing) {
      latest.set(snapshot.user_id, snapshot);
      continue;
    }
    const existingKey = `${existing.snapshot_date}T${existing.created_at}`;
    const candidateKey = `${snapshot.snapshot_date}T${snapshot.created_at}`;
    if (candidateKey > existingKey) {
      latest.set(snapshot.user_id, snapshot);
    }
  }
  return latest;
}

export interface OwnerAdminOverviewInput {
  members: ReadonlyArray<HouseholdMember>;
  people: ReadonlyArray<Person>;
  cashSnapshots: ReadonlyArray<CashSnapshot>;
  paycheckSchedules: ReadonlyArray<PaycheckSchedule>;
  savingsParticipants: ReadonlyArray<SavingsGoalParticipant>;
  savingsContributions: ReadonlyArray<SavingsContribution>;
  receiptUploads: ReadonlyArray<Pick<ReceiptUpload, "uploaded_by" | "status">>;
  cashPaymentTransactions: ReadonlyArray<
    Pick<CashPaymentTransaction, "user_id" | "amount">
  >;
}

export function buildOwnerAdminOverview(
  input: OwnerAdminOverviewInput
): OwnerAdminOverview {
  const peopleById = new Map<string, string>();
  for (const person of input.people) {
    peopleById.set(person.id, person.name);
  }

  const activeMembers = input.members.filter(isActiveHouseholdMember);
  const latestCash = latestSnapshotByUser(input.cashSnapshots);

  const members: AdminMemberFinancialSummary[] = activeMembers.map((member) => {
    const userId = member.user_id;

    const latest = latestCash.get(userId) ?? null;

    const schedule = input.paycheckSchedules.find(
      (row) => row.user_id === userId
    );

    const memberParticipants = input.savingsParticipants.filter(
      (row) => row.user_id === userId
    );
    const savingsTargetTotal = memberParticipants.reduce(
      (sum, row) => sum + Number(row.target_contribution_amount ?? 0),
      0
    );

    const savingsContributedTotal = input.savingsContributions
      .filter((row) => row.user_id === userId)
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

    const receiptCount = input.receiptUploads.filter(
      (row) => row.uploaded_by === userId && row.status !== "deleted"
    ).length;

    const memberPayments = input.cashPaymentTransactions.filter(
      (row) => row.user_id === userId
    );
    const cashPaymentTotal = memberPayments.reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0
    );

    return {
      memberKey: member.id,
      label: buildAdminMemberLabel(member, peopleById),
      roleLabel:
        member.role === "owner" || member.is_owner ? "Owner" : "Member",
      email: member.email ?? null,
      currentCash: latest ? Number(latest.amount) : null,
      currentCashAsOf: latest ? latest.snapshot_date : null,
      paycheckAmount:
        schedule && schedule.schedule_type !== "disabled"
          ? Number(schedule.amount)
          : null,
      paycheckScheduleLabel: paycheckScheduleLabel(schedule?.schedule_type),
      savingsGoalCount: memberParticipants.length,
      savingsTargetTotal,
      savingsContributedTotal,
      receiptCount,
      cashPaymentCount: memberPayments.length,
      cashPaymentTotal,
    };
  });

  const householdCashTotal = members.reduce(
    (sum, member) => sum + (member.currentCash ?? 0),
    0
  );

  return { members, householdCashTotal };
}

export async function loadOwnerAdminOverview(
  householdId: string
): Promise<{ overview: OwnerAdminOverview | null; error: string | null }> {
  const [
    membersResult,
    peopleResult,
    cashResult,
    paycheckResult,
    participantsResult,
    contributionsResult,
    receiptsResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from("household_members")
      .select(
        "id, household_id, user_id, person_id, email, display_name, role, status, is_owner, is_active, removed_at, removed_by, created_at"
      )
      .eq("household_id", householdId),
    supabase.from("people").select("*").eq("household_id", householdId),
    supabase
      .from("cash_snapshots")
      .select("id, household_id, user_id, amount, snapshot_date, notes, created_at")
      .eq("household_id", householdId),
    supabase
      .from("paycheck_schedules")
      .select("*")
      .eq("household_id", householdId),
    supabase
      .from("savings_goal_participants")
      .select("*")
      .eq("household_id", householdId),
    supabase
      .from("savings_contributions")
      .select("*")
      .eq("household_id", householdId),
    supabase
      .from("receipt_uploads")
      .select("uploaded_by, status")
      .eq("household_id", householdId),
    supabase
      .from("cash_payment_transactions")
      .select("user_id, amount")
      .eq("household_id", householdId),
  ]);

  const error =
    membersResult.error?.message ??
    peopleResult.error?.message ??
    cashResult.error?.message ??
    paycheckResult.error?.message ??
    participantsResult.error?.message ??
    contributionsResult.error?.message ??
    receiptsResult.error?.message ??
    paymentsResult.error?.message ??
    null;

  if (error) {
    return { overview: null, error };
  }

  const overview = buildOwnerAdminOverview({
    members: (membersResult.data as HouseholdMember[]) ?? [],
    people: (peopleResult.data as Person[]) ?? [],
    cashSnapshots: (cashResult.data as CashSnapshot[]) ?? [],
    paycheckSchedules: (paycheckResult.data as PaycheckSchedule[]) ?? [],
    savingsParticipants:
      (participantsResult.data as SavingsGoalParticipant[]) ?? [],
    savingsContributions:
      (contributionsResult.data as SavingsContribution[]) ?? [],
    receiptUploads:
      (receiptsResult.data as Array<
        Pick<ReceiptUpload, "uploaded_by" | "status">
      >) ?? [],
    cashPaymentTransactions:
      (paymentsResult.data as Array<
        Pick<CashPaymentTransaction, "user_id" | "amount">
      >) ?? [],
  });

  return { overview, error: null };
}
