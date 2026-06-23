/**
 * CASHFLOW-CURSOR-112 — Seed owner/member test users for two-user privacy smoke.
 *
 * Requires:
 *   CASHFLOW_ALLOW_TEST_USER_SEED=YES
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_SUPABASE_URL
 */
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_E2E_BASE_URL,
  MEMBER_CASH_AMOUNT,
  MEMBER_PAYCHECK_AMOUNT,
  MEMBER_PRIVATE_GOAL_NAME,
  OWNER_CASH_AMOUNT,
  OWNER_PAYCHECK_AMOUNT,
  OWNER_PRIVATE_GOAL_NAME,
  SHARED_GOAL_NAME,
  assertSeedAllowed,
  assertTestEmail,
  ensureAuthUser,
  ensureTmpDir,
  getActiveMembership,
  requireSupabaseConfig,
  resolveSeedCredentials,
  todayIsoDate,
  writeSeedMetadata,
  writeSmokeEnvFile,
} from "./lib/two-user-privacy-test-support.mjs";

function logSafe(message) {
  console.log(message);
}

async function ensurePeople(admin, householdId) {
  const { data: existing, error } = await admin
    .from("people")
    .select("id, name")
    .eq("household_id", householdId);

  if (error) {
    throw new Error(`Could not load people rows: ${error.message}`);
  }

  const byName = new Map((existing ?? []).map((row) => [row.name, row.id]));
  const required = [
    { name: "Teles", color: "#3b82f6" },
    { name: "Nicole", color: "#22c55e" },
  ];

  for (const person of required) {
    if (byName.has(person.name)) {
      continue;
    }

    const { data, error: insertError } = await admin
      .from("people")
      .insert({
        household_id: householdId,
        name: person.name,
        color: person.color,
      })
      .select("id, name")
      .single();

    if (insertError) {
      throw new Error(`Could not create ${person.name} profile: ${insertError.message}`);
    }

    byName.set(data.name, data.id);
  }

  return {
    telesPersonId: byName.get("Teles"),
    nicolePersonId: byName.get("Nicole"),
  };
}

async function upsertMembership(admin, input) {
  const { data: existing, error: lookupError } = await admin
    .from("household_members")
    .select("*")
    .eq("household_id", input.householdId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not look up membership: ${lookupError.message}`);
  }

  const payload = {
    household_id: input.householdId,
    user_id: input.userId,
    email: input.email,
    display_name: input.displayName,
    role: input.role,
    status: "active",
    is_owner: input.isOwner,
    is_active: true,
    person_id: input.personId,
    removed_at: null,
    removed_by: null,
  };

  if (existing) {
    const { error } = await admin
      .from("household_members")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Could not update membership for ${input.email}: ${error.message}`);
    }

    return { membershipId: existing.id, reused: true };
  }

  const { data, error } = await admin
    .from("household_members")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create membership for ${input.email}: ${error.message}`);
  }

  return { membershipId: data.id, reused: false };
}

async function ensureHouseholdSettings(admin, householdId, ownerUserId) {
  const startDate = "2026-01-01";
  const { data: existing, error: lookupError } = await admin
    .from("household_settings")
    .select("household_id")
    .eq("household_id", householdId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not load household settings: ${lookupError.message}`);
  }

  if (existing) {
    return { reused: true };
  }

  const { error } = await admin.from("household_settings").insert({
    household_id: householdId,
    cashflow_start_date: startDate,
    created_by: ownerUserId,
  });

  if (error) {
    throw new Error(`Could not create household settings: ${error.message}`);
  }

  return { reused: false };
}

async function replaceLatestCashSnapshot(admin, householdId, userId, amount, notes) {
  await admin
    .from("cash_snapshots")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("notes", notes);

  const { error } = await admin.from("cash_snapshots").insert({
    household_id: householdId,
    user_id: userId,
    amount,
    snapshot_date: todayIsoDate(),
    notes,
  });

  if (error) {
    throw new Error(`Could not create cash snapshot for ${userId}: ${error.message}`);
  }
}

