/**
 * CASHFLOW-CURSOR-128 — static function / SECURITY DEFINER audit registry.
 * Mirrors migration-defined database functions; does not query live Supabase.
 */

export type FunctionAuditResult = "PASS" | "GAP" | "NOT_APPLICABLE";

export interface ParsedMigrationFunction {
  name: string;
  schema: string;
  migrationFile: string;
  securityDefiner: boolean;
  securityInvoker: boolean;
  hasSearchPath: boolean;
  searchPathValue: string | null;
  isTrigger: boolean;
  grantAuthenticated: boolean;
  grantPublic: boolean;
  grantServiceRole: boolean;
  revokePublic: boolean;
}

export interface FunctionSecurityExpectation {
  name: string;
  location: string;
  callableFromClient: boolean;
  securityDefiner: boolean;
  searchPathSet: boolean | "not_applicable";
  readsPrivateData: boolean;
  writesPrivateData: boolean;
  writesSharedData: boolean;
  usesAuthUid: boolean;
  verifiesHouseholdMembership: boolean;
  verifiesOwnerRole: boolean;
  grantsExecute: string;
  expectedCallers: string;
  auditResult: FunctionAuditResult;
  notes?: string;
}

export interface FrontendRpcReference {
  rpcName: string;
  sourceFile: string;
}

export interface FrontendEdgeInvokeReference {
  functionName: string;
  sourceFile: string;
}

