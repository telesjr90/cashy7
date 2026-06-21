import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  addPersistedExpenseCategory,
  extractDistinctCategoriesFromExpenses,
  filterCategorySuggestions,
  getExpenseCategoriesStorageKey,
  loadPersistedExpenseCategories,
  mergeExpenseCategories,
  normalizeExpenseCategory,
  parsePersistedExpenseCategories,
  removePersistedExpenseCategory,
  savePersistedExpenseCategories,
} from "@/lib/expense-categories";

describe("normalizeExpenseCategory", () => {
  it("returns null for empty, null, or whitespace", () => {
    expect(normalizeExpenseCategory(null)).toBeNull();
    expect(normalizeExpenseCategory(undefined)).toBeNull();
    expect(normalizeExpenseCategory("")).toBeNull();
    expect(normalizeExpenseCategory("   ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeExpenseCategory("  Food  ")).toBe("Food");
  });
});

describe("extractDistinctCategoriesFromExpenses", () => {
  it("returns sorted distinct non-empty categories", () => {
    const result = extractDistinctCategoriesFromExpenses([
      { category: "Transport" },
      { category: "Food" },
      { category: "food" },
      { category: null },
      { category: "  Household  " },
      { category: "" },
    ]);

    expect(result).toEqual(["Food", "Household", "Transport"]);
  });

  it("returns empty array when no categories exist", () => {
    expect(extractDistinctCategoriesFromExpenses([{ category: null }])).toEqual(
      []
    );
  });
});

describe("mergeExpenseCategories", () => {
  it("merges derived and persisted without duplicates", () => {
    expect(
      mergeExpenseCategories(["Food", "Transport"], ["food", "Utilities"])
    ).toEqual(["Food", "Transport", "Utilities"]);
  });

  it("ignores empty values", () => {
    expect(mergeExpenseCategories(["Food"], ["", "  "])).toEqual(["Food"]);
  });
});

describe("filterCategorySuggestions", () => {
  const suggestions = ["Food", "Transport", "Household"];

  it("returns all suggestions when query is empty", () => {
    expect(filterCategorySuggestions(suggestions, "")).toEqual(suggestions);
  });

  it("filters case-insensitively by substring", () => {
    expect(filterCategorySuggestions(suggestions, "oo")).toEqual(["Food"]);
    expect(filterCategorySuggestions(suggestions, "HOUSE")).toEqual([
      "Household",
    ]);
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("persisted expense categories", () => {
  const householdId = "household-test-063";

  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses household-scoped storage key", () => {
    expect(getExpenseCategoriesStorageKey(householdId)).toBe(
      "cashflow-expense-categories:household-test-063"
    );
  });

  it("parses invalid persisted JSON safely", () => {
    expect(parsePersistedExpenseCategories("not-json")).toEqual([]);
    expect(parsePersistedExpenseCategories('{"bad": true}')).toEqual([]);
  });

  it("adds, loads, and removes persisted categories", () => {
    expect(loadPersistedExpenseCategories(householdId)).toEqual([]);

    expect(addPersistedExpenseCategory(householdId, "  Dining  ")).toEqual([
      "Dining",
    ]);
    expect(loadPersistedExpenseCategories(householdId)).toEqual(["Dining"]);

    savePersistedExpenseCategories(householdId, ["Food", "food", "Travel"]);
    expect(loadPersistedExpenseCategories(householdId)).toEqual([
      "Food",
      "Travel",
    ]);

    expect(removePersistedExpenseCategory(householdId, "FOOD")).toEqual([
      "Travel",
    ]);
  });
});
