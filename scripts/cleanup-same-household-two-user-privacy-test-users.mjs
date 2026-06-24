/**
 * CASHFLOW-CURSOR-130 — Cleanup seeded same-household privacy test data.
 *
 * Dry-run by default. Set CASHFLOW_CONFIRM_SAME_HOUSEHOLD_TEST_CLEANUP=YES to delete.
 */
import { createClient } from "@supabase/supabase-js";
import {
  C130_TEST_EMAILS,
  HOUSEHOLD_NAME,
  assertC130TestEmail,
  assertSameHouseholdCleanupAllowed,
  findUserByEmail,
  loadRootEnvFile,
  readSeedMetadata,
  requireSupabaseConfig,
} from "./lib/two-user-privacy-v2-test-support.mjs";

function resolveTargets() {
  const metadata = readSeedMetadata();
  return {
    emails: C130_TEST_EMAILS,
    householdId: metadata?.householdId ?? null,
    householdName: metadata?.householdName ?? HOUSEHOLD_NAME,
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
  const destructive = assertSameHouseholdCleanupAllowed();

  for (const email of targets.emails) {
    assertC130TestEmail(email, "Cleanup target email");
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
    console.log("C130 same-household privacy test cleanup summary");
    console.log("Mode: DRY RUN (metadata only — service role unavailable)");
    console.log(`Household id (metadata): ${targets.householdId ?? "unknown"}`);
    for (const email of targets.emails) {
      console.log(`Would delete auth user: ${email}`);
    }
    console.log("");
    console.log(
      "Dry run only. Set CASHFLOW_CONFIRM_SAME_HOUSEHOLD_TEST_CLEANUP=YES to delete C130 test data."
    );
    return;
  }

  const household = await summarizeHousehold(
    admin,
    targets.householdId,
    targets.householdName
  );

  const authUsers = [];
  for (const email of targets.emails) {
    const user = await findUserByEmail(admin, email);
    authUsers.push({ email, user });
  }

  console.log("C130 same-household privacy test cleanup summary");
  console.log(`Mode: ${destructive ? "DELETE" : "DRY RUN"}`);
  console.log(
    `Household: ${household ? `${household.name} (${household.id})` : "not found"}`
  );

  for (const { email, user } of authUsers) {
    console.log(`Auth user ${email}: ${user ? user.id : "missing"}`);
  }

  if (household) {
    console.log("");
    console.log("Fixture row counts (service role):");
    for (const table of [
      "bills",
      "bill_instances",
      "manual_expenses",
      "cash_snapshots",
      "cash_payment_transactions",
      "receipt_uploads",
      "savings_goals",
      "household_invitations",
    ]) {
      console.log(`  ${table}: ${await countFixtureRows(admin, household.id, table)}`);
    }
  }

  if (!destructive) {
    console.log("");
    console.log(
      "Dry run only. Set CASHFLOW_CONFIRM_SAME_HOUSEHOLD_TEST_CLEANUP=YES to delete C130 test data."
    );
    return;
  }

  if (household) {
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

  console.log("C130 cleanup complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