export interface FunctionSecurityScanSummary {
  functionsFound: number;
  securityDefinerFunctions: number;
  securityDefinerMissingSearchPath: string[];
  triggerFunctions: number;
  clientCallableFunctions: string[];
  rlsHelperFunctions: string[];
  frontendRpcReferences: FrontendRpcReference[];
  frontendEdgeInvokes: FrontendEdgeInvokeReference[];
  gaps: string[];
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const SECRET_PATTERN =
  /service[_-]?role|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.|supabase_service_role/i;

const FUNCTION_HEADER_RE =
  /create\s+or\s+replace\s+function\s+(?:(\w+)\.)?(\w+)\s*\(/gi;

const SECURITY_DEFINER_RE = /\bsecurity\s+definer\b/i;
const SECURITY_INVOKER_RE = /\bsecurity\s+invoker\b/i;
const SEARCH_PATH_RE = /\bset\s+search_path\s*=\s*('[^']*'|[^\s;]+)/i;
const RETURNS_TRIGGER_RE = /\breturns\s+trigger\b/i;

const GRANT_AUTHENTICATED_RE =
  /grant\s+execute\s+on\s+function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+to\s+authenticated/gi;
const GRANT_PUBLIC_RE =
  /grant\s+execute\s+on\s+function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+to\s+public/gi;
const GRANT_SERVICE_ROLE_RE =
  /grant\s+execute\s+on\s+function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+to\s+service_role/gi;
const REVOKE_PUBLIC_RE =
  /revoke\s+all\s+on\s+function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+from\s+public/gi;

const RPC_REFERENCE_RE = /\.rpc\s*\(\s*["'`](\w+)["'`]/g;
const EDGE_INVOKE_RE = /\.functions\.invoke\s*\(\s*["'`]([^"'`]+)["'`]/g;
const EDGE_INVOKE_CONST_RE =
  /const\s+(\w+)\s*=\s*["'`]([^"'`]+)["'`][\s\S]*?\.functions\.invoke\s*\(\s*\1/g;

export const ALL_DATABASE_FUNCTIONS = [
  "get_my_household_id",
  "is_my_household_owner",
  "set_updated_at",
  "set_household_settings_created_by",
  "set_household_invitations_updated_at",
  "prevent_paid_manual_expense_delete",
  "pay_source_from_current_cash",
  "credit_manual_expense_adjustment_to_current_cash",
] as const;

export const RLS_HELPER_FUNCTIONS = [
  "get_my_household_id",
  "is_my_household_owner",
] as const;

export const CLIENT_RPC_FUNCTIONS = [
  "pay_source_from_current_cash",
  "credit_manual_expense_adjustment_to_current_cash",
] as const;

export const EDGE_FUNCTION_NAMES = [
  "invite-household-member",
  "manage-household-members",
  "accept-household-invite",
  "extract-receipt",
] as const;

function extractFunctionBody(sql: string, startIndex: number): string {
  const dollarMatch = sql.slice(startIndex).match(/\bas\s+\$\$(\w*)\$\$/i);
  if (!dollarMatch || dollarMatch.index === undefined) {
    const endSemi = sql.indexOf(";", startIndex);
    return endSemi === -1 ? sql.slice(startIndex) : sql.slice(startIndex, endSemi);
  }

  const tag = dollarMatch[1];
  const bodyStart =
    startIndex + dollarMatch.index + dollarMatch[0].length;
  const closing = `$${tag}$`;
  const bodyEnd = sql.indexOf(closing, bodyStart);
  if (bodyEnd === -1) {
    return sql.slice(startIndex);
  }

  return sql.slice(startIndex, bodyEnd + closing.length);
}

export function parseFunctionsFromMigrationSql(
  sql: string,
  migrationFile: string
): ParsedMigrationFunction[] {
  const functions: ParsedMigrationFunction[] = [];
  const grantAuth = new Set<string>();
  const grantPublic = new Set<string>();
  const grantService = new Set<string>();
  const revokePublic = new Set<string>();

  for (const match of sql.matchAll(GRANT_AUTHENTICATED_RE)) {
    grantAuth.add(match[1]);
  }
  for (const match of sql.matchAll(GRANT_PUBLIC_RE)) {
    grantPublic.add(match[1]);
  }
  for (const match of sql.matchAll(GRANT_SERVICE_ROLE_RE)) {
    grantService.add(match[1]);
  }
  for (const match of sql.matchAll(REVOKE_PUBLIC_RE)) {
    revokePublic.add(match[1]);
  }

  FUNCTION_HEADER_RE.lastIndex = 0;
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = FUNCTION_HEADER_RE.exec(sql)) !== null) {
    const schema = headerMatch[1] ?? "public";
    const name = headerMatch[2];
    const block = extractFunctionBody(sql, headerMatch.index);

    const searchPathMatch = block.match(SEARCH_PATH_RE);
    functions.push({
      name,
      schema,
      migrationFile,
      securityDefiner: SECURITY_DEFINER_RE.test(block),
      securityInvoker: SECURITY_INVOKER_RE.test(block),
      hasSearchPath: SEARCH_PATH_RE.test(block),
      searchPathValue: searchPathMatch?.[1]?.replace(/^'|'$/g, "") ?? null,
      isTrigger: RETURNS_TRIGGER_RE.test(block),
      grantAuthenticated: grantAuth.has(name),
      grantPublic: grantPublic.has(name),
      grantServiceRole: grantService.has(name),
      revokePublic: revokePublic.has(name),
    });
  }

  return functions;
}

export function mergeParsedFunctions(
  chunks: ReadonlyArray<{ file: string; sql: string }>
): ParsedMigrationFunction[] {
  const byName = new Map<string, ParsedMigrationFunction>();
  for (const chunk of chunks) {
    for (const fn of parseFunctionsFromMigrationSql(chunk.sql, chunk.file)) {
      const existing = byName.get(fn.name);
      if (!existing) {
        byName.set(fn.name, fn);
        continue;
      }
      byName.set(fn.name, {
        ...fn,
        grantAuthenticated: existing.grantAuthenticated || fn.grantAuthenticated,
        grantPublic: existing.grantPublic || fn.grantPublic,
        grantServiceRole: existing.grantServiceRole || fn.grantServiceRole,
        revokePublic: existing.revokePublic || fn.revokePublic,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function detectFrontendRpcReferences(
  sources: ReadonlyArray<{ path: string; content: string }>
): FrontendRpcReference[] {
  const refs: FrontendRpcReference[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    RPC_REFERENCE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RPC_REFERENCE_RE.exec(source.content)) !== null) {
      const key = `${match[1]}:${source.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ rpcName: match[1], sourceFile: source.path });
      }
    }
  }

  return refs.sort((a, b) => a.rpcName.localeCompare(b.rpcName));
}

export function detectFrontendEdgeInvokes(
  sources: ReadonlyArray<{ path: string; content: string }>
): FrontendEdgeInvokeReference[] {
  const refs: FrontendEdgeInvokeReference[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    EDGE_INVOKE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EDGE_INVOKE_RE.exec(source.content)) !== null) {
      const key = `${match[1]}:${source.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ functionName: match[1], sourceFile: source.path });
      }
    }

    EDGE_INVOKE_CONST_RE.lastIndex = 0;
    while ((match = EDGE_INVOKE_CONST_RE.exec(source.content)) !== null) {
      const fnName = match[2];
      const key = `${fnName}:${source.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ functionName: fnName, sourceFile: source.path });
      }
    }
  }

  return refs.sort((a, b) => a.functionName.localeCompare(b.functionName));
}

export function findRlsPolicyFunctionReferences(
  chunks: ReadonlyArray<{ file: string; sql: string }>
): string[] {
  const refs = new Set<string>();
  for (const chunk of chunks) {
    if (/get_my_household_id\s*\(/i.test(chunk.sql)) {
      refs.add("get_my_household_id");
    }
    if (/is_my_household_owner\s*\(/i.test(chunk.sql)) {
      refs.add("is_my_household_owner");
    }
  }
  return [...refs].sort();
}

export function buildFunctionSecurityExpectations(): FunctionSecurityExpectation[] {
  return [
    {
      name: "get_my_household_id",
      location: "20260618000000_009_complete_baseline_contract.sql",
      callableFromClient: true,
      securityDefiner: true,
      searchPathSet: true,
      readsPrivateData: false,
      writesPrivateData: false,
      writesSharedData: false,
      usesAuthUid: true,
      verifiesHouseholdMembership: true,
      verifiesOwnerRole: false,
      grantsExecute: "revoke public; grant authenticated, service_role",
      expectedCallers: "RLS policies; SECURITY DEFINER RPCs",
      auditResult: "PASS",
      notes: "Active member only (status=active, is_active=true).",
    },
    {
      name: "is_my_household_owner",
      location: "20260622000002_022_household_settings_owner_only.sql",
      callableFromClient: true,
      securityDefiner: true,
      searchPathSet: true,
      readsPrivateData: false,
      writesPrivateData: false,
      writesSharedData: false,
      usesAuthUid: true,
      verifiesHouseholdMembership: true,
      verifiesOwnerRole: true,
      grantsExecute: "revoke public; grant authenticated, service_role",
      expectedCallers: "RLS owner policies; client indirect via RLS",
      auditResult: "PASS",
      notes: "Requires active membership and owner role.",
    },
    {
      name: "set_updated_at",
      location: "20260618000000_009_complete_baseline_contract.sql",
      callableFromClient: false,
      securityDefiner: false,
      searchPathSet: true,
      readsPrivateData: false,
      writesPrivateData: false,
      writesSharedData: false,
      usesAuthUid: false,
      verifiesHouseholdMembership: false,
      verifiesOwnerRole: false,
      grantsExecute: "trigger-only (no execute grant)",
      expectedCallers: "BEFORE UPDATE triggers",
      auditResult: "PASS",
    },
    {
      name: "set_household_settings_created_by",
      location: "20260619000000_010_cashflow_start_and_cash_snapshots.sql",
      callableFromClient: false,
      securityDefiner: false,
      searchPathSet: true,
      readsPrivateData: false,
      writesPrivateData: false,
      writesSharedData: false,
      usesAuthUid: true,
      verifiesHouseholdMembership: false,
      verifiesOwnerRole: false,
      grantsExecute: "trigger-only",
      expectedCallers: "household_settings BEFORE INSERT trigger",
      auditResult: "PASS",
      notes: "Sets created_by from auth.uid() when null.",
    },
    {
      name: "set_household_invitations_updated_at",
      location: "20260623000008_030_household_invitations.sql; hardened 033",
      callableFromClient: false,
      securityDefiner: false,
      searchPathSet: true,
      readsPrivateData: false,
      writesPrivateData: false,
      writesSharedData: false,
      usesAuthUid: false,
      verifiesHouseholdMembership: false,
      verifiesOwnerRole: false,
      grantsExecute: "trigger-only",
      expectedCallers: "household_invitations BEFORE UPDATE trigger",
      auditResult: "PASS",
      notes: "Migration 033 adds set search_path = ''.",
    },
    {
      name: "prevent_paid_manual_expense_delete",
      location: "20260619000006_016_prevent_paid_manual_expense_delete.sql",
      callableFromClient: false,
      securityDefiner: true,
      searchPathSet: true,
      readsPrivateData: true,
      writesPrivateData: false,
      writesSharedData: false,
      usesAuthUid: false,
      verifiesHouseholdMembership: false,
      verifiesOwnerRole: false,
      grantsExecute: "trigger-only",
      expectedCallers: "manual_expenses BEFORE DELETE trigger",
      auditResult: "PASS",
      notes: "Blocks delete when cash_payment_transactions reference expense.",
    },
    {
      name: "pay_source_from_current_cash",
      location:
        "20260619000005_015_payment_actions_foundation.sql; 020; hardened 033",
      callableFromClient: true,
      securityDefiner: true,
      searchPathSet: true,
      readsPrivateData: true,
      writesPrivateData: true,
      writesSharedData: true,
      usesAuthUid: true,
      verifiesHouseholdMembership: true,
      verifiesOwnerRole: false,
      grantsExecute: "revoke public; grant authenticated",
      expectedCallers: "payments.ts, bills/debt/expenses/savings pages",
      auditResult: "PASS",
      notes:
        "Migration 033 validates bill_instance/debt/manual/savings sources before cash deduction.",
    },
    {
      name: "credit_manual_expense_adjustment_to_current_cash",
      location: "20260619000008_018_cash_credit_adjustments.sql; hardened 033",
      callableFromClient: true,
      securityDefiner: true,
      searchPathSet: true,
      readsPrivateData: true,
      writesPrivateData: true,
      writesSharedData: false,
      usesAuthUid: true,
      verifiesHouseholdMembership: true,
      verifiesOwnerRole: false,
      grantsExecute: "revoke public; grant authenticated",
      expectedCallers: "cash-adjustments.ts",
      auditResult: "PASS",
      notes:
        "Migration 033 adds shared-or-own-user check on adjustment expense.",
    },
  ];
}

export function assertAllFunctionsClassified(): void {
  const expected = buildFunctionSecurityExpectations().map((row) => row.name);
  const missing = ALL_DATABASE_FUNCTIONS.filter(
    (name) => !expected.includes(name)
  );
  const extra = expected.filter(
    (name) => !(ALL_DATABASE_FUNCTIONS as readonly string[]).includes(name)
  );
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Function registry mismatch. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`
    );
  }
}

export function countFunctionGaps(
  expectations: FunctionSecurityExpectation[] = buildFunctionSecurityExpectations()
): number {
  return expectations.filter((row) => row.auditResult === "GAP").length;
}

export function analyzeFunctionSecurity(input: {
  parsedFunctions: ParsedMigrationFunction[];
  frontendRpcReferences: FrontendRpcReference[];
  rlsHelperReferences: string[];
}): FunctionSecurityScanSummary {
  const securityDefiner = input.parsedFunctions.filter((fn) => fn.securityDefiner);
  const securityDefinerMissingSearchPath = securityDefiner
    .filter((fn) => !fn.hasSearchPath)
    .map((fn) => fn.name);

  const clientCallable = input.parsedFunctions
    .filter((fn) => fn.grantAuthenticated)
    .map((fn) => fn.name);

  const gaps: string[] = [];
  for (const name of securityDefinerMissingSearchPath) {
    gaps.push(`SECURITY_DEFINER_MISSING_SEARCH_PATH:${name}`);
  }

  for (const ref of input.frontendRpcReferences) {
    const parsed = input.parsedFunctions.find((fn) => fn.name === ref.rpcName);
    if (!parsed) {
      gaps.push(`FRONTEND_RPC_NOT_IN_MIGRATIONS:${ref.rpcName}`);
      continue;
    }
    if (parsed.grantPublic) {
      gaps.push(`RPC_GRANTED_TO_PUBLIC:${ref.rpcName}`);
    }
  }

  return {
    functionsFound: input.parsedFunctions.length,
    securityDefinerFunctions: securityDefiner.length,
    securityDefinerMissingSearchPath,
    triggerFunctions: input.parsedFunctions.filter((fn) => fn.isTrigger).length,
    clientCallableFunctions: clientCallable,
    rlsHelperFunctions: input.rlsHelperReferences,
    frontendRpcReferences: input.frontendRpcReferences,
    frontendEdgeInvokes: [],
    gaps,
  };
}

export function functionAuditLabelContainsSecrets(label: string): boolean {
  return SECRET_PATTERN.test(label) || UUID_PATTERN.test(label);
}

export function classifyFunctionSecurity(
  block: string
): Pick<
  ParsedMigrationFunction,
  "securityDefiner" | "securityInvoker" | "hasSearchPath" | "isTrigger"
> {
  return {
    securityDefiner: SECURITY_DEFINER_RE.test(block),
    securityInvoker: SECURITY_INVOKER_RE.test(block),
    hasSearchPath: SEARCH_PATH_RE.test(block),
    isTrigger: RETURNS_TRIGGER_RE.test(block),
  };
}
