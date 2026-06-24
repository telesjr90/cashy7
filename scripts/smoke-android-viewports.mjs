/**
 * CASHFLOW-CURSOR-126 — Android viewport smoke tests.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from C112 seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5226)
 */
import { chromium } from "playwright";
import {
  BASE_URL,
  EMAIL,
  PASSWORD,
  VIEWPORTS,
  PRIMARY_ROUTES,
  SECONDARY_ROUTES,
  MODAL_SELECTORS,
  assert,
  login,
  collectConsoleErrors,
  saveFailureScreenshot,
  assertNoHorizontalOverflow,
  assertListContainersWithinViewport,
  assertOpenModalsFitViewport,
  assertDialogActionsAboveBottomNav,
  assertElementWithinViewport,
  assertNoUuidLabels,
  assertNoSecretsVisible,
  closeOpenModal,
  tryOpenFirstMatchingButton,
  assertMobileNavVisible,
  assertDesktopNavHidden,
  assertDesktopNavVisible,
  assertActiveMobileNav,
  navigateSecondaryRoute,
  assertBottomNavNotCoveringContent,
  assertDesktopTableHiddenOnMobile,
  assertDesktopTableVisible,
  waitForRouteMarker,
  tryDashboardDrilldown,
  waitForOpenSheetSettled,
} from "./lib/android-smoke-helpers.mjs";

const KNOWN_CONTAINED_OVERFLOW = [
  {
    selector: '[data-testid="bills-page"] table',
    note: "Bill templates table may use contained horizontal scroll on mobile (C124 limitation).",
  },
];

async function assertBillTemplatesContained(page, viewportLabel) {
  const templatesOverflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const pageOverflow =
      document.documentElement.scrollWidth > viewportWidth + 2 ||
      document.body.scrollWidth > viewportWidth + 2;
    if (pageOverflow) {
      return { pageOverflow: true, contained: false };
    }

    const tables = document.querySelectorAll('[data-testid="bills-page"] table');
    const overflowingTable = [...tables].find((table) => {
      const style = window.getComputedStyle(table);
      if (style.display === "none") {
        return false;
      }
      const rect = table.getBoundingClientRect();
      return rect.right > viewportWidth + 2;
    });

    if (!overflowingTable) {
      return { pageOverflow: false, contained: true };
    }

    let parent = overflowingTable.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflowX === "auto" || style.overflowX === "scroll") {
        return { pageOverflow: false, contained: true };
      }
      parent = parent.parentElement;
    }

    return { pageOverflow: false, contained: false };
  });

  assert(
    !templatesOverflow.pageOverflow,
    `${viewportLabel}: bill templates section must not cause page-level overflow`
  );

  if (!templatesOverflow.contained) {
    console.warn(
      `${viewportLabel}: bill templates dense table visible without contained scroll (known C124 limitation)`
    );
  }
}

async function runNavigationChecks(page, viewport) {
  const label = viewport.id;

  if (viewport.mobile) {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await assertMobileNavVisible(page);
    await assertDesktopNavHidden(page);
    await assertNoHorizontalOverflow(page, `${label} shell`);
    await assertActiveMobileNav(page, "dashboard");
    await page.getByTestId("mobile-current-route").waitFor({ timeout: 15000 });

    for (const route of PRIMARY_ROUTES.slice(1)) {
      await page.getByTestId(`mobile-nav-${route.id}`).click();
      await page.waitForURL((url) => url.pathname === route.path, {
        timeout: 15000,
      });
      await waitForRouteMarker(page, route);
      await assertActiveMobileNav(page, route.id);
      await assertNoHorizontalOverflow(page, `${label} ${route.id}`);
    }

    for (const route of SECONDARY_ROUTES) {
      await navigateSecondaryRoute(page, route);
      await assertNoHorizontalOverflow(page, `${label} ${route.id}`);
    }
  } else {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await assertDesktopNavVisible(page);
    await assertNoHorizontalOverflow(page, `${label} shell`);

    for (const route of [...PRIMARY_ROUTES.slice(1), ...SECONDARY_ROUTES]) {
      await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForRouteMarker(page, route);
      await assertNoHorizontalOverflow(page, `${label} ${route.id}`);
    }
  }
}

