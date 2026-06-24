/**
 * Shared helpers for CASHFLOW-CURSOR-126 Android viewport smoke tests.
 */
import fs from "node:fs";
import path from "node:path";
import {
  loadRootEnvFile,
  loadSmokeEnvFile,
} from "./two-user-privacy-test-support.mjs";

export const BASE_URL =
  process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5226";

export const OVERFLOW_TOLERANCE_PX = 2;

export const FAILURE_SCREENSHOT_DIR = path.join(
  process.cwd(),
  ".tmp",
  "android-smoke-failures"
);

export const MODAL_SELECTORS = [
  '[data-slot="dialog-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="alert-dialog-content"]',
].join(", ");

export const VIEWPORTS = [
  { id: "320x740", width: 320, height: 740, mobile: true },
  { id: "390x844", width: 390, height: 844, mobile: true },
  { id: "412x915", width: 412, height: 915, mobile: true },
  { id: "1280x800", width: 1280, height: 800, mobile: false },
];

export const PRIMARY_ROUTES = [
  {
    id: "dashboard",
    path: "/",
    marker: "Household Cashflow Dashboard",
    label: "Dashboard",
  },
  { id: "bills", path: "/bills", marker: "All Bills", label: "Bills" },
  { id: "expenses", path: "/expenses", marker: "Expenses", label: "Expenses" },
  {
    id: "calendar",
    path: "/calendar",
    marker: "Calendar",
    label: "Calendar",
    testId: "cashflow-calendar-view",
  },
];

export const SECONDARY_ROUTES = [
  { id: "debt", path: "/debt", marker: "Debt Tracker", label: "Debt" },
  {
    id: "reports",
    path: "/reports/monthly",
    marker: "Printable Report",
    label: "Reports",
  },
  { id: "settings", path: "/settings", marker: "Settings", label: "Settings" },
];

const SECONDARY_ROUTE_IDS = new Set(SECONDARY_ROUTES.map((route) => route.id));

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

export function loadCredentials() {
  loadRootEnvFile();
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

export const EMAIL =
  process.env.TEST_EMAIL?.trim() ?? process.env.CASHFLOW_OWNER_EMAIL?.trim();
export const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function collectConsoleErrors(page) {
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

export async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });
}

export async function saveFailureScreenshot(page, viewportId, label) {
  try {
    fs.mkdirSync(FAILURE_SCREENSHOT_DIR, { recursive: true });
    const safeLabel = label.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);
    const filePath = path.join(
      FAILURE_SCREENSHOT_DIR,
      `${viewportId}-${safeLabel}.png`
    );
    await page.screenshot({ path: filePath, fullPage: true });
    console.error(`Saved failure screenshot: ${filePath}`);
  } catch {
    // Screenshot failures should not mask the original assertion.
  }
}

export async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate((tolerance) => {
    const viewportWidth = document.documentElement.clientWidth;
    const scrollOverflow =
      document.documentElement.scrollWidth > viewportWidth + tolerance ||
      document.body.scrollWidth > viewportWidth + tolerance;

    const appRoot = document.querySelector("#root");
    const main = document.querySelector("main");
    const targets = [appRoot, main, document.body].filter(Boolean);

    const elementOverflow = targets.some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
    });

    return scrollOverflow || elementOverflow;
  }, OVERFLOW_TOLERANCE_PX);

  assert(!overflow, `${label}: horizontal page overflow detected`);
}

export async function assertListContainersWithinViewport(page, testIds, label) {
  const overflowing = await page.evaluate(
    ({ ids, tolerance }) => {
      const viewportWidth = document.documentElement.clientWidth;
      return ids.some((id) => {
        const elements = document.querySelectorAll(`[data-testid="${id}"]`);
        return [...elements].some((element) => {
          const style = window.getComputedStyle(element);
          if (style.display === "none") {
            return false;
          }
          const rect = element.getBoundingClientRect();
          return (
            rect.left < -tolerance || rect.right > viewportWidth + tolerance
          );
        });
      });
    },
    { ids: testIds, tolerance: OVERFLOW_TOLERANCE_PX }
  );

  assert(!overflowing, `${label}: list containers should fit within viewport`);
}

