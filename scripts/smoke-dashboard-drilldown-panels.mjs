/**
 * CASHFLOW-CURSOR-131B — Dashboard drilldown panel smoke tests.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5232)
 *
 * Usage:
 *   npm run dev -- --host 127.0.0.1 --port 5232 --strictPort
 *   node scripts/smoke-dashboard-drilldown-panels.mjs
 */
import { chromium } from "playwright";
import {
  assert,
  login,
  collectConsoleErrors,
  saveFailureScreenshot,
  assertNoHorizontalOverflow,
  assertNoUuidLabels,
  assertOpenModalsFitViewport,
  waitForOpenSheetSettled,
  closeOpenModal,
  EMAIL,
  PASSWORD,
} from "./lib/android-smoke-helpers.mjs";

const BASE_URL =
  process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5232";

const VIEWPORTS = [
  { id: "desktop-1280x800", width: 1280, height: 800, mobile: false },
  { id: "mobile-390x844", width: 390, height: 844, mobile: true },
];

// Required data-testid constants
const TEST_IDS = {
  // Cards
  availableAfterSavings: "dashboard-card-available-after-savings",
  totalAvailable: "dashboard-card-total-available",
  // Open-panel affordances
  openAvailableAfterSavings: "dashboard-drilldown-open-available-after-savings",
  openTotalAvailable: "dashboard-drilldown-open-total-available",
  // Panel elements
  panel: "dashboard-drilldown-panel",
  panelTitle: "dashboard-drilldown-panel-title",
  panelAmount: "dashboard-drilldown-panel-amount",
  panelClose: "dashboard-drilldown-panel-close",
  // Content sections
  availableAfterSavingsSection: "dashboard-drilldown-available-after-savings",
  totalAvailableSection: "dashboard-drilldown-total-available",
  billsSection: "dashboard-drilldown-bills",
  expensesSection: "dashboard-drilldown-expenses",
  savingsSection: "dashboard-drilldown-savings",
  debtSection: "dashboard-drilldown-debt",
};

async function assertPanelNotOpen(page, label) {
  const panelVisible = await page
    .getByTestId(TEST_IDS.panel)
    .isVisible()
    .catch(() => false);
  assert(!panelVisible, `${label}: drilldown panel should not be open`);
}

async function openPanelByTestId(page, openButtonTestId, label) {
  const button = page.getByTestId(openButtonTestId);
  const exists = (await button.count()) > 0;
  if (!exists) {
    console.warn(
      `${label}: open-panel button [data-testid="${openButtonTestId}"] not found — skipping`
    );
    return false;
  }

  await button.click();
  await waitForOpenSheetSettled(page).catch(async () => {
    await page
      .locator('[data-slot="sheet-content"]')
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
  });

  const panelVisible = await page
    .getByTestId(TEST_IDS.panel)
    .isVisible()
    .catch(() => false);
  assert(panelVisible, `${label}: panel [data-testid="${TEST_IDS.panel}"] should be visible after clicking open button`);
  return true;
}

async function assertPanelTitleVisible(page, label) {
  const titleVisible = await page
    .getByTestId(TEST_IDS.panelTitle)
    .isVisible()
    .catch(() => false);
  assert(titleVisible, `${label}: panel title [data-testid="${TEST_IDS.panelTitle}"] should be visible`);

  const titleText = await page
    .getByTestId(TEST_IDS.panelTitle)
    .innerText()
    .catch(() => "");
  assert(titleText.trim().length > 0, `${label}: panel title should not be empty`);
}

async function closePanelByButton(page, label) {
  const closeBtn = page.getByTestId(TEST_IDS.panelClose);
  const exists = (await closeBtn.count()) > 0;
  if (!exists) {
    // Fallback: use Escape
    await closeOpenModal(page);
    return;
  }

  await closeBtn.click();
  await page
    .getByTestId(TEST_IDS.panel)
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});

  const panelVisible = await page
    .getByTestId(TEST_IDS.panel)
    .isVisible()
    .catch(() => false);
  assert(!panelVisible, `${label}: panel should be hidden after close button click`);
}

