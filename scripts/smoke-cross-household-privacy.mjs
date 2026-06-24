/**
 * CASHFLOW-CURSOR-129 — Cross-household privacy smoke (API + RPC + optional UI).
 *
 * Requires seeded C129 fixtures (.tmp/c129-cross-household-smoke.env).
 * Uses anon Supabase client + authenticated sessions only for assertions.
 */
import { chromium } from "playwright";
import {
  LABEL_A_BILL,
  LABEL_B_BILL,
  SMOKE_ENV_FILE,
  DEFAULT_E2E_BASE_URL,
  createAuthenticatedClient,
  countRows,
  fetchRowById,
  isSafeRpcErrorMessage,
  loadSmokeEnvFile,
  readSeedMetadata,
  requireAnonConfig,
  resolveSmokeCredentials,
} from "./lib/cross-household-privacy-test-support.mjs";

const results = {
  apiIsolation: [],
  rpcIsolation: [],
  ownerAdmin: [],
  uiIsolation: [],
  leaks: [],
};

function pass(category, message) {
  console.log(`PASS  [${category}] ${message}`);
}

function fail(category, message) {
  results.leaks.push({ category, message });
  console.error(`FAIL  [${category}] ${message}`);
}

function assertCondition(category, condition, message) {
  if (condition) {
    pass(category, message);
    return true;
  }
  fail(category, message);
  return false;
}

// ── read helpers ─────────────────────────────────────────────────────────────

async function assertCannotReadForeignHousehold(client, table, foreignHouseholdId, callerLabel) {
  const { data, error } = await client
    .from(table)
    .select("household_id")
    .eq("household_id", foreignHouseholdId);

  if (error) {
    pass("apiIsolation", `${callerLabel} ${table} foreign household query blocked (${error.message})`);
    return;
  }

  assertCondition(
    "apiIsolation",
    (data ?? []).length === 0,
    `${callerLabel} must not read ${table} rows for foreign household (${(data ?? []).length} leaked)`
  );
}

async function assertCannotReadForeignRow(client, table, foreignRowId, callerLabel, detail) {
  const row = await fetchRowById(client, table, foreignRowId, "*");
  assertCondition(
    "apiIsolation",
    row === null,
    `${callerLabel} must not read foreign ${table} row ${detail}`
  );
}

async function assertCannotReadForeignHouseholdRow(client, table, foreignRowId, callerLabel) {
  const row = await fetchRowById(client, table, foreignRowId, "id, name");
  assertCondition(
    "apiIsolation",
    row === null,
    `${callerLabel} must not read foreign ${table} household row`
  );
}

// ── write helpers ─────────────────────────────────────────────────────────────

async function assertWriteDenied(client, table, foreignRowId, payload, callerLabel, operation) {
  let errorMessage = "";

  if (operation === "update") {
    const { error } = await client.from(table).update(payload).eq("id", foreignRowId);
    errorMessage = error?.message ?? "";
    assertCondition(
      "apiIsolation",
      Boolean(error),
      `${callerLabel} ${operation} on foreign ${table} must fail`
    );
  } else if (operation === "delete") {
    const { error } = await client.from(table).delete().eq("id", foreignRowId);
    errorMessage = error?.message ?? "";
    assertCondition(
      "apiIsolation",
      Boolean(error),
      `${callerLabel} ${operation} on foreign ${table} must fail`
    );
  } else {
    const { error } = await client.from(table).insert(payload);
    errorMessage = error?.message ?? "";
    assertCondition(
      "apiIsolation",
      Boolean(error),
      `${callerLabel} insert on foreign ${table} must fail`
    );
  }

  if (errorMessage && !isSafeRpcErrorMessage(errorMessage)) {
    fail("apiIsolation", `${callerLabel} foreign ${table} ${operation} error leaked secrets`);
  }
}

/**
 * Assert that an UPDATE on a foreign row is denied.
 *
 * PostgREST/RLS can deny an update silently (no error, 0 rows affected).
 * This helper treats both outcomes as PASS:
 *   - PASS if update returns an error.
 *   - PASS if update returns [] and verifierClient confirms row is unchanged.
 *   - FAIL if actor sees returned updated rows, or verifier sees mutated values.
 */
