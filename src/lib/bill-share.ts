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