async function upsertPaycheckSchedule(admin, householdId, userId, amount) {
  const payload = {
    household_id: householdId,
    user_id: userId,
    amount,
    schedule_type: "semi_monthly_15_30",
    first_pay_day: 15,
    second_pay_day: 30,
    use_last_business_day: false,
    is_active: true,
    effective_from: todayIsoDate(),
  };

  const { error } = await admin.from("paycheck_schedules").upsert(payload, {
    onConflict: "user_id",
  });

  if (error) {
    throw new Error(`Could not upsert paycheck schedule for ${userId}: ${error.message}`);
  }
}

async function ensurePrivateGoal(admin, householdId, userId, name, targetAmount) {
  const { data: existing, error: lookupError } = await admin
    .from("savings_goals")
    .select("id")
    .eq("household_id", householdId)
    .eq("created_by_user_id", userId)
    .eq("name", name)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not look up savings goal ${name}: ${lookupError.message}`);
  }

  if (existing) {
    return { goalId: existing.id, reused: true };
  }

  const { data, error } = await admin
    .from("savings_goals")
    .insert({
      household_id: householdId,
      created_by_user_id: userId,
      name,
      goal_type: "private",
      target_amount: targetAmount,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create private savings goal ${name}: ${error.message}`);
  }

  return { goalId: data.id, reused: false };
}

async function ensureSharedGoal(admin, householdId, ownerUserId) {
  const { data: existing, error: lookupError } = await admin
    .from("savings_goals")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", SHARED_GOAL_NAME)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not look up shared savings goal: ${lookupError.message}`);
  }

  if (existing) {
    return { goalId: existing.id, reused: true };
  }

  const { data, error } = await admin
    .from("savings_goals")
    .insert({
      household_id: householdId,
      created_by_user_id: ownerUserId,
      name: SHARED_GOAL_NAME,
      goal_type: "shared",
      target_amount: 5000,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create shared savings goal: ${error.message}`);
  }

  return { goalId: data.id, reused: false };
}

async function assertNoForeignActiveMembership(admin, userId, email, allowedHouseholdId) {
  const memberships = await getActiveMembership(admin, userId);
  const foreign = memberships.filter((row) => row.household_id !== allowedHouseholdId);

  if (foreign.length > 0) {
    throw new Error(
      `${email} is active in a different household (${foreign[0].household_id}). Run cleanup-two-user-privacy-test-users.mjs first.`
    );
  }
}

async function resolveHousehold(admin, creds, ownerUserId, memberUserId) {
  const ownerMemberships = await getActiveMembership(admin, ownerUserId);
  const memberMemberships = await getActiveMembership(admin, memberUserId);

  const sharedHouseholdId = ownerMemberships.find((ownerRow) =>
    memberMemberships.some(
      (memberRow) => memberRow.household_id === ownerRow.household_id
    )
  )?.household_id;

  if (sharedHouseholdId) {
    const { data, error } = await admin
      .from("households")
      .select("*")
      .eq("id", sharedHouseholdId)
      .single();

    if (error) {
      throw new Error(`Could not load shared household: ${error.message}`);
    }

    return { household: data, reused: true };
  }

  if (ownerMemberships.length > 0 || memberMemberships.length > 0) {
    throw new Error(
      "Owner and member are not in the same active household. Run cleanup-two-user-privacy-test-users.mjs before reseeding."
    );
  }

  const { data, error } = await admin
    .from("households")
    .insert({
      name: creds.householdName,
      owner_id: ownerUserId,
      created_by: ownerUserId,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not create test household: ${error.message}`);
  }

  return { household: data, reused: false };
}

