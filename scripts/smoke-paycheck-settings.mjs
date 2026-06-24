/**
 * CASHFLOW-CURSOR-113/114 — Paycheck settings browser smoke.
 *
 * C114: selects and saves the 15th/30th schedule; verifies forecast privacy copy.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5212)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5212";
const EMAIL =
  process.env.TEST_EMAIL?.trim() ??
  process.env.CASHFLOW_OWNER_EMAIL?.trim();
const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

const PRIVACY_COPY = {
  amount: "Only you can see your paycheck amount.",
  forecast: "This is used for your forecast only.",
  household: "Other household members cannot see your paycheck settings.",
};

const ROUTES = [
  { path: "/settings", marker: "Settings" },
  { path: "/", marker: "Household Cashflow Dashboard" },
  { path: "/bills", marker: "All Bills" },
  { path: "/expenses", marker: "Expenses" },
  { path: "/debt", marker: "Debt Tracker" },
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

    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByText("Your paycheck schedule", { exact: false }).first().waitFor({
      timeout: 15000,
    });

    const settingsText = await page.locator("body").innerText();
    assert(
      settingsText.includes(PRIVACY_COPY.amount),
      "Missing paycheck amount privacy copy"
    );
    assert(
      settingsText.includes(PRIVACY_COPY.forecast),
      "Missing forecast-only privacy copy"
    );
    assert(
      settingsText.includes(PRIVACY_COPY.household),
      "Missing household privacy copy"
    );

    await page.locator("#paycheck-schedule-type").click();
    await page.getByRole("option", {
      name: /15th and 30th of each month/i,
    }).click();
    await page.locator("#paycheck-amount").fill("-5");
    await page.getByRole("button", { name: "Save paycheck schedule" }).click();
    await page.getByText("Paycheck amount must be zero or greater.", {
      exact: false,
    }).waitFor({ timeout: 5000 });

    const uniqueAmount = "2345.67";
    await page.locator("#paycheck-amount").fill(uniqueAmount);
    await page.getByRole("button", { name: "Save paycheck schedule" }).click();
    await page.getByText("Paycheck schedule saved.", { exact: false }).waitFor({
      timeout: 10000,
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.getByText("Household Cashflow Dashboard", { exact: false }).first().waitFor({
      timeout: 15000,
    });
    await page.getByText(/Income CA\$/i).first().waitFor({ timeout: 15000 });
    const dashboardText = await page.locator("body").innerText();
    const formattedCad = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(Number(uniqueAmount));
    const formattedApp = `CA$${new Intl.NumberFormat("en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(uniqueAmount))}`;
    assert(
      dashboardText.includes(uniqueAmount) ||
        dashboardText.includes(formattedCad) ||
        dashboardText.includes(formattedCad.replace(/\u00a0/g, " ")) ||
        dashboardText.includes(formattedApp),
      "Dashboard should reflect saved paycheck amount for current user"
    );
    assert(!dashboardText.includes("2127.08"), "Dashboard leaked hardcoded Teles amount");
    assert(!dashboardText.includes("1990.11"), "Dashboard leaked hardcoded Nicole amount");

    for (const route of ROUTES) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.getByText(route.marker, { exact: false }).first().waitFor({
        timeout: 15000,
      });
    }

    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByText("Receipt upload storage", { exact: false }).first().waitFor({
      timeout: 15000,
    }).catch(() => null);

    assert(
      consoleErrors.length === 0,
      `Browser console errors: ${consoleErrors.join(" | ")}`
    );

    console.log("CASHFLOW-CURSOR-114 browser smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-114 browser smoke: FAIL");
  console.error(error.message);
  process.exit(1);
});
