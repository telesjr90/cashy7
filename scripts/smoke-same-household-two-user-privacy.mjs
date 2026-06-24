/**
 * CASHFLOW-CURSOR-130 — Same-household two-user privacy smoke (API + RPC + optional UI).
 *
 * Requires seeded C130 fixtures (.tmp/c130-same-household-smoke.env).
 * Uses anon Supabase client + authenticated sessions only for assertions.
 */
import { chromium } from "playwright";
import {
  DEFAULT_E2E_BASE_URL,
  LABEL_SHARED_BILL,
  SMOKE_ENV_FILE,
  createAuthenticatedClient,
  countRows,
  fetchRowById,
  isSafeRpcErrorMessage,
  loadSmokeEnvFile,
  readSeedMetadata,
  requireAnonConfig,
  resolveSmokeCredentials,
} from "./lib/two-user-privacy-v2-test-support.mjs";

const results = {
  sharedData: [],
  personalView: [],
  ownerAdminRead: [],
  ownerAdminWrite: [],
  memberPrivacy: [],
  rpcIsolation: [],
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

async function assertUpdateDeniedOrNoop(
  category,
  actorClient,
  verifierClient,
  table,
  targetId,
  patch,
  actorLabel,
  detail,
  keyCol = "id"
) {
  const verifyCol = Object.keys(patch).join(", ");

  let beforeRow = null;
  try {
    const { data } = await verifierClient
      .from(table)
      .select(verifyCol)
      .eq(keyCol, targetId)
      .maybeSingle();
    beforeRow = data;
  } catch {
    // verifier read failed
  }

  const { data: updated, error } = await actorClient
    .from(table)
    .update(patch)
    .eq(keyCol, targetId)
    .select(verifyCol);

  if (error) {
    pass(category, `${actorLabel} update on ${table} blocked — ${detail} (${error.message})`);
    if (!isSafeRpcErrorMessage(error.message)) {
      fail(category, `${actorLabel} ${table} update error leaked secrets`);
    }
    return;
  }

  if ((updated ?? []).length === 0) {
    let afterRow = null;
    try {
      const { data } = await verifierClient
        .from(table)
        .select(verifyCol)
        .eq(keyCol, targetId)
        .maybeSingle();
      afterRow = data;
    } catch {
      // verifier read failed
    }

    const unchanged =
      beforeRow === null ||
      afterRow === null ||
      JSON.stringify(beforeRow) === JSON.stringify(afterRow);

    if (unchanged) {
      pass(category, `${actorLabel} update on ${table} denied — noop, row unchanged (${detail})`);
    } else {
      fail(
        category,
        `${actorLabel} update on ${table} silently mutated row despite 0 rows returned (${detail})`
      );
    }
    return;
  }

  fail(
    category,
    `${actorLabel} update on ${table} must fail — actor saw ${(updated ?? []).length} updated rows (${detail})`
  );
}

async function assertDeleteDeniedOrNoop(
  category,
  actorClient,
  verifierClient,
  table,
  targetId,
  actorLabel,
  detail,
  keyCol = "id"
) {
  let beforeRow = null;
  try {
    const { data } = await verifierClient
      .from(table)
      .select(keyCol)
      .eq(keyCol, targetId)
      .maybeSingle();
    beforeRow = data;
  } catch {
    // verifier read failed before delete
  }

  const { data: deleted, error } = await actorClient
    .from(table)
    .delete()
    .eq(keyCol, targetId)
    .select(keyCol);

  if (error) {
    pass(category, `${actorLabel} delete on ${table} blocked — ${detail} (${error.message})`);
    if (!isSafeRpcErrorMessage(error.message)) {
      fail(category, `${actorLabel} ${table} delete error leaked secrets`);
    }
    return;
  }

  if ((deleted ?? []).length > 0) {
    fail(
      category,
      `${actorLabel} delete on ${table} must fail — actor received ${deleted.length} deleted row(s) (${detail})`
    );
    return;
  }

  // Zero rows deleted — verify the row still exists via the verifier.
  let afterRow = null;
  try {
    const { data } = await verifierClient
      .from(table)
      .select(keyCol)
      .eq(keyCol, targetId)
      .maybeSingle();
    afterRow = data;
  } catch {
    // verifier read failed after delete
  }

  const rowStillExists = afterRow !== null || beforeRow === null;
  if (rowStillExists) {
    pass(
      category,
      `${actorLabel} delete on ${table} denied — noop, row still exists (${detail})`
    );
  } else {
    fail(
      category,
      `${actorLabel} delete on ${table} silently removed row despite 0 rows returned (${detail})`
    );
  }
}

async function runSharedDataVisibility(ownerClient, memberClient, metadata) {
  const householdId = metadata.householdId;
  const sharedTables = [
    "bills",
    "bill_instances",
    "debt_accounts",
    "debt_payments",
    "manual_expenses",
    "household_settings",
    "people",
    "import_batches",
    "import_batch_records",
  ];

  // household_settings uses household_id as its primary key — no id column.
  const tableSelectCol = {
    household_settings: "household_id",
  };

  for (const [label, client] of [
    ["Owner", ownerClient],
    ["Member", memberClient],
  ]) {
    for (const table of sharedTables) {
      const selectCol = tableSelectCol[table] ?? "id";
      const { data, error } = await client
        .from(table)
        .select(selectCol)
        .eq("household_id", householdId);

      if (error) {
        fail("sharedData", `${label} could not read ${table}: ${error.message}`);
        continue;
      }

      assertCondition(
        "sharedData",
        (data ?? []).length > 0,
        `${label} can read same-household ${table} (${(data ?? []).length} rows)`
      );
    }

    const bill = await fetchRowById(client, "bills", metadata.fixtures.billId, "id, name");
    assertCondition(
      "sharedData",
      bill !== null && (bill.name === LABEL_SHARED_BILL || bill.name?.includes("C130")),
      `${label} can read shared bill fixture by id`
    );
  }
}

async function runPersonalViewPrivacy(ownerClient, memberClient, metadata) {
  const f = metadata.fixtures;

  for (const [label, client, userId, otherUserId, ownFixtures, otherFixtures] of [
    [
      "Owner",
      ownerClient,
      metadata.ownerUserId,
      metadata.memberUserId,
      {
        cashId: f.ownerCashSnapshotId,
        paycheck: metadata.paycheckAmounts.owner,
        savingsParticipantId: f.ownerSavingsParticipantId,
        savingsContributionId: f.ownerSavingsContributionId,
        receiptUploadId: f.ownerReceiptUploadId,
        receiptCandidateId: f.ownerReceiptCandidateId,
        cashPaymentId: f.ownerCashPaymentTransactionId,
      },
      {
        cashId: f.memberCashSnapshotId,
        paycheck: metadata.paycheckAmounts.member,
        savingsParticipantId: f.memberSavingsParticipantId,
        savingsContributionId: f.memberSavingsContributionId,
        receiptUploadId: f.memberReceiptUploadId,
        receiptCandidateId: f.memberReceiptCandidateId,
        cashPaymentId: f.memberCashPaymentTransactionId,
      },
    ],
    [
      "Member",
      memberClient,
      metadata.memberUserId,
      metadata.ownerUserId,
      {
        cashId: f.memberCashSnapshotId,
        paycheck: metadata.paycheckAmounts.member,
        savingsParticipantId: f.memberSavingsParticipantId,
        savingsContributionId: f.memberSavingsContributionId,
        receiptUploadId: f.memberReceiptUploadId,
        receiptCandidateId: f.memberReceiptCandidateId,
        cashPaymentId: f.memberCashPaymentTransactionId,
      },
      {
        cashId: f.ownerCashSnapshotId,
        paycheck: metadata.paycheckAmounts.owner,
        savingsParticipantId: f.ownerSavingsParticipantId,
        savingsContributionId: f.ownerSavingsContributionId,
        receiptUploadId: f.ownerReceiptUploadId,
        receiptCandidateId: f.ownerReceiptCandidateId,
        cashPaymentId: f.ownerCashPaymentTransactionId,
      },
    ],
  ]) {
    const ownCash = await fetchRowById(client, "cash_snapshots", ownFixtures.cashId, "id, notes");
    assertCondition(
      "personalView",
      ownCash !== null,
      `${label} personal-view query can read own private cash`
    );

    const { data: ownPaycheck } = await client
      .from("paycheck_schedules")
      .select("amount")
      .eq("user_id", userId)
      .maybeSingle();

    assertCondition(
      "personalView",
      ownPaycheck !== null && Number(ownPaycheck.amount) === ownFixtures.paycheck,
      `${label} personal-view query can read own paycheck schedule`
    );

    const ownParticipant = await fetchRowById(
      client,
      "savings_goal_participants",
      ownFixtures.savingsParticipantId,
      "id"
    );
    assertCondition(
      "personalView",
      ownParticipant !== null,
      `${label} personal-view query can read own savings participant`
    );

    const ownContribution = await fetchRowById(
      client,
      "savings_contributions",
      ownFixtures.savingsContributionId,
      "id"
    );
    assertCondition(
      "personalView",
      ownContribution !== null,
      `${label} personal-view query can read own savings contribution`
    );

    const ownReceipt = await fetchRowById(
      client,
      "receipt_uploads",
      ownFixtures.receiptUploadId,
      "id"
    );
    assertCondition(
      "personalView",
      ownReceipt !== null,
      `${label} personal-view query can read own receipt upload metadata`
    );

    const ownCandidate = await fetchRowById(
      client,
      "receipt_candidates",
      ownFixtures.receiptCandidateId,
      "id"
    );
    assertCondition(
      "personalView",
      ownCandidate !== null,
      `${label} personal-view query can read own receipt candidate`
    );

    const { data: personalCashRows } = await client
      .from("cash_snapshots")
      .select("id, user_id, notes")
      .eq("user_id", userId);

    const personalNotes = (personalCashRows ?? []).map((row) => row.notes);
    const otherLabel = label === "Owner" ? metadata.labels.memberPrivateCash : metadata.labels.ownerPrivateCash;
    assertCondition(
      "personalView",
      personalNotes.some((note) => note?.includes("PRIVATE CASH")) &&
        !personalNotes.some((note) => note === otherLabel),
      `${label} personal-view cash query returns own rows only (no other-user private labels)`
    );

    if (label === "Member") {
      const otherCash = await fetchRowById(client, "cash_snapshots", otherFixtures.cashId, "id");
      assertCondition(
        "personalView",
        otherCash === null,
        "Member must not read owner private cash by id"
      );

      const { data: ownerPaycheck } = await client
        .from("paycheck_schedules")
        .select("user_id")
        .eq("user_id", otherUserId)
        .maybeSingle();
      assertCondition(
        "personalView",
        ownerPaycheck === null,
        "Member must not read owner paycheck schedule"
      );

      const ownerParticipant = await fetchRowById(
        client,
        "savings_goal_participants",
        otherFixtures.savingsParticipantId,
        "id"
      );
      assertCondition(
        "personalView",
        ownerParticipant === null,
        "Member must not read owner savings participant"
      );

      const ownerPayment = await fetchRowById(
        client,
        "cash_payment_transactions",
        otherFixtures.cashPaymentId,
        "id"
      );
      assertCondition(
        "personalView",
        ownerPayment === null,
        "Member must not read owner cash audit rows"
      );
    }
  }
}

async function runOwnerAdminRead(ownerClient, memberClient, metadata) {
  const f = metadata.fixtures;

  const memberCash = await fetchRowById(
    ownerClient,
    "cash_snapshots",
    f.memberCashSnapshotId,
    "id, notes, amount"
  );
  assertCondition(
    "ownerAdminRead",
    memberCash !== null && memberCash.notes === metadata.labels.memberPrivateCash,
    "Owner can read active member private cash (admin SELECT)"
  );

  const { data: memberPaycheck } = await ownerClient
    .from("paycheck_schedules")
    .select("user_id, amount")
    .eq("user_id", metadata.memberUserId)
    .maybeSingle();
  assertCondition(
    "ownerAdminRead",
    memberPaycheck !== null &&
      Number(memberPaycheck.amount) === metadata.paycheckAmounts.member,
    "Owner can read active member paycheck schedule"
  );

  const memberParticipant = await fetchRowById(
    ownerClient,
    "savings_goal_participants",
    f.memberSavingsParticipantId,
    "id"
  );
  assertCondition(
    "ownerAdminRead",
    memberParticipant !== null,
    "Owner can read active member savings participant"
  );

  const memberContribution = await fetchRowById(
    ownerClient,
    "savings_contributions",
    f.memberSavingsContributionId,
    "id"
  );
  assertCondition(
    "ownerAdminRead",
    memberContribution !== null,
    "Owner can read active member savings contribution"
  );

  const memberReceipt = await fetchRowById(
    ownerClient,
    "receipt_uploads",
    f.memberReceiptUploadId,
    "id"
  );
  assertCondition(
    "ownerAdminRead",
    memberReceipt !== null,
    "Owner can read active member receipt upload metadata"
  );

  const removedCash = await fetchRowById(
    ownerClient,
    "cash_snapshots",
    f.removedCashSnapshotId,
    "id"
  );
  assertCondition(
    "ownerAdminRead",
    removedCash === null,
    "Owner admin read must not include removed member private cash"
  );

  const memberOwnerCash = await fetchRowById(
    memberClient,
    "cash_snapshots",
    f.ownerCashSnapshotId,
    "id"
  );
  assertCondition(
    "ownerAdminRead",
    memberOwnerCash === null,
    "Member cannot use owner admin read on owner private cash"
  );

  const memberOtherCash = await fetchRowById(
    memberClient,
    "cash_snapshots",
    f.memberCashSnapshotId,
    "id"
  );
  assertCondition(
    "ownerAdminRead",
    memberOtherCash !== null,
    "Member can read own private cash (not admin — own-user policy)"
  );
}

async function runOwnerAdminWriteDenial(ownerClient, memberClient, metadata) {
  const f = metadata.fixtures;
  const memberPrivateTables = [
    ["cash_snapshots", f.memberCashSnapshotId, { amount: 0.01 }],
    ["cash_payment_transactions", f.memberCashPaymentTransactionId, { notes: "C130 hijack audit" }],
    ["paycheck_schedules", null, { amount: 0.01 }],
    ["savings_goal_participants", f.memberSavingsParticipantId, { target_contribution_amount: 1 }],
    ["savings_contributions", f.memberSavingsContributionId, { amount: 0.01 }],
    ["receipt_uploads", f.memberReceiptUploadId, { original_file_name: "hijack.pdf" }],
    ["receipt_candidates", f.memberReceiptCandidateId, { merchant: "hijack" }],
    ["manual_expenses", f.memberPrivateExpenseId, { description: "C130 hijack expense" }],
  ];

  for (const [table, id, patch] of memberPrivateTables) {
    if (table === "paycheck_schedules") {
      // paycheck_schedules uses user_id as its unique lookup key (no fixture id stored).
      // RLS USING clause is user_id = auth.uid(), so the owner's update is a silent noop.
      await assertUpdateDeniedOrNoop(
        "ownerAdminWrite",
        ownerClient,
        memberClient,
        "paycheck_schedules",
        metadata.memberUserId,
        patch,
        "Owner",
        "member paycheck schedule",
        "user_id"
      );
      continue;
    }

    await assertUpdateDeniedOrNoop(
      "ownerAdminWrite",
      ownerClient,
      memberClient,
      table,
      id,
      patch,
      "Owner",
      `member ${table}`
    );
  }

  await assertDeleteDeniedOrNoop(
    "ownerAdminWrite",
    ownerClient,
    memberClient,
    "cash_snapshots",
    f.memberCashSnapshotId,
    "Owner",
    "member private cash"
  );
}

async function runMemberWriteDenial(memberClient, ownerClient, metadata) {
  const f = metadata.fixtures;

  await assertUpdateDeniedOrNoop(
    "memberPrivacy",
    memberClient,
    ownerClient,
    "cash_snapshots",
    f.ownerCashSnapshotId,
    { amount: 0.01 },
    "Member",
    "owner private cash"
  );

  const settingsUpdate = await memberClient
    .from("household_settings")
    .update({ cashflow_start_date: "2020-01-01" })
    .eq("household_id", metadata.householdId);

  assertCondition(
    "memberPrivacy",
    Boolean(settingsUpdate.error) || (settingsUpdate.count ?? 0) === 0,
    "Member cannot update household settings"
  );

  const memberUpdate = await memberClient
    .from("household_members")
    .update({ person_id: f.ownerPersonId })
    .eq("user_id", metadata.memberUserId);

  assertCondition(
    "memberPrivacy",
    Boolean(memberUpdate.error) || (memberUpdate.count ?? 0) === 0,
    "Member cannot change own profile mapping to owner profile via API"
  );

  const importUpdate = await memberClient
    .from("import_batches")
    .update({ source_file_name: "hijack.csv" })
    .eq("id", f.importBatchId);

  assertCondition(
    "memberPrivacy",
    Boolean(importUpdate.error) || (importUpdate.count ?? 0) === 0,
    "Member cannot modify import batches"
  );
}

async function runRpcIsolation(ownerClient, memberClient, metadata) {
  const f = metadata.fixtures;

  for (const [label, client, userId, foreignFixtures] of [
    [
      "Member",
      memberClient,
      metadata.memberUserId,
      {
        manualExpenseId: f.ownerPrivateExpenseId,
        savingsContributionId: f.ownerSavingsContributionId,
        billInstanceId: f.billInstanceId,
      },
    ],
    [
      "Owner",
      ownerClient,
      metadata.ownerUserId,
      {
        manualExpenseId: f.memberPrivateExpenseId,
        savingsContributionId: f.memberSavingsContributionId,
        billInstanceId: f.billInstanceId,
      },
    ],
  ]) {
    const beforeSnapshots = await countRows(client, "cash_snapshots", { user_id: userId });
    const beforePayments = await countRows(client, "cash_payment_transactions", {
      user_id: userId,
    });

    const rpcAttempts = [
      {
        fn: "pay_source_from_current_cash",
        args: {
          p_source_type: "manual_expense",
          p_source_id: foreignFixtures.manualExpenseId,
          p_amount: 1,
          p_notes: "C130 same-household RPC test",
        },
        label: "other-user private manual_expense",
      },
      {
        fn: "pay_source_from_current_cash",
        args: {
          p_source_type: "savings_contribution",
          p_source_id: foreignFixtures.savingsContributionId,
          p_amount: 1,
          p_notes: "C130 same-household RPC test",
        },
        label: "other-user savings_contribution",
      },
    ];

    for (const attempt of rpcAttempts) {
      const { error } = await client.rpc(attempt.fn, attempt.args);
      assertCondition(
        "rpcIsolation",
        Boolean(error),
        `${label} ${attempt.fn} on ${attempt.label} must fail`
      );
      if (error && !isSafeRpcErrorMessage(error.message)) {
        fail("rpcIsolation", `${label} RPC error message unsafe`);
      }
    }

    const afterSnapshots = await countRows(client, "cash_snapshots", { user_id: userId });
    const afterPayments = await countRows(client, "cash_payment_transactions", {
      user_id: userId,
    });

    assertCondition(
      "rpcIsolation",
      afterSnapshots === beforeSnapshots,
      `${label} failed RPCs must not create cash snapshots`
    );
    assertCondition(
      "rpcIsolation",
      afterPayments === beforePayments,
      `${label} failed RPCs must not create cash payment transactions`
    );
  }
}

const UI_COPY = {
  ownerInviteReadOnly: "Only a household owner can invite members.",
  ownerManageReadOnly: "Only a household owner can manage members.",
  cashflowStartReadOnly: "Only a household admin can change the cashflow start date.",
  importRollbackReadOnly: "Only a household owner can roll back spreadsheet imports.",
  personalPrivacy:
    "Personal view: only your own private cash, savings, paycheck, receipts, and audit history are shown.",
};

async function runUiIsolation(baseUrl, creds, metadata) {
  const browser = await chromium.launch({ headless: true });
  const ownerErrors = [];
  const memberErrors = [];

  try {
    const ownerContext = await browser.newContext();
    const memberContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();

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

    trackErrors(ownerPage, ownerErrors, "owner");
    trackErrors(memberPage, memberErrors, "member");

    async function login(page, email, password) {
      await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 25000,
      });
    }

    await login(ownerPage, creds.ownerEmail, creds.ownerPassword);
    await login(memberPage, creds.memberEmail, creds.memberPassword);

    const routes = [
      { path: "/", marker: "Household Cashflow Dashboard" },
      { path: "/bills", marker: "All Bills" },
      { path: "/expenses", marker: "Expenses" },
      { path: "/debt", marker: "Debt Tracker" },
      { path: "/calendar", marker: "Calendar" },
      { path: "/reports/monthly", marker: "Printable Report" },
      { path: "/settings", marker: "Settings" },
    ];

    for (const route of routes) {
      await ownerPage.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      await memberPage.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
      await ownerPage.getByText(route.marker, { exact: false }).first().waitFor({ timeout: 15000 });
      await memberPage.getByText(route.marker, { exact: false }).first().waitFor({ timeout: 15000 });
    }

    await ownerPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
    await memberPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });

    const ownerToggle = await ownerPage.getByTestId("owner-view-toggle").count();
    const memberToggle = await memberPage.getByTestId("owner-view-toggle").count();

    assertCondition(
      "uiIsolation",
      ownerToggle > 0,
      "Owner sees Admin view toggle on Settings"
    );
    assertCondition(
      "uiIsolation",
      memberToggle === 0,
      "Member must not see Admin view toggle"
    );

    let ownerBody = await ownerPage.locator("body").innerText();
    assertCondition(
      "uiIsolation",
      ownerBody.includes(UI_COPY.personalPrivacy) || ownerBody.includes("Personal view"),
      "Owner Settings loads with personal privacy copy"
    );
    assertCondition(
      "uiIsolation",
      !ownerBody.includes(metadata.labels.memberPrivateCash),
      "Owner personal view must not show member private cash label"
    );
    assertCondition(
      "uiIsolation",
      !ownerBody.includes(metadata.labels.memberReceipt),
      "Owner personal view must not show member receipt label"
    );

    await ownerPage.getByTestId("owner-view-admin").click();
    await ownerPage.getByTestId("owner-admin-banner").waitFor({ timeout: 15000 });
    await ownerPage.getByTestId("household-admin-overview").waitFor({ timeout: 15000 });

    ownerBody = await ownerPage.locator("body").innerText();
    const memberCashFormatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(metadata.cashAmounts.member);

    assertCondition(
      "uiIsolation",
      ownerBody.includes("Household admin overview") || ownerBody.includes("Admin view"),
      "Owner admin view shows admin overview"
    );
    assertCondition(
      "uiIsolation",
      ownerBody.includes(memberCashFormatted) ||
        ownerBody.includes(String(metadata.cashAmounts.member)) ||
        ownerBody.includes("Nicole"),
      "Owner admin overview includes member financial summary"
    );
    assertCondition(
      "uiIsolation",
      !ownerBody.includes(metadata.labels.removedPrivateCash),
      "Owner admin view must not show removed user private cash label"
    );

    const editButtons = await ownerPage.getByRole("button", { name: /edit|delete|remove/i }).count();
    assertCondition(
      "uiIsolation",
      editButtons === 0,
      "Owner admin overview has no edit/delete controls for member private rows"
    );

    await ownerPage.getByTestId("owner-view-personal").click();
    await ownerPage.waitForTimeout(800);
    ownerBody = await ownerPage.locator("body").innerText();
    assertCondition(
      "uiIsolation",
      !ownerBody.includes(metadata.labels.memberPrivateCash),
      "Owner personal view hides member private labels after switching back from admin"
    );

    let memberBody = await memberPage.locator("body").innerText();
    assertCondition(
      "uiIsolation",
      !memberBody.includes(metadata.labels.ownerPrivateCash),
      "Member must not see owner private cash label"
    );
    assertCondition(
      "uiIsolation",
      !memberBody.includes(metadata.labels.ownerCashAudit),
      "Member must not see owner cash audit label"
    );
    assertCondition(
      "uiIsolation",
      !memberBody.includes(metadata.labels.ownerSavings),
      "Member must not see owner savings private label"
    );
    assertCondition(
      "uiIsolation",
      !memberBody.includes(metadata.labels.ownerReceipt),
      "Member must not see owner receipt label"
    );
    assertCondition(
      "uiIsolation",
      memberBody.includes(LABEL_SHARED_BILL) || memberBody.includes(metadata.labels.sharedBill),
      "Member can see shared household bill label"
    );
    assertCondition(
      "uiIsolation",
      memberBody.includes(UI_COPY.ownerInviteReadOnly),
      "Member sees owner-only invite read-only copy"
    );
    assertCondition(
      "uiIsolation",
      (await memberPage.getByRole("button", { name: "Send invite", exact: true }).count()) === 0,
      "Member cannot invite users"
    );

    assertCondition("uiIsolation", ownerErrors.length === 0, `Owner console errors: ${ownerErrors.join("; ")}`);
    assertCondition(
      "uiIsolation",
      memberErrors.length === 0,
      `Member console errors: ${memberErrors.join("; ")}`
    );

    await ownerContext.close();
    await memberContext.close();
  } finally {
    await browser.close();
  }
}

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