async function main() {
  assertSeedAllowed();
  const { supabaseUrl, serviceRoleKey } = requireSupabaseConfig();
  const creds = resolveSeedCredentials();

  assertTestEmail(creds.ownerEmail, "Owner email");
  assertTestEmail(creds.memberEmail, "Member email");

  if (creds.ownerEmail.toLowerCase() === creds.memberEmail.toLowerCase()) {
    throw new Error("Owner and member emails must be different.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  logSafe("Seeding C112 two-user privacy test users...");

  const ownerAuth = await ensureAuthUser(admin, creds.ownerEmail, creds.ownerPassword);
  const memberAuth = await ensureAuthUser(admin, creds.memberEmail, creds.memberPassword);

  const { household, reused: householdReused } = await resolveHousehold(
    admin,
    creds,
    ownerAuth.userId,
    memberAuth.userId
  );

  await assertNoForeignActiveMembership(
    admin,
    ownerAuth.userId,
    creds.ownerEmail,
    household.id
  );
  await assertNoForeignActiveMembership(
    admin,
    memberAuth.userId,
    creds.memberEmail,
    household.id
  );

  const { telesPersonId, nicolePersonId } = await ensurePeople(admin, household.id);

  await upsertMembership(admin, {
    householdId: household.id,
    userId: ownerAuth.userId,
    email: creds.ownerEmail,
    displayName: "C112 Owner Test",
    role: "owner",
    isOwner: true,
    personId: telesPersonId,
  });

  await upsertMembership(admin, {
    householdId: household.id,
    userId: memberAuth.userId,
    email: creds.memberEmail,
    displayName: "C112 Member Test",
    role: "member",
    isOwner: false,
    personId: nicolePersonId,
  });

  await ensureHouseholdSettings(admin, household.id, ownerAuth.userId);

  await replaceLatestCashSnapshot(
    admin,
    household.id,
    ownerAuth.userId,
    OWNER_CASH_AMOUNT,
    "C112 owner privacy fixture"
  );
  await replaceLatestCashSnapshot(
    admin,
    household.id,
    memberAuth.userId,
    MEMBER_CASH_AMOUNT,
    "C112 member privacy fixture"
  );

  await upsertPaycheckSchedule(
    admin,
    household.id,
    ownerAuth.userId,
    OWNER_PAYCHECK_AMOUNT
  );
  await upsertPaycheckSchedule(
    admin,
    household.id,
    memberAuth.userId,
    MEMBER_PAYCHECK_AMOUNT
  );

  await ensurePrivateGoal(
    admin,
    household.id,
    ownerAuth.userId,
    OWNER_PRIVATE_GOAL_NAME,
    1500
  );
  await ensurePrivateGoal(
    admin,
    household.id,
    memberAuth.userId,
    MEMBER_PRIVATE_GOAL_NAME,
    1800
  );
  await ensureSharedGoal(admin, household.id, ownerAuth.userId);

  ensureTmpDir();
  writeSmokeEnvFile({
    ownerEmail: creds.ownerEmail,
    ownerPassword: creds.ownerPassword,
    memberEmail: creds.memberEmail,
    memberPassword: creds.memberPassword,
    baseUrl: creds.baseUrl || DEFAULT_E2E_BASE_URL,
  });

  writeSeedMetadata({
    version: 1,
    householdId: household.id,
    householdName: household.name,
    ownerEmail: creds.ownerEmail,
    memberEmail: creds.memberEmail,
    ownerUserId: ownerAuth.userId,
    memberUserId: memberAuth.userId,
    seededAt: new Date().toISOString(),
    householdReused,
    ownerAuthCreated: ownerAuth.created,
    memberAuthCreated: memberAuth.created,
  });

  logSafe("");
  logSafe("C112 test-user seed complete.");
  logSafe(`Owner test email: ${creds.ownerEmail}`);
  logSafe(`Member test email: ${creds.memberEmail}`);
  logSafe(`Household: ${household.name} (${householdReused ? "reused" : "created"})`);
  logSafe(`Smoke env file: .tmp/c112-two-user-smoke.env`);
  logSafe("Passwords were written to the smoke env file only.");
  if (!creds.ownerPasswordProvided || !creds.memberPasswordProvided) {
    logSafe("Generated passwords were not printed.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
