import {
  calculateRemainingSavingsObligation,
  sumMySavingsContributionsForView,
  sumMySavingsTargetForView,
} from "@/lib/savings";
import {
  buildContributionListCashDeductionLabel,
  getSavingsContributionCashDeductionSourceIds,
} from "@/lib/savings-cash-actions";
import {
  SHARED_GOAL_METADATA_ONLY_COPY,
  SHARED_GOAL_PRIVACY_COPY,
} from "@/lib/savings-edit";
import {
  SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY,
  SAVINGS_DETAIL_SHARED_PRIVACY_COPY,
} from "@/lib/savings-detail";
import type { PeriodView } from "@/lib/periods";
import type {
  CashPaymentTransaction,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalParticipant,
} from "@/lib/types";
import { format, parseISO } from "date-fns";
import {
  buildMySavingsDrilldownRows,
  type DashboardSavingsContributionRow,
  type DashboardSavingsDrilldownRow,
} from "@/lib/dashboard-drilldowns";
export type DashboardSavingsDrilldownRowKind = "target" | "contribution";

export type DashboardSavingsScopeFilter = "all" | "private" | "shared";

export type DashboardSavingsRowKindFilter =
  | "all"
  | "target"
  | "contribution"
  | "cash-deducted";

export interface DashboardSavingsDrilldownFilters {
  searchText: string;
  scope: DashboardSavingsScopeFilter;
  rowKind: DashboardSavingsRowKindFilter;
}

export const DEFAULT_DASHBOARD_SAVINGS_DRILLDOWN_FILTERS: DashboardSavingsDrilldownFilters =
  {
    searchText: "",
    scope: "all",
    rowKind: "all",
  };

export interface DashboardSavingsContributionDrilldownRow
  extends DashboardSavingsContributionRow {
  kind: "contribution";
  goalLabel: string;
  isSharedGoal: boolean;
  scopeLabel: string;
  sourceLabel: string;
  cashDeductionLabel: string | null;
  isCashDeducted: boolean;
}

export interface DashboardSavingsTargetDrilldownRow {
  id: string;
  kind: "target";
  savingsGoalId: string;
  goalLabel: string;
  isSharedGoal: boolean;
  scopeLabel: string;
  contributionPeriodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  periodStartLabel: string | null;
  periodEndLabel: string | null;
  targetAmount: number;
  contributedAmount: number;
  remainingObligation: number;
  sourceLabel: string;
  sharedPrivacyCopy: string | null;
  otherUserPrivacyCopy: string | null;
  sharedMetadataCopy: string | null;
  contributions: DashboardSavingsContributionDrilldownRow[];
}

export interface DashboardSavingsDrilldownSummary {
  savingsTargetTotal: number;
  contributionsTotal: number;
  remainingObligationTotal: number;
}

export interface DashboardSavingsDrilldownReconciliation {
  cardTotal: number;
  displayedRowTotal: number;
  totalsMatch: boolean;
  cardTotalLabel: string;
  rowTotalLabel: string;
  matchLabel: string | null;
  mismatchExplanation: string | null;
}

export interface BuildMySavingsDrilldownInput {
  participants: SavingsGoalParticipant[];
  contributions: SavingsContribution[];
  visibleGoals: Pick<SavingsGoal, "id" | "name" | "goal_type">[];
  periodView: PeriodView;
  selectedYear: number;
  selectedMonth: number;
  signedInUserId: string;
  cardRemainingObligationTotal: number;
  paymentTransactions?: ReadonlyArray<
    Pick<CashPaymentTransaction, "source_type" | "source_id">
  >;
  cashDeductionContextAvailable?: boolean;
}

export interface MySavingsDrilldownResult {
  targetRows: DashboardSavingsTargetDrilldownRow[];
  summary: DashboardSavingsDrilldownSummary;
  reconciliation: DashboardSavingsDrilldownReconciliation;
  hasSharedGoals: boolean;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const OWN_TARGET_SOURCE_LABEL = "Your period target";
const OWN_CONTRIBUTION_SOURCE_LABEL = "Your contribution";

export const SAVINGS_DRILLDOWN_EMPTY_MESSAGE =
  "No savings targets or contributions are included in this view.";

export const SAVINGS_DRILLDOWN_CASH_CONTEXT_UNAVAILABLE_MESSAGE =
  "Cash deduction status is unavailable until your payment history finishes loading.";

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function formatDisplayDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMM d, yyyy");
}

function scopeLabel(isSharedGoal: boolean): string {
  return isSharedGoal ? "Shared" : "Private";
}

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function filterOwnSavingsParticipants(
  participants: ReadonlyArray<SavingsGoalParticipant>,
  signedInUserId: string
): SavingsGoalParticipant[] {
  return participants.filter((participant) => participant.user_id === signedInUserId);
}

export function filterOwnSavingsContributions(
  contributions: ReadonlyArray<SavingsContribution>,
  signedInUserId: string
): SavingsContribution[] {
  return contributions.filter(
    (contribution) => contribution.user_id === signedInUserId
  );
}