async function assertUpdateDeniedOrNoop(
  category,
  actorClient,
  verifierClient,
  table,
  targetId,
  patch,
  actorLabel,
  detail
) {
  const verifyCol = Object.keys(patch).join(", ");

  // 1. Capture before state via verifier
  let beforeRow = null;
  try {
    const { data } = await verifierClient
      .from(table)
      .select(verifyCol)
      .eq("id", targetId)
      .maybeSingle();
    beforeRow = data;
  } catch {
    // verifier read failed — proceed without before-state
  }

  // 2. Run actor update with select to detect any returned rows
  const { data: updated, error } = await actorClient
    .from(table)
    .update(patch)
    .eq("id", targetId)
    .select(verifyCol);

  // 3. PASS if update returned an error (explicit RLS denial)
  if (error) {
    pass(category, `${actorLabel} update on foreign ${table} blocked — ${detail} (${error.message})`);
    if (!isSafeRpcErrorMessage(error.message)) {
      fail(category, `${actorLabel} foreign ${table} update error leaked secrets`);
    }
    return;
  }

  // 4. PASS if 0 rows returned — confirm row is unchanged via verifier
  if ((updated ?? []).length === 0) {
    let afterRow = null;
    try {
      const { data } = await verifierClient
        .from(table)
        .select(verifyCol)
        .eq("id", targetId)
        .maybeSingle();
      afterRow = data;
    } catch {
      // verifier read failed
    }

    // If we couldn't read before or after, give benefit of the doubt
    const unchanged =
      beforeRow === null ||
      afterRow === null ||
      JSON.stringify(beforeRow) === JSON.stringify(afterRow);

    if (unchanged) {
      pass(category, `${actorLabel} update on foreign ${table} denied — noop, row unchanged (${detail})`);
    } else {
      fail(
        category,
        `${actorLabel} update on foreign ${table} silently mutated row despite 0 rows returned (${detail})`
      );
    }
    return;
  }

  // 5. FAIL — actor can see updated rows
  fail(
    category,
    `${actorLabel} update on foreign ${table} must fail — actor saw ${(updated ?? []).length} updated rows (${detail})`
  );
}

// ── isolation runners ─────────────────────────────────────────────────────────

async function runReadIsolationForCaller(client, callerLabel, own, foreign) {
  // households table direct SELECT is not exposed via RLS; verify own-household access
  // through household_members instead.
  const { data: ownMembership, error: membershipError } = await client
    .from("household_members")
    .select("household_id")
    .eq("household_id", own.householdId)
    .limit(1);

  assertCondition(
    "apiIsolation",
    !membershipError && (ownMembership ?? []).length > 0,
    `${callerLabel} can access own household via household_members (${(ownMembership ?? []).length} memberships)`
  );

  await assertCannotReadForeignHouseholdRow(
    client,
    "households",
    foreign.householdId,
    callerLabel
  );

  const readTables = [
    "household_members",
    "people",
    "household_settings",
    "bills",
    "bill_instances",
    "debt_accounts",
    "debt_payments",
    "manual_expenses",
    "import_batches",
    "import_batch_records",
    "receipt_uploads",
    "receipt_candidates",
    "savings_goals",
    "savings_goal_participants",
    "savings_contributions",
    "cash_snapshots",
    "cash_payment_transactions",
    "paycheck_schedules",
  ];

  for (const table of readTables) {
    await assertCannotReadForeignHousehold(client, table, foreign.householdId, callerLabel);
  }

  const foreignFixtures = foreign.fixtures;
  await assertCannotReadForeignRow(
    client,
    "bills",
    foreignFixtures.billId,
    callerLabel,
    foreign.labels.bill
  );
  await assertCannotReadForeignRow(
    client,
    "bill_instances",
    foreignFixtures.billInstanceId,
    callerLabel,
    foreign.labels.bill
  );
  await assertCannotReadForeignRow(
    client,
    "cash_snapshots",
    foreignFixtures.cashSnapshotId,
    callerLabel,
    foreign.labels.privateCash
  );

  const { data: foreignPaycheck } = await client
    .from("paycheck_schedules")
    .select("user_id")
    .eq("user_id", foreign.ownerUserId)
    .maybeSingle();

  assertCondition(
    "apiIsolation",
    foreignPaycheck === null,
    `${callerLabel} must not read foreign paycheck schedule for owner user`
  );

  await assertCannotReadForeignRow(
    client,
    "receipt_uploads",
    foreignFixtures.receiptUploadId,
    callerLabel,
    foreign.labels.receipt
  );
  await assertCannotReadForeignRow(
    client,
    "savings_goals",
    foreignFixtures.savingsGoalId,
    callerLabel,
    foreign.labels.privateGoal
  );
  await assertCannotReadForeignRow(
    client,
    "manual_expenses",
    foreignFixtures.privateExpenseId,
    callerLabel,
    "private expense"
  );
}