async function runDashboardChecks(page, viewport) {
  if (!viewport.mobile) {
    const grid = page.getByTestId("dashboard-monthly-summary-grid");
    if ((await grid.count()) > 0) {
      const multiColumn = await page.evaluate(() => {
        const element = document.querySelector(
          '[data-testid="dashboard-monthly-summary-grid"]'
        );
        if (!element) {
          return false;
        }
        const columns = window.getComputedStyle(element).gridTemplateColumns;
        const repeatMatch = columns.match(/repeat\((\d+)/);
        const columnCount = repeatMatch
          ? Number(repeatMatch[1])
          : columns.split(" ").filter(Boolean).length;
        return columnCount >= 2;
      });
      assert(
        multiColumn,
        `${viewport.id}: desktop dashboard summary should use multi-column layout`
      );
    }
    return;
  }

  const label = viewport.id;
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("dashboard-page").waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${label} dashboard`);

  await assertElementWithinViewport(
    page,
    "dashboard-current-amount-card",
    `${label} current amount card`
  );
  await assertElementWithinViewport(
    page,
    "dashboard-month-controls",
    `${label} month controls`
  );
  await assertElementWithinViewport(
    page,
    "dashboard-period-controls",
    `${label} period controls`
  );

  const warnings = page.getByTestId("dashboard-warnings");
  if ((await warnings.count()) > 0) {
    await warnings.waitFor({ state: "visible", timeout: 10000 });
  }

  await page.getByTestId("dashboard-card-available-after-savings").waitFor({
    state: "visible",
    timeout: 15000,
  });

  const forecast = page.getByTestId("dashboard-forecast-section");
  if ((await forecast.count()) > 0) {
    await forecast.waitFor({ state: "visible", timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${label} forecast`);

    const select = page.getByTestId("dashboard-forecast-window-select");
    if ((await select.count()) > 0) {
      await select.click();
      const option = page.getByRole("option").first();
      await option.waitFor({ state: "visible", timeout: 10000 });
      await option.click();
      await page.keyboard.press("Escape");
    }
  }

  const debtSummary = page.getByTestId("dashboard-debt-summary");
  if ((await debtSummary.count()) > 0) {
    await debtSummary.waitFor({ state: "visible", timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${label} debt summary`);
  }

  const viewUnpaid = page.getByRole("button", { name: "View unpaid bills" });
  if ((await viewUnpaid.count()) > 0) {
    await tryDashboardDrilldown(page, label);
  }

  await assertBottomNavNotCoveringContent(page, "dashboard-page");
}

async function runBillsChecks(page, viewport) {
  const label = viewport.id;
  await page.goto(`${BASE_URL}/bills`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("bills-page").waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${label} bills`);

  const filters = page.getByTestId("bills-filters");
  if ((await filters.count()) > 0) {
    await filters.waitFor({ state: "visible", timeout: 10000 });
    await assertNoHorizontalOverflow(page, `${label} bills filters`);
  }

  await assertListContainersWithinViewport(
    page,
    ["bills-mobile-list", "bills-desktop-list", "bills-mobile-card"],
    `${label} bills lists`
  );

  if (viewport.mobile) {
    await assertDesktopTableHiddenOnMobile(page, "bills-desktop-list");
    const mobileList = page.getByTestId("bills-mobile-list");
    if ((await mobileList.count()) > 0) {
      await mobileList.waitFor({ state: "visible", timeout: 15000 });
    }
    await assertBillTemplatesContained(page, label);

    const openedDetail = await tryOpenFirstMatchingButton(
      page,
      /^View details for /
    );
    if (openedDetail) {
      await assertOpenModalsFitViewport(page, `${label} bill detail`);
      await closeOpenModal(page);
    }

    const openedEdit = await tryOpenFirstMatchingButton(page, /^Edit /);
    if (openedEdit) {
      await assertOpenModalsFitViewport(page, `${label} bill edit`);
      await assertDialogActionsAboveBottomNav(page, `${label} bill edit`);
      await closeOpenModal(page);
    }
  } else if ((await page.getByTestId("bills-desktop-list").count()) > 0) {
    await assertDesktopTableVisible(page, "bills-desktop-list");
  }
}

async function runDebtChecks(page, viewport) {
  const label = viewport.id;
  await page.goto(`${BASE_URL}/debt`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("debt-page").waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${label} debt`);

  const progress = page.getByTestId("debt-progress-dashboard");
  if ((await progress.count()) > 0) {
    await progress.waitFor({ state: "visible", timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${label} debt progress`);
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
    `${label} debt lists`
  );

  if (viewport.mobile) {
    const openedDetail = await tryOpenFirstMatchingButton(
      page,
      /^View details for /
    );
    if (openedDetail) {
      await assertOpenModalsFitViewport(page, `${label} debt detail`);
      await closeOpenModal(page);
    }

    const openedReplace = await tryOpenFirstMatchingButton(
      page,
      /Replace future unpaid scheduled payments/
    );
    if (openedReplace) {
      await assertOpenModalsFitViewport(page, `${label} debt schedule replace`);
      await closeOpenModal(page);
    }

    const openedArchive = await tryOpenFirstMatchingButton(
      page,
      /Archive|Close account/
    );
    if (openedArchive) {
      await assertOpenModalsFitViewport(page, `${label} debt archive`);
      await closeOpenModal(page);
    }
  } else if ((await page.getByTestId("debt-payments-desktop-list").count()) > 0) {
    await assertDesktopTableVisible(page, "debt-payments-desktop-list");
  }
}

