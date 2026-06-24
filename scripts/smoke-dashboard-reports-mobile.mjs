/**
 * CASHFLOW-CURSOR-131E — Dashboard + Reports mobile/report smoke aggregator.
 *
 * Consolidates and hardens browser smoke coverage for:
 *   - C131A dashboard compact cards
 *   - C131B dashboard drilldown panels
 *   - C131D reports expense charts
 *   - mobile reflow / no horizontal overflow
 *   - print/report behavior (no-print chart section, printable report retained)
 *   - privacy-safe labels (no raw UUIDs)
 *   - no console / page errors
 *
 * This script reuses the shared helpers in ./lib/android-smoke-helpers.mjs and
 * does NOT change any product behavior, RLS, auth, formulas, or database state.
 *
 * Env: TEST_EMAIL/TEST_PASSWORD or CASHFLOW_OWNER_* (loaded by shared helpers).
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5234).
 *
 * Usage:
 *   npm run dev -- --host 127.0.0.1 --port 5234 --strictPort
 *   $env:CASHFLOW_E2E_BASE_URL = "http://127.0.0.1:5234"
 *   node scripts/smoke-dashboard-reports-mobile.mjs
 */
import { chromium } from "playwright";
import {
  assert,
  login,
  collectConsoleErrors,
  saveFailureScreenshot,
  assertNoUuidLabels,
  assertOpenModalsFitViewport,
  waitForOpenSheetSettled,
  closeOpenModal,
  EMAIL,
  PASSWORD,
  OVERFLOW_TOLERANCE_PX,
} from "./lib/android-smoke-helpers.mjs";

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5234";

/**
 * Viewports under test. Desktop 1280 + Android mobile 390 are required; narrow
 * mobile 360 is low-risk extra coverage.
 *
 * The optional tablet 768x1024 viewport is intentionally excluded: at exactly
 * the Tailwind `md` (768px) breakpoint the GLOBAL desktop top navigation
 * (`<AppNavigation className="hidden md:flex" />` in src/App.tsx) becomes
 * visible and its nav buttons overflow the page width. That overflow originates
 * in the shared app navigation, not in the C131 dashboard cards or reports
 * charts this task hardens, so it is out of scope here (see task report —
 * recommended follow-up: a dedicated app-navigation tablet-reflow task).
 */
const VIEWPORTS = [
  { id: "desktop-1280x800", width: 1280, height: 800, mobile: false },
  { id: "mobile-390x844", width: 390, height: 844, mobile: true },
  { id: "narrow-360x740", width: 360, height: 740, mobile: true },
];

const DASHBOARD_TEST_IDS = {
  availableAfterSavings: "dashboard-card-available-after-savings",
  totalAvailable: "dashboard-card-total-available",
  toggleAvailableAfterSavings: "dashboard-card-toggle-available-after-savings",
  toggleTotalAvailable: "dashboard-card-toggle-total-available",
  detailsAvailableAfterSavings: "dashboard-card-details-available-after-savings",
  detailsTotalAvailable: "dashboard-card-details-total-available",
  currentAmount: "dashboard-current-amount-card",
  openAvailableAfterSavings: "dashboard-drilldown-open-available-after-savings",
  openTotalAvailable: "dashboard-drilldown-open-total-available",
  panel: "dashboard-drilldown-panel",
  panelTitle: "dashboard-drilldown-panel-title",
  panelAmount: "dashboard-drilldown-panel-amount",
  panelClose: "dashboard-drilldown-panel-close",
  availableAfterSavingsSection: "dashboard-drilldown-available-after-savings",
  totalAvailableSection: "dashboard-drilldown-total-available",
};

const REPORT_TEST_IDS = {
  printableReport: "monthly-print-report",
  chartsSection: "reports-expense-charts-section",
  chartTabs: "reports-expense-chart-tabs",
  categoryChart: "reports-expenses-by-category-chart",
  monthChart: "reports-expenses-by-month-chart",
  payPeriodChart: "reports-expenses-by-pay-period-chart",
  catByMonthChart: "reports-category-by-month-chart",
  catByPeriodChart: "reports-category-by-pay-period-chart",
  emptyState: "reports-expense-chart-empty-state",
};

