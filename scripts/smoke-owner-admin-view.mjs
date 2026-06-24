/**
 * CASHFLOW-OWNER-001 — Owner Personal/Admin view + invite profile assignment smoke.
 *
 * Verifies, signed in as the household owner:
 *  - Personal/Admin toggle is visible (owner only).
 *  - Personal view is the default; personal privacy copy is shown.
 *  - Switching to Admin view shows the admin banner + household admin overview.
 *  - Switching back to Personal view restores the privacy copy and hides admin.
 *  - The invite form shows a profile dropdown; the Nicole profile can be selected.
 *  - No console errors; no mobile horizontal overflow.
 *
 * Optional non-owner check (when CASHFLOW_MEMBER_EMAIL/PASSWORD are provided):
 *  - Member does NOT see the Personal/Admin toggle.
 *
 * Env: TEST_EMAIL/TEST_PASSWORD or CASHFLOW_OWNER_EMAIL/CASHFLOW_OWNER_PASSWORD
 * Optional: CASHFLOW_MEMBER_EMAIL/CASHFLOW_MEMBER_PASSWORD
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5230)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5230";
const OWNER_EMAIL =
  process.env.TEST_EMAIL?.trim() ?? process.env.CASHFLOW_OWNER_EMAIL?.trim();
const OWNER_PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;
const MEMBER_EMAIL = process.env.CASHFLOW_MEMBER_EMAIL?.trim();
const MEMBER_PASSWORD = process.env.CASHFLOW_MEMBER_PASSWORD;

const PERSONAL_PRIVACY_FRAGMENT = "Personal view: only your own private";
const ADMIN_BANNER_FRAGMENT =
  "Admin view: You are viewing all household member data as owner.";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  assert(overflow <= 2, `Horizontal overflow detected (${label}): ${overflow}px`);
}

async function runOwnerChecks(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  try {
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);

    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("owner-view-toggle").waitFor({
      state: "visible",
      timeout: 20000,
    });

    // Personal view is the default.
    await page.getByTestId("owner-personal-privacy-copy").waitFor({
      state: "visible",
      timeout: 10000,
    });
    let bodyText = await page.locator("body").innerText();
    assert(
      bodyText.includes(PERSONAL_PRIVACY_FRAGMENT),
      "Personal privacy copy should be visible in Personal view"
    );
    assert(
      (await page.getByTestId("household-admin-overview").count()) === 0,
      "Admin overview should not render in Personal view"
    );
    await assertNoHorizontalOverflow(page, "personal view");

    // Switch to Admin view.
    await page.getByTestId("owner-view-admin").click();
    await page.getByTestId("owner-admin-banner").waitFor({
      state: "visible",
      timeout: 15000,
    });
    await page.getByTestId("household-admin-overview").waitFor({
      state: "visible",
      timeout: 15000,
    });
    bodyText = await page.locator("body").innerText();
    assert(
      bodyText.includes(ADMIN_BANNER_FRAGMENT),
      "Admin banner copy should be visible in Admin view"
    );
    await assertNoHorizontalOverflow(page, "admin view");

    // Switch back to Personal view.
    await page.getByTestId("owner-view-personal").click();
    await page.getByTestId("owner-personal-privacy-copy").waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert(
      (await page.getByTestId("owner-admin-banner").count()) === 0,
      "Admin banner should disappear when returning to Personal view"
    );

    // Invite form: profile dropdown visible and Nicole selectable.
    const profileTrigger = page.getByTestId("household-invite-profile-trigger");
    await profileTrigger.waitFor({ state: "visible", timeout: 15000 });
    await profileTrigger.click();
    const nicoleOption = page.getByRole("option", { name: /Nicole/i });
    await nicoleOption.first().waitFor({ state: "visible", timeout: 10000 });
    assert(
      (await nicoleOption.count()) > 0,
      "Invite form should offer the Nicole profile"
    );
    // Teles profile is reserved by the active owner (best-effort check).
    const telesOption = page.getByRole("option", { name: /Teles/i }).first();
    if ((await telesOption.count()) > 0) {
      const telesText = (await telesOption.textContent()) ?? "";
      if (/Already assigned|Reserved/i.test(telesText)) {
        console.log("Owner profile (Teles) correctly shown as reserved.");
      }
    }
    await page.keyboard.press("Escape");

    assert(
      consoleErrors.length === 0,
      `Browser console errors (owner): ${consoleErrors.join(" | ")}`
    );

    console.log("Owner Personal/Admin view smoke: PASS");
  } finally {
    await context.close();
  }
}

async function runMemberChecks(browser) {
  if (!MEMBER_EMAIL || !MEMBER_PASSWORD) {
    console.log(
      "Non-owner check skipped (set CASHFLOW_MEMBER_EMAIL/CASHFLOW_MEMBER_PASSWORD to enable)."
    );
    return;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD);
    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByText("Settings", { exact: false }).first().waitFor({
      timeout: 15000,
    });
    assert(
      (await page.getByTestId("owner-view-toggle").count()) === 0,
      "Non-owner must not see the Personal/Admin toggle"
    );
    assert(
      (await page.getByTestId("household-admin-overview").count()) === 0,
      "Non-owner must not see the household admin overview"
    );
    console.log("Non-owner toggle hidden smoke: PASS");
  } finally {
    await context.close();
  }
}

async function main() {
  assert(
    OWNER_EMAIL && OWNER_PASSWORD,
    "Missing owner credentials (TEST_EMAIL/TEST_PASSWORD or CASHFLOW_OWNER_*)"
  );

  const browser = await chromium.launch({ headless: true });
  try {
    await runOwnerChecks(browser);
    await runMemberChecks(browser);
    console.log("CASHFLOW-OWNER-001 browser smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-OWNER-001 browser smoke: FAIL");
  console.error(error.message);
  process.exit(1);
});
