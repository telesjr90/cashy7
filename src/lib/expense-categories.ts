const STORAGE_KEY_PREFIX = "cashflow-expense-categories:";

export function normalizeExpenseCategory(
  value: string | null | undefined
): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Distinct non-empty categories from RLS-visible expense rows, case-insensitive deduped. */
export function extractDistinctCategoriesFromExpenses(
  expenses: ReadonlyArray<{ category: string | null }>
): string[] {
  const seen = new Map<string, string>();

  for (const expense of expenses) {
    const normalized = normalizeExpenseCategory(expense.category);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }

  return sortCategories(Array.from(seen.values()));
}

/** Merge derived and persisted lists without duplicates (case-insensitive). */
export function mergeExpenseCategories(
  derived: readonly string[],
  persisted: readonly string[]
): string[] {
  const seen = new Map<string, string>();

  for (const category of [...derived, ...persisted]) {
    const normalized = normalizeExpenseCategory(category);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }

  return sortCategories(Array.from(seen.values()));
}

function sortCategories(categories: string[]): string[] {
  return [...categories].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
}

export function getExpenseCategoriesStorageKey(householdId: string): string {
  return `${STORAGE_KEY_PREFIX}${householdId}`;
}

export function parsePersistedExpenseCategories(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return mergeExpenseCategories(
      [],
      parsed.filter((value): value is string => typeof value === "string")
    );
  } catch {
    return [];
  }
}

export function loadPersistedExpenseCategories(householdId: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(getExpenseCategoriesStorageKey(householdId));
  return parsePersistedExpenseCategories(raw);
}

export function savePersistedExpenseCategories(
  householdId: string,
  categories: readonly string[]
): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = mergeExpenseCategories([], categories);
  localStorage.setItem(
    getExpenseCategoriesStorageKey(householdId),
    JSON.stringify(normalized)
  );
}

export function addPersistedExpenseCategory(
  householdId: string,
  category: string
): string[] {
  const normalized = normalizeExpenseCategory(category);
  if (!normalized) {
    return loadPersistedExpenseCategories(householdId);
  }

  const current = loadPersistedExpenseCategories(householdId);
  const next = mergeExpenseCategories(current, [normalized]);
  savePersistedExpenseCategories(householdId, next);
  return next;
}

export function removePersistedExpenseCategory(
  householdId: string,
  category: string
): string[] {
  const normalized = normalizeExpenseCategory(category);
  if (!normalized) {
    return loadPersistedExpenseCategories(householdId);
  }

  const key = normalized.toLowerCase();
  const current = loadPersistedExpenseCategories(householdId);
  const next = current.filter((value) => value.toLowerCase() !== key);
  savePersistedExpenseCategories(householdId, next);
  return next;
}

export function filterCategorySuggestions(
  suggestions: readonly string[],
  query: string
): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...suggestions];
  }

  return suggestions.filter((category) =>
    category.toLowerCase().includes(normalizedQuery)
  );
}