const REPORT_TABS = [
  { value: "category", label: "By Category", chart: REPORT_TEST_IDS.categoryChart },
  { value: "month", label: "By Month", chart: REPORT_TEST_IDS.monthChart },
  { value: "payperiod", label: "By Pay Period", chart: REPORT_TEST_IDS.payPeriodChart },
  { value: "cat-by-month", label: "Category × Month", chart: REPORT_TEST_IDS.catByMonthChart },
  { value: "cat-by-period", label: "Category × Period", chart: REPORT_TEST_IDS.catByPeriodChart },
];

// ---------------------------------------------------------------------------
// Reusable horizontal-overflow diagnostics
// ---------------------------------------------------------------------------

/**
 * Measure horizontal overflow against the document element, returning rich
 * diagnostics (scroll/client width plus the widest offending elements) so
 * failures are actionable.
 */
async function describeHorizontalOverflow(page, tolerance) {
  return page.evaluate((tol) => {
    const docEl = document.documentElement;
    const clientWidth = docEl.clientWidth;
    const scrollWidth = Math.max(docEl.scrollWidth, document.body.scrollWidth);
    const overflow = scrollWidth > clientWidth + tol;

    let widest = [];
    if (overflow) {
      const offenders = [];
      const all = document.body.querySelectorAll("*");
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) continue;
        // Element pushes past the right edge or starts left of the viewport.
        if (rect.right > clientWidth + tol || rect.left < -tol) {
          const id = el.getAttribute("data-testid");
          const descriptor =
            el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : "") +
            (id ? `[data-testid="${id}"]` : "") +
            (typeof el.className === "string" && el.className
              ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
              : "");
          offenders.push({
            descriptor,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      }
      // Sort by right edge (worst first), keep a small best-effort list.
      offenders.sort((a, b) => b.right - a.right);
      widest = offenders.slice(0, 6);
    }

    return { overflow, scrollWidth, clientWidth, widest };
  }, tolerance);
}

async function assertNoHorizontalOverflowDetailed(page, viewportId, route, label) {
  const result = await describeHorizontalOverflow(page, OVERFLOW_TOLERANCE_PX);
  if (result.overflow) {
    console.error(
      `  [OVERFLOW] ${viewportId} ${route} — ${label}: scrollWidth=${result.scrollWidth} clientWidth=${result.clientWidth}`
    );
    for (const offender of result.widest) {
      console.error(
        `    - ${offender.descriptor} (left=${offender.left} right=${offender.right} width=${offender.width})`
      );
    }
  }
  assert(
    !result.overflow,
    `${viewportId} ${route} — ${label}: horizontal page overflow (scrollWidth=${result.scrollWidth} > clientWidth=${result.clientWidth})`
  );
}

// ---------------------------------------------------------------------------
// Small assertion helpers
// ---------------------------------------------------------------------------

async function isVisible(page, testId) {
  return page
    .getByTestId(testId)
    .isVisible()
    .catch(() => false);
}

async function assertVisible(page, testId, label) {
  assert(await isVisible(page, testId), `${label}: [data-testid="${testId}"] should be visible`);
}

async function assertHiddenOrAbsent(page, testId, label) {
  const count = await page.locator(`[data-testid="${testId}"]`).count();
  if (count === 0) return;
  assert(
    !(await isVisible(page, testId)),
    `${label}: [data-testid="${testId}"] should be hidden by default`
  );
}

async function assertNonEmptyText(page, testId, label) {
  const text = await page
    .getByTestId(testId)
    .innerText()
    .catch(() => "");
  assert(text.trim().length > 0, `${label}: [data-testid="${testId}"] should have visible text`);
}

// ---------------------------------------------------------------------------
// Dashboard smoke
// ---------------------------------------------------------------------------

