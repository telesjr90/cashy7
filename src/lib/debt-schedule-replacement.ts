import { addMonths, format, parseISO } from "date-fns";
import {
  computeDebtPaymentAmounts,
  computeProjectedRemainingBalances,
  debtBillInstanceName,
  formatCurrency,
  splitDebtPayment,
} from "@/lib/format";
import type { DebtPayment } from "@/lib/types";

export type ScheduleSplitType = "5149" | "custom";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type DebtPaymentProtectionReason =
  | "paid"
  | "cash_deducted"
  | "before_start_date";

export type ExistingDebtPaymentPreviewRow = {
  kind: "existing";
  id: string;
  paymentDate: string;
  month: number;
  year: number;
  totalPayment: number;
  label: string;
  linkedBillInstanceId: string | null;
  linkedBillLabel: string | null;
  disposition: "replace" | "preserve";
  protectionReason?: DebtPaymentProtectionReason;
};

export type ProposedDebtPaymentPreviewRow = {
  kind: "proposed";
  paymentDate: string;
  month: number;
  year: number;
  totalPayment: number;
  telesAmount: number;
  nicoleAmount: number;
  remainingBalance: number;
  label: string;
  linkedBillLabel: string;
  status: "create" | "skip_duplicate";
  skipReason?: string;
};

export type DebtScheduleReplacementSummary = {
  toReplace: number;
  toCreate: number;
  preservedPaid: number;
  preservedCashDeducted: number;
  preservedHistorical: number;
  skippedDuplicates: number;
  linkedBillsToRemove: number;
};

export type DebtScheduleReplacementPlan = {
  existingRows: ExistingDebtPaymentPreviewRow[];
  proposedRows: ProposedDebtPaymentPreviewRow[];
  summary: DebtScheduleReplacementSummary;
  errors: string[];
};

export type DebtScheduleReplacementInput = {
  accountName: string;
  currentBalance: number;
  existingPayments: DebtPayment[];
  cashDeductedPaymentIds: ReadonlySet<string>;
  replacementStartDate: string;
  paymentsLeft: number;
  regularPayment: number;
  splitType: ScheduleSplitType;
  customTeles?: number;
  customNicole?: number;
};

export type DebtScheduleReplacementCreateRow = {
  paymentDate: string;
  month: number;
  year: number;
  totalPayment: number;
  telesAmount: number;
  nicoleAmount: number;
  remainingBalance: number;
};

export type DebtScheduleReplacementMutation = {
  paymentIdsToDelete: string[];
  billInstanceIdsToDelete: string[];
  paymentsToCreate: DebtScheduleReplacementCreateRow[];
};

