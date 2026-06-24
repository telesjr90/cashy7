/**
 * CASHFLOW-CURSOR-122 — Mobile navigation browser smoke.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5222)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5222";
const EMAIL =
  process.env.TEST_EMAIL?.trim() ??
  process.env.CASHFLOW_OWNER_EMAIL?.trim();
const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

const PRIMARY_ROUTES = [
  { id: "dashboard", path: "/", marker: "Household Cashflow Dashboard", label: "Dashboard" },
  { id: "bills", path: "/bills", marker: "All Bills", label: "Bills" },
  { id: "expenses", path: "/expenses", marker: "Expenses", label: "Expenses" },
  { id: "calendar", path: "/calendar", marker: "Calendar", label: "Calendar", testId: "cashflow-calendar-view" },
];

const SECONDARY_ROUTES = [
  { id: "debt", path: "/debt", marker: "Debt Tracker", label: "Debt" },
  { id: "reports", path: "/reports/monthly", marker: "Printable Report", label: "Reports" },
  { id: "settings", path: "/settings", marker: "Settings", label: "Settings" },
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

async function assertNavChromeFitsViewport(page) {
  const navOverflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const elements = [
      document.querySelector("header.no-print"),
      document.querySelector('[data-testid="mobile-bottom-nav"]'),
    ];

    return elements.some((element) => {
      if (!element) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > viewportWidth + 1 || rect.width > viewportWidth + 1;
    });
  });

  assert(!navOverflow, "Navigation chrome should not overflow the mobile viewport");
}

async function assertMobileNavVisible(page) {
  await page.getByTestId("mobile-bottom-nav").waitFor({ state: "visible", timeout: 15000 });
  await page.getByTestId("mobile-nav-more-button").waitFor({ state: "visible", timeout: 15000 });
}

async function assertDesktopNavHidden(page) {
  await page.getByTestId("desktop-app-nav").waitFor({ state: "hidden", timeout: 15000 });
}

async function assertDesktopNavVisible(page) {
  await page.getByTestId("desktop-app-nav").waitFor({ state: "visible", timeout: 15000 });
  await page.getByTestId("mobile-bottom-nav").waitFor({ state: "hidden", timeout: 15000 });
}

const SECONDARY_ROUTE_IDS = new Set(SECONDARY_ROUTES.map((route) => route.id));

async function assertActiveMobileNav(page, navId) {
  if (SECONDARY_ROUTE_IDS.has(navId)) {
    await page
      .getByTestId("mobile-nav-more-button")
      .waitFor({ state: "visible", timeout: 15000 });
    const isMoreActive = await page.getByTestId("mobile-nav-more-button").evaluate((node) => {
      return node.getAttribute("aria-current") === "page";
    });
    assert(isMoreActive, `More button should be active for secondary route ${navId}`);
    return;
  }

  const activeLink = page.locator(`[data-testid="mobile-nav-${navId}"][aria-current="page"]`);
  await activeLink.first().waitFor({ state: "visible", timeout: 15000 });
}

async function openMoreSheet(page) {
  await page.getByTestId("mobile-nav-more-button").click();
  await page.getByTestId("mobile-nav-more-sheet").waitFor({ state: "visible", timeout: 15000 });
}

async function navigateSecondaryRoute(page, route) {
  await openMoreSheet(page);
  await page.getByTestId(`mobile-nav-${route.id}`).click();
  await page.waitForURL((url) => url.pathname === route.path, { timeout: 15000 });
  await page.getByText(route.marker, { exact: false }).first().waitFor({ timeout: 15000 });
  await page.getByTestId("mobile-nav-more-sheet").waitFor({ state: "hidden", timeout: 15000 });
  await assertActiveMobileNav(page, route.id);
}

async function main() {
  assert(EMAIL && PASSWORD, "Missing TEST_EMAIL/TEST_PASSWORD or C112 seed env");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = await collectConsoleErrors(page);

  try {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await login(page);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await assertMobileNavVisible(page);
    await assertDesktopNavHidden(page);
    await assertNavChromeFitsViewport(page);
    await assertActiveMobileNav(page, "dashboard");
    await page.getByTestId("mobile-current-route").waitFor({ timeout: 15000 });
    await page.getByText("Dashboard", { exact: true }).first().waitFor({ timeout: 15000 });

    for (const route of PRIMARY_ROUTES.slice(1)) {
      await page.getByTestId(`mobile-nav-${route.id}`).click();
      await page.waitForURL((url) => url.pathname === route.path, { timeout: 15000 });
      await page.getByText(route.marker, { exact: false }).first().waitFor({ timeout: 15000 });
      if (route.testId) {
        await page.getByTestId(route.testId).waitFor({ timeout: 15000 });
      }
      await assertActiveMobileNav(page, route.id);
      await assertNavChromeFitsViewport(page);
    }

    for (const route of SECONDARY_ROUTES) {
      await navigateSecondaryRoute(page, route);
      await assertNavChromeFitsViewport(page);
    }

    await page.emulateMedia({ media: "print" });
    const navHidden = await page.locator("header.no-print").evaluate((node) => {
      return window.getComputedStyle(node).display === "none";
    });
    const bottomNavHidden = await page.locator('[data-testid="mobile-bottom-nav"]').evaluate((node) => {
      return window.getComputedStyle(node).display === "none";
    });
    assert(navHidden, "Navigation header should be hidden under print media");
    assert(bottomNavHidden, "Mobile bottom nav should be hidden under print media");
    await page.emulateMedia({ media: "screen" });

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await assertDesktopNavVisible(page);
    await page.getByRole("link", { name: "Bills" }).click();
    await page.waitForURL((url) => url.pathname === "/bills", { timeout: 15000 });
    await page.getByText("All Bills", { exact: false }).first().waitFor({ timeout: 15000 });

    assert(
      consoleErrors.length === 0,
      `Browser console errors:\n${consoleErrors.join("\n")}`
    );

    console.log("CASHFLOW-CURSOR-122 smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-122 smoke: FAIL");
  console.error(error);
  process.exit(1);
});