async function runDashboard(page, viewport) {
  const tag = `[${viewport.id}] dashboard`;
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page
    .getByText("Household Cashflow Dashboard", { exact: false })
    .first()
    .waitFor({ timeout: 20000 });
  console.log(`${tag}: loaded`);

  // Priority card order: available-after-savings first, then total-available,
  // both ahead of the secondary current-amount card.
  await assertVisible(page, DASHBOARD_TEST_IDS.availableAfterSavings, tag);
  await assertVisible(page, DASHBOARD_TEST_IDS.totalAvailable, tag);

  const afterSavingsBox = await page
    .getByTestId(DASHBOARD_TEST_IDS.availableAfterSavings)
    .boundingBox();
  const totalBox = await page.getByTestId(DASHBOARD_TEST_IDS.totalAvailable).boundingBox();
  const currentBox = await page
    .getByTestId(DASHBOARD_TEST_IDS.currentAmount)
    .boundingBox()
    .catch(() => null);
  if (afterSavingsBox && totalBox) {
    assert(
      afterSavingsBox.y <= totalBox.y + 1,
      `${tag}: "Available to spend after savings" should appear before "Total amount available"`
    );
  }
  if (afterSavingsBox && currentBox) {
    assert(
      afterSavingsBox.y <= currentBox.y + 1,
      `${tag}: priority cards should appear before secondary cards`
    );
  }
  console.log(`${tag}: priority cards present and ordered`);

  // Collapsed cards show title + amount only — large details hidden by default.
  await assertHiddenOrAbsent(page, DASHBOARD_TEST_IDS.detailsAvailableAfterSavings, tag);
  await assertHiddenOrAbsent(page, DASHBOARD_TEST_IDS.detailsTotalAvailable, tag);
  console.log(`${tag}: inline details collapsed by default`);

  await assertNoHorizontalOverflowDetailed(page, viewport.id, "/", "dashboard collapsed");
  await assertNoUuidLabels(page, `${tag} collapsed`);

  // Available-to-spend drilldown panel.
  await openDrilldownPanel(page, DASHBOARD_TEST_IDS.openAvailableAfterSavings, tag);
  await assertVisible(page, DASHBOARD_TEST_IDS.panel, `${tag} available-after-savings panel`);
  await assertVisible(page, DASHBOARD_TEST_IDS.panelTitle, `${tag} panel title`);
  await assertNonEmptyText(page, DASHBOARD_TEST_IDS.panelTitle, `${tag} panel title`);
  // Amount may be absent when the user has no current-amount snapshot; only
  // assert non-empty text when present.
  if ((await page.locator(`[data-testid="${DASHBOARD_TEST_IDS.panelAmount}"]`).count()) > 0) {
    await assertNonEmptyText(page, DASHBOARD_TEST_IDS.panelAmount, `${tag} panel amount`);
  }
  await assertVisible(page, DASHBOARD_TEST_IDS.panelClose, `${tag} panel close button`);
  // Related details/links section.
  assert(
    (await page.locator(`[data-testid="${DASHBOARD_TEST_IDS.availableAfterSavingsSection}"]`).count()) > 0,
    `${tag}: available-after-savings detail section should be present`
  );
  await assertOpenModalsFitViewport(page, `${tag} available-after-savings panel fits viewport`);
  await assertNoUuidLabels(page, `${tag} available-after-savings panel`);
  await closeDrilldownPanel(page, tag);
  console.log(`${tag}: available-to-spend panel verified`);

  // Total-available panel — cash + savings explanation/detail.
  await openDrilldownPanel(page, DASHBOARD_TEST_IDS.openTotalAvailable, tag);
  await assertVisible(page, DASHBOARD_TEST_IDS.panel, `${tag} total-available panel`);
  assert(
    (await page.locator(`[data-testid="${DASHBOARD_TEST_IDS.totalAvailableSection}"]`).count()) > 0,
    `${tag}: total-available detail section should be present`
  );
  await assertOpenModalsFitViewport(page, `${tag} total-available panel fits viewport`);
  await assertNoUuidLabels(page, `${tag} total-available panel`);
  await closeDrilldownPanel(page, tag);
  console.log(`${tag}: total-available panel verified`);

  // At least one secondary panel (bills / expenses / savings) if present.
  await trySecondaryPanel(page, tag);

  await assertNoHorizontalOverflowDetailed(page, viewport.id, "/", "dashboard after panels");
  await assertNoUuidLabels(page, `${tag} final`);
}

async function openDrilldownPanel(page, openTestId, tag) {
  const button = page.getByTestId(openTestId);
  assert((await button.count()) > 0, `${tag}: open button [data-testid="${openTestId}"] not found`);
  await button.click();
  await waitForOpenSheetSettled(page).catch(async () => {
    await page
      .locator('[data-slot="sheet-content"]')
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
  });
}

