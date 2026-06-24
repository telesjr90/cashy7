/**
 * CASHFLOW-CURSOR-125 — Mobile forms/dialogs browser smoke.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5225)
 */
import { chromium } from "playwright";
import { loadSmokeEnvFile } from "./lib/two-user-privacy-test-support.mjs";

function loadCredentials() {
  if (!process.env.TEST_EMAIL?.trim() || !process.env.TEST_PASSWORD) {
    loadSmokeEnvFile();
  }
}

loadCredentials();

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5225";
const EMAIL =
  process.env.TEST_EMAIL?.trim() ??
  process.env.CASHFLOW_OWNER_EMAIL?.trim();
const PASSWORD =
  process.env.TEST_PASSWORD ?? process.env.CASHFLOW_OWNER_PASSWORD;

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const NARROW_VIEWPORT = { width: 320, height: 740 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

const OVERFLOW_TOLERANCE_PX = 2;

const MODAL_SELECTORS = [
  '[data-slot="dialog-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="alert-dialog-content"]',
].join(", ");

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

async function assertOpenModalsFitViewport(page, label) {
  const overflow = await page.evaluate(
    ({ selectors, tolerance }) => {
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;

      return [...document.querySelectorAll(selectors)].some((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const horizontal =
          rect.left < -tolerance || rect.right > viewportWidth + tolerance;
        const vertical =
          rect.top < -tolerance || rect.bottom > viewportHeight + tolerance;
        return horizontal || vertical;
      });
    },
    { selectors: MODAL_SELECTORS, tolerance: OVERFLOW_TOLERANCE_PX }
  );

  assert(!overflow, `${label}: open modal/sheet overflows viewport`);
}

async function assertDialogActionsAboveBottomNav(page, label) {
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
      if (!footer) {
        const buttons = modal.querySelectorAll("button");
        if (buttons.length === 0) {
          return true;
        }
        const lastButton = buttons[buttons.length - 1];
        const buttonRect = lastButton.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        return buttonRect.bottom <= navRect.top + tolerance;
      }

      const footerRect = footer.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      return footerRect.bottom <= navRect.top + tolerance;
    },
    { selectors: MODAL_SELECTORS, tolerance: OVERFLOW_TOLERANCE_PX }
  );

  assert(
    layoutOk,
    `${label}: dialog actions should not sit behind bottom navigation`
  );
}

async function closeOpenModal(page) {
  await page.keyboard.press("Escape");
  await page
    .locator(MODAL_SELECTORS)
    .first()
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});
}

async function tryOpenFirstMatchingButton(page, pattern) {
  const button = page.getByRole("button", { name: pattern }).first();
  if ((await button.count()) === 0) {
    return false;
  }
  await button.click();
  await page
    .locator(MODAL_SELECTORS)
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
  return true;
}

async function runBillsDialogChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/bills`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("bills-page").waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${viewportLabel} bills page`);

  const openedDetail = await tryOpenFirstMatchingButton(
    page,
    /^View details for /
  );
  if (openedDetail) {
    await assertNoHorizontalOverflow(page, `${viewportLabel} bill detail sheet`);
    await assertOpenModalsFitViewport(page, `${viewportLabel} bill detail sheet`);
    await assertDialogActionsAboveBottomNav(
      page,
      `${viewportLabel} bill detail sheet`
    );
    await closeOpenModal(page);
  }

  const openedEdit = await tryOpenFirstMatchingButton(page, /^Edit /);
  if (openedEdit) {
    await assertNoHorizontalOverflow(page, `${viewportLabel} bill edit dialog`);
    await assertOpenModalsFitViewport(page, `${viewportLabel} bill edit dialog`);
    await assertDialogActionsAboveBottomNav(
      page,
      `${viewportLabel} bill edit dialog`
    );
    await closeOpenModal(page);
  }
}

async function runDebtDialogChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/debt`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("debt-page").waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${viewportLabel} debt page`);

  const openedDetail = await tryOpenFirstMatchingButton(
    page,
    /^View details for /
  );
  if (openedDetail) {
    await assertOpenModalsFitViewport(
      page,
      `${viewportLabel} debt payment detail sheet`
    );
    await closeOpenModal(page);
  }

  const openedReplace = await tryOpenFirstMatchingButton(
    page,
    /Replace future unpaid scheduled payments/
  );
  if (openedReplace) {
    await assertOpenModalsFitViewport(
      page,
      `${viewportLabel} debt schedule replacement dialog`
    );
    await assertNoHorizontalOverflow(
      page,
      `${viewportLabel} debt schedule replacement dialog`
    );
    await closeOpenModal(page);
  }

  const openedArchive = await tryOpenFirstMatchingButton(page, /Archive|Close account/);
  if (openedArchive) {
    await assertOpenModalsFitViewport(
      page,
      `${viewportLabel} debt archive dialog`
    );
    await closeOpenModal(page);
  }
}