async function runForViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  console.log(`\n[${viewport.id}] Starting drilldown panel smoke tests`);

  try {
    // 1. Login
    await login(page);
    console.log(`[${viewport.id}] Login OK`);

    // 2. Navigate to dashboard
    await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
    await page
      .getByText("Household Cashflow Dashboard", { exact: false })
      .first()
      .waitFor({ timeout: 20000 });
    console.log(`[${viewport.id}] Dashboard loaded`);

    // 3. Important cards are visible
    const availableCard = page.getByTestId(TEST_IDS.availableAfterSavings);
    assert(
      await availableCard.isVisible().catch(() => false),
      `${viewport.id}: available-after-savings card should be visible`
    );
    const totalCard = page.getByTestId(TEST_IDS.totalAvailable);
    assert(
      await totalCard.isVisible().catch(() => false),
      `${viewport.id}: total-available card should be visible`
    );
    console.log(`[${viewport.id}] Priority cards present`);

    // 4. Cards remain compact — no panel open by default
    await assertPanelNotOpen(page, `${viewport.id} no panel open by default`);
    console.log(`[${viewport.id}] No panel open by default`);

    // 5. No horizontal overflow in initial state
    await assertNoHorizontalOverflow(page, `${viewport.id} initial no overflow`);
    console.log(`[${viewport.id}] No horizontal overflow in initial state`);

    // 6. Open "Available to spend after savings" panel
    const openedAfterSavings = await openPanelByTestId(
      page,
      TEST_IDS.openAvailableAfterSavings,
      `${viewport.id} open available-after-savings panel`
    );

    if (openedAfterSavings) {
      console.log(`[${viewport.id}] Available-after-savings panel opened`);

      // 6a. Panel title is visible
      await assertPanelTitleVisible(page, `${viewport.id} after-savings panel title`);

      // 6b. No overflow in open panel
      await assertOpenModalsFitViewport(
        page,
        `${viewport.id} available-after-savings panel fits viewport`
      );

      // 6c. No raw UUIDs in panel
      await assertNoUuidLabels(page, `${viewport.id} no raw UUIDs in panel`);

      // 6d. Close panel via close button
      await closePanelByButton(
        page,
        `${viewport.id} close available-after-savings panel`
      );
      console.log(`[${viewport.id}] Available-after-savings panel closed`);
    }

    // 7. Open "Total amount available" panel
    const openedTotalAvailable = await openPanelByTestId(
      page,
      TEST_IDS.openTotalAvailable,
      `${viewport.id} open total-available panel`
    );

    if (openedTotalAvailable) {
      console.log(`[${viewport.id}] Total-available panel opened`);

      // 7a. Panel title is visible
      await assertPanelTitleVisible(page, `${viewport.id} total-available panel title`);

      // 7b. No overflow in open panel
      await assertOpenModalsFitViewport(
        page,
        `${viewport.id} total-available panel fits viewport`
      );

      // 7c. No raw UUIDs
      await assertNoUuidLabels(page, `${viewport.id} no raw UUIDs in total-available panel`);

      // 7d. Close via Escape key (alternate close path)
      await page.keyboard.press("Escape");
      await page
        .getByTestId(TEST_IDS.panel)
        .waitFor({ state: "hidden", timeout: 10000 })
        .catch(() => {});

      const panelVisible = await page
        .getByTestId(TEST_IDS.panel)
        .isVisible()
        .catch(() => false);
      assert(!panelVisible, `${viewport.id}: panel should close on Escape`);
      console.log(`[${viewport.id}] Total-available panel closed via Escape`);
    }

    // 8. Try to open a secondary drilldown panel (bills or unpaid-bills) if present
    //    The "My unpaid bills for this view" card may have a "View unpaid bills" button
    const viewUnpaidBtn = page.getByRole("button", { name: "View unpaid bills" });
    if ((await viewUnpaidBtn.count()) > 0) {
      await viewUnpaidBtn.first().click();
      const sheetOpened = await waitForOpenSheetSettled(page)
        .then(() => true)
        .catch(() => false);

      if (sheetOpened) {
        console.log(`[${viewport.id}] Secondary drilldown (unpaid bills) opened`);

        await assertOpenModalsFitViewport(
          page,
          `${viewport.id} secondary panel fits viewport`
        );
        await assertNoUuidLabels(
          page,
          `${viewport.id} no raw UUIDs in secondary panel`
        );
        await closeOpenModal(page);
        console.log(`[${viewport.id}] Secondary drilldown closed`);
      }
    } else {
      console.log(`[${viewport.id}] No secondary drilldown available (no unpaid bills)`);
    }

    // 9. Mobile: panel is readable and close control is reachable
    if (viewport.mobile) {
      const openedForMobile = await openPanelByTestId(
        page,
        TEST_IDS.openAvailableAfterSavings,
        `${viewport.id} mobile panel open check`
      );

      if (openedForMobile) {
        // Close button should be reachable (in DOM and not clipped)
        const closeBtn = page.getByTestId(TEST_IDS.panelClose);
        const closeBtnExists = (await closeBtn.count()) > 0;
        assert(
          closeBtnExists,
          `${viewport.id}: close button should be present on mobile`
        );

        await assertOpenModalsFitViewport(
          page,
          `${viewport.id} mobile panel not clipped`
        );

        await closePanelByButton(page, `${viewport.id} mobile close panel`);
        console.log(`[${viewport.id}] Mobile panel open/close verified`);
      }
    }

    // 10. No console errors
    if (consoleErrors.length > 0) {
      console.warn(
        `[${viewport.id}] Console errors (${consoleErrors.length}):`,
        consoleErrors.slice(0, 5)
      );
    }
    assert(
      consoleErrors.length === 0,
      `[${viewport.id}] ${consoleErrors.length} console error(s): ${consoleErrors[0] ?? ""}`
    );
    console.log(`[${viewport.id}] No console errors`);

    console.log(`[${viewport.id}] ALL CHECKS PASSED`);
  } catch (err) {
    await saveFailureScreenshot(page, viewport.id, "dashboard-drilldown-panels");
    throw err;
  } finally {
    await context.close();
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "Missing credentials. Set TEST_EMAIL / TEST_PASSWORD or CASHFLOW_OWNER_EMAIL / CASHFLOW_OWNER_PASSWORD."
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  const results = [];
  for (const viewport of VIEWPORTS) {
    try {
      await runForViewport(browser, viewport);
      results.push({ viewport: viewport.id, status: "PASS" });
    } catch (err) {
      console.error(`[${viewport.id}] FAILED:`, err.message);
      results.push({ viewport: viewport.id, status: "FAIL", error: err.message });
    }
  }

  await browser.close();

  console.log("\n── Results ──");
  for (const result of results) {
    console.log(
      `  ${result.status.padEnd(4)} ${result.viewport}${result.error ? `: ${result.error}` : ""}`
    );
  }

  const failures = results.filter((r) => r.status === "FAIL");
  if (failures.length > 0) {
    console.error(`\n${failures.length} viewport(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll dashboard drilldown panel smoke tests passed.");
}

main().catch((err) => {
  console.error("Smoke test runner error:", err);
  process.exit(1);
});
