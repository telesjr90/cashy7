import crypto from "node:crypto";

/**
 * CASHFLOW-CURSOR-129 — Seed two isolated households for cross-household privacy tests.
 *
 * Requires:
 *   CASHFLOW_ALLOW_CROSS_HOUSEHOLD_TEST_SEED=YES
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_SUPABASE_URL
 */
import { createClient } from "@supabase/supabase-js";
import {
  HOUSEHOLD_A_MEMBER_EMAIL,
  HOUSEHOLD_A_NAME,
  HOUSEHOLD_A_OWNER_EMAIL,
  HOUSEHOLD_B_NAME,
  HOUSEHOLD_B_OWNER_EMAIL,
  LABEL_A_BILL,
  LABEL_A_CASH_AMOUNT,
  LABEL_A_MEMBER_CASH_AMOUNT,
  LABEL_A_PAYCHECK_AMOUNT,
  LABEL_A_PRIVATE_CASH,
  LABEL_A_PRIVATE_GOAL,
  LABEL_A_RECEIPT,
  LABEL_B_BILL,
  LABEL_B_CASH_AMOUNT,
  LABEL_B_PAYCHECK_AMOUNT,
  LABEL_B_PRIVATE_CASH,
  LABEL_B_PRIVATE_GOAL,
  LABEL_B_RECEIPT,
  assertC129TestEmail,
  assertCrossHouseholdSeedAllowed,
  ensureAuthUser,
  ensureTmpDir,
  getActiveMembership,
  requireSupabaseConfig,
  resolveSeedCredentials,
  todayIsoDate,
  writeSeedMetadata,
  writeSmokeEnvFile,
} from "./lib/cross-household-privacy-test-support.mjs";

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
    person_id: input.personId,
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