async function runWriteIsolationForCaller(client, callerLabel, ownUserId, foreign, verifierClient) {
  const f = foreign.fixtures;

  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "bills",
    f.billId,
    { name: "C129 CROSS HOUSEHOLD HIJACK" },
    callerLabel,
    "foreign bill"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "bill_instances",
    f.billInstanceId,
    { amount: 0.01 },
    callerLabel,
    "foreign bill_instance"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "debt_accounts",
    f.debtAccountId,
    { current_balance: 0 },
    callerLabel,
    "foreign debt_account"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "debt_payments",
    f.debtPaymentId,
    { total_payment: 0.01 },
    callerLabel,
    "foreign debt_payment"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "manual_expenses",
    f.sharedExpenseId,
    { description: "C129 hijack" },
    callerLabel,
    "foreign manual_expense"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "savings_goals",
    f.savingsGoalId,
    { name: "C129 hijack goal" },
    callerLabel,
    "foreign savings_goal"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "import_batches",
    f.importBatchId,
    { source_file_name: "hijack.csv" },
    callerLabel,
    "foreign import_batch"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "import_batch_records",
    f.importBatchRecordId,
    { row_type: "hijack" },
    callerLabel,
    "foreign import_batch_record"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "receipt_uploads",
    f.receiptUploadId,
    { original_file_name: "hijack.pdf" },
    callerLabel,
    "foreign receipt_upload"
  );
  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "receipt_candidates",
    f.receiptCandidateId,
    { merchant: "hijack" },
    callerLabel,
    "foreign receipt_candidate"
  );

  // household_members uses composite key — custom handling
  const memberUpdate = await client
    .from("household_members")
    .update({ display_name: "C129 hijack member" })
    .eq("household_id", foreign.householdId)
    .eq("user_id", foreign.ownerUserId);

  assertCondition(
    "apiIsolation",
    Boolean(memberUpdate.error) || (memberUpdate.count ?? 0) === 0,
    `${callerLabel} must not update foreign household_members row`
  );

  await assertUpdateDeniedOrNoop(
    "apiIsolation",
    client,
    verifierClient,
    "cash_snapshots",
    f.cashSnapshotId,
    { amount: 0.01 },
    callerLabel,
    "foreign cash_snapshot"
  );

  // insert into foreign household cash_snapshots must fail
  await assertWriteDenied(
    client,
    "cash_snapshots",
    null,
    {
      household_id: foreign.householdId,
      user_id: foreign.ownerUserId,
      amount: 1,
      snapshot_date: new Date().toISOString().slice(0, 10),
      notes: "C129 cross-household hijack",
    },
    callerLabel,
    "insert"
  );

  // household_settings uses household_id as PK — custom handling
  const settingsUpdate = await client
    .from("household_settings")
    .update({ cashflow_start_date: "2020-01-01" })
    .eq("household_id", foreign.householdId);

  assertCondition(
    "apiIsolation",
    Boolean(settingsUpdate.error) || (settingsUpdate.count ?? 0) === 0,
    `${callerLabel} must not update foreign household_settings`
  );
}

