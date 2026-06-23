import type { SavingsContribution } from "@/lib/types";

export const SAVINGS_PRE_START_LABEL = "Before cashflow start";

export const SAVINGS_CONTRIBUTIONS_PRE_START_HIDDEN_NOTICE =
  "Savings contributions before the cashflow start date are hidden from the active list.";

export const SHOW_PRE_START_SAVINGS_CONTRIBUTIONS_LABEL =
  "Show pre-start savings contributions";

export const SAVINGS_ACTIVE_TOTAL_EXCLUDES_PRE_START_NOTICE =
  "Active contribution totals exclude amounts before the cashflow start date.";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function parseContributionDateOnly(
  contributionDate: string | null | undefined
): string | null {
  if (!contributionDate) {
    return null;
  }

  const match = contributionDate.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function isSavingsContributionOnOrAfterCashflowStart(
  contribution: Pick<SavingsContribution, "contribution_date">,
  cashflowStartDate: string
): boolean {
  const contributionDate = parseContributionDateOnly(contribution.contribution_date);
  if (!contributionDate) {
    return true;
  }

  return contributionDate >= cashflowStartDate;
}

export function isSavingsContributionPreStart(
  contribution: Pick<SavingsContribution, "contribution_date">,
  cashflowStartDate: string | null | undefined
): boolean {
  if (!cashflowStartDate) {
    return false;
  }

  return !isSavingsContributionOnOrAfterCashflowStart(
    contribution,
    cashflowStartDate
  );
}

export function getSavingsContributionPreStartLabel(
  contribution: Pick<SavingsContribution, "contribution_date">,
  cashflowStartDate: string | null | undefined
): string | null {
  return isSavingsContributionPreStart(contribution, cashflowStartDate)
    ? SAVINGS_PRE_START_LABEL
    : null;
}

export function filterSavingsContributionsByCashflowStart<
  T extends Pick<SavingsContribution, "contribution_date">,
>(
  contributions: readonly T[],
  cashflowStartDate: string | null | undefined
): T[] {
  if (!cashflowStartDate) {
    return [...contributions];
  }

  return contributions.filter((contribution) =>
    isSavingsContributionOnOrAfterCashflowStart(contribution, cashflowStartDate)
  );
}

export function splitSavingsContributionsByCashflowStart<
  T extends Pick<SavingsContribution, "contribution_date">,
>(
  contributions: readonly T[],
  cashflowStartDate: string | null | undefined
): { activeContributions: T[]; preStartContributions: T[] } {
  if (!cashflowStartDate) {
    return { activeContributions: [...contributions], preStartContributions: [] };
  }

  const activeContributions: T[] = [];
  const preStartContributions: T[] = [];

  for (const contribution of contributions) {
    if (
      isSavingsContributionOnOrAfterCashflowStart(contribution, cashflowStartDate)
    ) {
      activeContributions.push(contribution);
    } else {
      preStartContributions.push(contribution);
    }
  }

  return { activeContributions, preStartContributions };
}

/** Contributions eligible for the default active list in Settings → Savings. */
export function getSavingsPageVisibleContributions<
  T extends Pick<SavingsContribution, "contribution_date">,
>(
  contributions: readonly T[],
  cashflowStartDate: string | null | undefined,
  showPreStartSavingsContributions: boolean
): T[] {
  if (!cashflowStartDate || showPreStartSavingsContributions) {
    return [...contributions];
  }

  return filterSavingsContributionsByCashflowStart(contributions, cashflowStartDate);
}

export function sumActiveSavingsContributionAmounts<
  T extends Pick<SavingsContribution, "contribution_date" | "amount">,
>(
  contributions: readonly T[],
  cashflowStartDate: string | null | undefined
): number {
  const activeContributions = filterSavingsContributionsByCashflowStart(
    contributions,
    cashflowStartDate
  );

  return activeContributions.reduce(
    (total, contribution) => total + Number(contribution.amount),
    0
  );
}

export function sumPreStartSavingsContributionAmounts<
  T extends Pick<SavingsContribution, "contribution_date" | "amount">,
>(
  contributions: readonly T[],
  cashflowStartDate: string | null | undefined
): number {
  if (!cashflowStartDate) {
    return 0;
  }

  const { preStartContributions } = splitSavingsContributionsByCashflowStart(
    contributions,
    cashflowStartDate
  );

  return preStartContributions.reduce(
    (total, contribution) => total + Number(contribution.amount),
    0
  );
}

export function savingsCashflowStartLabelContainsRawUuid(label: string): boolean {
  return UUID_PATTERN.test(label);
}
