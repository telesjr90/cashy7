/**
 * Splits a total amount into Teles 51% / Nicole 49% shares, rounded to cents.
 * Teles absorbs any rounding residual so the two shares always sum to the total.
 */
export function split5149(total: number): { teles: number; nicole: number } {
  const t = Math.round(total * 0.51 * 100) / 100;
  const n = Math.round((total - t) * 100) / 100;
  return { teles: t, nicole: n };
}

const CAD_SYMBOL = "CA" + String.fromCharCode(36);

export function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const body = CAD_SYMBOL + formatted;
  return value < 0 ? "-" + body : body;
}