async function ensurePeople(admin, householdId, names) {
  const { data: existing, error } = await admin
    .from("people")
    .select("id, name")
    .eq("household_id", householdId);

  if (error) {
    throw new Error(`Could not load people rows: ${error.message}`);
  }

  const byName = new Map((existing ?? []).map((row) => [row.name, row.id]));

  for (const person of names) {
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

  return byName;
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

async function ensureBillFixture(admin, householdId, label) {
  const { data: existing, error: lookupError } = await admin
    .from("bills")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", label)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not look up bill ${label}: ${lookupError.message}`);
  }

  let billId = existing?.id;
  if (!billId) {
    const { data, error } = await admin
      .from("bills")
      .insert({
        household_id: householdId,
        name: label,
        category: "other",
        default_amount: 99.99,
        period_bucket: "1_14",
        recurring: true,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create bill ${label}: ${error.message}`);
    }
    billId = data.id;
  }

  const { data: instanceExisting, error: instanceLookupError } = await admin
    .from("bill_instances")
    .select("id")
    .eq("household_id", householdId)
    .eq("bill_id", billId)
    .eq("name", label)
    .maybeSingle();

  if (instanceLookupError) {
    throw new Error(`Could not look up bill instance ${label}: ${instanceLookupError.message}`);
  }

  if (instanceExisting) {
    return { billId, billInstanceId: instanceExisting.id, reused: true };
  }

  const { data: instance, error: instanceError } = await admin
    .from("bill_instances")
    .insert({
      household_id: householdId,
      bill_id: billId,
      year: 2026,
      month: 6,
      period_bucket: "1_14",
      name: label,
      amount: 99.99,
      teles_amount: 50.99,
      nicole_amount: 49.0,
      due_date: "2026-06-14",
      is_paid: false,
      paid_status: "unpaid",
    })
    .select("id")
    .single();

  if (instanceError) {
    throw new Error(`Could not create bill instance ${label}: ${instanceError.message}`);
  }

  return { billId, billInstanceId: instance.id, reused: false };
}

async function ensureDebtFixture(admin, householdId, labelPrefix) {
  const accountName = `${labelPrefix} DEBT ACCOUNT`;
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
        original_amount: 1000,
        current_balance: 800,
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
    return { debtAccountId, debtPaymentId: existingPayment.id, reused: true };
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
      total_payment: 100,
      teles_amount: 51,
      nicole_amount: 49,
      paid_status: false,
    })
    .select("id")
    .single();

  if (paymentError) {
    throw new Error(`Could not create debt payment: ${paymentError.message}`);
  }

  return { debtAccountId, debtPaymentId: payment.id, reused: false };
}

async function ensureManualExpenseFixtures(admin, householdId, ownerUserId, labelPrefix) {
  const sharedDescription = `${labelPrefix} SHARED EXPENSE`;
  const { data: sharedExisting, error: sharedLookupError } = await admin
    .from("manual_expenses")
    .select("id")
    .eq("household_id", householdId)
    .eq("description", sharedDescription)
    .maybeSingle();

  if (sharedLookupError) {
    throw new Error(`Could not look up shared manual expense: ${sharedLookupError.message}`);
  }

  let sharedExpenseId = sharedExisting?.id;
  if (!sharedExpenseId) {
    const { data, error } = await admin
      .from("manual_expenses")
      .insert({
        household_id: householdId,
        created_by_user_id: ownerUserId,
        expense_scope: "shared",
        description: sharedDescription,
        amount: 45.5,
        expense_date: todayIsoDate(),
        period_bucket: "1_14",
        split_type: "equal",
        teles_amount: 22.75,
        nicole_amount: 22.75,
        is_paid: false,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create shared manual expense: ${error.message}`);
    }
    sharedExpenseId = data.id;
  }

  const privateDescription = `${labelPrefix} PRIVATE EXPENSE`;
  const { data: privateExisting, error: privateLookupError } = await admin
    .from("manual_expenses")
    .select("id")
    .eq("household_id", householdId)
    .eq("description", privateDescription)
    .maybeSingle();

  if (privateLookupError) {
    throw new Error(`Could not look up private manual expense: ${privateLookupError.message}`);
  }

  let privateExpenseId = privateExisting?.id;
  if (!privateExpenseId) {
    const { data, error } = await admin
      .from("manual_expenses")
      .insert({
        household_id: householdId,
        created_by_user_id: ownerUserId,
        expense_scope: "private",
        description: privateDescription,
        amount: 12.34,
        expense_date: todayIsoDate(),
        period_bucket: "1_14",
        split_type: "personal",
        teles_amount: 12.34,
        nicole_amount: 0,
        is_paid: false,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create private manual expense: ${error.message}`);
    }
    privateExpenseId = data.id;
  }

  const adjustmentDescription = `${labelPrefix} DECREASE ADJUSTMENT`;
  const { data: adjustmentExisting, error: adjustmentLookupError } = await admin
    .from("manual_expenses")
    .select("id")
    .eq("household_id", householdId)
    .eq("description", adjustmentDescription)
    .maybeSingle();

  if (adjustmentLookupError) {
    throw new Error(`Could not look up adjustment manual expense: ${adjustmentLookupError.message}`);
  }

  let adjustmentExpenseId = adjustmentExisting?.id;
  if (!adjustmentExpenseId) {
    const { data, error } = await admin
      .from("manual_expenses")
      .insert({
        household_id: householdId,
        created_by_user_id: ownerUserId,
        expense_scope: "shared",
        description: adjustmentDescription,
        amount: 5,
        expense_date: todayIsoDate(),
        period_bucket: "1_14",
        split_type: "equal",
        teles_amount: 2.5,
        nicole_amount: 2.5,
        adjusts_manual_expense_id: sharedExpenseId,
        adjustment_direction: "decrease",
        adjustment_reason: "C129 fixture decrease adjustment",
        is_paid: false,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not create adjustment manual expense: ${error.message}`);
    }
    adjustmentExpenseId = data.id;
  }

  return { sharedExpenseId, privateExpenseId, adjustmentExpenseId };
}

async function ensureSavingsFixtures(admin, householdId, ownerUserId, privateGoalName) {
  const { data: goalExisting, error: goalLookupError } = await admin
    .from("savings_goals")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", privateGoalName)
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
        created_by_user_id: ownerUserId,
        name: privateGoalName,
        goal_type: "private",
        target_amount: 900,
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
    .eq("user_id", ownerUserId)
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
        user_id: ownerUserId,
        target_contribution_amount: 300,
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
    .eq("user_id", ownerUserId)
    .eq("notes", "C129 fixture contribution")
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
        user_id: ownerUserId,
        amount: 25,
        contribution_date: todayIsoDate(),
        notes: "C129 fixture contribution",
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

async function ensureImportFixtures(admin, householdId, ownerUserId, labelPrefix) {
  const fileName = `${labelPrefix} import.csv`;
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

  let recordId = recordExisting?.id;
  if (!recordId) {
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
    recordId = data.id;
  }

  return { batchId, recordId };
}

async function ensureReceiptFixtures(admin, householdId, ownerUserId, receiptLabel) {
  const fileName = `${receiptLabel}.pdf`;
  const storagePath = `${ownerUserId}/c129-${receiptLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`;

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
        uploaded_by: ownerUserId,
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
        created_by: ownerUserId,
        status: "pending",
        merchant: receiptLabel,
        total_amount: 19.99,
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

async function ensureCashPaymentFixture(admin, householdId, userId, billInstanceId) {
  const notes = "C129 fixture cash payment audit";
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
    throw new Error("Could not load cash snapshot for payment fixture");
  }

  const { data: newSnapshot, error: newSnapshotError } = await admin
    .from("cash_snapshots")
    .insert({
      household_id: householdId,
      user_id: userId,
      amount: Number(snapshot.amount) - 1,
      snapshot_date: todayIsoDate(),
      notes: "C129 fixture payment deduction snapshot",
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

async function assertNoForeignActiveMembership(admin, userId, email, allowedHouseholdId) {
  const memberships = await getActiveMembership(admin, userId);
  const foreign = memberships.filter((row) => row.household_id !== allowedHouseholdId);

  if (foreign.length > 0) {
    throw new Error(
      `${email} is active in a different household (${foreign[0].household_id}). Run cleanup-cross-household-privacy-test-users.mjs first.`
    );
  }
}

async function resolveHousehold(admin, name, ownerUserId) {
  const memberships = await getActiveMembership(admin, ownerUserId);
  const owned = memberships.find((row) => row.is_owner);

  if (owned) {
    const { data, error } = await admin
      .from("households")
      .select("*")
      .eq("id", owned.household_id)
      .single();

    if (error) {
      throw new Error(`Could not load household for ${name}: ${error.message}`);
    }

    if (data.name !== name && !data.name.startsWith("C129 Cross-Household")) {
      throw new Error(
        `${name} owner is active in unexpected household "${data.name}". Run cleanup first.`
      );
    }

    return { household: data, reused: true };
  }

  if (memberships.length > 0) {
    throw new Error(
      `${name} owner has active non-owner membership elsewhere. Run cleanup first.`
    );
  }

  const { data, error } = await admin
    .from("households")
    .insert({
      name,
      owner_id: ownerUserId,
      created_by: ownerUserId,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not create household ${name}: ${error.message}`);
  }

  return { household: data, reused: false };
}

async function seedHousehold(admin, config) {
  const peopleByName = await ensurePeople(admin, config.householdId, config.people);

  await upsertMembership(admin, {
    householdId: config.householdId,
    userId: config.ownerUserId,
    email: config.ownerEmail,
    displayName: config.ownerDisplayName,
    role: "owner",
    isOwner: true,
    personId: peopleByName.get(config.ownerPersonName),
  });

  let memberUserId = null;
  if (config.memberUserId) {
    await upsertMembership(admin, {
      householdId: config.householdId,
      userId: config.memberUserId,
      email: config.memberEmail,
      displayName: config.memberDisplayName,
      role: "member",
      isOwner: false,
      personId: peopleByName.get(config.memberPersonName),
    });
    memberUserId = config.memberUserId;
  }

  await ensureHouseholdSettings(admin, config.householdId, config.ownerUserId);

  const cashSnapshotId = await replaceCashSnapshot(
    admin,
    config.householdId,
    config.ownerUserId,
    config.cashAmount,
    config.privateCashLabel
  );

  let memberCashSnapshotId = null;
  if (memberUserId) {
    memberCashSnapshotId = await replaceCashSnapshot(
      admin,
      config.householdId,
      memberUserId,
      config.memberCashAmount,
      `${config.labelPrefix} MEMBER PRIVATE CASH`
    );
    await upsertPaycheckSchedule(
      admin,
      config.householdId,
      memberUserId,
      config.memberPaycheckAmount ?? config.paycheckAmount + 100
    );
  }

  await upsertPaycheckSchedule(
    admin,
    config.householdId,
    config.ownerUserId,
    config.paycheckAmount
  );

  const bill = await ensureBillFixture(admin, config.householdId, config.billLabel);
  const debt = await ensureDebtFixture(admin, config.householdId, config.labelPrefix);
  const expenses = await ensureManualExpenseFixtures(
    admin,
    config.householdId,
    config.ownerUserId,
    config.labelPrefix
  );
  const savings = await ensureSavingsFixtures(
    admin,
    config.householdId,
    config.ownerUserId,
    config.privateGoalName
  );
  const imports = await ensureImportFixtures(
    admin,
    config.householdId,
    config.ownerUserId,
    config.labelPrefix
  );
  const receipts = await ensureReceiptFixtures(
    admin,
    config.householdId,
    config.ownerUserId,
    config.receiptLabel
  );
  const cashPaymentId = await ensureCashPaymentFixture(
    admin,
    config.householdId,
    config.ownerUserId,
    bill.billInstanceId
  );

  return {
    householdId: config.householdId,
    ownerUserId: config.ownerUserId,
    memberUserId,
    ownerPersonId: peopleByName.get(config.ownerPersonName),
    memberPersonId: config.memberPersonName
      ? peopleByName.get(config.memberPersonName)
      : null,
    fixtures: {
      cashSnapshotId,
      memberCashSnapshotId,
      billId: bill.billId,
      billInstanceId: bill.billInstanceId,
      debtAccountId: debt.debtAccountId,
      debtPaymentId: debt.debtPaymentId,
      sharedExpenseId: expenses.sharedExpenseId,
      privateExpenseId: expenses.privateExpenseId,
      adjustmentExpenseId: expenses.adjustmentExpenseId,
      savingsGoalId: savings.goalId,
      savingsParticipantId: savings.participantId,
      savingsContributionId: savings.contributionId,
      importBatchId: imports.batchId,
      importBatchRecordId: imports.recordId,
      receiptUploadId: receipts.uploadId,
      receiptCandidateId: receipts.candidateId,
      cashPaymentTransactionId: cashPaymentId,
    },
    labels: {
      bill: config.billLabel,
      privateCash: config.privateCashLabel,
      receipt: config.receiptLabel,
      privateGoal: config.privateGoalName,
    },
  };
}

async function main() {
  assertCrossHouseholdSeedAllowed();
  const { supabaseUrl, serviceRoleKey } = requireSupabaseConfig();
  const creds = resolveSeedCredentials();

  assertC129TestEmail(creds.householdAOwnerEmail, "Household A owner email");
  assertC129TestEmail(creds.householdBOwnerEmail, "Household B owner email");
  assertC129TestEmail(creds.householdAMemberEmail, "Household A member email");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logSafe("Seeding C129 cross-household privacy test users...");

  const ownerAAuth = await ensureAuthUser(
    admin,
    creds.householdAOwnerEmail,
    creds.householdAOwnerPassword
  );
  const ownerBAuth = await ensureAuthUser(
    admin,
    creds.householdBOwnerEmail,
    creds.householdBOwnerPassword
  );
  const memberAAuth = await ensureAuthUser(
    admin,
    creds.householdAMemberEmail,
    creds.householdAMemberPassword
  );

  const { household: householdA, reused: householdAReused } = await resolveHousehold(
    admin,
    HOUSEHOLD_A_NAME,
    ownerAAuth.userId
  );
  const { household: householdB, reused: householdBReused } = await resolveHousehold(
    admin,
    HOUSEHOLD_B_NAME,
    ownerBAuth.userId
  );

  if (householdA.id === householdB.id) {
    throw new Error("Household A and B resolved to the same household id.");
  }

  await assertNoForeignActiveMembership(
    admin,
    ownerAAuth.userId,
    creds.householdAOwnerEmail,
    householdA.id
  );
  await assertNoForeignActiveMembership(
    admin,
    ownerBAuth.userId,
    creds.householdBOwnerEmail,
    householdB.id
  );
  await assertNoForeignActiveMembership(
    admin,
    memberAAuth.userId,
    creds.householdAMemberEmail,
    householdA.id
  );

  const householdAData = await seedHousehold(admin, {
    householdId: householdA.id,
    ownerUserId: ownerAAuth.userId,
    ownerEmail: creds.householdAOwnerEmail,
    ownerDisplayName: "C129 Household A Owner",
    memberUserId: memberAAuth.userId,
    memberEmail: creds.householdAMemberEmail,
    memberDisplayName: "C129 Household A Member",
    ownerPersonName: "OwnerA",
    memberPersonName: "MemberA",
    people: [
      { name: "OwnerA", color: "#2563eb" },
      { name: "MemberA", color: "#16a34a" },
    ],
    labelPrefix: "C129 HOUSEHOLD A",
    billLabel: LABEL_A_BILL,
    privateCashLabel: LABEL_A_PRIVATE_CASH,
    receiptLabel: LABEL_A_RECEIPT,
    privateGoalName: LABEL_A_PRIVATE_GOAL,
    cashAmount: LABEL_A_CASH_AMOUNT,
    memberCashAmount: LABEL_A_MEMBER_CASH_AMOUNT,
    paycheckAmount: LABEL_A_PAYCHECK_AMOUNT,
  });

  const householdBData = await seedHousehold(admin, {
    householdId: householdB.id,
    ownerUserId: ownerBAuth.userId,
    ownerEmail: creds.householdBOwnerEmail,
    ownerDisplayName: "C129 Household B Owner",
    ownerPersonName: "OwnerB",
    people: [{ name: "OwnerB", color: "#9333ea" }],
    labelPrefix: "C129 HOUSEHOLD B",
    billLabel: LABEL_B_BILL,
    privateCashLabel: LABEL_B_PRIVATE_CASH,
    receiptLabel: LABEL_B_RECEIPT,
    privateGoalName: LABEL_B_PRIVATE_GOAL,
    cashAmount: LABEL_B_CASH_AMOUNT,
    paycheckAmount: LABEL_B_PAYCHECK_AMOUNT,
  });

  ensureTmpDir();
  writeSmokeEnvFile({
    householdAOwnerEmail: creds.householdAOwnerEmail,
    householdAOwnerPassword: creds.householdAOwnerPassword,
    householdBOwnerEmail: creds.householdBOwnerEmail,
    householdBOwnerPassword: creds.householdBOwnerPassword,
    householdAMemberEmail: creds.householdAMemberEmail,
    householdAMemberPassword: creds.householdAMemberPassword,
    baseUrl: creds.baseUrl,
  });

  writeSeedMetadata({
    version: 1,
    seededAt: new Date().toISOString(),
    householdA: {
      ...householdAData,
      householdName: householdA.name,
      householdReused: householdAReused,
      ownerEmail: creds.householdAOwnerEmail,
      memberEmail: creds.householdAMemberEmail,
    },
    householdB: {
      ...householdBData,
      householdName: householdB.name,
      householdReused: householdBReused,
      ownerEmail: creds.householdBOwnerEmail,
    },
    migration034Expected: true,
  });

  logSafe("");
  logSafe("C129 cross-household test seed complete.");
  logSafe(`Household A owner: ${creds.householdAOwnerEmail}`);
  logSafe(`Household A member: ${creds.householdAMemberEmail}`);
  logSafe(`Household B owner: ${creds.householdBOwnerEmail}`);
  logSafe(`Household A: ${householdA.name} (${householdAReused ? "reused" : "created"})`);
  logSafe(`Household B: ${householdB.name} (${householdBReused ? "reused" : "created"})`);
  logSafe(`Smoke env file: .tmp/c129-cross-household-smoke.env`);
  logSafe("Passwords were written to the smoke env file only.");
  if (
    !creds.passwordsProvided.householdAOwner ||
    !creds.passwordsProvided.householdBOwner ||
    !creds.passwordsProvided.householdAMember
  ) {
    logSafe("Generated passwords were not printed.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