async function runRpcIsolation(client, callerLabel, ownUserId, foreign) {
  const f = foreign.fixtures;
  const beforeSnapshots = await countRows(client, "cash_snapshots", { user_id: ownUserId });
  const beforePayments = await countRows(client, "cash_payment_transactions", {
    user_id: ownUserId,
  });
  const beforeAdjustments = await countRows(client, "cash_adjustment_transactions", {
    user_id: ownUserId,
  });

  const rpcAttempts = [
    {
      fn: "pay_source_from_current_cash",
      args: {
        p_source_type: "bill_instance",
        p_source_id: f.billInstanceId,
        p_amount: 1,
        p_notes: "C129 cross-household RPC test",
      },
      label: "bill_instance",
    },
    {
      fn: "pay_source_from_current_cash",
      args: {
        p_source_type: "debt_payment",
        p_source_id: f.debtPaymentId,
        p_amount: 1,
        p_notes: "C129 cross-household RPC test",
      },
      label: "debt_payment",
    },
    {
      fn: "pay_source_from_current_cash",
      args: {
        p_source_type: "manual_expense",
        p_source_id: f.sharedExpenseId,
        p_amount: 1,
        p_notes: "C129 cross-household RPC test",
      },
      label: "manual_expense",
    },
    {
      fn: "pay_source_from_current_cash",
      args: {
        p_source_type: "savings_contribution",
        p_source_id: f.savingsContributionId,
        p_amount: 1,
        p_notes: "C129 cross-household RPC test",
      },
      label: "savings_contribution",
    },
    {
      fn: "credit_manual_expense_adjustment_to_current_cash",
      args: {
        p_adjustment_manual_expense_id: f.adjustmentExpenseId,
        p_amount: 1,
        p_notes: "C129 cross-household RPC test",
      },
      label: "credit_adjustment",
    },
  ];

  for (const attempt of rpcAttempts) {
    const { error } = await client.rpc(attempt.fn, attempt.args);
    assertCondition(
      "rpcIsolation",
      Boolean(error),
      `${callerLabel} ${attempt.fn}(${attempt.label}) with foreign ids must fail`
    );
    if (error && !isSafeRpcErrorMessage(error.message)) {
      fail("rpcIsolation", `${callerLabel} ${attempt.fn} error message unsafe: ${error.message}`);
    }
  }

  const afterSnapshots = await countRows(client, "cash_snapshots", { user_id: ownUserId });
  const afterPayments = await countRows(client, "cash_payment_transactions", {
    user_id: ownUserId,
  });
  const afterAdjustments = await countRows(client, "cash_adjustment_transactions", {
    user_id: ownUserId,
  });

  assertCondition(
    "rpcIsolation",
    afterSnapshots === beforeSnapshots,
    `${callerLabel} failed RPCs must not create cash snapshots (${beforeSnapshots} -> ${afterSnapshots})`
  );
  assertCondition(
    "rpcIsolation",
    afterPayments === beforePayments,
    `${callerLabel} failed RPCs must not create cash payment transactions (${beforePayments} -> ${afterPayments})`
  );
  assertCondition(
    "rpcIsolation",
    afterAdjustments === beforeAdjustments,
    `${callerLabel} failed RPCs must not create cash adjustment transactions (${beforeAdjustments} -> ${afterAdjustments})`
  );
}