function buildContributionRows(
  contributions: DashboardSavingsContributionRow[],
  goalLabel: string,
  isSharedGoal: boolean,
  cashDeductionSourceIds: ReadonlySet<string>
): DashboardSavingsContributionDrilldownRow[] {
  return contributions.map((contribution) => {
    const cashDeductionLabel = buildContributionListCashDeductionLabel(
      contribution.id,
      cashDeductionSourceIds
    );

    return {
      ...contribution,
      kind: "contribution",
      goalLabel,
      isSharedGoal,
      scopeLabel: scopeLabel(isSharedGoal),
      sourceLabel: OWN_CONTRIBUTION_SOURCE_LABEL,
      cashDeductionLabel,
      isCashDeducted: cashDeductionLabel !== null,
    };
  });
}

function buildTargetRow(
  row: DashboardSavingsDrilldownRow,
  participantId: string,
  periodStart: string | null,
  periodEnd: string | null
): DashboardSavingsTargetDrilldownRow {
  const isSharedGoal = row.isSharedGoal;

  return {
    id: participantId,
    kind: "target",
    savingsGoalId: row.savingsGoalId,
    goalLabel: row.goalLabel,
    isSharedGoal,
    scopeLabel: scopeLabel(isSharedGoal),
    contributionPeriodLabel: row.contributionPeriodLabel,
    periodStart,
    periodEnd,
    periodStartLabel: periodStart ? formatDisplayDate(periodStart) : null,
    periodEndLabel: periodEnd ? formatDisplayDate(periodEnd) : null,
    targetAmount: row.targetAmount,
    contributedAmount: row.contributedAmount,
    remainingObligation: row.remainingObligation,
    sourceLabel: OWN_TARGET_SOURCE_LABEL,
    sharedPrivacyCopy: isSharedGoal ? SAVINGS_DETAIL_SHARED_PRIVACY_COPY : null,
    otherUserPrivacyCopy: isSharedGoal
      ? SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY
      : null,
    sharedMetadataCopy: isSharedGoal ? SHARED_GOAL_METADATA_ONLY_COPY : null,
    contributions: [],
  };
}

export function sumSavingsTargetRowRemainingObligations(
  rows: ReadonlyArray<Pick<DashboardSavingsTargetDrilldownRow, "remainingObligation">>
): number {
  return rows.reduce((sum, row) => sum + row.remainingObligation, 0);
}

export function buildSavingsDrilldownReconciliation(
  cardTotal: number,
  displayedRowTotal: number,
  options?: { cashDeductionContextAvailable?: boolean }
): DashboardSavingsDrilldownReconciliation {
  const totalsMatch = Math.abs(cardTotal - displayedRowTotal) < 0.005;
  const cashContextUnavailable = options?.cashDeductionContextAvailable === false;

  return {
    cardTotal,
    displayedRowTotal,
    totalsMatch,
    cardTotalLabel:
      "Dashboard remaining savings obligation (after-savings impact)",
    rowTotalLabel: "Sum of remaining obligations in listed target rows",
    matchLabel: totalsMatch ? "Totals match" : null,
    mismatchExplanation: totalsMatch
      ? null
      : cashContextUnavailable
        ? "These totals use only your visible savings targets and contributions. Other household members' private savings are not shown. Refresh the dashboard if payment or savings data is still loading."
        : "These totals use only your visible savings targets and contributions. Other household members' private savings are not shown. Refresh the dashboard or open Settings → Savings if something looks off.",
  };
}

export function buildMySavingsDrilldown(
  input: BuildMySavingsDrilldownInput
): MySavingsDrilldownResult {
  const ownParticipants = filterOwnSavingsParticipants(
    input.participants,
    input.signedInUserId
  );
  const ownContributions = filterOwnSavingsContributions(
    input.contributions,
    input.signedInUserId
  );

  const participantByGoalId = new Map(
    ownParticipants.map((participant) => [participant.savings_goal_id, participant])
  );

  const baseRows = buildMySavingsDrilldownRows(
    ownParticipants,
    ownContributions,
    input.visibleGoals,
    input.periodView,
    input.selectedYear,
    input.selectedMonth
  );

  const cashDeductionSourceIds = getSavingsContributionCashDeductionSourceIds(
    input.paymentTransactions ?? []
  );

  const targetRows = baseRows.map((row) => {
    const participant = participantByGoalId.get(row.savingsGoalId);
    const periodStart = parseDateOnly(participant?.period_start);
    const periodEnd = parseDateOnly(participant?.period_end);
    const targetRow = buildTargetRow(
      row,
      participant?.id ?? row.savingsGoalId,
      periodStart,
      periodEnd
    );

    targetRow.contributions = buildContributionRows(
      row.contributions,
      row.goalLabel,
      row.isSharedGoal,
      cashDeductionSourceIds
    );

    return targetRow;
  });

  const savingsTargetTotal = sumMySavingsTargetForView(
    ownParticipants,
    input.periodView,
    input.selectedYear,
    input.selectedMonth
  );
  const contributionsTotal = sumMySavingsContributionsForView(
    ownContributions,
    ownParticipants,
    input.periodView,
    input.selectedYear,
    input.selectedMonth
  );
  const remainingObligationTotal = calculateRemainingSavingsObligation(
    savingsTargetTotal,
    contributionsTotal
  );
  const displayedRowTotal = sumSavingsTargetRowRemainingObligations(targetRows);

  return {
    targetRows,
    summary: {
      savingsTargetTotal,
      contributionsTotal,
      remainingObligationTotal,
    },
    reconciliation: buildSavingsDrilldownReconciliation(
      input.cardRemainingObligationTotal,
      displayedRowTotal,
      { cashDeductionContextAvailable: input.cashDeductionContextAvailable }
    ),
    hasSharedGoals: targetRows.some((row) => row.isSharedGoal),
  };
}