function formatPaymentDateLabel(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function monthYearKey(month: number, year: number): string {
  return `${year}-${month}`;
}

function monthYearLabel(month: number, year: number): string {
  const monthName = MONTH_NAMES[month - 1] ?? String(month);
  return `${monthName} ${year}`;
}

function compareByPaymentDate(
  a: Pick<ExistingDebtPaymentPreviewRow, "paymentDate">,
  b: Pick<ExistingDebtPaymentPreviewRow, "paymentDate">
): number {
  return a.paymentDate.localeCompare(b.paymentDate);
}

export function getDebtPaymentProtectionReason(
  payment: Pick<DebtPayment, "id" | "payment_date" | "paid_status">,
  replacementStartDate: string,
  cashDeductedPaymentIds: ReadonlySet<string>
): DebtPaymentProtectionReason | null {
  if (payment.paid_status) {
    return "paid";
  }

  if (cashDeductedPaymentIds.has(payment.id)) {
    return "cash_deducted";
  }

  if (payment.payment_date < replacementStartDate) {
    return "before_start_date";
  }

  return null;
}

export function isDebtPaymentReplaceable(
  payment: Pick<DebtPayment, "id" | "payment_date" | "paid_status">,
  replacementStartDate: string,
  cashDeductedPaymentIds: ReadonlySet<string>
): boolean {
  return (
    getDebtPaymentProtectionReason(
      payment,
      replacementStartDate,
      cashDeductedPaymentIds
    ) === null
  );
}

export function protectionReasonLabel(
  reason: DebtPaymentProtectionReason
): string {
  switch (reason) {
    case "paid":
      return "Paid — will not be changed";
    case "cash_deducted":
      return "Cash-deducted — will not be changed";
    case "before_start_date":
      return "Before replacement start — will not be changed";
  }
}

export function buildDebtPaymentRowLabel(
  paymentDate: string,
  totalPayment: number,
  accountName: string
): string {
  return `${formatPaymentDateLabel(paymentDate)} · ${formatCurrency(totalPayment)} · ${accountName}`;
}

export function buildLinkedBillLabel(
  accountName: string,
  month: number,
  year: number
): string {
  return `${debtBillInstanceName(accountName)} · ${monthYearLabel(month, year)}`;
}

export function planDebtScheduleReplacement(
  input: DebtScheduleReplacementInput
): DebtScheduleReplacementPlan {
  const errors: string[] = [];
  const {
    accountName,
    currentBalance,
    existingPayments,
    cashDeductedPaymentIds,
    replacementStartDate,
    paymentsLeft,
    regularPayment,
    splitType,
    customTeles,
    customNicole,
  } = input;

  if (paymentsLeft <= 0) {
    errors.push("Enter a valid number of payments.");
  }
  if (regularPayment <= 0) {
    errors.push("Enter a valid payment amount.");
  }
  if (currentBalance <= 0) {
    errors.push("Current balance must be greater than zero.");
  }

  const existingRows: ExistingDebtPaymentPreviewRow[] = existingPayments.map(
    (payment) => {
      const protectionReason = getDebtPaymentProtectionReason(
        payment,
        replacementStartDate,
        cashDeductedPaymentIds
      );
      const disposition = protectionReason ? "preserve" : "replace";
      const label = buildDebtPaymentRowLabel(
        payment.payment_date,
        payment.total_payment,
        accountName
      );
      const linkedBillLabel = payment.linked_bill_instance_id
        ? buildLinkedBillLabel(accountName, payment.month, payment.year)
        : null;

      return {
        kind: "existing",
        id: payment.id,
        paymentDate: payment.payment_date,
        month: payment.month,
        year: payment.year,
        totalPayment: payment.total_payment,
        label,
        linkedBillInstanceId: payment.linked_bill_instance_id,
        linkedBillLabel,
        disposition,
        protectionReason: protectionReason ?? undefined,
      };
    }
  );

  const preservedMonthYears = new Set<string>();
  let preservedPaid = 0;
  let preservedCashDeducted = 0;
  let preservedHistorical = 0;

  for (const row of existingRows) {
    if (row.disposition !== "preserve") {
      continue;
    }

    preservedMonthYears.add(monthYearKey(row.month, row.year));

    switch (row.protectionReason) {
      case "paid":
        preservedPaid += 1;
        break;
      case "cash_deducted":
        preservedCashDeducted += 1;
        break;
      case "before_start_date":
        preservedHistorical += 1;
        break;
    }
  }

  const proposedRows: ProposedDebtPaymentPreviewRow[] = [];
  let skippedDuplicates = 0;

  if (errors.length === 0) {
    const paymentAmounts = computeDebtPaymentAmounts(
      currentBalance,
      paymentsLeft,
      regularPayment
    );

    if (paymentAmounts.length === 0) {
      errors.push("Unable to build a replacement schedule for this balance.");
    } else {
      const projectedRemaining = computeProjectedRemainingBalances(
        currentBalance,
        paymentAmounts
      );

      let firstPaymentDate: Date;
      try {
        firstPaymentDate = parseISO(replacementStartDate);
        if (Number.isNaN(firstPaymentDate.getTime())) {
          throw new Error("invalid date");
        }
      } catch {
        errors.push("Enter a valid replacement start date.");
        firstPaymentDate = new Date();
      }

      if (errors.length === 0) {
        for (let i = 0; i < paymentAmounts.length; i++) {
          const totalPayment = paymentAmounts[i];
          const paymentDate = format(addMonths(firstPaymentDate, i), "yyyy-MM-dd");
          const paymentDateParts = parseISO(paymentDate);
          const month = paymentDateParts.getMonth() + 1;
          const year = paymentDateParts.getFullYear();

          const { teles, nicole } = splitDebtPayment(
            totalPayment,
            splitType,
            customTeles,
            customNicole,
            regularPayment
          );

          const label = buildDebtPaymentRowLabel(
            paymentDate,
            totalPayment,
            accountName
          );
          const linkedBillLabel = buildLinkedBillLabel(accountName, month, year);
          const key = monthYearKey(month, year);

          if (preservedMonthYears.has(key)) {
            skippedDuplicates += 1;
            proposedRows.push({
              kind: "proposed",
              paymentDate,
              month,
              year,
              totalPayment,
              telesAmount: teles,
              nicoleAmount: nicole,
              remainingBalance: projectedRemaining[i],
              label,
              linkedBillLabel,
              status: "skip_duplicate",
              skipReason:
                "A preserved payment already exists for this month — duplicate skipped",
            });
            continue;
          }

          proposedRows.push({
            kind: "proposed",
            paymentDate,
            month,
            year,
            totalPayment,
            telesAmount: teles,
            nicoleAmount: nicole,
            remainingBalance: projectedRemaining[i],
            label,
            linkedBillLabel,
            status: "create",
          });
        }
      }
    }
  }

  const toReplace = existingRows.filter((row) => row.disposition === "replace").length;
  const toCreate = proposedRows.filter((row) => row.status === "create").length;
  const linkedBillsToRemove = existingRows.filter(
    (row) => row.disposition === "replace" && row.linkedBillInstanceId
  ).length;

  return {
    existingRows: [...existingRows].sort(compareByPaymentDate),
    proposedRows,
    summary: {
      toReplace,
      toCreate,
      preservedPaid,
      preservedCashDeducted,
      preservedHistorical,
      skippedDuplicates,
      linkedBillsToRemove,
    },
    errors,
  };
}

export function getDebtScheduleReplacementMutation(
  plan: DebtScheduleReplacementPlan
): DebtScheduleReplacementMutation {
  const paymentIdsToDelete = plan.existingRows
    .filter((row) => row.disposition === "replace")
    .map((row) => row.id);

  const billInstanceIdsToDelete = plan.existingRows
    .filter((row) => row.disposition === "replace" && row.linkedBillInstanceId)
    .map((row) => row.linkedBillInstanceId as string);

  const paymentsToCreate = plan.proposedRows
    .filter((row) => row.status === "create")
    .map((row) => ({
      paymentDate: row.paymentDate,
      month: row.month,
      year: row.year,
      totalPayment: row.totalPayment,
      telesAmount: row.telesAmount,
      nicoleAmount: row.nicoleAmount,
      remainingBalance: row.remainingBalance,
    }));

  return {
    paymentIdsToDelete,
    billInstanceIdsToDelete,
    paymentsToCreate,
  };
}

export function debtScheduleReplacementSummaryMessage(
  summary: DebtScheduleReplacementSummary
): string {
  const parts: string[] = [];

  if (summary.toReplace > 0) {
    parts.push(
      `${summary.toReplace} future unpaid payment${summary.toReplace === 1 ? "" : "s"} replaced`
    );
  }

  if (summary.toCreate > 0) {
    parts.push(
      `${summary.toCreate} new scheduled payment${summary.toCreate === 1 ? "" : "s"} created`
    );
  }

  if (summary.linkedBillsToRemove > 0) {
    parts.push(
      `${summary.linkedBillsToRemove} linked bill instance${summary.linkedBillsToRemove === 1 ? "" : "s"} updated`
    );
  }

  const preservedTotal =
    summary.preservedPaid +
    summary.preservedCashDeducted +
    summary.preservedHistorical;

  if (preservedTotal > 0) {
    parts.push(`${preservedTotal} payment${preservedTotal === 1 ? "" : "s"} preserved`);
  }

  if (parts.length === 0) {
    return "No schedule changes were made.";
  }

  return parts.join(". ") + ".";
}
