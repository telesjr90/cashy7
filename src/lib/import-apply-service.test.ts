import { describe, expect, it } from "vitest";
import {
  canUserApplyImport,
  IMPORT_OWNER_ONLY_COPY,
} from "./import-apply";
import { sanitizeApplyImportErrorMessage } from "./import-apply-service";

describe("import apply service helpers", () => {
  it("sanitizes raw UUID database errors for user-facing text", () => {
    const message = sanitizeApplyImportErrorMessage(
      "insert failed for id 00000000-0000-4000-8000-000000000001"
    );
    expect(message).not.toMatch(/00000000-0000-4000-8000-000000000001/);
  });

  it("blocks non-owner apply at permission layer", () => {
    expect(canUserApplyImport({ role: "member", is_owner: false })).toBe(false);
    expect(IMPORT_OWNER_ONLY_COPY).toContain("owner");
  });
});