async function closeDrilldownPanel(page, tag) {
  const closeBtn = page.getByTestId(DASHBOARD_TEST_IDS.panelClose);
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click();
  } else {
    await closeOpenModal(page);
  }
  await page
    .getByTestId(DASHBOARD_TEST_IDS.panel)
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});
  assert(
    !(await isVisible(page, DASHBOARD_TEST_IDS.panel)),
    `${tag}: drilldown panel should close`
  );
}

async function trySecondaryPanel(page, tag) {
  const labels = ["View bills", "View expenses", "View savings", "View unpaid bills"];
  for (const name of labels) {
    const button = page.getByRole("button", { name }).first();
    if ((await button.count()) === 0) continue;
    await button.click();
    const opened = await waitForOpenSheetSettled(page)
      .then(() => true)
      .catch(() => false);
    if (!opened) continue;
    await assertOpenModalsFitViewport(page, `${tag} secondary panel (${name}) fits viewport`);
    await assertNoUuidLabels(page, `${tag} secondary panel (${name})`);
    await closeOpenModal(page);
    await page
      .locator('[data-slot="sheet-content"]')
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
    console.log(`${tag}: secondary panel "${name}" verified`);
    return;
  }
  console.log(`${tag}: no secondary panel available (no qualifying data)`);
}

// ---------------------------------------------------------------------------
// Reports smoke
// ---------------------------------------------------------------------------

async function assertChartOrEmpty(page, chartTestId, label) {
  const container = page.getByTestId(chartTestId);
  if ((await container.count()) === 0) {
    console.warn(`  [WARN] ${label}: container [data-testid="${chartTestId}"] not found`);
    return;
  }
  const hasSvg = (await container.locator("svg").count()) > 0;
  const hasCanvas = (await container.locator("canvas").count()) > 0;
  const hasEmpty =
    (await page.getByTestId(REPORT_TEST_IDS.emptyState).count()) > 0 &&
    (await page.getByTestId(REPORT_TEST_IDS.emptyState).isVisible().catch(() => false));
  assert(
    hasSvg || hasCanvas || hasEmpty,
    `${label}: expected an SVG/canvas chart or empty-state in [data-testid="${chartTestId}"]`
  );
}

