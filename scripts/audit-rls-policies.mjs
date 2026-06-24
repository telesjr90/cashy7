#!/usr/bin/env node
/**
 * CASHFLOW-CURSOR-127 — offline migration RLS policy audit.
 * Parses supabase/migrations SQL; does not require live DB or service role.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

const EXPECTED_TABLES = [
  "households",
  "household_members",
  "household_invitations",
  "people",
  "household_settings",
  "bills",
  "bill_instances",
  "debt_accounts",
  "debt_payments",
  "manual_expenses",
  "cash_snapshots",
  "cash_payment_transactions",
  "cash_adjustment_transactions",
  "savings_goals",
  "savings_goal_participants",
  "savings_contributions",
  "paycheck_schedules",
  "import_batches",
  "import_batch_records",
  "receipt_uploads",
  "receipt_candidates",
];

const TABLE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
const RLS_RE =
  /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi;
const POLICY_RE =
  /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z_.]+)/gi;
const STORAGE_POLICY_RE =
  /create\s+policy\s+"([^"]+)"\s+on\s+storage\.objects/gi;
const TRUE_POLICY_RE =
  /(?:using|with\s+check)\s*\(\s*true\s*\)/gi;

function addToMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(value);
}

async function loadMigrationSql() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const chunks = await Promise.all(
    files.map(async (file) => ({
      file,
      sql: await readFile(path.join(MIGRATIONS_DIR, file), "utf8"),
    }))
  );

  return chunks;
}

function scanMigrations(chunks) {
  const tablesCreated = new Set();
  const rlsEnabled = new Set();
  const policiesByTable = new Map();
  const storagePolicies = new Set();
  const riskyTruePolicies = [];
  const helperFunctions = new Set();

  for (const { file, sql } of chunks) {
    for (const match of sql.matchAll(TABLE_RE)) {
      tablesCreated.add(match[1]);
    }

    for (const match of sql.matchAll(RLS_RE)) {
      rlsEnabled.add(match[1]);
    }

    for (const match of sql.matchAll(POLICY_RE)) {
      const [, policyName, tableName] = match;
      addToMap(policiesByTable, tableName, policyName);
    }

    for (const match of sql.matchAll(STORAGE_POLICY_RE)) {
      storagePolicies.add(match[1]);
    }

    if (TRUE_POLICY_RE.test(sql)) {
      riskyTruePolicies.push(file);
    }
    TRUE_POLICY_RE.lastIndex = 0;

    if (/get_my_household_id/i.test(sql)) {
      helperFunctions.add("get_my_household_id");
    }
    if (/is_my_household_owner/i.test(sql)) {
      helperFunctions.add("is_my_household_owner");
    }
  }

  return {
    tablesCreated,
    rlsEnabled,
    policiesByTable,
    storagePolicies,
    riskyTruePolicies,
    helperFunctions,
  };
}

function reportMissingRls(expectedTables, rlsEnabled, policiesByTable) {
  const warnings = [];

  for (const table of expectedTables) {
    if (!rlsEnabled.has(table)) {
      warnings.push(`MISSING_RLS_ENABLE: public.${table}`);
      continue;
    }

    const policies = policiesByTable.get(table);
    if (!policies || policies.size === 0) {
      warnings.push(`MISSING_POLICIES: public.${table}`);
    }
  }

  return warnings;
}

function printSection(title) {
  console.log(`\n## ${title}`);
}

async function main() {
  const chunks = await loadMigrationSql();
  const scan = scanMigrations(chunks);
  const warnings = reportMissingRls(
    EXPECTED_TABLES,
    scan.rlsEnabled,
    scan.policiesByTable
  );

  printSection("Migration files");
  console.log(chunks.map((chunk) => chunk.file).join("\n"));

  printSection("Tables created (public schema mentions)");
  console.log([...scan.tablesCreated].sort().join(", "));

  printSection("RLS enabled");
  console.log([...scan.rlsEnabled].sort().join(", "));

  printSection("Policies by table");
  for (const table of [...scan.policiesByTable.keys()].sort()) {
    const policies = [...scan.policiesByTable.get(table)].sort();
    console.log(`${table}: ${policies.join(", ")}`);
  }

  printSection("Storage policies (storage.objects)");
  console.log([...scan.storagePolicies].sort().join(", ") || "(none)");

  printSection("RLS helper functions referenced");
  console.log([...scan.helperFunctions].sort().join(", ") || "(none)");

  printSection("Risk scan: using(true) / with check(true)");
  if (scan.riskyTruePolicies.length === 0) {
    console.log("None found in app migrations.");
  } else {
    console.log(scan.riskyTruePolicies.join(", "));
  }

  printSection("Warnings");
  if (warnings.length === 0) {
    console.log("None — all expected app tables have RLS enabled and at least one policy.");
  } else {
    for (const warning of warnings) {
      console.log(warning);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nAudit script: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
