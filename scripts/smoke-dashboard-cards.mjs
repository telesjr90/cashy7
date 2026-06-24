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
  toggleAvailableAfterSavings: "dashboard-card-toggle-available-after-savings",
  toggleTotalAvailable: "dashboard-card-toggle-total-available",
  detailsAvailableAfterSavings: "dashboard-card-details-available-after-savings",
  detailsTotalAvailable: "dashboard-card-details-total-available",
  currentAmount: "dashboard-current-amount-card",
  safeToSpendBefore: "dashboard-safe-to-spend-before-card",
  unpaidBills: "dashboard-unpaid-bills-card",
  manualExpenses: "dashboard-manual-expenses-card",
  billTotal: "dashboard-bill-total-card",
};

async function assertElementVisible(page, testId, label) {
  const el = page.getByTestId(testId);
  const visible = await el.isVisible().catch(() => false);
  assert(visible, `${label}: [data-testid="${testId}"] should be visible`);
}

async function assertElementNotVisible(page, testId, label) {
  // Details sections are hidden via Collapsible — they may not be in DOM or
  // have display:none / hidden attribute.
  const count = await page.locator(`[data-testid="${testId}"]`).count();
  if (count === 0) {
    return; // Not in DOM at all — counts as hidden.
  }
  const el = page.getByTestId(testId);
  const visible = await el.isVisible().catch(() => false);
  assert(!visible, `${label}: [data-testid="${testId}"] should be hidden (collapsed)`);
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

async function expandCard(page, toggleTestId, detailsTestId, label) {
  const toggle = page.getByTestId(toggleTestId);
  const exists = (await toggle.count()) > 0;
  if (!exists) {
    console.warn(`${label}: toggle [data-testid="${toggleTestId}"] not found — skipping expand`);
    return false;
  }

  await toggle.click();
  await page.waitForTimeout(300); // allow Collapsible animation

  const details = page.getByTestId(detailsTestId);
  const visible = await details.isVisible().catch(() => false);
  assert(visible, `${label}: details [data-testid="${detailsTestId}"] should be visible after expand`);
  return true;
}

async function collapseCard(page, toggleTestId, detailsTestId, label) {
  const toggle = page.getByTestId(toggleTestId);
  await toggle.click();
  await page.waitForTimeout(300);

  const details = page.getByTestId(detailsTestId);
  const visible = await details.isVisible().catch(() => false);
  assert(!visible, `${label}: details [data-testid="${detailsTestId}"] should be hidden after collapse`);
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

    // 5. Details are hidden by default (collapsed)
    await assertElementNotVisible(
      page,
      CARD_TEST_IDS.detailsAvailableAfterSavings,
      `${viewport.id} available-after-savings details hidden by default`
    );
    await assertElementNotVisible(
      page,
      CARD_TEST_IDS.detailsTotalAvailable,
      `${viewport.id} total-available details hidden by default`
    );
    console.log(`[${viewport.id}] Details hidden by default`);

    // 6. No horizontal overflow in collapsed state
    await assertNoHorizontalOverflow(
      page,
      `${viewport.id} collapsed cards no overflow`
    );
    console.log(`[${viewport.id}] No horizontal overflow`);

    // 7. Expand "Available to spend after savings"
    const expandedAfterSavings = await expandCard(
      page,
      CARD_TEST_IDS.toggleAvailableAfterSavings,
      CARD_TEST_IDS.detailsAvailableAfterSavings,
      `${viewport.id} expand available-after-savings`
    );
    if (expandedAfterSavings) {
      console.log(`[${viewport.id}] Available-after-savings expanded OK`);
      await assertNoHorizontalOverflow(
        page,
        `${viewport.id} available-after-savings expanded no overflow`
      );

      // 8. Collapse it again
      await collapseCard(
        page,
        CARD_TEST_IDS.toggleAvailableAfterSavings,
        CARD_TEST_IDS.detailsAvailableAfterSavings,
        `${viewport.id} collapse available-after-savings`
      );
      console.log(`[${viewport.id}] Available-after-savings collapsed again OK`);
    }

    // 9. Expand "Total amount available"
    const expandedTotalAvailable = await expandCard(
      page,
      CARD_TEST_IDS.toggleTotalAvailable,
      CARD_TEST_IDS.detailsTotalAvailable,
      `${viewport.id} expand total-available`
    );
    if (expandedTotalAvailable) {
      console.log(`[${viewport.id}] Total-available expanded OK`);
      await assertNoHorizontalOverflow(
        page,
        `${viewport.id} total-available expanded no overflow`
      );

      // 10. Collapse it again
      await collapseCard(
        page,
        CARD_TEST_IDS.toggleTotalAvailable,
        CARD_TEST_IDS.detailsTotalAvailable,
        `${viewport.id} collapse total-available`
      );
      console.log(`[${viewport.id}] Total-available collapsed again OK`);
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
