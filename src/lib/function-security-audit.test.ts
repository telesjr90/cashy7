import { describe, expect, it } from "vitest";
import {
  ALL_DATABASE_FUNCTIONS,
  assertAllFunctionsClassified,
  buildFunctionSecurityExpectations,
  classifyFunctionSecurity,
  countFunctionGaps,
  detectFrontendRpcReferences,
  functionAuditLabelContainsSecrets,
  parseFunctionsFromMigrationSql,
} from "./function-security-audit";

describe("function-security-audit registry", () => {
  it("classifies every database function without duplicates", () => {
    expect(() => assertAllFunctionsClassified()).not.toThrow();
    expect(ALL_DATABASE_FUNCTIONS).toHaveLength(8);
    expect(buildFunctionSecurityExpectations()).toHaveLength(8);
  });

  it("has no unresolved GAP rows after hardening migration 033", () => {
    expect(countFunctionGaps()).toBe(0);
  });

  it("labels do not include secrets or raw UUIDs", () => {
    for (const row of buildFunctionSecurityExpectations()) {
      const label = `${row.name} ${row.notes ?? ""} ${row.expectedCallers}`;
      expect(functionAuditLabelContainsSecrets(label)).toBe(false);
    }
  });
});

describe("parseFunctionsFromMigrationSql", () => {
  it("flags SECURITY DEFINER without search_path", () => {
    const sql = `
      create or replace function public.unsafe_example()
      returns void
      language plpgsql
      security definer
      as $$
      begin
        null;
      end;
      $$;
    `;
    const parsed = parseFunctionsFromMigrationSql(sql, "test.sql");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].securityDefiner).toBe(true);
    expect(parsed[0].hasSearchPath).toBe(false);
  });

  it("passes SECURITY DEFINER with safe search_path", () => {
    const sql = `
      create or replace function public.safe_example()
      returns uuid
      language sql
      stable
      security definer
      set search_path = ''
      as $$
        select auth.uid();
      $$;
    `;
    const parsed = parseFunctionsFromMigrationSql(sql, "test.sql");
    expect(parsed[0].securityDefiner).toBe(true);
    expect(parsed[0].hasSearchPath).toBe(true);
    expect(parsed[0].searchPathValue).toBe("");
  });

  it("classifies SECURITY INVOKER/default trigger functions", () => {
    const sql = `
      create or replace function public.set_updated_at()
      returns trigger
      language plpgsql
      set search_path = ''
      as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$;
    `;
    const classified = classifyFunctionSecurity(sql);
    expect(classified.securityDefiner).toBe(false);
    expect(classified.isTrigger).toBe(true);
    expect(classified.hasSearchPath).toBe(true);
  });

  it("detects grant execute to authenticated", () => {
    const sql = `
      create or replace function public.pay_source_from_current_cash(
        p_source_type text,
        p_source_id uuid,
        p_amount numeric,
        p_notes text default null
      )
      returns json
      language plpgsql
      security definer
      set search_path = ''
      as $$ begin null; end; $$;
      revoke all on function public.pay_source_from_current_cash(text, uuid, numeric, text) from public;
      grant execute on function public.pay_source_from_current_cash(text, uuid, numeric, text) to authenticated;
    `;
    const parsed = parseFunctionsFromMigrationSql(sql, "test.sql");
    expect(parsed[0].grantAuthenticated).toBe(true);
    expect(parsed[0].revokePublic).toBe(true);
    expect(parsed[0].grantPublic).toBe(false);
  });
});

describe("detectFrontendRpcReferences", () => {
  it("detects supabase.rpc references", () => {
    const refs = detectFrontendRpcReferences([
      {
        path: "src/lib/payments.ts",
        content: `await supabase.rpc("pay_source_from_current_cash", { });`,
      },
      {
        path: "src/lib/cash-adjustments.ts",
        content: `await supabase.rpc(\n    "credit_manual_expense_adjustment_to_current_cash",\n    { }\n  );`,
      },
    ]);
    expect(refs.map((ref) => ref.rpcName).sort()).toEqual([
      "credit_manual_expense_adjustment_to_current_cash",
      "pay_source_from_current_cash",
    ]);
  });
});
