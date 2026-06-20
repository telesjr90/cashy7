import { describe, expect, it } from "vitest";
import { isPersonInHousehold } from "./user-person";

describe("isPersonInHousehold", () => {
  const people = [{ id: "person-a" }, { id: "person-b" }];

  it("returns true when person belongs to household", () => {
    expect(isPersonInHousehold("person-a", people)).toBe(true);
  });

  it("returns false when person is outside household", () => {
    expect(isPersonInHousehold("person-c", people)).toBe(false);
  });

  it("returns false for blank person id", () => {
    expect(isPersonInHousehold("", people)).toBe(false);
  });
});
