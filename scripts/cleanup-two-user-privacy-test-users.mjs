/**
 * CASHFLOW-CURSOR-112 — Cleanup seeded two-user privacy test data.
 *
 * Dry-run by default. Set CASHFLOW_CONFIRM_TEST_USER_CLEANUP=YES to delete.
 */
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_HOUSEHOLD_NAME,
  DEFAULT_MEMBER_EMAIL,
  DEFAULT_OWNER_EMAIL,
  assertSeedAllowed,
  assertTestEmail,
  findUserByEmail,
  readSeedMetadata,
  requireSupabaseConfig,
} from "./lib/two-user-privacy-test-support.mjs";

function resolveTargetEmails() {
  const metadata = readSeedMetadata();
  return {
    ownerEmail: process.env.CASHFLOW_OWNER_EMAIL?.trim() || metadata?.ownerEmail || DEFAULT_OWNER_EMAIL,
    memberEmail:
      process.env.CASHFLOW_MEMBER_EMAIL?.trim() || metadata?.memberEmail || DEFAULT_MEMBER_EMAIL,
    householdId: metadata?.householdId ?? null,
    householdName: metadata?.householdName || DEFAULT_HOUSEHOLD_NAME,
  };
}

async function main() {
  assertSeedAllowed();
  const { supabaseUrl, serviceRoleKey } = requireSupabaseConfig();
  const targets = resolveTargetEmails();
  const destructive = process.env.CASHFLOW_CONFIRM_TEST_USER_CLEANUP === "YES";

  assertTestEmail(targets.ownerEmail, "Owner email");
  assertTestEmail(targets.memberEmail, "Member email");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const ownerUser = await findUserByEmail(admin, targets.ownerEmail);
  const memberUser = await findUserByEmail(admin, targets.memberEmail);

  let household = null;
  if (targets.householdId) {
    const { data } = await admin
      .from("households")
      .select("id, name, owner_id")
      .eq("id", targets.householdId)
      .maybeSingle();
    household = data;
  }

  if (!household) {
    const { data } = await admin
      .from("households")
      .select("id, name, owner_id")
      .eq("name", targets.householdName)
      .maybeSingle();
    household = data;
  }

  console.log("C112 two-user privacy test cleanup summary");
  console.log(`Mode: ${destructive ? "DELETE" : "DRY RUN"}`);
  console.log(`Owner email: ${targets.ownerEmail}${ownerUser ? " (found)" : " (missing)"}`);
  console.log(`Member email: ${targets.memberEmail}${memberUser ? " (found)" : " (missing)"}`);
  console.log(
    `Household: ${household ? `${household.name} (${household.id})` : "not found"}`
  );

  if (!destructive) {
    console.log("");
    console.log("Dry run only. Set CASHFLOW_CONFIRM_TEST_USER_CLEANUP=YES to delete test data.");
    return;
  }

  if (household) {
    const { error: householdError } = await admin
      .from("households")
      .delete()
      .eq("id", household.id);

    if (householdError) {
      throw new Error(`Could not delete test household: ${householdError.message}`);
    }

    console.log(`Deleted household ${household.name}.`);
  }

  for (const user of [ownerUser, memberUser]) {
    if (!user) {
      continue;
    }

    const deleteResult = await admin.auth.admin.deleteUser(user.id);
    if (deleteResult.error) {
      throw new Error(
        `Could not delete auth user ${user.email}: ${deleteResult.error.message}`
      );
    }

    console.log(`Deleted auth user ${user.email}.`);
  }

  console.log("Cleanup complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
