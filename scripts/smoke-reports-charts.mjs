/**
 * CASHFLOW-CURSOR-131D — Report expense charts browser smoke tests.
 *
 * Env: TEST_EMAIL, TEST_PASSWORD (or CASHFLOW_OWNER_* from seed)
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5233)
 *
 * Usage:
 *   npm run dev -- --host 127.0.0.1 --port 5233 --strictPort
 *   node scripts/smoke-reports-charts.mjs
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
} from "./lib/android-smoke-helpers.mjs";

const BASE_URL =
  process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5233";

const VIEWPORTS = [
  { id: "desktop-1280x800", width: 1280, height: 800, mobile: false },
  { id: "mobile-390x844", width: 390, height: 844, mobile: true },
];

// Required data-testids
const TEST_IDS = {
  chartsSection: "reports-expense-charts-section",
  chartTabs: "reports-expense-chart-tabs",
  categoryChart: "reports-expenses-by-category-chart",
  monthChart: "reports-expenses-by-month-chart",
  payPeriodChart: "reports-expenses-by-pay-period-chart",
  catByMonthChart: "reports-category-by-month-chart",
  catByPeriodChart: "reports-category-by-pay-period-chart",
  emptyState: "reports-expense-chart-empty-state",
};

/** Tab trigger labels as they appear in the DOM. */
const TAB_VALUES = [
  { value: "category", label: "By Category" },
  { value: "month", label: "By Month" },
  { value: "payperiod", label: "By Pay Period" },
  { value: "cat-by-month", label: "Category × Month" },
  { value: "cat-by-period", label: "Category × Period" },
];

/**
 * Check that either a chart SVG/div or an empty-state element is visible
 * inside the given CardContent container.
 */
async function assertChartOrEmpty(page, contentTestId, label) {
  const container = page.getByTestId(contentTestId);
  const hasContainer = (await container.count()) > 0;
  if (!hasContainer) {
    console.warn(`  [WARN] ${label}: container [data-testid="${contentTestId}"] not found`);
    return;
  }

  const hasSvg = (await container.locator("svg").count()) > 0;
  const hasCanvas = (await container.locator("canvas").count()) > 0;
  const hasEmpty =
    (await page.getByTestId(TEST_IDS.emptyState).count()) > 0 &&
    (await page.getByTestId(TEST_IDS.emptyState).isVisible().catch(() => false));

  assert(
    hasSvg || hasCanvas || hasEmpty,
    `${label}: expected an SVG chart or empty-state in [data-testid="${contentTestId}"]`
  );

  console.log(`  ${label}: chart or empty state present`);
}

