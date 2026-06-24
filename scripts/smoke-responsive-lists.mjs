/**
 * CASHFLOW-CURSOR-124 — Responsive Bills/Debt/Expenses lists browser smoke.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5224)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5224";
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
  { path: "/", marker: "dashboard-page", testId: "dashboard-page" },
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

    const main = document.querySelector("main");
    const targets = [main, document.body].filter(Boolean);

    const elementOverflow = targets.some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
    });

    return scrollOverflow || elementOverflow;
  }, OVERFLOW_TOLERANCE_PX);

  assert(!overflow, `${label}: horizontal overflow detected`);
}

async function assertListContainersWithinViewport(page, testIds, label) {
  const overflowing = await page.evaluate(
    ({ ids, tolerance }) => {
      const viewportWidth = document.documentElement.clientWidth;
      return ids.some((id) => {
        const elements = document.querySelectorAll(`[data-testid="${id}"]`);
        return [...elements].some((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
        });
      });
    },
    { ids: testIds, tolerance: OVERFLOW_TOLERANCE_PX }
  );

  assert(!overflowing, `${label}: list containers should fit within viewport`);
}

async function assertBottomNavVisible(page) {
  const bottomNav = page.getByTestId("mobile-bottom-nav");
  await bottomNav.waitFor({ state: "visible", timeout: 15000 });
}

async function assertBottomNavNotCoveringLastCard(page, listTestId) {
  const layoutOk = await page.evaluate(({ listId }) => {
    const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
    const list = document.querySelector(`[data-testid="${listId}"]`);
    if (!nav || !list) {
      return true;
    }

    const cards = list.querySelectorAll("article");
    if (cards.length === 0) {
      return true;
    }

    const lastCard = cards[cards.length - 1];
    const navRect = nav.getBoundingClientRect();
    const cardRect = lastCard.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    return cardRect.bottom <= document.documentElement.scrollHeight + 1 &&
      navRect.top >= viewportHeight - navRect.height - 8;
  }, { listId: listTestId });

  assert(
    layoutOk,
    `Bottom nav should not permanently cover ${listTestId} content`
  );
}

async function tryOpenCloseDetailSheet(page, detailsButtonName) {
  const detailsButton = page.getByRole("button", { name: detailsButtonName }).first();
  if ((await detailsButton.count()) === 0) {
    return;
  }

  await detailsButton.click();
  const sheet = page.locator('[role="dialog"], [data-state="open"]').first();
  await sheet.waitFor({ state: "visible", timeout: 10000 });
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
}

async function assertDesktopTableVisible(page, desktopListTestId) {
  const desktopList = page.getByTestId(desktopListTestId);
  await desktopList.waitFor({ state: "visible", timeout: 15000 });
  const mobileHidden = await page.evaluate((id) => {
    const desktop = document.querySelector(`[data-testid="${id}"]`);
    if (!desktop) {
      return false;
    }
    const style = window.getComputedStyle(desktop);
    return style.display !== "none";
  }, desktopListTestId);

  assert(mobileHidden, `${desktopListTestId} should be visible on desktop`);
}

async function assertMobileCardsVisible(page, mobileListTestId) {
  const mobileList = page.getByTestId(mobileListTestId);
  if ((await mobileList.count()) === 0) {
    return;
  }

  await mobileList.waitFor({ state: "visible", timeout: 15000 });
  const cardCount = await page.getByTestId(
    mobileListTestId.replace("-list", "-card")
  ).count();
  if (cardCount > 0) {
    await assertNoHorizontalOverflow(page, mobileListTestId);
  }
}

async function runBillsChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/bills`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("bills-page").waitFor({ timeout: 20000 });
  await page.getByRole("heading", { name: "All Bills" }).waitFor({
    timeout: 15000,
  });

  await assertNoHorizontalOverflow(page, `${viewportLabel} bills page`);

  const filters = page.getByTestId("bills-filters");
  if ((await filters.count()) > 0) {
    await filters.waitFor({ state: "visible", timeout: 10000 });
    await assertNoHorizontalOverflow(page, `${viewportLabel} bills filters`);
  }

  await assertListContainersWithinViewport(
    page,
    ["bills-mobile-list", "bills-desktop-list", "bills-mobile-card"],
    `${viewportLabel} bills lists`
  );

  if (viewportLabel.includes("Desktop")) {
    if ((await page.getByTestId("bills-desktop-list").count()) > 0) {
      await assertDesktopTableVisible(page, "bills-desktop-list");
    }
  } else {
    await assertMobileCardsVisible(page, "bills-mobile-list");
    await tryOpenCloseDetailSheet(page, /^View details for /);
  }
}

async function runDebtChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/debt`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("debt-page").waitFor({ timeout: 20000 });
  await page.getByRole("heading", { name: "Debt Tracker" }).waitFor({
    timeout: 15000,
  });

  await assertNoHorizontalOverflow(page, `${viewportLabel} debt page`);

  const progress = page.getByTestId("debt-progress-dashboard");
  if ((await progress.count()) > 0) {
    await progress.waitFor({ state: "visible", timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${viewportLabel} debt progress`);
  }

  await assertListContainersWithinViewport(
    page,
    [
      "debt-accounts-mobile-list",
      "debt-accounts-desktop-list",
      "debt-payments-mobile-list",
      "debt-payments-desktop-list",
      "debt-payment-mobile-card",
      "debt-progress-mobile-list",
    ],
    `${viewportLabel} debt lists`
  );

  if (viewportLabel.includes("Desktop")) {
    if ((await page.getByTestId("debt-payments-desktop-list").count()) > 0) {
      await assertDesktopTableVisible(page, "debt-payments-desktop-list");
    }
  } else {
    await assertMobileCardsVisible(page, "debt-payments-mobile-list");
    await tryOpenCloseDetailSheet(page, /^View details for /);
  }
}

async function runExpensesChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/expenses`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("expenses-page").waitFor({ timeout: 20000 });
  await page.getByRole("heading", { name: "Expenses", exact: true }).waitFor({
    timeout: 15000,
  });

  await assertNoHorizontalOverflow(page, `${viewportLabel} expenses page`);

  const filters = page.getByTestId("expenses-filters");
  if ((await filters.count()) > 0) {
    await filters.waitFor({ state: "visible", timeout: 10000 });
    await assertNoHorizontalOverflow(page, `${viewportLabel} expenses filters`);
  }

  await assertListContainersWithinViewport(
    page,
    ["expenses-mobile-list", "expenses-desktop-list", "expenses-mobile-card"],
    `${viewportLabel} expenses lists`
  );

  if (viewportLabel.includes("Desktop")) {
    if ((await page.getByTestId("expenses-desktop-list").count()) > 0) {
      await assertDesktopTableVisible(page, "expenses-desktop-list");
    }
  } else {
    await assertMobileCardsVisible(page, "expenses-mobile-list");
    await tryOpenCloseDetailSheet(page, /^View details for /);
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
    await runBillsChecks(page, "Mobile 390px");
    await runDebtChecks(page, "Mobile 390px");
    await runExpensesChecks(page, "Mobile 390px");
    await assertBottomNavVisible(page);
    await assertBottomNavNotCoveringLastCard(page, "expenses-mobile-list");

    await page.setViewportSize(NARROW_VIEWPORT);
    await runBillsChecks(page, "Narrow 320px");
    await runDebtChecks(page, "Narrow 320px");
    await runExpensesChecks(page, "Narrow 320px");

    for (const route of OTHER_ROUTES) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
      if (route.testId) {
        await page.getByTestId(route.testId).waitFor({ timeout: 15000 });
      } else {
        await page.getByText(route.marker, { exact: false }).first().waitFor({
          timeout: 15000,
        });
      }
    }

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await runBillsChecks(page, "Desktop 1280px");
    await runDebtChecks(page, "Desktop 1280px");
    await runExpensesChecks(page, "Desktop 1280px");
    await page.getByTestId("mobile-bottom-nav").waitFor({ state: "hidden", timeout: 15000 });

    assert(
      consoleErrors.length === 0,
      `Browser console errors:\n${consoleErrors.join("\n")}`
    );

    console.log("CASHFLOW-CURSOR-124 smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-124 smoke: FAIL");
  console.error(error);
  process.exit(1);
});
