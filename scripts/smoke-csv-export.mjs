/**
 * CASHFLOW-CURSOR-121 — CSV export browser smoke.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5221)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  loadSmokeEnvFile,
  MEMBER_PAYCHECK_AMOUNT,
  MEMBER_PRIVATE_GOAL_NAME,
  OWNER_PRIVATE_GOAL_NAME,
} from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5221";
const EMAIL =
  process.env.TEST_EMAIL?.trim() ??
  process.env.CASHFLOW_OWNER_EMAIL?.trim();
const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

const EXPECTED_HEADERS =
  "section,type,date,period,title,status,category,amount,effect,source,notes,warning,privacy_scope";

const REQUIRED_SECTIONS = [
  "cash_position",
  "bills",
  "debt",
  "savings",
  "expenses",
  "income",
  "forecast",
  "calendar",
];

const ROUTES = [
  { path: "/reports/monthly", marker: "Printable Report" },
  { path: "/", marker: "Household Cashflow Dashboard" },
  { path: "/calendar", marker: "Calendar", testId: "cashflow-calendar-view" },
  { path: "/bills", marker: "All Bills" },
  { path: "/expenses", marker: "Expenses" },
  { path: "/debt", marker: "Debt Tracker" },
  { path: "/settings", marker: "Settings" },
];

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

function readDownloadedCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.replace(/^\uFEFF/, "");
}

async function main() {
  assert(EMAIL && PASSWORD, "Missing TEST_EMAIL/TEST_PASSWORD or C112 seed env");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = await collectConsoleErrors(page);

  try {
    await login(page);

    await page.goto(`${BASE_URL}/reports/monthly`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Printable Report" }).waitFor({ timeout: 15000 });
    await page.getByTestId("monthly-report-month-selector").waitFor({ timeout: 15000 });
    await page.getByTestId("monthly-print-report").waitFor({ timeout: 20000 });

    const monthTitle = await page.getByTestId("monthly-print-report").innerText();
    assert(monthTitle.length > 0, "Selected month report content should be visible");

    await page.getByTestId("monthly-report-export-csv-button").waitFor({ timeout: 15000 });
    await page.getByTestId("monthly-report-print-button").waitFor({ timeout: 15000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;

    const suggestedFilename = download.suggestedFilename();
    assert(
      /^cashflow-report-\d{4}-\d{2}\.csv$/.test(suggestedFilename),
      `Download filename should match cashflow-report-YYYY-MM.csv, got ${suggestedFilename}`
    );

    const downloadPath = path.join(process.cwd(), ".tmp", suggestedFilename);
    fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
    await download.saveAs(downloadPath);

    const csvText = readDownloadedCsv(downloadPath);
    assert(csvText.includes(EXPECTED_HEADERS), "CSV should include required headers");

    for (const section of REQUIRED_SECTIONS) {
      assert(csvText.includes(section), `CSV should include ${section} section rows`);
    }

    assert(!UUID_PATTERN.test(csvText), "CSV should not contain raw UUID-looking labels");

    if (OWNER_PRIVATE_GOAL_NAME) {
      assert(
        !csvText.includes(MEMBER_PRIVATE_GOAL_NAME),
        "CSV should not expose other-user private savings goal labels when C112 seed is present"
      );
    }

    if (MEMBER_PAYCHECK_AMOUNT) {
      const memberPaycheckLabel = String(MEMBER_PAYCHECK_AMOUNT);
      assert(
        !csvText.includes(memberPaycheckLabel),
        "CSV should not expose other-user paycheck amounts when C112 seed is present"
      );
    }

    await page.getByTestId("monthly-report-export-status").waitFor({ timeout: 5000 });
    const exportStatus = await page.getByTestId("monthly-report-export-status").innerText();
    assert(exportStatus.includes("Exported cashflow-report-"), "Export success message should appear");

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

    console.log("CASHFLOW-CURSOR-121 smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-121 smoke: FAIL");
  console.error(error);
  process.exit(1);
});
