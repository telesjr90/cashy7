import { Link } from "react-router-dom";
import type { BillInstanceDetailView } from "@/lib/bill-detail";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type BillDetailPanelProps = {
  detail: BillInstanceDetailView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function DetailRow({
  label,
  value,
  align = "right",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div className="flex min-w-0 justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", align === "right" ? "text-right" : undefined)}>
        {value}
      </dd>
    </div>
  );
}

export function BillDetailPanel({
  detail,
  open,
  onOpenChange,
}: BillDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {detail ? (
          <>
            <SheetHeader>
              <SheetTitle>{detail.title}</SheetTitle>
              <SheetDescription>{detail.subtitle}</SheetDescription>
              {detail.beforeCashflowStartLabel && (
                <Badge variant="outline" className="w-fit">
                  {detail.beforeCashflowStartLabel}
                </Badge>
              )}
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Bill identity</h3>
                <dl className="grid gap-2 text-sm">
                  <DetailRow label="Name" value={detail.name} />
                  <DetailRow label="Due date" value={detail.dueDateLabel} />
                  <DetailRow label="Month" value={detail.monthYearLabel} />
                  <DetailRow label="Period bucket" value={detail.periodBucketLabel} />
                  {detail.categoryLabel && (
                    <DetailRow
                      label="Category"
                      value={detail.categoryLabel}
                      align="left"
                    />
                  )}
                  <DetailRow label="Source" value={detail.sourceLabel} />
                  {detail.beforeCashflowStartLabel && (
                    <DetailRow
                      label="Cashflow start"
                      value={detail.beforeCashflowStartLabel}
                      align="left"
                    />
                  )}
                  {detail.userNotes && (
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">Notes</dt>
                      <dd>{detail.userNotes}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Amounts</h3>
                <dl className="grid gap-2 text-sm">
                  <DetailRow label="Total" value={detail.amountLabel} />
                  <DetailRow label="Teles" value={detail.telesAmountLabel} />
                  <DetailRow label="Nicole" value={detail.nicoleAmountLabel} />
                  <DetailRow label="Split" value={detail.splitSummaryLabel} />
                  {detail.variableAmountStatusLabel && (
                    <DetailRow
                      label="Amount type"
                      value={detail.variableAmountStatusLabel}
                    />
                  )}
                </dl>
                {detail.needsAmountConfirmation && detail.needsConfirmationMessage && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                    {detail.needsConfirmationMessage}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Paid & cash status</h3>
                <dl className="grid gap-2 text-sm">
                  <DetailRow
                    label="Paid status"
                    value={detail.paymentAudit.paidStatusLabel}
                  />
                  {detail.paymentAudit.paidAtLabel && (
                    <DetailRow
                      label="Marked paid at"
                      value={detail.paymentAudit.paidAtLabel}
                    />
                  )}
                  <DetailRow
                    label="Cash deduction"
                    value={detail.paymentAudit.cashDeductionStatusLabel}
                  />
                  {detail.paymentAudit.paymentMethodLabel && (
                    <DetailRow
                      label="Payment method"
                      value={detail.paymentAudit.paymentMethodLabel}
                    />
                  )}
                  {detail.paymentAudit.hasPaymentTransaction && (
                    <>
                      {detail.paymentAudit.paymentAmountLabel && (
                        <DetailRow
                          label="Payment amount"
                          value={detail.paymentAudit.paymentAmountLabel}
                        />
                      )}
                      {detail.paymentAudit.paymentDateLabel && (
                        <DetailRow
                          label="Payment date"
                          value={detail.paymentAudit.paymentDateLabel}
                        />
                      )}
                      {detail.paymentAudit.paymentSourceLabel && (
                        <DetailRow
                          label="Payment source"
                          value={detail.paymentAudit.paymentSourceLabel}
                        />
                      )}
                      {detail.paymentAudit.paymentNotes && (
                        <div className="space-y-1">
                          <dt className="text-muted-foreground">Payment notes</dt>
                          <dd>{detail.paymentAudit.paymentNotes}</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              </section>

              {detail.isDebtLinked && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Debt context</h3>
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {detail.debtLinkedLabel && (
                      <p className="font-medium">{detail.debtLinkedLabel}</p>
                    )}
                    {detail.debtAccountArchivedLabel && (
                      <p className="font-medium text-muted-foreground">
                        {detail.debtAccountArchivedLabel}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {detail.debtManagedExplanation}
                    </p>
                    <Link to="/debt" className="mt-2 inline-block underline underline-offset-2">
                      Open Debt page
                    </Link>
                  </div>
                </section>
              )}

              {(detail.isGeneratedFromTemplate || detail.templateName) && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Recurring & template</h3>
                  <dl className="grid gap-2 text-sm">
                    {detail.templateName && (
                      <DetailRow label="Template" value={detail.templateName} />
                    )}
                    {detail.templateStatusLabel && (
                      <DetailRow
                        label="Template status"
                        value={detail.templateStatusLabel}
                      />
                    )}
                    {detail.generatedNoteLabel && (
                      <DetailRow
                        label="Generated note"
                        value={detail.generatedNoteLabel}
                      />
                    )}
                  </dl>
                  {detail.recurringEditExplanation && (
                    <p className="text-sm text-muted-foreground">
                      {detail.recurringEditExplanation}
                    </p>
                  )}
                </section>
              )}

              {detail.isVariableBill && detail.variableContextExplanation && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Variable bill</h3>
                  <p className="text-sm text-muted-foreground">
                    {detail.variableContextExplanation}
                  </p>
                </section>
              )}

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Edit & delete guidance</h3>
                <ul className="space-y-2">
                  {detail.actionGuards.map((guard) => (
                    <li
                      key={guard.action}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{guard.label}</p>
                        <Badge variant={guard.available ? "default" : "secondary"}>
                          {guard.available ? "Available" : "Unavailable"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{guard.explanation}</p>
                    </li>
                  ))}
                </ul>
                {detail.informationalGuards.length > 0 && (
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {detail.informationalGuards.map((message) => (
                      <li key={message} className="rounded-md border px-3 py-2">
                        {message}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
