/**
 * CASHFLOW-CURSOR-120 — Printable report browser smoke.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5220)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5220";
const EMAIL =
  process.env.TEST_EMAIL?.trim() ??
  process.env.CASHFLOW_OWNER_EMAIL?.trim();
const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

const REPORT_SECTIONS = [
  "monthly-report-section-cash",
  "monthly-report-section-bills",
  "monthly-report-section-debt",
  "monthly-report-section-savings",
  "monthly-report-section-expenses",
  "monthly-report-section-income",
  "monthly-report-section-forecast",
  "monthly-report-section-warnings",
  "monthly-report-section-calendar",
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

    await page.goto(`${BASE_URL}/reports/monthly`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Printable Report" }).waitFor({ timeout: 15000 });
    await page.getByTestId("monthly-report-month-selector").waitFor({ timeout: 15000 });
    await page.getByTestId("monthly-print-report").waitFor({ timeout: 20000 });
    await page.getByTestId("monthly-report-print-button").waitFor({ timeout: 15000 });

    for (const sectionTestId of REPORT_SECTIONS) {
      await page.getByTestId(sectionTestId).waitFor({ timeout: 15000 });
    }

    await page.getByRole("button", { name: "Print report" }).waitFor({ timeout: 15000 });

    const printCssPresent = await page.evaluate(async () => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSMediaRule && rule.condition?.media?.includes("print")) {
              return true;
            }
          }
        } catch {
          // Cross-origin stylesheets may be inaccessible.
        }
      }
      return document.querySelector(".no-print") !== null;
    });
    assert(printCssPresent, "Print CSS classes or @media print rules should be present");

    await page.emulateMedia({ media: "print" });
    const printControlsHidden = await page.getByTestId("monthly-report-month-selector").evaluate((node) => {
      return window.getComputedStyle(node).display === "none";
    });
    const navHidden = await page.locator("header.no-print").evaluate((node) => {
      return window.getComputedStyle(node).display === "none";
    });
    assert(printControlsHidden, "Month selector and print controls should be hidden under print media");
    assert(navHidden, "Navigation header should be hidden under print media");
    await page.emulateMedia({ media: "screen" });

    await page.getByTestId("monthly-report-month-selector").locator("button").first().click();
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

    console.log("CASHFLOW-CURSOR-120 smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-120 smoke: FAIL");
  console.error(error);
  process.exit(1);
});
