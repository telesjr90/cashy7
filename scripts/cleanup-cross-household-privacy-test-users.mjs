/**
 * CASHFLOW-CURSOR-129 — Cleanup seeded cross-household privacy test data.
 *
 * Dry-run by default. Set CASHFLOW_CONFIRM_CROSS_HOUSEHOLD_TEST_CLEANUP=YES to delete.
 */
import { createClient } from "@supabase/supabase-js";
import {
  C129_TEST_EMAILS,
  HOUSEHOLD_A_NAME,
  HOUSEHOLD_B_NAME,
  assertC129TestEmail,
  assertCrossHouseholdCleanupAllowed,
  findUserByEmail,
  loadRootEnvFile,
  readSeedMetadata,
  requireSupabaseConfig,
} from "./lib/cross-household-privacy-test-support.mjs";

function resolveTargets() {
  const metadata = readSeedMetadata();
  return {
    emails: C129_TEST_EMAILS,
    householdAId: metadata?.householdA?.householdId ?? null,
    householdBId: metadata?.householdB?.householdId ?? null,
    householdAName: metadata?.householdA?.householdName ?? HOUSEHOLD_A_NAME,
    householdBName: metadata?.householdB?.householdName ?? HOUSEHOLD_B_NAME,
  };
}

async function summarizeHousehold(admin, householdId, fallbackName) {
  if (!householdId) {
    const { data } = await admin
      .from("households")
      .select("id, name, owner_id")
      .eq("name", fallbackName)
      .maybeSingle();
    return data;
  }

  const { data } = await admin
    .from("households")
    .select("id, name, owner_id")
    .eq("id", householdId)
    .maybeSingle();

  return data;
}

async function countFixtureRows(admin, householdId, table) {
  if (!householdId) {
    return 0;
  }

  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);

  if (error) {
    return `error: ${error.message}`;
  }

  return count ?? 0;
}

async function main() {
  loadRootEnvFile();
  const targets = resolveTargets();
  const destructive = assertCrossHouseholdCleanupAllowed();

  for (const email of targets.emails) {
    assertC129TestEmail(email, "Cleanup target email");
  }

  let admin = null;
  try {
    const config = requireSupabaseConfig();
    admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch (error) {
    if (destructive) {
      throw error;
    }
    console.log("C129 cross-household privacy test cleanup summary");
    console.log("Mode: DRY RUN (metadata only — service role unavailable)");
    console.log(`Household A id (metadata): ${targets.householdAId ?? "unknown"}`);
    console.log(`Household B id (metadata): ${targets.householdBId ?? "unknown"}`);
    for (const email of targets.emails) {
      console.log(`Would delete auth user: ${email}`);
    }
    console.log("");
    console.log(
      "Dry run only. Set CASHFLOW_CONFIRM_CROSS_HOUSEHOLD_TEST_CLEANUP=YES to delete C129 test data."
    );
    return;
  }

  const householdA = await summarizeHousehold(
    admin,
    targets.householdAId,
    targets.householdAName
  );
  const householdB = await summarizeHousehold(
    admin,
    targets.householdBId,
    targets.householdBName
  );

  const authUsers = [];
  for (const email of targets.emails) {
    const user = await findUserByEmail(admin, email);
    authUsers.push({ email, user });
  }

  console.log("C129 cross-household privacy test cleanup summary");
  console.log(`Mode: ${destructive ? "DELETE" : "DRY RUN"}`);
  console.log(
    `Household A: ${householdA ? `${householdA.name} (${householdA.id})` : "not found"}`
  );
  console.log(
    `Household B: ${householdB ? `${householdB.name} (${householdB.id})` : "not found"}`
  );

  for (const { email, user } of authUsers) {
    console.log(`Auth user ${email}: ${user ? user.id : "missing"}`);
  }

  if (householdA) {
    console.log("");
    console.log("Household A fixture row counts (service role):");
    for (const table of [
      "bills",
      "bill_instances",
      "manual_expenses",
      "cash_snapshots",
      "receipt_uploads",
    ]) {
      console.log(`  ${table}: ${await countFixtureRows(admin, householdA.id, table)}`);
    }
  }

  if (householdB) {
    console.log("");
    console.log("Household B fixture row counts (service role):");
    for (const table of [
      "bills",
      "bill_instances",
      "manual_expenses",
      "cash_snapshots",
      "receipt_uploads",
    ]) {
      console.log(`  ${table}: ${await countFixtureRows(admin, householdB.id, table)}`);
    }
  }

  if (!destructive) {
    console.log("");
    console.log(
      "Dry run only. Set CASHFLOW_CONFIRM_CROSS_HOUSEHOLD_TEST_CLEANUP=YES to delete C129 test data."
    );
    return;
  }

  for (const household of [householdA, householdB]) {
    if (!household) {
      continue;
    }

    const { error } = await admin.from("households").delete().eq("id", household.id);
    if (error) {
      throw new Error(`Could not delete household ${household.name}: ${error.message}`);
    }

    console.log(`Deleted household ${household.name}.`);
  }

  for (const { email, user } of authUsers) {
    if (!user) {
      continue;
    }

    const deleteResult = await admin.auth.admin.deleteUser(user.id);
    if (deleteResult.error) {
      throw new Error(
        `Could not delete auth user ${email}: ${deleteResult.error.message}`
      );
    }

    console.log(`Deleted auth user ${email}.`);
  }

  console.log("C129 cleanup complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