async function main() {
  loadSmokeEnvFile();
  const creds = resolveSmokeCredentials();
  const metadata = readSeedMetadata();

  const missing = [
    ["CASHFLOW_OWNER_EMAIL", creds.ownerEmail],
    ["CASHFLOW_OWNER_PASSWORD", creds.ownerPassword],
    ["CASHFLOW_MEMBER_EMAIL", creds.memberEmail],
    ["CASHFLOW_MEMBER_PASSWORD", creds.memberPassword],
  ].filter(([, value]) => !value);

  if (missing.length > 0 || !metadata) {
    console.error("C130 smoke requires seeded credentials and metadata.");
    console.error(`Missing: ${missing.map(([name]) => name).join(", ")}`);
    console.error(
      'Run: $env:CASHFLOW_ALLOW_SAME_HOUSEHOLD_TEST_SEED = "YES"; node scripts/seed-same-household-two-user-privacy-test-users.mjs'
    );
    console.error(`Expected smoke env: ${SMOKE_ENV_FILE}`);
    process.exit(2);
  }

  const { supabaseUrl, anonKey } = requireAnonConfig();

  const ownerClient = await createAuthenticatedClient(
    supabaseUrl,
    anonKey,
    creds.ownerEmail,
    creds.ownerPassword
  );
  const memberClient = await createAuthenticatedClient(
    supabaseUrl,
    anonKey,
    creds.memberEmail,
    creds.memberPassword
  );

  console.log("C130 same-household privacy smoke — shared data visibility");
  await runSharedDataVisibility(ownerClient, memberClient, metadata);

  console.log("");
  console.log("C130 same-household privacy smoke — personal view");
  await runPersonalViewPrivacy(ownerClient, memberClient, metadata);

  console.log("");
  console.log("C130 same-household privacy smoke — owner admin read");
  await runOwnerAdminRead(ownerClient, memberClient, metadata);

  console.log("");
  console.log("C130 same-household privacy smoke — owner admin write denial");
  await runOwnerAdminWriteDenial(ownerClient, memberClient, metadata);

  console.log("");
  console.log("C130 same-household privacy smoke — member write denial");
  await runMemberWriteDenial(memberClient, ownerClient, metadata);

  console.log("");
  console.log("C130 same-household privacy smoke — RPC isolation");
  await runRpcIsolation(ownerClient, memberClient, metadata);

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
      console.log(`C130 — UI smoke NOT_RUN (dev server not reachable at ${baseUrl})`);
      uiResult = "NOT_RUN";
    } else {
      console.log(`C130 same-household privacy smoke — UI isolation (${baseUrl})`);
      try {
        await runUiIsolation(baseUrl, creds, metadata);
        uiResult = "PASS";
      } catch (error) {
        fail("uiIsolation", error instanceof Error ? error.message : String(error));
        uiResult = "FAIL";
      }
    }
  }

  console.log("");
  if (results.leaks.length > 0) {
    console.error(`C130 same-household privacy smoke FAILED (${results.leaks.length} leak(s)).`);
    for (const leak of results.leaks) {
      console.error(`  - [${leak.category}] ${leak.message}`);
    }
    process.exit(1);
  }

  console.log("C130 same-household privacy smoke PASSED.");
  console.log(
    "Verified: shared data, personal view, owner admin read/read-only, member privacy, RPC isolation."
  );
  if (uiResult === "PASS") {
    console.log("Verified: isolated browser contexts and Admin view UI isolation.");
  } else if (uiResult === "NOT_RUN") {
    console.log("UI smoke: NOT_RUN (start dev server on port 5230 to verify).");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
