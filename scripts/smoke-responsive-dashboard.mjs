/**
 * CASHFLOW-CURSOR-123 — Responsive Dashboard browser smoke.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5223)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5223";
const EMAIL =
  process.env.TEST_EMAIL?.trim() ??
  process.env.CASHFLOW_OWNER_EMAIL?.trim();
const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const NARROW_VIEWPORT = { width: 320, height: 740 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

const OVERFLOW_TOLERANCE_PX = 2;

const OTHER_ROUTES = [
  { path: "/bills", marker: "All Bills" },
  { path: "/expenses", marker: "Expenses" },
  { path: "/debt", marker: "Debt Tracker" },
  { path: "/calendar", marker: "Calendar", testId: "cashflow-calendar-view" },
  { path: "/reports/monthly", marker: "Printable Report" },
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

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate((tolerance) => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollOverflow =
      document.documentElement.scrollWidth > viewportWidth + tolerance ||
      document.body.scrollWidth > viewportWidth + tolerance;

    const dashboard = document.querySelector('[data-testid="dashboard-page"]');
    const main = document.querySelector("main");
    const targets = [dashboard, main, document.body].filter(Boolean);

    const elementOverflow = targets.some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
    });

    return scrollOverflow || elementOverflow;
  }, OVERFLOW_TOLERANCE_PX);

  assert(!overflow, `${label}: horizontal overflow detected`);
}

async function assertElementWithinViewport(page, testId, label) {
  const fits = await page.evaluate(({ id, tolerance }) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!element) {
      return null;
    }

    const viewportWidth = document.documentElement.clientWidth;
    const rect = element.getBoundingClientRect();
    return rect.left >= -tolerance && rect.right <= viewportWidth + tolerance;
  }, { id: testId, tolerance: OVERFLOW_TOLERANCE_PX });

  if (fits === null) {
    return;
  }

  assert(fits, `${label} (${testId}) should fit within viewport width`);
}

async function assertCurrencyValuesWithinCards(page) {
  const overflowing = await page.evaluate(() => {
    const cards = document.querySelectorAll(
      '[data-testid="dashboard-page"] [data-testid^="dashboard-"]'
    );

    return [...cards].some((card) => {
      const viewportWidth = document.documentElement.clientWidth;
      const cardRect = card.getBoundingClientRect();
      if (cardRect.right > viewportWidth + 2) {
        return true;
      }

      const amounts = card.querySelectorAll(".tabular-nums");
      return [...amounts].some((node) => {
        const rect = node.getBoundingClientRect();
        return rect.right > viewportWidth + 2;
      });
    });
  });

  assert(!overflowing, "Currency values should stay within card/viewport bounds");
}

async function assertBottomNavVisibleAndNotCoveringContent(page) {
  const bottomNav = page.getByTestId("mobile-bottom-nav");
  await bottomNav.waitFor({ state: "visible", timeout: 15000 });

  const layoutOk = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
    const dashboard = document.querySelector('[data-testid="dashboard-page"]');
    if (!nav || !dashboard) {
      return false;
    }

    const navRect = nav.getBoundingClientRect();
    const dashboardRect = dashboard.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    return (
      navRect.top >= viewportHeight - navRect.height - 4 &&
      dashboardRect.bottom <= document.documentElement.scrollHeight + 1
    );
  });

  assert(layoutOk, "Mobile bottom nav should remain visible without breaking dashboard layout");
}

async function assertForecastWindowSelectorWorks(page) {
  const forecast = page.getByTestId("dashboard-forecast-section");
  const forecastCount = await forecast.count();
  if (forecastCount === 0) {
    return;
  }

  await forecast.waitFor({ state: "visible", timeout: 15000 });
  const select = page.getByTestId("dashboard-forecast-window-select");
  await select.waitFor({ state: "visible", timeout: 15000 });
  await select.click();

  const option = page.getByRole("option").first();
  await option.waitFor({ state: "visible", timeout: 10000 });
  const optionText = (await option.textContent())?.trim() ?? "";
  await option.click();
  await page.keyboard.press("Escape");

  assert(optionText.length > 0, "Forecast window selector should expose options");
}

async function tryDrilldownOpenClose(page) {
  const viewUnpaidLink = page.getByRole("button", { name: "View unpaid bills" });
  if ((await viewUnpaidLink.count()) === 0) {
    return;
  }

  await viewUnpaidLink.first().click();
  const sheetTitle = page.getByRole("heading", { name: "Unpaid bill details" });
  await sheetTitle.first().waitFor({ state: "visible", timeout: 10000 });
  await page.keyboard.press("Escape");
  await sheetTitle.first().waitFor({ state: "hidden", timeout: 10000 });
}

async function assertDesktopMultiColumnLayout(page) {
  const summaryGrid = page.getByTestId("dashboard-monthly-summary-grid");
  await summaryGrid.waitFor({ state: "visible", timeout: 15000 });
  await summaryGrid.scrollIntoViewIfNeeded();

  const layout = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="dashboard-monthly-summary-grid"]');
    if (!grid) {
      return { found: false, multiColumn: false, columns: "" };
    }

    const columns = window.getComputedStyle(grid).gridTemplateColumns;
    const repeatMatch = columns.match(/repeat\((\d+)/);
    const columnCount = repeatMatch
      ? Number(repeatMatch[1])
      : columns.split(" ").filter(Boolean).length;
    return { found: true, multiColumn: columnCount >= 2, columns };
  });

  if (layout.found) {
    assert(
      layout.multiColumn,
      `Desktop dashboard summary should use multi-column layout (columns: ${layout.columns})`
    );
  }
}

async function runDashboardResponsiveChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("dashboard-page").waitFor({ timeout: 20000 });

  await assertNoHorizontalOverflow(page, viewportLabel);
  await assertElementWithinViewport(page, "dashboard-current-amount-card", "Current amount card");
  await assertElementWithinViewport(page, "dashboard-month-controls", "Month controls");
  await assertElementWithinViewport(page, "dashboard-period-controls", "Period controls");
  await assertCurrencyValuesWithinCards(page);

  const warnings = page.getByTestId("dashboard-warnings");
  if ((await warnings.count()) > 0) {
    await warnings.waitFor({ state: "visible", timeout: 10000 });
  }

  await page.getByTestId("dashboard-safe-to-spend-before-card").waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.getByTestId("dashboard-safe-to-spend-after-card").waitFor({
    state: "visible",
    timeout: 15000,
  });

  const forecast = page.getByTestId("dashboard-forecast-section");
  if ((await forecast.count()) > 0) {
    await forecast.waitFor({ state: "visible", timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${viewportLabel} forecast`);
  }

  const debtSummary = page.getByTestId("dashboard-debt-summary");
  if ((await debtSummary.count()) > 0) {
    await debtSummary.waitFor({ state: "visible", timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${viewportLabel} debt summary`);
  }
}

async function main() {
  assert(EMAIL && PASSWORD, "Missing TEST_EMAIL/TEST_PASSWORD or C112 seed env");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  try {
    await login(page);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await runDashboardResponsiveChecks(page, "Mobile 390px");
    await assertBottomNavVisibleAndNotCoveringContent(page);
    await assertForecastWindowSelectorWorks(page);
    await tryDrilldownOpenClose(page);

    await page.setViewportSize(NARROW_VIEWPORT);
    await runDashboardResponsiveChecks(page, "Narrow 320px");

    for (const route of OTHER_ROUTES) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.getByText(route.marker, { exact: false }).first().waitFor({ timeout: 15000 });
      if (route.testId) {
        await page.getByTestId(route.testId).waitFor({ timeout: 15000 });
      }
    }

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await runDashboardResponsiveChecks(page, "Desktop 1280px");
    await assertDesktopMultiColumnLayout(page);
    await page.getByTestId("mobile-bottom-nav").waitFor({ state: "hidden", timeout: 15000 });

    assert(
      consoleErrors.length === 0,
      `Browser console errors:\n${consoleErrors.join("\n")}`
    );

    console.log("CASHFLOW-CURSOR-123 smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-123 smoke: FAIL");
  console.error(error);
  process.exit(1);
});