async function runReports(page, viewport) {
  const tag = `[${viewport.id}] reports`;
  await page.goto(`${BASE_URL}/reports/monthly`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Printable Report", exact: false })
    .first()
    .waitFor({ timeout: 20000 });
  // Allow data to settle.
  await page.waitForTimeout(2000);
  console.log(`${tag}: loaded`);

  // Printable report content still renders.
  await assertVisible(page, REPORT_TEST_IDS.printableReport, `${tag} printable report`);

  // Charts section + tabs visible.
  await assertVisible(page, REPORT_TEST_IDS.chartsSection, `${tag} charts section`);
  await assertVisible(page, REPORT_TEST_IDS.chartTabs, `${tag} chart tabs`);
  console.log(`${tag}: charts section and tabs visible`);

  // Cycle through every tab; each shows a chart or the empty state.
  for (const tab of REPORT_TABS) {
    if (tab.value !== "category") {
      const trigger = page.locator(`[role="tab"]`, { hasText: tab.label }).first();
      if ((await trigger.count()) === 0) {
        console.warn(`  [WARN] ${tag}: tab "${tab.label}" not found — skipping`);
        continue;
      }
      await trigger.click();
      await page.waitForTimeout(400);
    }
    await assertChartOrEmpty(page, tab.chart, `${tag} "${tab.label}"`);
    await assertNoHorizontalOverflowDetailed(
      page,
      viewport.id,
      "/reports/monthly",
      `reports "${tab.label}" tab`
    );
    console.log(`${tag}: tab "${tab.label}" OK`);
  }

  // Tab row must scroll inside its own container, not overflow the page.
  await assertTabRowScrollsInternally(page, tag);

  // Chart cards fit the page.
  await assertChartCardsWithinViewport(page, viewport, tag);

  await assertNoUuidLabels(page, `${tag} after cycling tabs`);
  console.log(`${tag}: no raw UUIDs after cycling tabs`);

  // Print behavior: chart section hidden under print, printable report retained.
  await assertPrintBehavior(page, tag);
}

async function assertTabRowScrollsInternally(page, tag) {
  const result = await page.evaluate(
    ({ tabsTestId, tol }) => {
      const tabs = document.querySelector(`[data-testid="${tabsTestId}"]`);
      if (!tabs) return { ok: true };
      // The tab list is wrapped in an overflow-x-auto container; verify the
      // wrapper does not push the page wider than the viewport.
      const list = tabs.querySelector('[role="tablist"]');
      const scroller = list?.parentElement ?? tabs;
      const clientWidth = document.documentElement.clientWidth;
      const rect = scroller.getBoundingClientRect();
      const style = window.getComputedStyle(scroller);
      const overflowsPage = rect.right > clientWidth + tol || rect.left < -tol;
      return {
        ok: !overflowsPage,
        overflowX: style.overflowX,
        right: Math.round(rect.right),
        clientWidth,
      };
    },
    { tabsTestId: REPORT_TEST_IDS.chartTabs, tol: OVERFLOW_TOLERANCE_PX }
  );
  assert(
    result.ok,
    `${tag}: tab row should stay within the page (right=${result.right} clientWidth=${result.clientWidth} overflowX=${result.overflowX})`
  );
}

async function assertChartCardsWithinViewport(page, viewport, tag) {
  const section = page.getByTestId(REPORT_TEST_IDS.chartsSection);
  const box = await section.boundingBox().catch(() => null);
  if (box) {
    assert(
      box.width <= viewport.width + OVERFLOW_TOLERANCE_PX,
      `${tag}: charts section width ${Math.round(box.width)}px should not exceed viewport ${viewport.width}px`
    );
  }
}

async function assertPrintBehavior(page, tag) {
  // The chart section carries the global `no-print` class; verify the global
  // print stylesheet is present, then confirm media emulation hides charts but
  // keeps the printable report.
  const printCssPresent = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSMediaRule && rule.conditionText?.includes("print")) {
            return true;
          }
        }
      } catch {
        // Cross-origin stylesheets are not inspectable; ignore.
      }
    }
    return document.querySelector(".no-print") !== null;
  });
  assert(printCssPresent, `${tag}: print CSS or .no-print marker should be present`);

  await page.emulateMedia({ media: "print" });
  const chartsHidden = await page
    .getByTestId(REPORT_TEST_IDS.chartsSection)
    .evaluate((node) => window.getComputedStyle(node).display === "none");
  const reportStillVisible = await page
    .getByTestId(REPORT_TEST_IDS.printableReport)
    .evaluate((node) => window.getComputedStyle(node).display !== "none");
  await page.emulateMedia({ media: "screen" });

  assert(chartsHidden, `${tag}: expense charts section should be hidden under print media (no-print)`);
  assert(reportStillVisible, `${tag}: printable monthly report should remain visible under print media`);
  console.log(`${tag}: print behavior OK (charts hidden, report retained)`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runForViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  console.log(`\n=== [${viewport.id}] starting dashboard + reports smoke ===`);
  try {
    await login(page);
    console.log(`[${viewport.id}] login OK`);

    await runDashboard(page, viewport);
    await runReports(page, viewport);

    if (consoleErrors.length > 0) {
      console.error(`[${viewport.id}] console errors:`, consoleErrors.slice(0, 5));
    }
    assert(
      consoleErrors.length === 0,
      `[${viewport.id}] ${consoleErrors.length} console/page error(s): ${consoleErrors[0] ?? ""}`
    );
    console.log(`[${viewport.id}] ALL CHECKS PASSED`);
  } catch (err) {
    await saveFailureScreenshot(page, viewport.id, "dashboard-reports-mobile");
    throw err;
  } finally {
    await context.close();
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "Missing credentials. Set TEST_EMAIL/TEST_PASSWORD or CASHFLOW_OWNER_EMAIL/CASHFLOW_OWNER_PASSWORD."
    );
    process.exit(2);
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
  console.log("\nAll dashboard + reports mobile smoke tests passed.");
}

main().catch((err) => {
  console.error("Smoke aggregator runner error:", err);
  process.exit(1);
});
