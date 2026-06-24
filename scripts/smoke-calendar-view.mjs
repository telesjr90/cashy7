/**
 * CASHFLOW-CURSOR-119 — Calendar view browser smoke.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5219)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5219";
const EMAIL =
  process.env.TEST_EMAIL?.trim() ??
  process.env.CASHFLOW_OWNER_EMAIL?.trim();
const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

const ROUTES = [
  { path: "/calendar", marker: "Calendar", testId: "cashflow-calendar-view" },
  { path: "/", marker: "Household Cashflow Dashboard" },
  { path: "/bills", marker: "All Bills" },
  { path: "/expenses", marker: "Expenses" },
  { path: "/debt", marker: "Debt Tracker" },
  { path: "/settings", marker: "Settings" },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });
}

async function collectConsoleErrors(page) {
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

async function main() {
  assert(EMAIL && PASSWORD, "Missing TEST_EMAIL/TEST_PASSWORD or C112 seed env");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = await collectConsoleErrors(page);

  try {
    await login(page);

    await page.getByRole("link", { name: "Calendar" }).click();
    await page.waitForURL((url) => url.pathname === "/calendar", { timeout: 15000 });
    await page.getByRole("heading", { name: "Calendar" }).waitFor({ timeout: 15000 });
    await page.getByTestId("calendar-month-selector").waitFor({ timeout: 15000 });
    await page.getByTestId("cashflow-calendar-view").waitFor({ timeout: 15000 });
    await page.getByText("Month grid", { exact: false }).waitFor({ timeout: 20000 });

    const calendarText = await page.locator('[data-testid="cashflow-calendar-view"]').innerText();
    assert(
      calendarText.includes("Month grid") || calendarText.includes("No planning events"),
      "Calendar grid or empty state should render"
    );
    assert(
      calendarText.includes("Chronological list"),
      "Chronological list section should render"
    );

    await page.getByRole("button").filter({ has: page.locator("svg") }).first().click();
    await page.waitForTimeout(300);

    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.getByText(route.marker, { exact: false }).first().waitFor({
        timeout: 15000,
      });

      if (route.testId) {
        await page.getByTestId(route.testId).waitFor({ timeout: 15000 });
      }
    }

    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByText("Your paycheck schedule", { exact: false }).first().waitFor({
      timeout: 15000,
    });

    const settingsText = await page.locator("body").innerText();
    assert(
      settingsText.includes("Receipt") ||
        settingsText.includes("Import") ||
        settingsText.includes("receipt"),
      "Settings should still expose receipt/import sections"
    );

    assert(
      consoleErrors.length === 0,
      `Browser console errors:\n${consoleErrors.join("\n")}`
    );

    console.log("CASHFLOW-CURSOR-119 calendar smoke PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