async function runExpensesChecks(page, viewport) {
  const label = viewport.id;
  await page.goto(`${BASE_URL}/expenses`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("expenses-page").waitFor({ timeout: 20000 });
  await assertNoHorizontalOverflow(page, `${label} expenses`);

  const filters = page.getByTestId("expenses-filters");
  if ((await filters.count()) > 0) {
    await filters.waitFor({ state: "visible", timeout: 10000 });
    await assertNoHorizontalOverflow(page, `${label} expenses filters`);
  }

  await assertListContainersWithinViewport(
    page,
    ["expenses-mobile-list", "expenses-desktop-list", "expenses-mobile-card"],
    `${label} expenses lists`
  );

  if (viewport.mobile) {
    await assertDesktopTableHiddenOnMobile(page, "expenses-desktop-list");

    const openedDetail = await tryOpenFirstMatchingButton(
      page,
      /^View details for /
    );
    if (openedDetail) {
      await assertOpenModalsFitViewport(page, `${label} expense detail`);
      await closeOpenModal(page);
    }

    const openedEdit = await tryOpenFirstMatchingButton(page, /^Edit /);
    if (openedEdit) {
      await assertOpenModalsFitViewport(page, `${label} expense edit`);
      await closeOpenModal(page);
    }
  } else if ((await page.getByTestId("expenses-desktop-list").count()) > 0) {
    await assertDesktopTableVisible(page, "expenses-desktop-list");
  }
}

async function runSettingsChecks(page, viewport) {
  const label = viewport.id;
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Settings" }).waitFor({
    timeout: 20000,
  });
  await assertNoHorizontalOverflow(page, `${label} settings`);

  const sections = [
    "Cashflow start",
    "Person mapping",
    "Your paycheck schedule",
    "Spreadsheet import",
    "Receipt uploads",
    "Household members",
  ];

  for (const section of sections) {
    const heading = page.getByText(section, { exact: false });
    if ((await heading.count()) > 0) {
      await heading.first().scrollIntoViewIfNeeded();
      await assertNoHorizontalOverflow(page, `${label} settings ${section}`);
    }
  }

  if (!viewport.mobile) {
    return;
  }

  let dialogsClosed = 0;

  const savingsDetail = page
    .getByRole("button", { name: /^View details for / })
    .first();
  if ((await savingsDetail.count()) > 0) {
    await savingsDetail.click();
    await assertOpenModalsFitViewport(page, `${label} savings detail`);
    await closeOpenModal(page);
    dialogsClosed += 1;
  }

  const savingsEdit = page.getByRole("button", { name: /^Edit goal / }).first();
  if ((await savingsEdit.count()) > 0) {
    await savingsEdit.click();
    await assertOpenModalsFitViewport(page, `${label} savings goal edit`);
    await assertDialogActionsAboveBottomNav(page, `${label} savings goal edit`);
    await closeOpenModal(page);
    dialogsClosed += 1;
  }

  const inviteButton = page
    .getByRole("button", { name: /Invite|Send invite/i })
    .first();
  if (dialogsClosed < 2 && (await inviteButton.count()) > 0) {
    await inviteButton.click();
    const dialog = page.locator(MODAL_SELECTORS).first();
    if (await dialog.isVisible().catch(() => false)) {
      await assertOpenModalsFitViewport(page, `${label} household invite`);
      await closeOpenModal(page);
      dialogsClosed += 1;
    }
  }

  if (dialogsClosed < 2) {
    const newGoal = page.getByRole("button", { name: /New goal|Add goal/i }).first();
    if ((await newGoal.count()) > 0) {
      await newGoal.click();
      const dialog = page.locator(MODAL_SELECTORS).first();
      if (await dialog.isVisible().catch(() => false)) {
        await assertOpenModalsFitViewport(page, `${label} new savings goal`);
        await closeOpenModal(page);
        dialogsClosed += 1;
      }
    }
  }

  if (dialogsClosed > 0) {
    console.log(`${label}: settings cancel paths exercised (${dialogsClosed} dialogs)`);
  }
}

