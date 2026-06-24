import {
  buildMonthlyReportCsvFilename,
  csvExportLabelsArePrivacySafe,
  rowsToCsv,
  type CsvExportRow,
} from "@/lib/csv-export";
import { formatCurrency, formatDeductionAmount } from "@/lib/format";
import type { MonthlyPrintReportResult } from "@/lib/monthly-print-report";

const SECRET_PATTERN =
  /(password|secret|api[_-]?key|token|credential|service[_-]?role|supabase[_-]?key)/i;

function emptyRow(): CsvExportRow {
  return {
    section: "",
    type: "",
    date: "",
    period: "",
    title: "",
    status: "",
    category: "",
    amount: "",
    effect: "",
    source: "",
    notes: "",
    warning: "",
    privacy_scope: "",
  };
}

function row(partial: Partial<CsvExportRow>): CsvExportRow {
  return { ...emptyRow(), ...partial };
}

function formatOptionalAmount(value: number | null | undefined, asDeduction = false): string {
  if (value == null) {
    return "";
  }

  return asDeduction ? formatDeductionAmount(value) : formatCurrency(value);
}

function buildMetadataRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  return [
    row({
      section: "metadata",
      type: "report_title",
      title: report.header.title,
      notes: report.header.generatedAtLabel,
      privacy_scope: "own",
    }),
    row({
      section: "metadata",
      type: "month",
      title: report.header.monthLabel,
      privacy_scope: "household",
    }),
    ...(report.header.householdLabel
      ? [
          row({
            section: "metadata",
            type: "household",
            title: report.header.householdLabel,
            privacy_scope: "household",
          }),
        ]
      : []),
    row({
      section: "metadata",
      type: "privacy_notice",
      title: report.header.privateSectionCopy,
      privacy_scope: "own",
    }),
  ];
}

function buildCashPositionRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { cashPosition: cash } = report;
  const rows: CsvExportRow[] = [
    row({
      section: "cash_position",
      type: "summary",
      title: "Current cash",
      date: cash.snapshotDateLabel ?? "",
      amount: cash.currentAmount == null ? "" : formatCurrency(cash.currentAmount),
      notes: cash.viewLabel,
      privacy_scope: "own",
    }),
    row({
      section: "cash_position",
      type: "summary",
      title: "Safe to spend before savings",
      amount: formatOptionalAmount(cash.safeToSpendBeforeSavings),
      privacy_scope: "own",
    }),
    row({
      section: "cash_position",
      type: "summary",
      title: "Safe to spend after savings",
      amount: formatOptionalAmount(cash.safeToSpendAfterSavings),
      privacy_scope: "own",
    }),
    row({
      section: "cash_position",
      type: "summary",
      title: "Projected ending balance",
      amount: formatOptionalAmount(cash.projectedEndingBalance),
      privacy_scope: "own",
    }),
  ];

  if (cash.missingSnapshotMessage) {
    rows.push(
      row({
        section: "cash_position",
        type: "warning",
        title: "Missing cash snapshot",
        warning: cash.missingSnapshotMessage,
        privacy_scope: "own",
      })
    );
  }

  if (cash.staleSnapshotMessage) {
    rows.push(
      row({
        section: "cash_position",
        type: "warning",
        title: "Stale cash snapshot",
        warning: cash.staleSnapshotMessage,
        privacy_scope: "own",
      })
    );
  }

  return rows;
}

function buildBillDetailRow(
  billRow: MonthlyPrintReportResult["bills"]["unpaidRows"][number],
  billType: string
): CsvExportRow {
  return row({
    section: "bills",
    type: billType,
    date: billRow.dueDateLabel,
    period: billRow.periodLabel ?? "",
    title: billRow.name,
    status: billRow.statusLabel,
    amount: billRow.amountLabel,
    effect: billRow.statusLabel === "Unpaid" ? billRow.amountLabel : "",
    source: billRow.debtLinkedLabel ?? "",
    warning: billRow.variableWarningLabel ?? "",
    privacy_scope: "household",
  });
}

function buildBillsRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { bills } = report;
  const rows: CsvExportRow[] = [
    row({
      section: "bills",
      type: "summary",
      title: "Bill total",
      amount: bills.totalLabel,
      privacy_scope: "household",
    }),
    row({
      section: "bills",
      type: "summary",
      title: "Unpaid total",
      amount: bills.unpaidTotalLabel,
      effect: bills.unpaidTotalLabel,
      privacy_scope: "household",
    }),
    row({
      section: "bills",
      type: "summary",
      title: "Paid total",
      amount: bills.paidTotalLabel,
      privacy_scope: "household",
    }),
  ];

  for (const breakdown of bills.periodBreakdown) {
    rows.push(
      row({
        section: "bills",
        type: "period_total",
        period: breakdown.periodLabel,
        title: breakdown.periodLabel,
        amount: breakdown.totalLabel,
        privacy_scope: "household",
      })
    );
  }

  for (const billRow of bills.unpaidRows) {
    rows.push(buildBillDetailRow(billRow, "unpaid_bill"));
  }
  for (const billRow of bills.paidRows) {
    rows.push(buildBillDetailRow(billRow, "paid_bill"));
  }
  for (const billRow of bills.variableRows) {
    if (!bills.unpaidRows.includes(billRow) && !bills.paidRows.includes(billRow)) {
      rows.push(buildBillDetailRow(billRow, "variable_bill"));
    }
  }

  if (bills.variableNeedsConfirmationCount > 0) {
    rows.push(
      row({
        section: "bills",
        type: "summary",
        title: "Variable bills needing confirmation",
        amount: String(bills.variableNeedsConfirmationCount),
        privacy_scope: "household",
      })
    );
  }

  return rows;
}

function buildDebtRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { debt } = report;
  const rows: CsvExportRow[] = [
    row({
      section: "debt",
      type: "summary",
      title: "Active debt accounts",
      amount: String(debt.activeDebtCount),
      privacy_scope: "household",
    }),
    row({
      section: "debt",
      type: "summary",
      title: "Remaining debt",
      amount: debt.remainingDebtLabel,
      privacy_scope: "household",
    }),
    row({
      section: "debt",
      type: "summary",
      title: "Payoff outlook",
      notes: debt.payoffLabel,
      privacy_scope: "household",
    }),
    row({
      section: "debt",
      type: "summary",
      title: "Next payment",
      amount: debt.nextPaymentLabel,
      notes: debt.nextPaymentDescription ?? "",
      privacy_scope: "household",
    }),
  ];

  for (const payment of debt.upcomingPayments) {
    rows.push(
      row({
        section: "debt",
        type: "payment",
        date: payment.paymentDateLabel,
        title: payment.accountName,
        status: payment.paidStatusLabel,
        amount: payment.totalPaymentLabel,
        effect: payment.paidStatusLabel === "Unpaid" ? payment.totalPaymentLabel : "",
        source: payment.linkedBillLabel ?? "",
        privacy_scope: "household",
      })
    );
  }

  return rows;
}

function buildSavingsRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { savings } = report;
  return [
    row({
      section: "savings",
      type: "summary",
      title: "My savings target",
      amount: savings.targetLabel,
      privacy_scope: "own",
    }),
    row({
      section: "savings",
      type: "summary",
      title: "My contributions",
      amount: savings.contributionsLabel,
      privacy_scope: "own",
    }),
    row({
      section: "savings",
      type: "summary",
      title: "Remaining obligation",
      amount: savings.remainingObligationLabel,
      effect: savings.remainingObligationLabel,
      privacy_scope: "own",
    }),
    row({
      section: "savings",
      type: "privacy_notice",
      title: savings.sharedPrivacyCopy,
      privacy_scope: "shared",
    }),
  ];
}

function buildExpenseRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { expenses } = report;
  const rows: CsvExportRow[] = [
    row({
      section: "expenses",
      type: "summary",
      title: "Expense total",
      amount: expenses.totalLabel,
      effect: expenses.totalLabel,
      privacy_scope: "household",
    }),
  ];

  for (const category of expenses.categorySummary) {
    rows.push(
      row({
        section: "expenses",
        type: "category_total",
        category: category.category,
        title: category.category,
        amount: category.totalLabel,
        effect: category.totalLabel,
        privacy_scope: "household",
      })
    );
  }

  for (const expense of expenses.rows) {
    rows.push(
      row({
        section: "expenses",
        type: expense.rowTypeLabel,
        date: expense.dateLabel,
        title: expense.description,
        category: expense.categoryLabel ?? "",
        amount: expense.amountLabel,
        effect: expense.amountLabel,
        source: expense.sourceLabel,
        privacy_scope: "household",
      })
    );
  }

  return rows;
}

function buildIncomeRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { income } = report;
  const rows: CsvExportRow[] = [
    row({
      section: "income",
      type: "summary",
      title: "Projected paycheck total",
      amount: income.projectedTotalLabel,
      effect: income.projectedTotalLabel,
      privacy_scope: "own",
    }),
  ];

  if (income.scheduleStatusMessage) {
    rows.push(
      row({
        section: "income",
        type: "schedule_status",
        title: income.scheduleStatusMessage,
        privacy_scope: "own",
      })
    );
  }

  for (const incomeRow of income.rows) {
    rows.push(
      row({
        section: "income",
        type: "paycheck",
        date: incomeRow.dateLabel,
        title: "Paycheck",
        amount: incomeRow.amountLabel,
        effect: incomeRow.amountLabel,
        source: incomeRow.scheduleLabel,
        privacy_scope: "own",
      })
    );
  }

  return rows;
}

function buildForecastRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { forecast } = report;
  const rows: CsvExportRow[] = [];

  if (forecast.windowLabel) {
    rows.push(
      row({
        section: "forecast",
        type: "summary",
        title: "Forecast window",
        notes: forecast.windowLabel,
        privacy_scope: "own",
      })
    );
  }

  const summaryFields: Array<[string, string | null]> = [
    ["Projected income", forecast.projectedIncomeLabel],
    ["Projected obligations", forecast.projectedObligationsLabel],
    ["Ending balance", forecast.endingBalanceLabel],
    ["Lowest balance", forecast.lowestBalanceLabel],
    ["First shortfall date", forecast.firstShortfallDateLabel],
  ];

  for (const [title, value] of summaryFields) {
    if (value) {
      rows.push(
        row({
          section: "forecast",
          type: "summary",
          title,
          amount: title.includes("obligations") ? "" : value,
          effect: title.includes("obligations") ? value : "",
          privacy_scope: "own",
        })
      );
    }
  }

  if (forecast.incompleteReason) {
    rows.push(
      row({
        section: "forecast",
        type: "warning",
        title: "Forecast incomplete",
        warning: forecast.incompleteReason,
        privacy_scope: "own",
      })
    );
  }

  return rows;
}

function buildWarningRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  return report.warnings.rows.map((warning) =>
    row({
      section: "warnings",
      type: warning.severity,
      title: warning.title,
      notes: warning.description,
      source: warning.affectedArea,
      warning: warning.description,
      privacy_scope: "own",
    })
  );
}

function buildCalendarRows(report: MonthlyPrintReportResult): CsvExportRow[] {
  const { calendar } = report;
  const rows: CsvExportRow[] = [
    row({
      section: "calendar",
      type: "summary",
      title: calendar.monthSummaryLabel,
      privacy_scope: "household",
    }),
  ];

  for (const day of calendar.days) {
    rows.push(
      row({
        section: "calendar",
        type: "day_summary",
        date: day.dateLabel,
        title: "Day totals",
        amount: day.incomeTotalLabel,
        effect: day.obligationTotalLabel,
        notes: `Net ${day.netEffectLabel}${day.projectedBalanceLabel ? `; Balance ${day.projectedBalanceLabel}` : ""}`,
        privacy_scope: "household",
      })
    );

    for (const event of day.events) {
      rows.push(
        row({
          section: "calendar",
          type: event.typeLabel,
          date: day.dateLabel,
          title: event.title,
          status: event.statusLabel ?? "",
          amount: event.amountLabel ?? "",
          effect: event.amountLabel ?? "",
          privacy_scope: "household",
        })
      );
    }
  }

  return rows;
}

export function buildMonthlyReportExportRows(
  report: MonthlyPrintReportResult
): CsvExportRow[] {
  return [
    ...buildMetadataRows(report),
    ...buildCashPositionRows(report),
    ...buildBillsRows(report),
    ...buildDebtRows(report),
    ...buildSavingsRows(report),
    ...buildExpenseRows(report),
    ...buildIncomeRows(report),
    ...buildForecastRows(report),
    ...buildWarningRows(report),
    ...buildCalendarRows(report),
  ];
}

export function buildMonthlyReportCsv(report: MonthlyPrintReportResult): string {
  return rowsToCsv(buildMonthlyReportExportRows(report));
}

export function monthlyReportExportSections(
  report: MonthlyPrintReportResult
): Set<string> {
  return new Set(buildMonthlyReportExportRows(report).map((entry) => entry.section));
}

export function monthlyReportExportMetadataIsSafe(
  report: MonthlyPrintReportResult,
  year: number,
  month: number
): boolean {
  const filename = buildMonthlyReportCsvFilename(year, month);
  const csv = buildMonthlyReportCsv(report);
  const serialized = `${filename}\n${csv}`;
  return !SECRET_PATTERN.test(serialized);
}

export function monthlyReportExportLabelsArePrivacySafe(
  report: MonthlyPrintReportResult
): boolean {
  const labels = buildMonthlyReportExportRows(report).flatMap((entry) => [
    entry.section,
    entry.type,
    entry.date,
    entry.period,
    entry.title,
    entry.status,
    entry.category,
    entry.amount,
    entry.effect,
    entry.source,
    entry.notes,
    entry.warning,
    entry.privacy_scope,
  ]);

  return csvExportLabelsArePrivacySafe(labels);
}

export { buildMonthlyReportCsvFilename };