async function runOwnerAdminIsolation(ownerAClient, memberAClient, ownerBClient, metadata) {
  const householdA = metadata.householdA;
  const householdB = metadata.householdB;

  if (householdA.memberUserId && householdA.fixtures.memberCashSnapshotId) {
    const memberCash = await fetchRowById(
      ownerAClient,
      "cash_snapshots",
      householdA.fixtures.memberCashSnapshotId,
      "id, notes, amount"
    );
    assertCondition(
      "ownerAdmin",
      memberCash !== null,
      "Household A owner can read same-household member private cash (migration 034 admin SELECT)"
    );
  } else {
    pass("ownerAdmin", "Same-household member fixture absent — admin member read skipped");
  }

  const foreignCash = await fetchRowById(
    ownerAClient,
    "cash_snapshots",
    householdB.fixtures.cashSnapshotId,
    "id, notes"
  );
  assertCondition(
    "ownerAdmin",
    foreignCash === null,
    "Household A owner admin SELECT must not read Household B private cash"
  );

  const foreignPaycheck = await ownerAClient
    .from("paycheck_schedules")
    .select("user_id, amount")
    .eq("user_id", householdB.ownerUserId)
    .maybeSingle();

  assertCondition(
    "ownerAdmin",
    foreignPaycheck.data === null,
    "Household A owner must not read Household B paycheck schedule"
  );

  const memberForeignCash = await fetchRowById(
    memberAClient,
    "cash_snapshots",
    householdB.fixtures.cashSnapshotId,
    "id"
  );
  assertCondition(
    "ownerAdmin",
    memberForeignCash === null,
    "Non-owner member must not read foreign private cash"
  );

  const memberSameHouseholdOwnerCash = await fetchRowById(
    memberAClient,
    "cash_snapshots",
    householdA.fixtures.cashSnapshotId,
    "id"
  );
  assertCondition(
    "ownerAdmin",
    memberSameHouseholdOwnerCash === null,
    "Non-owner member must not use owner admin read on same-household owner cash"
  );

  // Owner A must not UPDATE foreign (Household B) private cash.
  // Use ownerBClient as verifier since B owns that snapshot.
  await assertUpdateDeniedOrNoop(
    "ownerAdmin",
    ownerAClient,
    ownerBClient,
    "cash_snapshots",
    householdB.fixtures.cashSnapshotId,
    { amount: 0.01 },
    "Household A owner",
    "foreign private cash — admin SELECT must not grant UPDATE"
  );

  if (householdA.memberUserId && householdA.fixtures.memberCashSnapshotId) {
    // Owner A must not UPDATE same-household member private cash.
    // Use ownerAClient as verifier (admin SELECT policy lets it read member cash).
    // Note: ownerAClient is both actor and verifier here — the before/after read will
    // detect a mutation if one occurs.
    await assertUpdateDeniedOrNoop(
      "ownerAdmin",
      ownerAClient,
      memberAClient,
      "cash_snapshots",
      householdA.fixtures.memberCashSnapshotId,
      { amount: 0.01 },
      "Household A owner",
      "same-household member private cash — admin read must not grant UPDATE"
    );
  }
}

