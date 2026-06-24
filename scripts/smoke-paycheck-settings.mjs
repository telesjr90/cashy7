/**
 * CASHFLOW-CURSOR-113/114/115/116/117/118 — Paycheck settings browser smoke.
 *
 * C114: selects and saves the 15th/30th schedule; verifies forecast privacy copy.
 * C115: selects and saves the 15th/last business day schedule.
 * C116: verifies business-day schedule labels and privacy copy after holiday hardening.
 * C117: verifies actual paycheck date preview in Settings and Dashboard forecast.
 * C118: verifies forecast projected income, window selector, and adjusted paycheck dates.
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

const DATE_PREVIEW_COPY = {
  title: "Upcoming paycheck dates",
  adjustment: "Dates adjust backward for weekends and B.C. statutory holidays.",
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

async function savePaycheckSchedule(page, { schedulePattern, amount }) {
  await page.locator("#paycheck-schedule-type").click();
  await page.getByRole("option", { name: schedulePattern }).click();
  await page.locator("#paycheck-amount").fill(amount);
  await page.getByRole("button", { name: "Save paycheck schedule" }).click();
  await page.getByText("Paycheck schedule saved.", { exact: false }).waitFor({
    timeout: 10000,
  });
}

async function assertPaycheckDatePreview(page) {
  const text = await page.locator("body").innerText();
  assert(
    text.includes(DATE_PREVIEW_COPY.title),
    "Missing upcoming paycheck dates preview heading"
  );
  assert(
    text.includes(DATE_PREVIEW_COPY.adjustment),
    "Missing business-day/B.C. holiday adjustment copy"
  );
  assert(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/.test(
      text
    ),
    "Paycheck date preview should include a readable formatted date"
  );
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
    const scheduleOptionsText = await page.locator("body").innerText();
    assert(
      scheduleOptionsText.includes("previous business day") ||
        scheduleOptionsText.includes("B.C. holiday") ||
        scheduleOptionsText.includes("B.C. statutory holidays") ||
        scheduleOptionsText.includes("Dates adjust backward"),
      "Schedule labels should mention business-day or B.C. holiday adjustment"
    );
    await page.keyboard.press("Escape");

    await page.locator("#paycheck-schedule-type").click();
    await page.getByRole("option", {
      name: /15th and 30th of each month/i,
    }).click();
    await page.locator("#paycheck-amount").fill("-5");
    await page.getByRole("button", { name: "Save paycheck schedule" }).click();
    await page.getByText("Paycheck amount must be zero or greater.", {
      exact: false,
    }).waitFor({ timeout: 5000 });

    const uniqueAmount1530 = "2127.08";
    await savePaycheckSchedule(page, {
      schedulePattern: /15th and 30th of each month/i,
      amount: uniqueAmount1530,
    });
    await assertPaycheckDatePreview(page);

    const uniqueAmountLastBd = "2345.67";
    await savePaycheckSchedule(page, {
      schedulePattern: /15th and last business day of each month/i,
      amount: uniqueAmountLastBd,
    });
    await assertPaycheckDatePreview(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.getByText("Household Cashflow Dashboard", { exact: false }).first().waitFor({
      timeout: 15000,
    });
    await page.getByText(/Income CA\$/i).first().waitFor({ timeout: 15000 });
    await page.getByText("Future safe-to-spend forecast", { exact: false }).first().waitFor({
      timeout: 15000,
    });
    await page.getByText(DATE_PREVIEW_COPY.title, { exact: false }).first().waitFor({
      timeout: 20000,
    });

    const formattedCad = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(Number(uniqueAmountLastBd));
    const formattedApp = `CA$${new Intl.NumberFormat("en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(uniqueAmountLastBd))}`;
    const doubledAmount = (Number(uniqueAmountLastBd) * 2).toFixed(2);
    const formattedDoubledApp = `CA$${new Intl.NumberFormat("en-CA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(uniqueAmountLastBd) * 2)}`;

    await page.waitForFunction(
      ({ amount, cad, app, doubled, doubledApp }) => {
        const text = document.body.innerText;
        return (
          text.includes(amount) ||
          text.includes(cad) ||
          text.includes(cad.replace(/\u00a0/g, " ")) ||
          text.includes(app) ||
          text.includes(doubled) ||
          text.includes(doubledApp)
        );
      },
      {
        amount: uniqueAmountLastBd,
        cad: formattedCad,
        app: formattedApp,
        doubled: doubledAmount,
        doubledApp: formattedDoubledApp,
      },
      { timeout: 20000 }
    );

    const dashboardText = await page.locator("body").innerText();
    assert(
      dashboardText.includes(uniqueAmountLastBd) ||
        dashboardText.includes(formattedCad) ||
        dashboardText.includes(formattedCad.replace(/\u00a0/g, " ")) ||
        dashboardText.includes(formattedApp) ||
        dashboardText.includes(doubledAmount) ||
        dashboardText.includes(formattedDoubledApp),
      "Dashboard should reflect saved paycheck amount for current user"
    );
    assert(
      dashboardText.includes(DATE_PREVIEW_COPY.title),
      "Dashboard forecast should show upcoming paycheck dates summary"
    );
    assert(
      dashboardText.includes(DATE_PREVIEW_COPY.adjustment),
      "Dashboard forecast should show business-day adjustment copy"
    );
    assert(
      dashboardText.includes("Income in forecast"),
      "Dashboard forecast should show projected income summary metric"
    );
    assert(
      dashboardText.includes("Includes your private expected paycheck schedule."),
      "Dashboard forecast should show configured income label"
    );
    assert(!dashboardText.includes("2127.08"), "Dashboard leaked other hardcoded Teles amount");
    assert(!dashboardText.includes("1990.11"), "Dashboard leaked hardcoded Nicole amount");

    const forecastWindowSelect = page.locator('[role="combobox"]').filter({
      has: page.getByText("Rest of this month"),
    });
    await forecastWindowSelect.click();
    await page.getByRole("option", { name: "Next 90 days" }).click();
    await page.getByText("Next 90 days", { exact: false }).first().waitFor({
      timeout: 10000,
    });
    await page.getByText(DATE_PREVIEW_COPY.title, { exact: false }).first().waitFor({
      timeout: 10000,
    });

    const next90Text = await page.locator("body").innerText();
    assert(
      next90Text.includes("Next 90 days"),
      "Forecast window selector should update the displayed window"
    );
    assert(
      next90Text.includes(uniqueAmountLastBd) ||
        next90Text.includes(formattedCad) ||
        next90Text.includes(formattedCad.replace(/\u00a0/g, " ")) ||
        next90Text.includes(formattedApp),
      "Next 90 days forecast should still show current-user projected income"
    );

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

    console.log("CASHFLOW-CURSOR-118 browser smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-118 browser smoke: FAIL");
  console.error(error.message);
  process.exit(1);
});