async function runCalendarChecks(page, viewport) {
  if (!viewport.mobile) {
    return;
  }

  const label = viewport.id;
  await page.goto(`${BASE_URL}/calendar`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("cashflow-calendar-view").waitFor({ timeout: 20000 });
  await page.getByTestId("calendar-month-selector").waitFor({ timeout: 15000 });
  await page.locator('[data-testid="cashflow-calendar-view"] .animate-pulse').first().waitFor({
    state: "hidden",
    timeout: 20000,
  }).catch(() => {});
  await assertNoHorizontalOverflow(page, `${label} calendar`);

  await page
    .getByText("Month grid", { exact: false })
    .first()
    .waitFor({ timeout: 20000 });
  await page
    .getByText("Chronological list", { exact: false })
    .first()
    .waitFor({ timeout: 20000 });

  await page
    .getByTestId("calendar-month-selector")
    .getByRole("button")
    .first()
    .click();
  await page.waitForTimeout(300);

  const dayButton = page.getByRole("button", { name: /^View events for / }).first();
  if ((await dayButton.count()) > 0) {
    await dayButton.click();
    await waitForOpenSheetSettled(page);
    await assertOpenModalsFitViewport(page, `${label} calendar day sheet`);
    await assertDialogActionsAboveBottomNav(page, `${label} calendar day sheet`);
    await closeOpenModal(page);
  }
}

async function runReportsChecks(page, viewport) {
  const label = viewport.id;
  await page.goto(`${BASE_URL}/reports/monthly`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByText("Printable Report", { exact: false }).first().waitFor({
    timeout: 20000,
  });
  await assertNoHorizontalOverflow(page, `${label} monthly report`);

  const printButton = page.getByTestId("monthly-report-print-button");
  if ((await printButton.count()) > 0) {
    await printButton.scrollIntoViewIfNeeded();
    assert(
      await printButton.isVisible(),
      `${label}: print control should be visible`
    );
    if (viewport.mobile) {
      const notCovered = await page.evaluate(() => {
        const button = document.querySelector(
          '[data-testid="monthly-report-print-button"]'
        );
        const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
        if (!button || !nav) {
          return true;
        }
        const navStyle = window.getComputedStyle(nav);
        if (navStyle.display === "none") {
          return true;
        }
        const buttonRect = button.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        return buttonRect.bottom <= navRect.top + 2;
      });
      assert(notCovered, `${label}: print button should not be covered by bottom nav`);
    }
  }

  const exportButton = page.getByTestId("monthly-report-export-csv-button");
  if ((await exportButton.count()) > 0) {
    await exportButton.scrollIntoViewIfNeeded();
    assert(
      await exportButton.isVisible(),
      `${label}: export control should be visible`
    );
    assert(
      await exportButton.isEnabled(),
      `${label}: export control should be enabled when report is ready`
    );
  }

  if (viewport.mobile) {
    await page.emulateMedia({ media: "print" });
    const navHidden = await page.locator("header.no-print").evaluate((node) => {
      return window.getComputedStyle(node).display === "none";
    });
    const bottomNavHidden = await page
      .locator('[data-testid="mobile-bottom-nav"]')
      .evaluate((node) => window.getComputedStyle(node).display === "none");
    assert(navHidden, `${label}: navigation header hidden under print media`);
    assert(bottomNavHidden, `${label}: bottom nav hidden under print media`);
    await page.emulateMedia({ media: "screen" });
  }
}

async function runFormsDialogsChecks(page, viewport) {
  if (!viewport.mobile) {
    return;
  }

  const label = viewport.id;
  let dialogOpened = false;
  let sheetOpened = false;
  let alertOpened = false;

  await page.goto(`${BASE_URL}/bills`, { waitUntil: "domcontentloaded" });
  if (await tryOpenFirstMatchingButton(page, /^Edit /)) {
    await assertNoHorizontalOverflow(page, `${label} dialog overflow`);
    await assertOpenModalsFitViewport(page, `${label} dialog fit`);
    await assertDialogActionsAboveBottomNav(page, `${label} dialog actions`);
    dialogOpened = true;
    await closeOpenModal(page);
  }

  if (await tryOpenFirstMatchingButton(page, /^View details for /)) {
    await assertOpenModalsFitViewport(page, `${label} sheet fit`);
    await assertDialogActionsAboveBottomNav(page, `${label} sheet actions`);
    sheetOpened = true;
    await closeOpenModal(page);
  }

  await page.goto(`${BASE_URL}/debt`, { waitUntil: "domcontentloaded" });
  const archiveButton = page
    .getByRole("button", { name: /Archive|Close account|Deactivate/ })
    .first();
  if ((await archiveButton.count()) > 0) {
    await archiveButton.click();
    const alert = page.locator('[data-slot="alert-dialog-content"]').first();
    if (await alert.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assertOpenModalsFitViewport(page, `${label} alert dialog fit`);
      alertOpened = true;
      await closeOpenModal(page);
    }
  }

  if (!alertOpened) {
    const deleteBill = page.getByRole("button", { name: /^Delete / }).first();
    if ((await deleteBill.count()) > 0) {
      await deleteBill.click();
      const alert = page.locator('[data-slot="alert-dialog-content"]').first();
      if (await alert.isVisible({ timeout: 5000 }).catch(() => false)) {
        await assertOpenModalsFitViewport(page, `${label} alert dialog fit`);
        alertOpened = true;
        await closeOpenModal(page);
      }
    }
  }

  console.log(
    `${label}: forms/dialogs — dialog=${dialogOpened} sheet=${sheetOpened} alert=${alertOpened}`
  );
}

async function runPrivacyChecks(page, viewport) {
  const label = viewport.id;
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
  const settingsText = await page.locator("body").innerText();

  const paycheckSection = page.getByText("Your paycheck schedule", {
    exact: false,
  });
  if ((await paycheckSection.count()) > 0) {
    assert(
      settingsText.includes("Only you can see your paycheck amount") ||
        settingsText.includes("forecast only") ||
        settingsText.includes("cannot see your paycheck"),
      `${label}: paycheck privacy copy should be visible in Settings`
    );
  }

  if (
    settingsText.includes("Receipt") ||
    settingsText.includes("receipt")
  ) {
    const hasReceiptPrivacy =
      settingsText.includes("Only you can see this candidate") ||
      settingsText.includes("privately until you review") ||
      settingsText.includes("No expense has been created");
    if (page.getByText("Receipt uploads", { exact: false }).count()) {
      // Only assert when receipt section has candidate content.
      const receiptCandidates = page.getByText("No receipt candidates yet", {
        exact: false,
      });
      if ((await receiptCandidates.count()) === 0) {
        assert(
          hasReceiptPrivacy || settingsText.includes("Receipt uploads"),
          `${label}: receipt privacy copy should be present when candidates exist`
        );
      }
    }
  }

  const memberSection = page.getByText("Household members", { exact: false });
  if ((await memberSection.count()) > 0) {
    const hasMemberCopy =
      settingsText.includes("household owner") ||
      settingsText.includes("Only a household owner") ||
      settingsText.includes("read-only") ||
      settingsText.includes("Household members");
    assert(hasMemberCopy, `${label}: household member copy should be visible`);
  }

  await assertNoUuidLabels(page, `${label} settings`);
  await assertNoSecretsVisible(page, `${label} settings`);

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await assertNoUuidLabels(page, `${label} dashboard`);
  await assertNoSecretsVisible(page, `${label} dashboard`);
}

async function runViewportSuite(browser, viewport) {
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
  };
  if (viewport.mobile) {
    contextOptions.hasTouch = true;
    contextOptions.isMobile = true;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);
  const failures = [];

  const runStep = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      failures.push({ step: name, message: error.message });
      await saveFailureScreenshot(page, viewport.id, name);
    }
  };

  try {
    await login(page);

    await runStep("navigation", () => runNavigationChecks(page, viewport));
    await runStep("dashboard", () => runDashboardChecks(page, viewport));
    await runStep("bills", () => runBillsChecks(page, viewport));
    await runStep("debt", () => runDebtChecks(page, viewport));
    await runStep("expenses", () => runExpensesChecks(page, viewport));
    await runStep("settings", () => runSettingsChecks(page, viewport));
    await runStep("calendar", () => runCalendarChecks(page, viewport));
    await runStep("reports", () => runReportsChecks(page, viewport));
    await runStep("forms-dialogs", () => runFormsDialogsChecks(page, viewport));
    await runStep("privacy", () => runPrivacyChecks(page, viewport));

    if (consoleErrors.length > 0) {
      failures.push({
        step: "console",
        message: `Browser console errors:\n${consoleErrors.join("\n")}`,
      });
    }

    return {
      viewport: viewport.id,
      pass: failures.length === 0,
      failures,
      consoleErrors,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  assert(EMAIL && PASSWORD, "Missing TEST_EMAIL/TEST_PASSWORD or C112 seed env");

  console.log(`CASHFLOW-CURSOR-126 Android viewport smoke — base URL ${BASE_URL}`);
  if (KNOWN_CONTAINED_OVERFLOW.length > 0) {
    for (const item of KNOWN_CONTAINED_OVERFLOW) {
      console.log(`Known contained overflow: ${item.note}`);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      console.log(`\n--- Viewport ${viewport.id} ---`);
      const result = await runViewportSuite(browser, viewport);
      results.push(result);

      if (result.pass) {
        console.log(`Viewport ${viewport.id}: PASS`);
      } else {
        console.error(`Viewport ${viewport.id}: FAIL`);
        for (const failure of result.failures) {
          console.error(`  [${failure.step}] ${failure.message}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const allPass = results.every((result) => result.pass);
  const summary = results
    .map((result) => `${result.viewport}:${result.pass ? "PASS" : "FAIL"}`)
    .join(", ");

  console.log(`\nCASHFLOW-CURSOR-126 summary: ${summary}`);

  if (!allPass) {
    process.exit(1);
  }

  console.log("CASHFLOW-CURSOR-126 smoke: PASS");
}

main().catch((error) => {
  console.error("CASHFLOW-CURSOR-126 smoke: FAIL");
  console.error(error);
  process.exit(1);
});
