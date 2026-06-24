#!/usr/bin/env node
/**
 * CASHFLOW-CURSOR-128 — offline database function / SECURITY DEFINER audit.
 * Parses supabase/migrations SQL and src RPC references; no live DB required.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SRC_DIR = path.join(ROOT, "src");

const EXPECTED_FUNCTIONS = [
  "get_my_household_id",
  "is_my_household_owner",
  "set_updated_at",
  "set_household_settings_created_by",
  "set_household_invitations_updated_at",
  "prevent_paid_manual_expense_delete",
  "pay_source_from_current_cash",
  "credit_manual_expense_adjustment_to_current_cash",
];

const FUNCTION_HEADER_RE =
  /create\s+or\s+replace\s+function\s+(?:(\w+)\.)?(\w+)\s*\(/gi;
const SECURITY_DEFINER_RE = /\bsecurity\s+definer\b/i;
const SEARCH_PATH_RE = /\bset\s+search_path\s*=\s*('[^']*'|[^\s;]+)/i;
const RETURNS_TRIGGER_RE = /\breturns\s+trigger\b/i;
const GRANT_AUTHENTICATED_RE =
  /grant\s+execute\s+on\s+function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+to\s+authenticated/gi;
const GRANT_PUBLIC_RE =
  /grant\s+execute\s+on\s+function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+to\s+public/gi;
const RPC_REFERENCE_RE = /\.rpc\s*\(\s*["'`](\w+)["'`]/g;
const EDGE_INVOKE_RE = /\.functions\.invoke\s*\(\s*["'`]([^"'`]+)["'`]/g;
const EDGE_INVOKE_CONST_RE =
  /const\s+(\w+)\s*=\s*["'`]([^"'`]+)["'`][\s\S]*?\.functions\.invoke\s*\(\s*\1/g;

function extractFunctionBody(sql, startIndex) {
  const slice = sql.slice(startIndex);
  const dollarMatch = slice.match(/\bas\s+\$\$(\w*)\$\$/i);
  if (!dollarMatch || dollarMatch.index === undefined) {
    const endSemi = sql.indexOf(";", startIndex);
    return endSemi === -1 ? sql.slice(startIndex) : sql.slice(startIndex, endSemi);
  }

  const tag = dollarMatch[1];
  const bodyStart = startIndex + dollarMatch.index + dollarMatch[0].length;
  const closing = `$${tag}$`;
  const bodyEnd = sql.indexOf(closing, bodyStart);
  if (bodyEnd === -1) {
    return sql.slice(startIndex);
  }
  return sql.slice(startIndex, bodyEnd + closing.length);
}

function parseFunctionsFromSql(sql, migrationFile) {
  const functions = [];
  const grantAuth = new Set();
  const grantPublic = new Set();

  for (const match of sql.matchAll(GRANT_AUTHENTICATED_RE)) {
    grantAuth.add(match[1]);
  }
  for (const match of sql.matchAll(GRANT_PUBLIC_RE)) {
    grantPublic.add(match[1]);
  }

  FUNCTION_HEADER_RE.lastIndex = 0;
  let headerMatch;
  while ((headerMatch = FUNCTION_HEADER_RE.exec(sql)) !== null) {
    const name = headerMatch[2];
    const block = extractFunctionBody(sql, headerMatch.index);
    const searchPathMatch = block.match(SEARCH_PATH_RE);
    functions.push({
      name,
      migrationFile,
      securityDefiner: SECURITY_DEFINER_RE.test(block),
      hasSearchPath: SEARCH_PATH_RE.test(block),
      searchPathValue: searchPathMatch?.[1]?.replace(/^'|'$/g, "") ?? null,
      isTrigger: RETURNS_TRIGGER_RE.test(block),
      grantAuthenticated: grantAuth.has(name),
      grantPublic: grantPublic.has(name),
    });
  }

  return functions;
}

async function loadMigrationSql() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      sql: await readFile(path.join(MIGRATIONS_DIR, file), "utf8"),
    }))
  );
}

async function walkSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSourceFiles(fullPath)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function loadFrontendSources() {
  const files = await walkSourceFiles(SRC_DIR);
  return Promise.all(
    files.map(async (file) => ({
      path: path.relative(ROOT, file).replace(/\\/g, "/"),
      content: await readFile(file, "utf8"),
    }))
  );
}

function detectRpcReferences(sources) {
  const refs = [];
  const seen = new Set();
  for (const source of sources) {
    RPC_REFERENCE_RE.lastIndex = 0;
    let match;
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

function detectEdgeInvokes(sources) {
  const refs = [];
  const seen = new Set();
  for (const source of sources) {
    EDGE_INVOKE_RE.lastIndex = 0;
    let match;
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

function findRlsHelperReferences(chunks) {
  const refs = new Set();
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

function printSection(title) {
  console.log(`\n## ${title}`);
}

async function main() {
  const chunks = await loadMigrationSql();
  const sources = await loadFrontendSources();
  const byName = new Map();

  for (const chunk of chunks) {
    for (const fn of parseFunctionsFromSql(chunk.sql, chunk.file)) {
      const existing = byName.get(fn.name);
      if (!existing) {
        byName.set(fn.name, fn);
        continue;
      }
      byName.set(fn.name, {
        ...fn,
        grantAuthenticated: existing.grantAuthenticated || fn.grantAuthenticated,
        grantPublic: existing.grantPublic || fn.grantPublic,
      });
    }
  }

  const functions = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const rpcRefs = detectRpcReferences(sources);
  const edgeRefs = detectEdgeInvokes(sources);
  const rlsHelpers = findRlsHelperReferences(chunks);

  const securityDefiner = functions.filter((fn) => fn.securityDefiner);
  const missingSearchPath = securityDefiner
    .filter((fn) => !fn.hasSearchPath)
    .map((fn) => fn.name);
  const clientCallable = functions
    .filter((fn) => fn.grantAuthenticated)
    .map((fn) => fn.name);
  const missingExpected = EXPECTED_FUNCTIONS.filter(
    (name) => !byName.has(name)
  );

  const gaps = [];
  for (const name of missingSearchPath) {
    gaps.push(`SECURITY_DEFINER_MISSING_SEARCH_PATH:${name}`);
  }
  for (const name of missingExpected) {
    gaps.push(`EXPECTED_FUNCTION_MISSING:${name}`);
  }
  for (const ref of rpcRefs) {
    if (!byName.has(ref.rpcName)) {
      gaps.push(`FRONTEND_RPC_NOT_IN_MIGRATIONS:${ref.rpcName}`);
    }
    const fn = byName.get(ref.rpcName);
    if (fn?.grantPublic) {
      gaps.push(`RPC_GRANTED_TO_PUBLIC:${ref.rpcName}`);
    }
  }

  printSection("Migration files");
  console.log(chunks.map((chunk) => chunk.file).join("\n"));

  printSection("Functions found (latest definition per name)");
  for (const fn of functions) {
    const flags = [
      fn.securityDefiner ? "SECURITY DEFINER" : "invoker/default",
      fn.hasSearchPath ? `search_path=${fn.searchPathValue ?? "set"}` : "no search_path",
      fn.isTrigger ? "trigger" : "callable",
      fn.grantAuthenticated ? "grant:authenticated" : "no client grant",
    ];
    console.log(`${fn.name} (${fn.migrationFile}) — ${flags.join("; ")}`);
  }

  printSection("SECURITY DEFINER functions");
  console.log(
    securityDefiner.map((fn) => fn.name).join(", ") || "(none)"
  );

  printSection("SECURITY DEFINER missing search_path");
  if (missingSearchPath.length === 0) {
    console.log("None.");
  } else {
    console.log(missingSearchPath.join(", "));
  }

  printSection("Client-callable functions (grant execute authenticated)");
  console.log(clientCallable.join(", ") || "(none)");

  printSection("RLS helper functions referenced in migrations");
  console.log(rlsHelpers.join(", ") || "(none)");

  printSection("Frontend supabase.rpc references");
  if (rpcRefs.length === 0) {
    console.log("(none)");
  } else {
    for (const ref of rpcRefs) {
      console.log(`${ref.rpcName} ← ${ref.sourceFile}`);
    }
  }

  printSection("Frontend functions.invoke references");
  if (edgeRefs.length === 0) {
    console.log("(none)");
  } else {
    for (const ref of edgeRefs) {
      console.log(`${ref.functionName} ← ${ref.sourceFile}`);
    }
  }

  printSection("Summary counts");
  console.log(`functions found: ${functions.length}`);
  console.log(`security definer: ${securityDefiner.length}`);
  console.log(`trigger functions: ${functions.filter((fn) => fn.isTrigger).length}`);
  console.log(`client callable: ${clientCallable.length}`);
  console.log(`frontend rpc refs: ${rpcRefs.length}`);
  console.log(`frontend edge invokes: ${edgeRefs.length}`);
  console.log(`gaps: ${gaps.length}`);

  printSection("Gaps");
  if (gaps.length === 0) {
    console.log("None.");
    console.log("\nAudit script: PASS");
    return;
  }

  for (const gap of gaps) {
    console.log(gap);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
