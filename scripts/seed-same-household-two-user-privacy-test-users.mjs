/**
 * CASHFLOW-CURSOR-130 — Seed same-household two-user privacy test fixtures.
 *
 * Requires:
 *   CASHFLOW_ALLOW_SAME_HOUSEHOLD_TEST_SEED=YES
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_SUPABASE_URL
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  HOUSEHOLD_NAME,
  INVITED_EMAIL,
  LABEL_MEMBER_CASH_AUDIT,
  LABEL_MEMBER_PRIVATE_CASH,
  LABEL_MEMBER_PRIVATE_EXPENSE,
  LABEL_MEMBER_RECEIPT,
  LABEL_MEMBER_RECEIPT_CANDIDATE,
  LABEL_MEMBER_SAVINGS,
  LABEL_OWNER_CASH_AUDIT,
  LABEL_OWNER_PRIVATE_CASH,
  LABEL_OWNER_PRIVATE_EXPENSE,
  LABEL_OWNER_RECEIPT,
  LABEL_OWNER_RECEIPT_CANDIDATE,
  LABEL_OWNER_SAVINGS,
  LABEL_REMOVED_PRIVATE_CASH,
  LABEL_SHARED_BILL,
  LABEL_SHARED_EXPENSE,
  MEMBER_CASH_AMOUNT,
  MEMBER_EMAIL,
  MEMBER_PAYCHECK_AMOUNT,
  OWNER_CASH_AMOUNT,
  OWNER_EMAIL,
  OWNER_PAYCHECK_AMOUNT,
  REMOVED_CASH_AMOUNT,
  REMOVED_EMAIL,
  assertC130TestEmail,
  assertSameHouseholdSeedAllowed,
  ensureAuthUser,
  ensureTmpDir,
  getActiveMembership,
  requireSupabaseConfig,
  resolveSeedCredentials,
  todayIsoDate,
  writeSeedMetadata,
  writeSmokeEnvFile,
} from "./lib/two-user-privacy-v2-test-support.mjs";

function logSafe(message) {
  console.log(message);
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
    status: input.status ?? "active",
    is_owner: input.isOwner,
    is_active: input.isActive ?? true,
    person_id: input.personId ?? null,
    removed_at: input.removedAt ?? null,
    removed_by: input.removedBy ?? null,
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

async function ensureHouseholdSettings(admin, householdId, ownerUserId) {
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
    cashflow_start_date: "2026-01-01",
    created_by: ownerUserId,
  });

  if (error) {
    throw new Error(`Could not create household settings: ${error.message}`);
  }

  return { reused: false };
}

async function replaceCashSnapshot(admin, householdId, userId, amount, notes) {
  await admin
    .from("cash_snapshots")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("notes", notes);

  const { data, error } = await admin
    .from("cash_snapshots")
    .insert({
      household_id: householdId,
      user_id: userId,
      amount,
      snapshot_date: todayIsoDate(),
      notes,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create cash snapshot: ${error.message}`);
  }

  return data.id;
}

async function upsertPaycheckSchedule(admin, householdId, userId, amount) {
  const { error } = await admin.from("paycheck_schedules").upsert(
    {
      household_id: householdId,
      user_id: userId,
      amount,
      schedule_type: "semi_monthly_15_30",
      first_pay_day: 15,
      second_pay_day: 30,
      use_last_business_day: false,
      is_active: true,
      effective_from: todayIsoDate(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`Could not upsert paycheck schedule: ${error.message}`);
  }
}

async function ensureBillFixture(admin, householdId) {
  const { data: existing, error: lookupError } = await admin
    .from("bills")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", LABEL_SHARED_BILL)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not look up bill: ${lookupError.message}`);
  }

  let billId = existing?.id;
  if (!billId) {
    const { data, error } = await admin
      .from("bills")
      .insert({
        household_id: householdId,
        name: LABEL_SHARED_BILL,
        category: "other",
        default_amount: 130.0,
        period_bucket: "1_14",
        recurring: true,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create shared bill: ${error.message}`);
    }
    billId = data.id;
  }

  const { data: instanceExisting, error: instanceLookupError } = await admin
    .from("bill_instances")
    .select("id")
    .eq("household_id", householdId)
    .eq("bill_id", billId)
    .eq("name", LABEL_SHARED_BILL)
    .maybeSingle();

  if (instanceLookupError) {
    throw new Error(`Could not look up bill instance: ${instanceLookupError.message}`);
  }

  if (instanceExisting) {
    return { billId, billInstanceId: instanceExisting.id };
  }

  const { data: instance, error: instanceError } = await admin
    .from("bill_instances")
    .insert({
      household_id: householdId,
      bill_id: billId,
      year: 2026,
      month: 6,
      period_bucket: "1_14",
      name: LABEL_SHARED_BILL,
      amount: 130.0,
      teles_amount: 66.3,
      nicole_amount: 63.7,
      due_date: "2026-06-14",
      is_paid: false,
      paid_status: "unpaid",
    })
    .select("id")
    .single();

  if (instanceError) {
    throw new Error(`Could not create bill instance: ${instanceError.message}`);
  }

  return { billId, billInstanceId: instance.id };
}

async function ensureDebtFixture(admin, householdId) {
  const accountName = "C130 SHARED DEBT ACCOUNT";
  const { data: existingAccount, error: accountLookupError } = await admin
    .from("debt_accounts")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", accountName)
    .maybeSingle();

  if (accountLookupError) {
    throw new Error(`Could not look up debt account: ${accountLookupError.message}`);
  }

  let debtAccountId = existingAccount?.id;
  if (!debtAccountId) {
    const { data, error } = await admin
      .from("debt_accounts")
      .insert({
        household_id: householdId,
        name: accountName,
        original_amount: 1300,
        current_balance: 900,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create debt account: ${error.message}`);
    }
    debtAccountId = data.id;
  }

  const { data: existingPayment, error: paymentLookupError } = await admin
    .from("debt_payments")
    .select("id")
    .eq("household_id", householdId)
    .eq("debt_account_id", debtAccountId)
    .eq("year", 2026)
    .eq("month", 6)
    .maybeSingle();

  if (paymentLookupError) {
    throw new Error(`Could not look up debt payment: ${paymentLookupError.message}`);
  }

  if (existingPayment) {
    return { debtAccountId, debtPaymentId: existingPayment.id };
  }

  const { data: payment, error: paymentError } = await admin
    .from("debt_payments")
    .insert({
      household_id: householdId,
      debt_account_id: debtAccountId,
      payment_date: "2026-06-14",
      month: 6,
      year: 2026,
      period_bucket: "1_14",
      total_payment: 130,
      teles_amount: 66.3,
      nicole_amount: 63.7,
      paid_status: false,
    })
    .select("id")
    .single();

  if (paymentError) {
    throw new Error(`Could not create debt payment: ${paymentError.message}`);
  }

  return { debtAccountId, debtPaymentId: payment.id };
}

async function ensureManualExpenseFixtures(admin, householdId, ownerUserId, memberUserId) {
  async function upsertExpense(description, payload) {
    const { data: existing, error: lookupError } = await admin
      .from("manual_expenses")
      .select("id")
      .eq("household_id", householdId)
      .eq("description", description)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Could not look up manual expense ${description}: ${lookupError.message}`);
    }

    if (existing) {
      return existing.id;
    }

    const { data, error } = await admin
      .from("manual_expenses")
      .insert({ household_id: householdId, ...payload, description })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create manual expense ${description}: ${error.message}`);
    }

    return data.id;
  }

  const sharedExpenseId = await upsertExpense(LABEL_SHARED_EXPENSE, {
    created_by_user_id: ownerUserId,
    expense_scope: "shared",
    amount: 45.5,
    expense_date: todayIsoDate(),
    period_bucket: "1_14",
    split_type: "equal",
    teles_amount: 22.75,
    nicole_amount: 22.75,
    is_paid: false,
  });

  const ownerPrivateExpenseId = await upsertExpense(LABEL_OWNER_PRIVATE_EXPENSE, {
    created_by_user_id: ownerUserId,
    expense_scope: "private",
    amount: 13.01,
    expense_date: todayIsoDate(),
    period_bucket: "1_14",
    split_type: "personal",
    teles_amount: 13.01,
    nicole_amount: 0,
    is_paid: false,
  });

  const memberPrivateExpenseId = await upsertExpense(LABEL_MEMBER_PRIVATE_EXPENSE, {
    created_by_user_id: memberUserId,
    expense_scope: "private",
    amount: 13.02,
    expense_date: todayIsoDate(),
    period_bucket: "1_14",
    split_type: "personal",
    teles_amount: 0,
    nicole_amount: 13.02,
    is_paid: false,
  });

  return { sharedExpenseId, ownerPrivateExpenseId, memberPrivateExpenseId };
}

async function ensureSavingsFixtures(admin, householdId, userId, goalName, contributionNotes) {
  const { data: goalExisting, error: goalLookupError } = await admin
    .from("savings_goals")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", goalName)
    .maybeSingle();

  if (goalLookupError) {
    throw new Error(`Could not look up savings goal: ${goalLookupError.message}`);
  }

  let goalId = goalExisting?.id;
  if (!goalId) {
    const { data, error } = await admin
      .from("savings_goals")
      .insert({
        household_id: householdId,
        created_by_user_id: userId,
        name: goalName,
        goal_type: "private",
        target_amount: 1300,
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create savings goal: ${error.message}`);
    }
    goalId = data.id;
  }

  const { data: participantExisting, error: participantLookupError } = await admin
    .from("savings_goal_participants")
    .select("id")
    .eq("savings_goal_id", goalId)
    .eq("user_id", userId)
    .maybeSingle();

  if (participantLookupError) {
    throw new Error(`Could not look up savings participant: ${participantLookupError.message}`);
  }

  let participantId = participantExisting?.id;
  if (!participantId) {
    const { data, error } = await admin
      .from("savings_goal_participants")
      .insert({
        savings_goal_id: goalId,
        household_id: householdId,
        user_id: userId,
        target_contribution_amount: 130,
        contribution_period: "monthly",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create savings participant: ${error.message}`);
    }
    participantId = data.id;
  }

  const { data: contributionExisting, error: contributionLookupError } = await admin
    .from("savings_contributions")
    .select("id")
    .eq("savings_goal_id", goalId)
    .eq("user_id", userId)
    .eq("notes", contributionNotes)
    .maybeSingle();

  if (contributionLookupError) {
    throw new Error(`Could not look up savings contribution: ${contributionLookupError.message}`);
  }

  let contributionId = contributionExisting?.id;
  if (!contributionId) {
    const { data, error } = await admin
      .from("savings_contributions")
      .insert({
        savings_goal_id: goalId,
        household_id: householdId,
        user_id: userId,
        amount: 13,
        contribution_date: todayIsoDate(),
        notes: contributionNotes,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create savings contribution: ${error.message}`);
    }
    contributionId = data.id;
  }

  return { goalId, participantId, contributionId };
}

async function ensureImportFixtures(admin, householdId, ownerUserId) {
  const fileName = "C130 import.csv";
  const { data: batchExisting, error: batchLookupError } = await admin
    .from("import_batches")
    .select("id")
    .eq("household_id", householdId)
    .eq("source_file_name", fileName)
    .maybeSingle();

  if (batchLookupError) {
    throw new Error(`Could not look up import batch: ${batchLookupError.message}`);
  }

  let batchId = batchExisting?.id;
  if (!batchId) {
    const { data, error } = await admin
      .from("import_batches")
      .insert({
        household_id: householdId,
        created_by: ownerUserId,
        source_file_name: fileName,
        source_file_kind: "csv",
        status: "applied",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create import batch: ${error.message}`);
    }
    batchId = data.id;
  }

  const { data: recordExisting, error: recordLookupError } = await admin
    .from("import_batch_records")
    .select("id")
    .eq("import_batch_id", batchId)
    .eq("row_type", "bill")
    .maybeSingle();

  if (recordLookupError) {
    throw new Error(`Could not look up import batch record: ${recordLookupError.message}`);
  }

  if (recordExisting) {
    return { batchId, recordId: recordExisting.id };
  }

  const { data, error } = await admin
    .from("import_batch_records")
    .insert({
      household_id: householdId,
      import_batch_id: batchId,
      source_sheet_name: "Sheet1",
      source_row_number: 2,
      row_type: "bill",
      target_table: "bills",
      target_id: crypto.randomUUID(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create import batch record: ${error.message}`);
  }

  return { batchId, recordId: data.id };
}

async function ensureReceiptFixtures(admin, householdId, userId, receiptLabel, candidateLabel) {
  const fileName = `${receiptLabel}.pdf`;
  const storagePath = `${userId}/c130-${receiptLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`;

  const { data: uploadExisting, error: uploadLookupError } = await admin
    .from("receipt_uploads")
    .select("id")
    .eq("household_id", householdId)
    .eq("original_file_name", fileName)
    .maybeSingle();

  if (uploadLookupError) {
    throw new Error(`Could not look up receipt upload: ${uploadLookupError.message}`);
  }

  let uploadId = uploadExisting?.id;
  if (!uploadId) {
    const { data, error } = await admin
      .from("receipt_uploads")
      .insert({
        household_id: householdId,
        uploaded_by: userId,
        storage_bucket: "receipt-uploads",
        storage_path: storagePath,
        original_file_name: fileName,
        mime_type: "application/pdf",
        size_bytes: 1024,
        status: "uploaded",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create receipt upload metadata: ${error.message}`);
    }
    uploadId = data.id;
  }

  const { data: candidateExisting, error: candidateLookupError } = await admin
    .from("receipt_candidates")
    .select("id")
    .eq("receipt_upload_id", uploadId)
    .maybeSingle();

  if (candidateLookupError) {
    throw new Error(`Could not look up receipt candidate: ${candidateLookupError.message}`);
  }

  let candidateId = candidateExisting?.id;
  if (!candidateId) {
    const { data, error } = await admin
      .from("receipt_candidates")
      .insert({
        household_id: householdId,
        receipt_upload_id: uploadId,
        created_by: userId,
        status: "pending",
        merchant: candidateLabel,
        total_amount: 13.99,
        source_status: "extracted",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create receipt candidate: ${error.message}`);
    }
    candidateId = data.id;
  }

  return { uploadId, candidateId };
}

async function ensureCashPaymentFixture(
  admin,
  householdId,
  userId,
  billInstanceId,
  notes
) {
  const { data: existingBySource, error: sourceLookupError } = await admin
    .from("cash_payment_transactions")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("source_type", "bill_instance")
    .eq("source_id", billInstanceId)
    .maybeSingle();

  if (sourceLookupError) {
    throw new Error(`Could not look up cash payment transaction: ${sourceLookupError.message}`);
  }

  if (existingBySource) {
    return existingBySource.id;
  }

  const { data: existing, error: lookupError } = await admin
    .from("cash_payment_transactions")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("notes", notes)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not look up cash payment transaction: ${lookupError.message}`);
  }

  if (existing) {
    return existing.id;
  }

  const { data: snapshot, error: snapshotError } = await admin
    .from("cash_snapshots")
    .select("id, amount")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError || !snapshot) {
    throw new Error(`Could not load cash snapshot for payment fixture (${userId})`);
  }

  const { data: newSnapshot, error: newSnapshotError } = await admin
    .from("cash_snapshots")
    .insert({
      household_id: householdId,
      user_id: userId,
      amount: Number(snapshot.amount) - 1,
      snapshot_date: todayIsoDate(),
      notes: `${notes} deduction snapshot`,
    })
    .select("id")
    .single();

  if (newSnapshotError) {
    throw new Error(`Could not create payment snapshot: ${newSnapshotError.message}`);
  }

  const { data: payment, error: paymentError } = await admin
    .from("cash_payment_transactions")
    .insert({
      household_id: householdId,
      user_id: userId,
      source_type: "bill_instance",
      source_id: billInstanceId,
      amount: 1,
      previous_cash_snapshot_id: snapshot.id,
      new_cash_snapshot_id: newSnapshot.id,
      notes,
    })
    .select("id")
    .single();

  if (paymentError) {
    throw new Error(`Could not create cash payment transaction: ${paymentError.message}`);
  }

  return payment.id;
}

async function ensurePendingInvitation(admin, householdId, ownerUserId, email) {
  const { data: existing, error: lookupError } = await admin
    .from("household_invitations")
    .select("id")
    .eq("household_id", householdId)
    .eq("email", email)
    .eq("status", "invited")
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not look up invitation: ${lookupError.message}`);
  }

  if (existing) {
    return existing.id;
  }

  const { data, error } = await admin
    .from("household_invitations")
    .insert({
      household_id: householdId,
      email,
      role: "member",
      status: "invited",
      invited_by: ownerUserId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create invitation: ${error.message}`);
  }

  return data.id;
}

async function assertNoForeignActiveMembership(admin, userId, email, allowedHouseholdId) {
  const memberships = await getActiveMembership(admin, userId);
  const foreign = memberships.filter((row) => row.household_id !== allowedHouseholdId);

  if (foreign.length > 0) {
    throw new Error(
      `${email} is active in a different household (${foreign[0].household_id}). Run cleanup first.`
    );
  }
}

async function resolveHousehold(admin, ownerUserId, memberUserId) {
  const ownerMemberships = await getActiveMembership(admin, ownerUserId);
  const memberMemberships = await getActiveMembership(admin, memberUserId);

  const sharedHouseholdId = ownerMemberships.find((ownerRow) =>
    memberMemberships.some((memberRow) => memberRow.household_id === ownerRow.household_id)
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

    if (data.name !== HOUSEHOLD_NAME && !data.name.startsWith("C130 Same-Household")) {
      throw new Error(
        `Owner/member share unexpected household "${data.name}". Run cleanup first.`
      );
    }

    return { household: data, reused: true };
  }

  if (ownerMemberships.length > 0 || memberMemberships.length > 0) {
    throw new Error(
      "Owner and member are not in the same active household. Run cleanup first."
    );
  }

  const { data, error } = await admin
    .from("households")
    .insert({
      name: HOUSEHOLD_NAME,
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
  assertSameHouseholdSeedAllowed();
  const { supabaseUrl, serviceRoleKey } = requireSupabaseConfig();
  const creds = resolveSeedCredentials();

  assertC130TestEmail(creds.ownerEmail, "Owner email");
  assertC130TestEmail(creds.memberEmail, "Member email");

  if (creds.ownerEmail.toLowerCase() === creds.memberEmail.toLowerCase()) {
    throw new Error("Owner and member emails must differ.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logSafe("Seeding C130 same-household two-user privacy test users...");

  const ownerAuth = await ensureAuthUser(admin, creds.ownerEmail, creds.ownerPassword);
  const memberAuth = await ensureAuthUser(admin, creds.memberEmail, creds.memberPassword);
  const removedAuth = await ensureAuthUser(admin, REMOVED_EMAIL, generatePasswordFromSeed());

  const { household, reused: householdReused } = await resolveHousehold(
    admin,
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
    displayName: "C130 Owner Test",
    role: "owner",
    isOwner: true,
    personId: telesPersonId,
  });

  await upsertMembership(admin, {
    householdId: household.id,
    userId: memberAuth.userId,
    email: creds.memberEmail,
    displayName: "C130 Member Test",
    role: "member",
    isOwner: false,
    personId: nicolePersonId,
  });

  await upsertMembership(admin, {
    householdId: household.id,
    userId: removedAuth.userId,
    email: REMOVED_EMAIL,
    displayName: "C130 Removed Test",
    role: "member",
    isOwner: false,
    status: "removed",
    isActive: false,
    removedAt: new Date().toISOString(),
    removedBy: ownerAuth.userId,
  });

  await ensureHouseholdSettings(admin, household.id, ownerAuth.userId);

  const ownerCashSnapshotId = await replaceCashSnapshot(
    admin,
    household.id,
    ownerAuth.userId,
    OWNER_CASH_AMOUNT,
    LABEL_OWNER_PRIVATE_CASH
  );
  const memberCashSnapshotId = await replaceCashSnapshot(
    admin,
    household.id,
    memberAuth.userId,
    MEMBER_CASH_AMOUNT,
    LABEL_MEMBER_PRIVATE_CASH
  );
  const removedCashSnapshotId = await replaceCashSnapshot(
    admin,
    household.id,
    removedAuth.userId,
    REMOVED_CASH_AMOUNT,
    LABEL_REMOVED_PRIVATE_CASH
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

  const bill = await ensureBillFixture(admin, household.id);
  const debt = await ensureDebtFixture(admin, household.id);
  const expenses = await ensureManualExpenseFixtures(
    admin,
    household.id,
    ownerAuth.userId,
    memberAuth.userId
  );
  const ownerSavings = await ensureSavingsFixtures(
    admin,
    household.id,
    ownerAuth.userId,
    LABEL_OWNER_SAVINGS,
    "C130 owner savings contribution"
  );
  const memberSavings = await ensureSavingsFixtures(
    admin,
    household.id,
    memberAuth.userId,
    LABEL_MEMBER_SAVINGS,
    "C130 member savings contribution"
  );
  const imports = await ensureImportFixtures(admin, household.id, ownerAuth.userId);
  const ownerReceipts = await ensureReceiptFixtures(
    admin,
    household.id,
    ownerAuth.userId,
    LABEL_OWNER_RECEIPT,
    LABEL_OWNER_RECEIPT_CANDIDATE
  );
  const memberReceipts = await ensureReceiptFixtures(
    admin,
    household.id,
    memberAuth.userId,
    LABEL_MEMBER_RECEIPT,
    LABEL_MEMBER_RECEIPT_CANDIDATE
  );

  const ownerMemberBillInstanceId = bill.billInstanceId;
  const ownerCashPaymentId = await ensureCashPaymentFixture(
    admin,
    household.id,
    ownerAuth.userId,
    ownerMemberBillInstanceId,
    LABEL_OWNER_CASH_AUDIT
  );

  const memberAuditBillName = "C130 MEMBER BILL FOR AUDIT";
  const { data: memberBillExisting } = await admin
    .from("bills")
    .select("id")
    .eq("household_id", household.id)
    .eq("name", memberAuditBillName)
    .maybeSingle();

  let memberBillInstanceId = bill.billInstanceId;
  if (memberBillExisting?.id) {
    const { data: existingInstance } = await admin
      .from("bill_instances")
      .select("id")
      .eq("household_id", household.id)
      .eq("bill_id", memberBillExisting.id)
      .maybeSingle();
    if (existingInstance) {
      memberBillInstanceId = existingInstance.id;
    }
  } else {
    const { data: memberBill, error: memberBillError } = await admin
      .from("bills")
      .insert({
        household_id: household.id,
        name: memberAuditBillName,
        category: "other",
        default_amount: 13.0,
        period_bucket: "1_14",
        recurring: false,
        is_active: true,
      })
      .select("id")
      .single();

    if (!memberBillError && memberBill) {
      const { data: memberInstance } = await admin
        .from("bill_instances")
        .insert({
          household_id: household.id,
          bill_id: memberBill.id,
          year: 2026,
          month: 6,
          period_bucket: "1_14",
          name: memberAuditBillName,
          amount: 13.0,
          teles_amount: 6.63,
          nicole_amount: 6.37,
          due_date: "2026-06-15",
          is_paid: false,
          paid_status: "unpaid",
        })
        .select("id")
        .single();
      if (memberInstance) {
        memberBillInstanceId = memberInstance.id;
      }
    }
  }

  const memberCashPaymentId = await ensureCashPaymentFixture(
    admin,
    household.id,
    memberAuth.userId,
    memberBillInstanceId,
    LABEL_MEMBER_CASH_AUDIT
  );

  const invitationId = await ensurePendingInvitation(
    admin,
    household.id,
    ownerAuth.userId,
    INVITED_EMAIL
  );

  ensureTmpDir();
  writeSmokeEnvFile({
    ownerEmail: creds.ownerEmail,
    ownerPassword: creds.ownerPassword,
    memberEmail: creds.memberEmail,
    memberPassword: creds.memberPassword,
    baseUrl: creds.baseUrl,
  });

  writeSeedMetadata({
    version: 1,
    seededAt: new Date().toISOString(),
    householdId: household.id,
    householdName: household.name,
    householdReused,
    ownerEmail: creds.ownerEmail,
    memberEmail: creds.memberEmail,
    ownerUserId: ownerAuth.userId,
    memberUserId: memberAuth.userId,
    removedUserId: removedAuth.userId,
    invitationId,
    invitedEmail: INVITED_EMAIL,
    ownerPersonId: telesPersonId,
    memberPersonId: nicolePersonId,
    fixtures: {
      ownerCashSnapshotId,
      memberCashSnapshotId,
      removedCashSnapshotId,
      billId: bill.billId,
      billInstanceId: bill.billInstanceId,
      debtAccountId: debt.debtAccountId,
      debtPaymentId: debt.debtPaymentId,
      sharedExpenseId: expenses.sharedExpenseId,
      ownerPrivateExpenseId: expenses.ownerPrivateExpenseId,
      memberPrivateExpenseId: expenses.memberPrivateExpenseId,
      ownerSavingsGoalId: ownerSavings.goalId,
      ownerSavingsParticipantId: ownerSavings.participantId,
      ownerSavingsContributionId: ownerSavings.contributionId,
      memberSavingsGoalId: memberSavings.goalId,
      memberSavingsParticipantId: memberSavings.participantId,
      memberSavingsContributionId: memberSavings.contributionId,
      importBatchId: imports.batchId,
      importBatchRecordId: imports.recordId,
      ownerReceiptUploadId: ownerReceipts.uploadId,
      ownerReceiptCandidateId: ownerReceipts.candidateId,
      memberReceiptUploadId: memberReceipts.uploadId,
      memberReceiptCandidateId: memberReceipts.candidateId,
      ownerCashPaymentTransactionId: ownerCashPaymentId,
      memberCashPaymentTransactionId: memberCashPaymentId,
    },
    labels: {
      sharedBill: LABEL_SHARED_BILL,
      ownerPrivateCash: LABEL_OWNER_PRIVATE_CASH,
      memberPrivateCash: LABEL_MEMBER_PRIVATE_CASH,
      ownerCashAudit: LABEL_OWNER_CASH_AUDIT,
      memberCashAudit: LABEL_MEMBER_CASH_AUDIT,
      ownerSavings: LABEL_OWNER_SAVINGS,
      memberSavings: LABEL_MEMBER_SAVINGS,
      ownerReceipt: LABEL_OWNER_RECEIPT,
      memberReceipt: LABEL_MEMBER_RECEIPT,
      removedPrivateCash: LABEL_REMOVED_PRIVATE_CASH,
    },
    paycheckAmounts: {
      owner: OWNER_PAYCHECK_AMOUNT,
      member: MEMBER_PAYCHECK_AMOUNT,
    },
    cashAmounts: {
      owner: OWNER_CASH_AMOUNT,
      member: MEMBER_CASH_AMOUNT,
    },
  });

  logSafe("");
  logSafe("C130 same-household test seed complete.");
  logSafe(`Owner: ${creds.ownerEmail}`);
  logSafe(`Member: ${creds.memberEmail}`);
  logSafe(`Removed fixture: ${REMOVED_EMAIL}`);
  logSafe(`Invited-only email: ${INVITED_EMAIL}`);
  logSafe(`Household: ${household.name} (${householdReused ? "reused" : "created"})`);
  logSafe(`Smoke env file: .tmp/c130-same-household-smoke.env`);
  logSafe("Passwords were written to the smoke env file only.");
  if (!creds.passwordsProvided.owner || !creds.passwordsProvided.member) {
    logSafe("Generated passwords were not printed.");
  }
}

function generatePasswordFromSeed() {
  return crypto.randomBytes(24).toString("base64url");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