export async function assertOpenModalsFitViewport(page, label) {
  const overflow = await page.evaluate(
    ({ selectors, tolerance }) => {
      const viewportWidth = document.documentElement.clientWidth;

      return [...document.querySelectorAll(selectors)].some((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        const state = element.getAttribute("data-state");
        if (state && state !== "open") {
          return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
      });
    },
    { selectors: MODAL_SELECTORS, tolerance: OVERFLOW_TOLERANCE_PX }
  );

  assert(!overflow, `${label}: open modal/sheet overflows viewport width`);
}

export async function assertDialogActionsAboveBottomNav(page, label) {
  const layoutOk = await page.evaluate(
    ({ selectors, tolerance }) => {
      const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
      if (!nav) {
        return true;
      }

      const navStyle = window.getComputedStyle(nav);
      if (navStyle.display === "none") {
        return true;
      }

      const modal = [...document.querySelectorAll(selectors)].find((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });

      if (!modal) {
        return true;
      }

      const footer = modal.querySelector(
        '[data-slot="dialog-footer"], [data-slot="alert-dialog-footer"], [data-slot="sheet-footer"]'
      );
      const target = footer ?? modal.querySelectorAll("button")[modal.querySelectorAll("button").length - 1];
      if (!target) {
        return true;
      }

      const targetRect = target.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      return targetRect.bottom <= navRect.top + tolerance;
    },
    { selectors: MODAL_SELECTORS, tolerance: OVERFLOW_TOLERANCE_PX }
  );

  assert(
    layoutOk,
    `${label}: dialog actions should not sit behind bottom navigation`
  );
}

export async function assertElementWithinViewport(page, testId, label) {
  const fits = await page.evaluate(
    ({ id, tolerance }) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) {
        return null;
      }

      const style = window.getComputedStyle(element);
      if (style.display === "none") {
        return null;
      }

      const viewportWidth = document.documentElement.clientWidth;
      const rect = element.getBoundingClientRect();
      return rect.left >= -tolerance && rect.right <= viewportWidth + tolerance;
    },
    { id: testId, tolerance: OVERFLOW_TOLERANCE_PX }
  );

  if (fits === null) {
    return;
  }

  assert(fits, `${label} (${testId}) should fit within viewport width`);
}

export async function assertNoUuidLabels(page, label) {
  const bodyText = await page.locator("body").innerText();
  const matches = bodyText.match(UUID_PATTERN);
  assert(!matches?.length, `${label}: raw UUID-like labels visible on page`);
}

export async function assertNoSecretsVisible(page, label) {
  const bodyText = await page.locator("body").innerText();
  assert(
    !bodyText.includes("service_role") && !bodyText.includes(".tmp/"),
    `${label}: secrets or tmp paths should not appear in UI`
  );
}

export async function waitForOpenSheetSettled(page) {
  const sheet = page
    .locator('[data-slot="sheet-content"][data-state="open"]')
    .first();
  await sheet.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => {
    const element = document.querySelector(
      '[data-slot="sheet-content"][data-state="open"]'
    );
    if (!element) {
      return false;
    }
    const transform = window.getComputedStyle(element).transform;
    return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
  }, { timeout: 5000 });
}

export async function closeOpenModal(page) {
  await page.keyboard.press("Escape");
  await page
    .locator(MODAL_SELECTORS)
    .first()
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});
}

export async function tryOpenFirstMatchingButton(page, pattern) {
  const button = page.getByRole("button", { name: pattern }).first();
  if ((await button.count()) === 0) {
    return false;
  }
  await button.click();
  await waitForOpenSheetSettled(page).catch(async () => {
    await page
      .locator(MODAL_SELECTORS)
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
  });
  return true;
}

export async function assertMobileNavVisible(page) {
  await page.getByTestId("mobile-bottom-nav").waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.getByTestId("mobile-nav-more-button").waitFor({
    state: "visible",
    timeout: 15000,
  });
}

export async function assertDesktopNavHidden(page) {
  await page.getByTestId("desktop-app-nav").waitFor({
    state: "hidden",
    timeout: 15000,
  });
}

export async function assertDesktopNavVisible(page) {
  await page.getByTestId("desktop-app-nav").waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.getByTestId("mobile-bottom-nav").waitFor({
    state: "hidden",
    timeout: 15000,
  });
}