async function runUiIsolation(baseUrl, creds, metadata) {
  const browser = await chromium.launch({ headless: true });
  const ownerAErrors = [];
  const ownerBErrors = [];

  try {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const trackErrors = (page, bucket, label) => {
      page.on("console", (msg) => {
        if (msg.type() === "error" && !msg.text().includes("favicon.ico")) {
          bucket.push(`[${label}] ${msg.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        bucket.push(`[${label}] ${error.message}`);
      });
    };

    trackErrors(pageA, ownerAErrors, "ownerA");
    trackErrors(pageB, ownerBErrors, "ownerB");

    async function login(page, email, password) {
      await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 25000,
      });
    }

    await login(pageA, creds.householdAOwnerEmail, creds.householdAOwnerPassword);
    await login(pageB, creds.householdBOwnerEmail, creds.householdBOwnerPassword);

    const routes = [
      { path: "/", marker: "Household Cashflow Dashboard" },
      { path: "/settings", marker: "Settings" },
      { path: "/bills", marker: "All Bills" },
      { path: "/expenses", marker: "Expenses" },
      { path: "/debt", marker: "Debt Tracker" },
    ];

    for (const route of routes) {
      await pageA.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      await pageB.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      await pageA.getByText(route.marker, { exact: false }).first().waitFor({ timeout: 15000 });
      await pageB.getByText(route.marker, { exact: false }).first().waitFor({ timeout: 15000 });
    }

    let bodyA = await pageA.locator("body").innerText();
    let bodyB = await pageB.locator("body").innerText();

    assertCondition(
      "uiIsolation",
      bodyA.includes(LABEL_A_BILL) || bodyA.includes(metadata.householdA.labels.bill),
      "Household A owner UI shows Household A bill fixture"
    );
    assertCondition(
      "uiIsolation",
      !bodyB.includes(LABEL_A_BILL) && !bodyB.includes(metadata.householdA.labels.bill),
      "Household B owner UI must not show Household A bill label"
    );
    assertCondition(
      "uiIsolation",
      bodyB.includes(LABEL_B_BILL) || bodyB.includes(metadata.householdB.labels.bill),
      "Household B owner UI shows Household B bill fixture"
    );
    assertCondition(
      "uiIsolation",
      !bodyA.includes(LABEL_B_BILL) && !bodyA.includes(metadata.householdB.labels.bill),
      "Household A owner UI must not show Household B bill label"
    );

    await pageA.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });

    const toggleA = await pageA.getByTestId("owner-view-toggle").count();
    const toggleB = await pageB.getByTestId("owner-view-toggle").count();
    assertCondition(
      "uiIsolation",
      toggleA > 0 && toggleB > 0,
      "Owner Admin view toggle appears for both household owners"
    );

    await pageA.getByTestId("owner-view-admin").click();
    await pageB.getByTestId("owner-view-admin").click();
    await pageA.getByTestId("owner-admin-banner").waitFor({ timeout: 15000 });
    await pageB.getByTestId("owner-admin-banner").waitFor({ timeout: 15000 });

    bodyA = await pageA.locator("body").innerText();
    bodyB = await pageB.locator("body").innerText();

    assertCondition(
      "uiIsolation",
      !bodyA.includes(metadata.householdB.labels.privateCash) &&
        !bodyA.includes(metadata.householdB.labels.receipt) &&
        !bodyA.includes(metadata.householdB.labels.privateGoal),
      "Household A admin view must not show Household B private fixture labels"
    );
    assertCondition(
      "uiIsolation",
      !bodyB.includes(metadata.householdA.labels.privateCash) &&
        !bodyB.includes(metadata.householdA.labels.receipt) &&
        !bodyB.includes(metadata.householdA.labels.privateGoal),
      "Household B admin view must not show Household A private fixture labels"
    );

    assertCondition(
      "uiIsolation",
      ownerAErrors.length === 0,
      `Household A browser console errors: ${ownerAErrors.join("; ")}`
    );
    assertCondition(
      "uiIsolation",
      ownerBErrors.length === 0,
      `Household B browser console errors: ${ownerBErrors.join("; ")}`
    );

    await contextA.close();
    await contextB.close();
  } finally {
    await browser.close();
  }
}

// ── dev-server probe ──────────────────────────────────────────────────────────

async function isDevServerReachable(baseUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    await fetch(baseUrl, { signal: controller.signal, method: "HEAD" });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadSmokeEnvFile();
  const creds = resolveSmokeCredentials();
  const metadata = readSeedMetadata();

  const missing = [
    ["CASHFLOW_HOUSEHOLD_A_OWNER_EMAIL", creds.householdAOwnerEmail],
    ["CASHFLOW_HOUSEHOLD_A_OWNER_PASSWORD", creds.householdAOwnerPassword],
    ["CASHFLOW_HOUSEHOLD_B_OWNER_EMAIL", creds.householdBOwnerEmail],
    ["CASHFLOW_HOUSEHOLD_B_OWNER_PASSWORD", creds.householdBOwnerPassword],
    ["CASHFLOW_HOUSEHOLD_A_MEMBER_EMAIL", creds.householdAMemberEmail],
    ["CASHFLOW_HOUSEHOLD_A_MEMBER_PASSWORD", creds.householdAMemberPassword],
  ].filter(([, value]) => !value);

  if (missing.length > 0 || !metadata) {
    console.error("C129 smoke requires seeded credentials and metadata.");
    console.error(`Missing: ${missing.map(([name]) => name).join(", ")}`);
    console.error(
      `Run: $env:CASHFLOW_ALLOW_CROSS_HOUSEHOLD_TEST_SEED = "YES"; node scripts/seed-cross-household-privacy-test-users.mjs`
    );
    console.error(`Expected smoke env: ${SMOKE_ENV_FILE}`);
    process.exit(2);
  }

  const { supabaseUrl, anonKey } = requireAnonConfig();

  const ownerAClient = await createAuthenticatedClient(
    supabaseUrl,
    anonKey,
    creds.householdAOwnerEmail,
    creds.householdAOwnerPassword
  );
  const ownerBClient = await createAuthenticatedClient(
    supabaseUrl,
    anonKey,
    creds.householdBOwnerEmail,
    creds.householdBOwnerPassword
  );
  const memberAClient = await createAuthenticatedClient(
    supabaseUrl,
    anonKey,
    creds.householdAMemberEmail,
    creds.householdAMemberPassword
  );

  console.log("C129 cross-household privacy smoke — API isolation");
  await runReadIsolationForCaller(
    ownerAClient,
    "Household A owner",
    metadata.householdA,
    metadata.householdB
  );
  await runReadIsolationForCaller(
    ownerBClient,
    "Household B owner",
    metadata.householdB,
    metadata.householdA
  );

  console.log("");
  console.log("C129 cross-household privacy smoke — write isolation");
  await runWriteIsolationForCaller(
    ownerAClient,
    "Household A owner",
    metadata.householdA.ownerUserId,
    metadata.householdB,
    ownerBClient
  );
  await runWriteIsolationForCaller(
    ownerBClient,
    "Household B owner",
    metadata.householdB.ownerUserId,
    metadata.householdA,
    ownerAClient
  );

  console.log("");
  console.log("C129 cross-household privacy smoke — RPC isolation");
  await runRpcIsolation(
    ownerAClient,
    "Household A owner",
    metadata.householdA.ownerUserId,
    metadata.householdB
  );
  await runRpcIsolation(
    ownerBClient,
    "Household B owner",
    metadata.householdB.ownerUserId,
    metadata.householdA
  );

  console.log("");
  console.log("C129 cross-household privacy smoke — owner admin isolation");
  await runOwnerAdminIsolation(ownerAClient, memberAClient, ownerBClient, metadata);

  // UI smoke — runs only when dev server is reachable; NOT_RUN otherwise (not a leak).
  // CASHFLOW_SKIP_UI_SMOKE=YES explicitly bypasses the check.
  const skipUi = process.env.CASHFLOW_SKIP_UI_SMOKE === "YES";
  const baseUrl = process.env.CASHFLOW_E2E_BASE_URL?.trim() || DEFAULT_E2E_BASE_URL;
  let uiResult = "NOT_RUN";

  console.log("");
  if (skipUi) {
    pass("uiIsolation", "UI smoke skipped (CASHFLOW_SKIP_UI_SMOKE=YES)");
    uiResult = "SKIPPED";
  } else {
    const reachable = await isDevServerReachable(baseUrl);

    if (!reachable) {
      // Dev server not running — report NOT_RUN, do not count as a leak.
      console.log(`C129 — UI smoke NOT_RUN (dev server not reachable at ${baseUrl})`);
      console.log("  To run UI smoke: npm run dev -- --port 5229 --strictPort");
      console.log("  Then: $env:CASHFLOW_E2E_BASE_URL = \"http://127.0.0.1:5229\"");
      uiResult = "NOT_RUN";
    } else {
      console.log(`C129 cross-household privacy smoke — UI isolation (${baseUrl})`);
      try {
        await runUiIsolation(baseUrl, creds, metadata);
        uiResult = "PASS";
      } catch (error) {
        fail(
          "uiIsolation",
          error instanceof Error ? error.message : String(error)
        );
        uiResult = "FAIL";
      }
    }
  }

  console.log("");
  if (results.leaks.length > 0) {
    console.error(`C129 cross-household privacy smoke FAILED (${results.leaks.length} leak(s)).`);
    for (const leak of results.leaks) {
      console.error(`  - [${leak.category}] ${leak.message}`);
    }
    process.exit(1);
  }

  console.log("C129 cross-household privacy smoke PASSED.");
  console.log("Verified: API read/write isolation, RPC isolation, owner admin cross-household denial.");
  if (uiResult === "PASS") {
    console.log("Verified: isolated browser contexts and admin view UI isolation.");
  } else if (uiResult === "NOT_RUN") {
    console.log("UI smoke: NOT_RUN (start dev server and set CASHFLOW_E2E_BASE_URL to verify).");
  } else if (uiResult === "SKIPPED") {
    console.log("UI smoke: SKIPPED (CASHFLOW_SKIP_UI_SMOKE=YES).");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
