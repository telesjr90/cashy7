import type { DebtAccount } from "@/lib/types";

export type DebtAccountArchiveStatus = {
  isArchived: boolean;
  archivedAt: string | null;
  archiveReason: string | null;
  isPaidOff: boolean;
  closeActionLabel: string;
  closeActionDescription: string;
  confirmButtonLabel: string;
};

export type DebtAccountArchiveUpdate = Pick<
  DebtAccount,
  "is_archived" | "archived_at" | "archive_reason"
>;

export const DEBT_ACCOUNT_ARCHIVED_BADGE_LABEL = "Archived";
export const DEBT_ACCOUNT_CLOSED_BADGE_LABEL = "Closed";

export const DEBT_ACCOUNT_ARCHIVE_HISTORY_MESSAGE =
  "Payment history, linked bills, and cash audit records are preserved.";

export const DEBT_ACCOUNT_ARCHIVE_UNPAID_WARNING =
  "This debt still has a remaining balance. Archiving hides it from your active list but does not mark it paid off.";

export const DEBT_ACCOUNT_REOPEN_MESSAGE =
  "Reopening restores this account to the active debt list. Scheduled payments and linked bills are not regenerated.";

export function isDebtAccountArchived(
  account: Pick<DebtAccount, "is_archived">
): boolean {
  return account.is_archived === true;
}

export function isDebtAccountPaidOff(
  account: Pick<DebtAccount, "current_balance">
): boolean {
  return account.current_balance <= 0;
}

export function computeDebtAccountTotalPaid(
  account: Pick<DebtAccount, "original_amount" | "current_balance">
): number {
  return Math.max(
    0,
    Math.round((account.original_amount - account.current_balance) * 100) / 100
  );
}

export function getDebtAccountArchiveStatus(
  account: Pick<
    DebtAccount,
    "name" | "is_archived" | "archived_at" | "archive_reason" | "current_balance"
  >
): DebtAccountArchiveStatus {
  const isArchived = isDebtAccountArchived(account);
  const isPaidOff = isDebtAccountPaidOff(account);

  if (isPaidOff) {
    return {
      isArchived,
      archivedAt: account.archived_at,
      archiveReason: account.archive_reason,
      isPaidOff: true,
      closeActionLabel: "Close account",
      closeActionDescription: `This debt is paid off. Closing hides "${account.name}" from your active debt list. ${DEBT_ACCOUNT_ARCHIVE_HISTORY_MESSAGE}`,
      confirmButtonLabel: "Close account",
    };
  }

  return {
    isArchived,
    archivedAt: account.archived_at,
    archiveReason: account.archive_reason,
    isPaidOff: false,
    closeActionLabel: "Archive account",
    closeActionDescription: `${DEBT_ACCOUNT_ARCHIVE_UNPAID_WARNING} ${DEBT_ACCOUNT_ARCHIVE_HISTORY_MESSAGE}`,
    confirmButtonLabel: "Archive account",
  };
}

export function canCloseDebtAccount(
  account: Pick<DebtAccount, "is_archived" | "current_balance">
): boolean {
  return !isDebtAccountArchived(account) && isDebtAccountPaidOff(account);
}

export function canArchiveDebtAccount(
  account: Pick<DebtAccount, "is_archived">
): boolean {
  return !isDebtAccountArchived(account);
}

export function canReopenDebtAccount(
  account: Pick<DebtAccount, "is_archived">
): boolean {
  return isDebtAccountArchived(account);
}

export function filterActiveDebtAccounts<T extends Pick<DebtAccount, "is_archived">>(
  accounts: readonly T[]
): T[] {
  return accounts.filter((account) => !isDebtAccountArchived(account));
}

export function filterArchivedDebtAccounts<T extends Pick<DebtAccount, "is_archived">>(
  accounts: readonly T[]
): T[] {
  return accounts.filter((account) => isDebtAccountArchived(account));
}

export function buildArchivePayload(
  archiveReason?: string | null,
  archivedAt: string = new Date().toISOString()
): DebtAccountArchiveUpdate {
  const trimmedReason = archiveReason?.trim();
  return {
    is_archived: true,
    archived_at: archivedAt,
    archive_reason: trimmedReason ? trimmedReason : null,
  };
}

export function buildReopenPayload(): DebtAccountArchiveUpdate {
  return {
    is_archived: false,
    archived_at: null,
    archive_reason: null,
  };
}

export function getDebtAccountArchivedBadgeLabel(
  account: Pick<DebtAccount, "is_archived" | "current_balance">
): string | null {
  if (!isDebtAccountArchived(account)) {
    return null;
  }

  return isDebtAccountPaidOff(account)
    ? DEBT_ACCOUNT_CLOSED_BADGE_LABEL
    : DEBT_ACCOUNT_ARCHIVED_BADGE_LABEL;
}

export function formatDebtAccountArchivedDate(
  archivedAt: string | null
): string | null {
  if (!archivedAt) {
    return null;
  }

  try {
    return new Date(archivedAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return archivedAt;
  }
}

export function isDebtScheduleActionAllowed(
  account: Pick<DebtAccount, "is_archived">
): boolean {
  return !isDebtAccountArchived(account);
}

export const BILL_DETAIL_DEBT_ACCOUNT_ARCHIVED_MESSAGE =
  "Debt account archived — linked bills remain visible here and are still managed from the Debt page.";