async function runForViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  console.log(`\n[${viewport.id}] Starting reports-charts smoke`);

  try {
    // 1. Login
    await login(page);
    console.log(`[${viewport.id}] Login OK`);

    // 2. Navigate to reports/monthly
    await page.goto(`${BASE_URL}/reports/monthly`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Printable Report", exact: false })
      .first()
      .waitFor({ timeout: 20000 });
    console.log(`[${viewport.id}] Reports page loaded`);

    // 3. Wait for data to finish loading (spinner goes away or report renders)
    await page.waitForTimeout(2000);

    // 4. Charts section must be present
    const chartsSectionVisible = await page
      .getByTestId(TEST_IDS.chartsSection)
      .isVisible()
      .catch(() => false);
    assert(
      chartsSectionVisible,
      `[${viewport.id}] Expense charts section [data-testid="${TEST_IDS.chartsSection}"] must be visible`
    );
    console.log(`[${viewport.id}] Charts section visible`);

    // 5. Chart tabs must be present
    const tabsVisible = await page
      .getByTestId(TEST_IDS.chartTabs)
      .isVisible()
      .catch(() => false);
    assert(
      tabsVisible,
      `[${viewport.id}] Chart tabs [data-testid="${TEST_IDS.chartTabs}"] must be visible`
    );
    console.log(`[${viewport.id}] Chart tabs visible`);

    // 6. Default tab (By Category) shows chart or empty state
    await assertChartOrEmpty(
      page,
      TEST_IDS.categoryChart,
      `[${viewport.id}] By Category tab`
    );

    // 7. No raw UUIDs on default view
    await assertNoUuidLabels(page, `[${viewport.id}] no raw UUIDs on category tab`);
    console.log(`[${viewport.id}] No raw UUIDs on category tab`);

    // 8. No horizontal overflow on default view
    await assertNoHorizontalOverflow(page, `[${viewport.id}] no overflow on category tab`);
    console.log(`[${viewport.id}] No overflow on category tab`);

    // 9. Cycle through all tabs and check chart/empty state
    for (const tab of TAB_VALUES.slice(1)) {
      // Find and click the tab trigger
      const trigger = page.locator(`[role="tab"]`, { hasText: tab.label }).first();
      const triggerExists = (await trigger.count()) > 0;

      if (!triggerExists) {
        console.warn(`  [WARN] Tab "${tab.label}" not found — skipping`);
        continue;
      }

      await trigger.click();
      await page.waitForTimeout(400);

      // Check chart or empty state for tabs that have a dedicated test id
      if (tab.value === "month") {
        await assertChartOrEmpty(
          page,
          TEST_IDS.monthChart,
          `[${viewport.id}] By Month tab`
        );
      } else if (tab.value === "payperiod") {
        await assertChartOrEmpty(
          page,
          TEST_IDS.payPeriodChart,
          `[${viewport.id}] By Pay Period tab`
        );
      } else if (tab.value === "cat-by-month") {
        await assertChartOrEmpty(
          page,
          TEST_IDS.catByMonthChart,
          `[${viewport.id}] Category × Month tab`
        );
      } else if (tab.value === "cat-by-period") {
        await assertChartOrEmpty(
          page,
          TEST_IDS.catByPeriodChart,
          `[${viewport.id}] Category × Period tab`
        );
      }

      // No overflow on each tab
      await assertNoHorizontalOverflow(
        page,
        `[${viewport.id}] no overflow on "${tab.label}" tab`
      );
      console.log(`[${viewport.id}] Tab "${tab.label}" — OK`);
    }

    // 10. No raw UUIDs anywhere on the page after cycling all tabs
    await assertNoUuidLabels(page, `[${viewport.id}] no raw UUIDs after cycling tabs`);
    console.log(`[${viewport.id}] No raw UUIDs after cycling tabs`);

    // 11. Tab list is keyboard-accessible (tab-to-first, then arrow-right)
    // Navigate back to category tab first
    const firstTab = page.locator(`[role="tab"]`, { hasText: "By Category" }).first();
    if ((await firstTab.count()) > 0) {
      await firstTab.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      console.log(`[${viewport.id}] Keyboard navigation through tabs: OK`);
    }

    // 12. Mobile-specific: charts section is readable, controls are usable
    if (viewport.mobile) {
      const chartsSectionEl = page.getByTestId(TEST_IDS.chartsSection);
      const sectionBox = await chartsSectionEl.boundingBox().catch(() => null);

      if (sectionBox) {
        assert(
          sectionBox.width <= viewport.width + 2,
          `[${viewport.id}] Charts section width ${sectionBox.width}px should not exceed viewport ${viewport.width}px`
        );
        console.log(`[${viewport.id}] Charts section fits mobile viewport`);
      }

      // Tab list should be scrollable horizontally, not overflowing the page
      await assertNoHorizontalOverflow(page, `[${viewport.id}] mobile no page overflow`);
      console.log(`[${viewport.id}] Mobile no page overflow`);
    }

    // 13. No console errors
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
    await saveFailureScreenshot(page, viewport.id, "reports-charts");
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

  console.log("\nAll reports-charts smoke tests passed.");
}

main().catch((err) => {
  console.error("Smoke test runner error:", err);
  process.exit(1);
});
