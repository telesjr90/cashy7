export type BillShareKey = "teles_amount" | "nicole_amount";

const PERSON_NAME_TO_SHARE_KEY: Record<string, BillShareKey> = {
  teles: "teles_amount",
  nicole: "nicole_amount",
};

function normalizePersonName(name: string): string {
  return name.trim().toLowerCase();
}

export function resolveBillShareKeyForPerson(
  person: { name: string } | null | undefined
): BillShareKey | null {
  if (!person?.name?.trim()) {
    return null;
  }

  return PERSON_NAME_TO_SHARE_KEY[normalizePersonName(person.name)] ?? null;
}

function toSafeNumber(value: number | string): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function getMyBillShareAmount(
  bill: { teles_amount: number | string; nicole_amount: number | string },
  shareKey: BillShareKey | null
): number | null {
  if (!shareKey) {
    return null;
  }

  return toSafeNumber(bill[shareKey]);
}

type BillSharePeriodBucket = "1_14" | "15_eom";
type BillSharePeriodView = BillSharePeriodBucket | "full";

type BillShareInput = {
  period_bucket: BillSharePeriodBucket;
  teles_amount: number | string;
  nicole_amount: number | string;
};

/** Sum the signed-in user's bill share for the selected dashboard period view. */
export function sumMyBillShareTotal(
  bills: BillShareInput[],
  shareKey: BillShareKey | null,
  periodView: BillSharePeriodView
): number | null {
  if (!shareKey) {
    return null;
  }

  const periodBills =
    periodView === "full"
      ? bills
      : bills.filter((bill) => bill.period_bucket === periodView);

  return periodBills.reduce((sum, bill) => {
    const amount = getMyBillShareAmount(bill, shareKey);
    return amount === null ? sum : sum + amount;
  }, 0);
}