export async function assertActiveMobileNav(page, navId) {
  if (SECONDARY_ROUTE_IDS.has(navId)) {
    const isMoreActive = await page
      .getByTestId("mobile-nav-more-button")
      .evaluate((node) => node.getAttribute("aria-current") === "page");
    assert(
      isMoreActive,
      `More button should be active for secondary route ${navId}`
    );
    return;
  }

  const activeLink = page.locator(
    `[data-testid="mobile-nav-${navId}"][aria-current="page"]`
  );
  await activeLink.first().waitFor({ state: "visible", timeout: 15000 });
}

export async function openMoreSheet(page) {
  await page.getByTestId("mobile-nav-more-button").click();
  await page.getByTestId("mobile-nav-more-sheet").waitFor({
    state: "visible",
    timeout: 15000,
  });
}

export async function navigateSecondaryRoute(page, route) {
  await openMoreSheet(page);
  await page.getByTestId(`mobile-nav-${route.id}`).click();
  await page.waitForURL((url) => url.pathname === route.path, {
    timeout: 15000,
  });
  await waitForRouteMarker(page, route);
  await page.getByTestId("mobile-nav-more-sheet").waitFor({
    state: "hidden",
    timeout: 15000,
  });
  await assertActiveMobileNav(page, route.id);
}

export async function assertBottomNavNotCoveringContent(page, contentTestId) {
  const layoutOk = await page.evaluate(({ testId }) => {
    const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
    const content = document.querySelector(`[data-testid="${testId}"]`);
    if (!nav || !content) {
      return true;
    }

    const navStyle = window.getComputedStyle(nav);
    if (navStyle.display === "none") {
      return true;
    }

    const navRect = nav.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    return navRect.top >= viewportHeight - navRect.height - 8;
  }, { testId: contentTestId });

  assert(
    layoutOk,
    `Bottom nav should not break layout for ${contentTestId}`
  );
}

export async function assertDesktopTableHiddenOnMobile(page, desktopListTestId) {
  const hidden = await page.evaluate((id) => {
    const desktop = document.querySelector(`[data-testid="${id}"]`);
    if (!desktop) {
      return true;
    }
    const style = window.getComputedStyle(desktop);
    return style.display === "none";
  }, desktopListTestId);

  assert(hidden, `${desktopListTestId} should be hidden on mobile`);
}

export async function waitForRouteMarker(page, route) {
  if (route.testId) {
    await page.getByTestId(route.testId).waitFor({ timeout: 15000 });
    return;
  }

  const headingMarkers = new Set([
    "All Bills",
    "Expenses",
    "Calendar",
    "Debt Tracker",
    "Printable Report",
    "Settings",
  ]);

  if (headingMarkers.has(route.marker)) {
    await page
      .getByRole("heading", { name: route.marker, exact: false })
      .first()
      .waitFor({ timeout: 15000 });
    return;
  }

  await page
    .getByText(route.marker, { exact: false })
    .locator("visible=true")
    .first()
    .waitFor({ timeout: 15000 });
}

export async function tryDashboardDrilldown(page, label) {
  const viewUnpaid = page.getByRole("button", { name: "View unpaid bills" });
  if ((await viewUnpaid.count()) === 0) {
    return;
  }

  await viewUnpaid.first().click();
  const sheetTitle = page.getByText("Unpaid bill details", { exact: false });
  const opened = await sheetTitle
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (opened) {
    await closeOpenModal(page);
    return;
  }

  const anySheet = page.locator('[data-slot="sheet-content"]').first();
  if (await anySheet.isVisible().catch(() => false)) {
    await closeOpenModal(page);
    return;
  }

  console.warn(`${label}: dashboard drilldown did not open (no unpaid bill data?)`);
}

export async function assertDesktopTableVisible(page, desktopListTestId) {
  const visible = await page.evaluate((id) => {
    const desktop = document.querySelector(`[data-testid="${id}"]`);
    if (!desktop) {
      return false;
    }
    const style = window.getComputedStyle(desktop);
    return style.display !== "none";
  }, desktopListTestId);

  assert(visible, `${desktopListTestId} should be visible on desktop`);
}
