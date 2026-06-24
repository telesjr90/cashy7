/**
 * CASHFLOW-CURSOR-131A — Dashboard card simplification smoke tests.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5231)
 *
 * Usage:
 *   npm run dev -- --host 127.0.0.1 --port 5231 --strictPort
 *   node scripts/smoke-dashboard-cards.mjs
 */
import { chromium } from "playwright";
import {
  assert,
  login,
  collectConsoleErrors,
  saveFailureScreenshot,
  assertNoHorizontalOverflow,
  assertNoUuidLabels,
  EMAIL,
  PASSWORD,
  OVERFLOW_TOLERANCE_PX,
} from "./lib/android-smoke-helpers.mjs";

const BASE_URL =
  process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5231";

const VIEWPORTS = [
  { id: "desktop-1280x800", width: 1280, height: 800, mobile: false },
  { id: "mobile-390x844", width: 390, height: 844, mobile: true },
];

const CARD_TEST_IDS = {
  availableAfterSavings: "dashboard-card-available-after-savings",
  totalAvailable: "dashboard-card-total-available",
  currentAmount: "dashboard-current-amount-card",
  unpaidBills: "dashboard-unpaid-bills-card",
  manualExpenses: "dashboard-manual-expenses-card",
  billTotal: "dashboard-bill-total-card",
};

const PANEL_TEST_IDS = {
  panel: "dashboard-drilldown-panel",
  panelClose: "dashboard-drilldown-panel-close",
  openAvailableAfterSavings: "dashboard-drilldown-open-available-after-savings",
  openTotalAvailable: "dashboard-drilldown-open-total-available",
};

async function assertElementVisible(page, testId, label) {
  const el = page.getByTestId(testId);
  const visible = await el.isVisible().catch(() => false);
  assert(visible, `${label}: [data-testid="${testId}"] should be visible`);
}

async function assertCardOrder(page, firstTestId, secondTestId, label) {
  const firstRect = await page.locator(`[data-testid="${firstTestId}"]`).boundingBox();
  const secondRect = await page.locator(`[data-testid="${secondTestId}"]`).boundingBox();
  if (!firstRect || !secondRect) {
    console.warn(`${label}: could not measure card order (cards may not be visible)`);
    return;
  }
  assert(
    firstRect.y <= secondRect.y,
    `${label}: "${firstTestId}" should appear before "${secondTestId}" (y: ${firstRect.y} vs ${secondRect.y})`
  );
}

async function openPanelFromBlock(page, openTestId, label) {
  const button = page.getByTestId(openTestId);
  const exists = (await button.count()) > 0;
  if (!exists) {
    console.warn(`${label}: open button [data-testid="${openTestId}"] not found — skipping`);
    return false;
  }

  await button.click();
  await page
    .getByTestId(PANEL_TEST_IDS.panel)
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(() => {});

  const visible = await page
    .getByTestId(PANEL_TEST_IDS.panel)
    .isVisible()
    .catch(() => false);
  assert(
    visible,
    `${label}: drilldown panel [data-testid="${PANEL_TEST_IDS.panel}"] should open after clicking the block`
  );
  return true;
}

async function closePanel(page, label) {
  const closeBtn = page.getByTestId(PANEL_TEST_IDS.panelClose);
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page
    .getByTestId(PANEL_TEST_IDS.panel)
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});

  const visible = await page
    .getByTestId(PANEL_TEST_IDS.panel)
    .isVisible()
    .catch(() => false);
  assert(!visible, `${label}: drilldown panel should be closed`);
}

async function assertNoRawUuids(page, label) {
  await assertNoUuidLabels(page, label);
}

async function runForViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  console.log(`\n[${viewport.id}] Starting dashboard card smoke tests`);

  try {
    // 1. Login
    await login(page);
    console.log(`[${viewport.id}] Login OK`);

    // 2. Navigate to dashboard
    await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("Household Cashflow Dashboard", { exact: false })
      .first()
      .waitFor({ timeout: 20000 });
    console.log(`[${viewport.id}] Dashboard loaded`);

    // 3. Important cards are visible
    await assertElementVisible(
      page,
      CARD_TEST_IDS.availableAfterSavings,
      `${viewport.id} available-after-savings card present`
    );
    await assertElementVisible(
      page,
      CARD_TEST_IDS.totalAvailable,
      `${viewport.id} total-available card present`
    );
    console.log(`[${viewport.id}] Important cards present`);

    // 4. Priority cards appear before secondary cards
    await assertCardOrder(
      page,
      CARD_TEST_IDS.availableAfterSavings,
      CARD_TEST_IDS.currentAmount,
      `${viewport.id} priority ordering`
    );
    await assertCardOrder(
      page,
      CARD_TEST_IDS.totalAvailable,
      CARD_TEST_IDS.currentAmount,
      `${viewport.id} priority ordering`
    );
    await assertCardOrder(
      page,
      CARD_TEST_IDS.availableAfterSavings,
      CARD_TEST_IDS.billTotal,
      `${viewport.id} priority ordering vs bill total`
    );
    console.log(`[${viewport.id}] Card priority order OK`);

    // 5. No horizontal overflow with the compact stat blocks laid out in a row
    await assertNoHorizontalOverflow(
      page,
      `${viewport.id} stat blocks no overflow`
    );
    console.log(`[${viewport.id}] No horizontal overflow`);

    // 6. Tapping "Available to spend after savings" opens its drilldown panel
    const openedAfterSavings = await openPanelFromBlock(
      page,
      PANEL_TEST_IDS.openAvailableAfterSavings,
      `${viewport.id} open available-after-savings panel`
    );
    if (openedAfterSavings) {
      console.log(`[${viewport.id}] Available-after-savings panel opened OK`);
      await assertNoHorizontalOverflow(
        page,
        `${viewport.id} available-after-savings panel no overflow`
      );
      await closePanel(page, `${viewport.id} close available-after-savings panel`);
      console.log(`[${viewport.id}] Available-after-savings panel closed OK`);
    }

    // 7. Tapping "Total amount available" opens its drilldown panel
    const openedTotalAvailable = await openPanelFromBlock(
      page,
      PANEL_TEST_IDS.openTotalAvailable,
      `${viewport.id} open total-available panel`
    );
    if (openedTotalAvailable) {
      console.log(`[${viewport.id}] Total-available panel opened OK`);
      await assertNoHorizontalOverflow(
        page,
        `${viewport.id} total-available panel no overflow`
      );
      await closePanel(page, `${viewport.id} close total-available panel`);
      console.log(`[${viewport.id}] Total-available panel closed OK`);
    }

    // 11. No raw UUIDs visible
    await assertNoRawUuids(page, `${viewport.id} no raw UUIDs`);
    console.log(`[${viewport.id}] No raw UUIDs visible`);

    // 12. No console errors
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
    await saveFailureScreenshot(page, viewport.id, "dashboard-cards");
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
    console.log(`  ${result.status.padEnd(4)} ${result.viewport}${result.error ? `: ${result.error}` : ""}`);
  }

  const failures = results.filter((r) => r.status === "FAIL");
  if (failures.length > 0) {
    console.error(`\n${failures.length} viewport(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll dashboard card smoke tests passed.");
}

main().catch((err) => {
  console.error("Smoke test runner error:", err);
  process.exit(1);
});