function targetRowSearchHaystack(row: DashboardSavingsTargetDrilldownRow): string {
  return normalizeSearchText(
    [
      row.goalLabel,
      row.scopeLabel,
      row.sourceLabel,
      row.contributionPeriodLabel,
      row.sharedPrivacyCopy,
      row.otherUserPrivacyCopy,
      row.sharedMetadataCopy,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
  );
}

function contributionRowSearchHaystack(
  row: DashboardSavingsContributionDrilldownRow
): string {
  return normalizeSearchText(
    [
      row.goalLabel,
      row.scopeLabel,
      row.sourceLabel,
      row.cashDeductionLabel,
      row.notes,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
  );
}

export function filterSavingsTargetRowsLocally(
  rows: DashboardSavingsTargetDrilldownRow[],
  filters: DashboardSavingsDrilldownFilters
): DashboardSavingsTargetDrilldownRow[] {
  const searchText = normalizeSearchText(filters.searchText);

  return rows
    .map((row) => {
      const filteredContributions = row.contributions.filter((contribution) => {
        if (filters.rowKind === "target") {
          return false;
        }

        if (
          filters.rowKind === "cash-deducted" &&
          !contribution.isCashDeducted
        ) {
          return false;
        }

        if (filters.scope === "private" && row.isSharedGoal) {
          return false;
        }

        if (filters.scope === "shared" && !row.isSharedGoal) {
          return false;
        }

        if (searchText && !contributionRowSearchHaystack(contribution).includes(searchText)) {
          return false;
        }

        return true;
      });

      const targetMatchesScope =
        filters.scope === "all" ||
        (filters.scope === "private" && !row.isSharedGoal) ||
        (filters.scope === "shared" && row.isSharedGoal);

      const targetMatchesKind =
        filters.rowKind === "all" ||
        filters.rowKind === "target" ||
        (filters.rowKind === "contribution" && filteredContributions.length > 0) ||
        (filters.rowKind === "cash-deducted" && filteredContributions.length > 0);

      const targetMatchesSearch =
        !searchText || targetRowSearchHaystack(row).includes(searchText);

      const includeTarget =
        targetMatchesScope &&
        targetMatchesKind &&
        (filters.rowKind === "contribution" ||
          filters.rowKind === "cash-deducted" ||
          targetMatchesSearch);

      if (!includeTarget && filteredContributions.length === 0) {
        return null;
      }

      if (filters.rowKind === "contribution" || filters.rowKind === "cash-deducted") {
        return filteredContributions.length > 0
          ? { ...row, contributions: filteredContributions }
          : null;
      }

      if (!targetMatchesScope || !targetMatchesKind) {
        return null;
      }

      if (!targetMatchesSearch && filteredContributions.length === 0) {
        return null;
      }

      return {
        ...row,
        contributions: filteredContributions,
      };
    })
    .filter((row): row is DashboardSavingsTargetDrilldownRow => row !== null);
}

export function hasActiveSavingsDrilldownFilters(
  filters: DashboardSavingsDrilldownFilters
): boolean {
  return (
    filters.searchText.trim().length > 0 ||
    filters.scope !== "all" ||
    filters.rowKind !== "all"
  );
}

export function savingsDrilldownLabelsArePrivacySafe(input: {
  targetRows: DashboardSavingsTargetDrilldownRow[];
}): boolean {
  const labels: Array<string | null | undefined> = [];

  for (const row of input.targetRows) {
    labels.push(
      row.goalLabel,
      row.scopeLabel,
      row.sourceLabel,
      row.contributionPeriodLabel,
      row.sharedPrivacyCopy,
      row.otherUserPrivacyCopy,
      row.sharedMetadataCopy
    );

    for (const contribution of row.contributions) {
      labels.push(
        contribution.goalLabel,
        contribution.scopeLabel,
        contribution.sourceLabel,
        contribution.cashDeductionLabel,
        contribution.notes
      );
    }
  }

  return labels.every((label) => !label || !UUID_PATTERN.test(label));
}

export const SAVINGS_DRILLDOWN_SHARED_PRIVACY_HEADING =
  "Shared savings privacy";

export function buildSavingsDrilldownSharedPrivacyLines(): string[] {
  return [
    SAVINGS_DETAIL_SHARED_PRIVACY_COPY,
    SAVINGS_DETAIL_OTHER_USER_PRIVACY_COPY,
    SHARED_GOAL_METADATA_ONLY_COPY,
    SHARED_GOAL_PRIVACY_COPY,
  ];
}
