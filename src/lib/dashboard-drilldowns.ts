import type { BillShareKey } from "@/lib/bill-share";
import { getMyBillShareAmount } from "@/lib/bill-share";
import {
  expenseSplitTypeLabel,
  getManualExpenseSignedShareAmount,
} from "@/lib/expenses";
import { getDashboardViewDateRange } from "@/lib/savings";
import type { PeriodView } from "@/lib/periods";
import type {
  BillInstance,
  ManualExpense,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";

type BillPeriodBucket = "1_14" | "15_eom";

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function dateInDashboardViewRange(
  dateValue: string,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): boolean {
  const dateOnly = parseDateOnly(dateValue);
  if (!dateOnly) {
    return false;
  }

  const { start, end } = getDashboardViewDateRange(
    periodView,
    selectedYear,
    selectedMonth
  );
  return dateOnly >= start && dateOnly <= end;
}

function participantMatchesView(
  contributionPeriod: SavingsGoalParticipant["contribution_period"],
  periodView: PeriodView
): boolean {
  if (periodView === "full") {
    return (
      contributionPeriod === "1_14" ||
      contributionPeriod === "15_eom" ||
      contributionPeriod === "monthly"
    );
  }

  return contributionPeriod === periodView;
}

function participantAppliesToViewDateRange(
  participant: SavingsGoalParticipant,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): boolean {
  const { start: viewStart, end: viewEnd } = getDashboardViewDateRange(
    periodView,
    selectedYear,
    selectedMonth
  );

  const periodStart = parseDateOnly(participant.period_start);
  const periodEnd = parseDateOnly(participant.period_end);

  if (!periodStart && !periodEnd) {
    return true;
  }

  if (periodStart && !periodEnd) {
    return viewEnd >= periodStart;
  }

  if (!periodStart && periodEnd) {
    return viewStart <= periodEnd;
  }

  if (periodStart && periodEnd) {
    return viewStart <= periodEnd && viewEnd >= periodStart;
  }

  return true;
}

function participantAppliesToDashboardView(
  participant: SavingsGoalParticipant,
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): boolean {
  return (
    participantMatchesView(participant.contribution_period, periodView) &&
    participantAppliesToViewDateRange(
      participant,
      periodView,
      selectedYear,
      selectedMonth
    )
  );
}

export function filterBillsForDashboardView(
  bills: BillInstance[],
  periodView: PeriodView,
  options?: { unpaidOnly?: boolean }
): BillInstance[] {
  const unpaidOnly = options?.unpaidOnly ?? false;
  const filtered = unpaidOnly ? bills.filter((bill) => !bill.is_paid) : bills;

  const periodBills =
    periodView === "full"
      ? filtered
      : filtered.filter((bill) => bill.period_bucket === periodView);

  return [...periodBills].sort((left, right) => {
    const leftDue = left.due_date ?? "";
    const rightDue = right.due_date ?? "";
    if (leftDue !== rightDue) {
      return leftDue.localeCompare(rightDue);
    }

    return left.name.localeCompare(right.name);
  });
}

export function filterManualExpensesCountedInDashboardView(
  expenses: ManualExpense[],
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number,
  snapshotDate: string | null | undefined,
  deductedManualExpenseIds?: ReadonlySet<string>
): ManualExpense[] {
  const snapshotDateOnly = parseDateOnly(snapshotDate ?? "");
  if (!snapshotDateOnly) {
    return [];
  }

  return expenses
    .filter((expense) => {
      if (
        !dateInDashboardViewRange(
          expense.expense_date,
          periodView,
          selectedYear,
          selectedMonth
        )
      ) {
        return false;
      }

      const expenseDateOnly = parseDateOnly(expense.expense_date);
      if (!expenseDateOnly || expenseDateOnly <= snapshotDateOnly) {
        return false;
      }

      if (expense.id && deductedManualExpenseIds?.has(expense.id)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.expense_date.localeCompare(left.expense_date));
}

export interface DashboardExpenseDrilldownRow {
  id: string;
  date: string;
  description: string;
  category: string | null;
  amount: number;
  myShareAmount: number | null;
  splitLabel: string;
  telesAmount: number;
  nicoleAmount: number;
}

export function buildExpenseDrilldownRows(
  expenses: ManualExpense[],
  shareKey: BillShareKey | null
): DashboardExpenseDrilldownRow[] {
  return expenses.map((expense) => ({
    id: expense.id,
    date: expense.expense_date,
    description: expense.description,
    category: expense.category,
    amount: Number(expense.amount),
    myShareAmount: getManualExpenseSignedShareAmount(expense, shareKey),
    splitLabel: expenseSplitTypeLabel(expense.split_type),
    telesAmount: Number(expense.teles_amount),
    nicoleAmount: Number(expense.nicole_amount),
  }));
}

export interface DashboardBillDrilldownRow {
  id: string;
  name: string;
  dueDate: string | null;
  periodBucket: BillPeriodBucket;
  totalAmount: number;
  telesAmount: number;
  nicoleAmount: number;
  myShareAmount: number | null;
  isPaid: boolean;
  isDebtLinked: boolean;
}

export function buildBillDrilldownRows(
  bills: BillInstance[],
  shareKey: BillShareKey | null,
  debtLinkedBillIds: ReadonlySet<string>
): DashboardBillDrilldownRow[] {
  return bills.map((bill) => ({
    id: bill.id,
    name: bill.name,
    dueDate: bill.due_date,
    periodBucket: bill.period_bucket,
    totalAmount: Number(bill.amount),
    telesAmount: Number(bill.teles_amount),
    nicoleAmount: Number(bill.nicole_amount),
    myShareAmount: getMyBillShareAmount(bill, shareKey),
    isPaid: bill.is_paid,
    isDebtLinked: debtLinkedBillIds.has(bill.id),
  }));
}

export interface DashboardSavingsContributionRow {
  id: string;
  date: string;
  amount: number;
  notes: string | null;
}

export interface DashboardSavingsDrilldownRow {
  savingsGoalId: string;
  goalLabel: string;
  isSharedGoal: boolean;
  contributionPeriodLabel: string;
  targetAmount: number;
  contributedAmount: number;
  remainingObligation: number;
  contributions: DashboardSavingsContributionRow[];
}

function contributionPeriodLabel(
  contributionPeriod: SavingsGoalParticipant["contribution_period"]
): string {
  switch (contributionPeriod) {
    case "1_14":
      return "1st–14th";
    case "15_eom":
      return "15th–end of month";
    case "monthly":
      return "Monthly";
    default:
      return contributionPeriod;
  }
}

export function buildMySavingsDrilldownRows(
  participants: SavingsGoalParticipant[],
  contributions: SavingsContribution[],
  visibleGoals: Pick<SavingsGoal, "id" | "name" | "goal_type">[],
  periodView: PeriodView,
  selectedYear: number,
  selectedMonth: number
): DashboardSavingsDrilldownRow[] {
  const goalById = new Map(visibleGoals.map((goal) => [goal.id, goal]));

  return participants
    .filter((participant) =>
      participantAppliesToDashboardView(
        participant,
        periodView,
        selectedYear,
        selectedMonth
      )
    )
    .map((participant) => {
      const goal = goalById.get(participant.savings_goal_id);
      const goalLabel = goal?.name ?? "Savings goal";
      const isSharedGoal = goal?.goal_type === "shared";

      const contributionsInView = contributions.filter((contribution) => {
        if (contribution.savings_goal_id !== participant.savings_goal_id) {
          return false;
        }

        return dateInDashboardViewRange(
          contribution.contribution_date,
          periodView,
          selectedYear,
          selectedMonth
        );
      });

      const contributedAmount = contributionsInView.reduce(
        (sum, contribution) => sum + Number(contribution.amount),
        0
      );
      const targetAmount = Number(participant.target_contribution_amount);
      const remainingObligation = Math.max(0, targetAmount - contributedAmount);

      return {
        savingsGoalId: participant.savings_goal_id,
        goalLabel,
        isSharedGoal,
        contributionPeriodLabel: contributionPeriodLabel(
          participant.contribution_period
        ),
        targetAmount,
        contributedAmount,
        remainingObligation,
        contributions: contributionsInView
          .map((contribution) => ({
            id: contribution.id,
            date: contribution.contribution_date,
            amount: Number(contribution.amount),
            notes: contribution.notes,
          }))
          .sort((left, right) => right.date.localeCompare(left.date)),
      };
    })
    .sort((left, right) => left.goalLabel.localeCompare(right.goalLabel));
}