async function runExpensesDialogChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/expenses`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("expenses-page").waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${viewportLabel} expenses page`);

  const openedDetail = await tryOpenFirstMatchingButton(
    page,
    /^View details for /
  );
  if (openedDetail) {
    await assertOpenModalsFitViewport(
      page,
      `${viewportLabel} expense detail sheet`
    );
    await closeOpenModal(page);
  }

  const openedEdit = await tryOpenFirstMatchingButton(page, /^Edit /);
  if (openedEdit) {
    await assertOpenModalsFitViewport(
      page,
      `${viewportLabel} expense edit dialog`
    );
    await closeOpenModal(page);
  }
}

async function runSettingsFormChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Settings" }).waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${viewportLabel} settings page`);

  const paycheckCard = page.getByText("Your paycheck schedule", { exact: false });
  if ((await paycheckCard.count()) > 0) {
    await paycheckCard.first().scrollIntoViewIfNeeded();
    await assertNoHorizontalOverflow(
      page,
      `${viewportLabel} paycheck settings form`
    );
  }

  const importCard = page.getByText("Spreadsheet import", { exact: false });
  if ((await importCard.count()) > 0) {
    await importCard.first().scrollIntoViewIfNeeded();
    await assertNoHorizontalOverflow(page, `${viewportLabel} import section`);
  }

  const receiptCard = page.getByText("Receipt uploads", { exact: false });
  if ((await receiptCard.count()) > 0) {
    await receiptCard.first().scrollIntoViewIfNeeded();
    await assertNoHorizontalOverflow(page, `${viewportLabel} receipt section`);
  }

  const householdCard = page.getByText("Household members", { exact: false });
  if ((await householdCard.count()) > 0) {
    await householdCard.first().scrollIntoViewIfNeeded();
    await assertNoHorizontalOverflow(page, `${viewportLabel} household section`);
  }

  const savingsDetail = page.getByRole("button", { name: /^View details for / }).first();
  if ((await savingsDetail.count()) > 0) {
    await savingsDetail.click();
    await assertOpenModalsFitViewport(
      page,
      `${viewportLabel} savings detail sheet`
    );
    await closeOpenModal(page);
  }
}

async function runReportsChecks(page, viewportLabel) {
  await page.goto(`${BASE_URL}/reports/monthly`, { waitUntil: "domcontentloaded" });
  await page.getByText("Printable Report", { exact: false }).first().waitFor({
    timeout: 20000,
  });
  await assertNoHorizontalOverflow(page, `${viewportLabel} monthly report page`);

  const printButton = page.getByRole("button", { name: /Print/i }).first();
  if ((await printButton.count()) > 0) {
    await printButton.scrollIntoViewIfNeeded();
    await assert(
      await printButton.isVisible(),
      `${viewportLabel}: print control should be visible`
    );
  }

  const exportButton = page.getByRole("button", { name: /Export CSV/i }).first();
  if ((await exportButton.count()) > 0) {
    await exportButton.scrollIntoViewIfNeeded();
    await assert(
      await exportButton.isVisible(),
      `${viewportLabel}: export control should be visible`
    );
  }
}

async function runViewportSuite(page, viewport, label) {
  await page.setViewportSize(viewport);
  await runBillsDialogChecks(page, label);
  await runDebtDialogChecks(page, label);
  await runExpensesDialogChecks(page, label);
  await runSettingsFormChecks(page, label);
  await runReportsChecks(page, label);

  if (viewport.width < 768) {
    await page.goto(`${BASE_URL}/expenses`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("mobile-bottom-nav").waitFor({
      state: "visible",
      timeout: 15000,
    });
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

    await runViewportSuite(page, MOBILE_VIEWPORT, "Mobile 390px");
    await runViewportSuite(page, NARROW_VIEWPORT, "Narrow 320px");

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await runBillsDialogChecks(page, "Desktop 1280px");
    await runDebtDialogChecks(page, "Desktop 1280px");
    await runExpensesDialogChecks(page, "Desktop 1280px");
    await runSettingsFormChecks(page, "Desktop 1280px");
    await runReportsChecks(page, "Desktop 1280px");
    await page.getByTestId("mobile-bottom-nav").waitFor({
      state: "hidden",
      timeout: 15000,
    });

    assert(
      consoleErrors.length === 0,
      `Browser console errors:\n${consoleErrors.join("\n")}`
    );

    console.log("CASHFLOW-CURSOR-125 smoke: PASS");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-125 smoke: FAIL");
  console.error(error);
  process.exit(1);
});
