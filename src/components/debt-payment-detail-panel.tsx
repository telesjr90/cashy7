import type { DebtPaymentDetailView } from "@/lib/debt-payment-detail";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type DebtPaymentDetailPanelProps = {
  detail: DebtPaymentDetailView | null;
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
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={align === "right" ? "text-right" : undefined}>{value}</dd>
    </div>
  );
}

export function DebtPaymentDetailPanel({
  detail,
  open,
  onOpenChange,
}: DebtPaymentDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {detail ? (
          <>
            <SheetHeader>
              <SheetTitle>{detail.title}</SheetTitle>
              <SheetDescription>{detail.subtitle}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Payment identity</h3>
                <dl className="grid gap-2 text-sm">
                  <DetailRow label="Debt account" value={detail.accountName} />
                  {detail.archivedAccountLabel && (
                    <DetailRow
                      label="Account status"
                      value={detail.archivedAccountLabel}
                    />
                  )}
                  <DetailRow label="Payment date" value={detail.paymentDateLabel} />
                  <DetailRow label="Month" value={detail.monthYearLabel} />
                  <DetailRow label="Period bucket" value={detail.periodBucketLabel} />
                  <DetailRow label="Source" value={detail.sourceLabel} />
                </dl>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Amounts</h3>
                <dl className="grid gap-2 text-sm">
                  <DetailRow label="Scheduled payment" value={detail.amountLabel} />
                  <DetailRow label="Teles" value={detail.telesAmountLabel} />
                  <DetailRow label="Nicole" value={detail.nicoleAmountLabel} />
                </dl>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Linked bill</h3>
                {detail.linkedBill.hasLinkedBill ? (
                  <dl className="grid gap-2 text-sm">
                    <DetailRow label="Bill name" value={detail.linkedBill.billNameLabel ?? "—"} />
                    <DetailRow
                      label="Due date"
                      value={detail.linkedBill.dueDateLabel ?? "—"}
                    />
                    <DetailRow
                      label="Bill paid status"
                      value={detail.linkedBill.paidStatusLabel ?? "—"}
                    />
                    <DetailRow
                      label="Bill cash deduction"
                      value={detail.linkedBill.cashDeductionStatusLabel ?? "—"}
                    />
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No linked bill instance for this payment.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {detail.linkedBill.managedFromDebtExplanation}
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Cash payment & audit</h3>
                <dl className="grid gap-2 text-sm">
                  <DetailRow
                    label="Payment status"
                    value={detail.cashAudit.paidStatusLabel}
                  />
                  <DetailRow
                    label="Cash deduction"
                    value={detail.cashAudit.cashDeductionStatusLabel}
                  />
                  {detail.cashAudit.paymentMethodLabel && (
                    <DetailRow
                      label="Payment method"
                      value={detail.cashAudit.paymentMethodLabel}
                    />
                  )}
                  {detail.cashAudit.hasVisiblePaymentTransaction && (
                    <>
                      {detail.cashAudit.paymentAmountLabel && (
                        <DetailRow
                          label="Payment amount"
                          value={detail.cashAudit.paymentAmountLabel}
                        />
                      )}
                      {detail.cashAudit.paymentDateLabel && (
                        <DetailRow
                          label="Payment date"
                          value={detail.cashAudit.paymentDateLabel}
                        />
                      )}
                      {detail.cashAudit.paymentSourceLabel && (
                        <DetailRow
                          label="Payment source"
                          value={detail.cashAudit.paymentSourceLabel}
                        />
                      )}
                      {detail.cashAudit.paymentNotes && (
                        <div className="space-y-1">
                          <dt className="text-muted-foreground">Payment notes</dt>
                          <dd>{detail.cashAudit.paymentNotes}</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
                {detail.cashAudit.privacyFallbackLabel && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {detail.cashAudit.privacyFallbackLabel}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Balance impact</h3>
                <dl className="grid gap-2 text-sm">
                  <DetailRow
                    label="Original debt amount"
                    value={detail.balanceImpact.originalAmountLabel}
                  />
                  {detail.balanceImpact.totalPaidBeforeLabel && (
                    <DetailRow
                      label="Total paid before this payment"
                      value={detail.balanceImpact.totalPaidBeforeLabel}
                    />
                  )}
                  {detail.balanceImpact.totalPaidThroughLabel && (
                    <DetailRow
                      label="Total paid through this payment"
                      value={detail.balanceImpact.totalPaidThroughLabel}
                    />
                  )}
                  {detail.balanceImpact.remainingAfterLabel && (
                    <>
                      <DetailRow
                        label={
                          detail.balanceImpact.remainingAfterCaption ??
                          "Remaining after this payment"
                        }
                        value={detail.balanceImpact.remainingAfterLabel}
                      />
                    </>
                  )}
                </dl>
                {detail.balanceImpact.balanceFallbackExplanation && (
                  <p className="text-sm text-muted-foreground">
                    {detail.balanceImpact.balanceFallbackExplanation}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Actions & guardrails</h3>
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
