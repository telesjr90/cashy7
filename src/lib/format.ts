/**
 * Splits a total amount into Teles 51% / Nicole 49% shares, rounded to cents.
 * Teles absorbs any rounding residual so the two shares always sum to the total.
 */
export function split5149(total: number): { teles: number; nicole: number } {
  const t = Math.round(total * 0.51 * 100) / 100;
  const n = Math.round((total - t) * 100) / 100;
  return { teles: t, nicole: n };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number.isFinite(amount) ? amount : 0);
}
