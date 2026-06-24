/**
 * CASHFLOW-DEPLOY-002 — Google Sign-In button browser smoke.
 *
 * Verifies /login renders the Continue with Google button for unauthenticated users.
 * Does not complete real Google OAuth.
 *
 * Optional: CASHFLOW_E2E_BASE_URL (default http://127.0.0.1:5227)
 */
import { chromium } from "playwright";

const BASE_URL = process.env.CASHFLOW_E2E_BASE_URL ?? "http://127.0.0.1:5227";
const IS_PRODUCTION = BASE_URL.includes("workers.dev");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function main() {
  console.log(`Smoke target: ${BASE_URL}/login (${IS_PRODUCTION ? "production" : "local"})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });

    const googleButton = page.getByTestId("google-sign-in-button");
    await googleButton.waitFor({ state: "visible", timeout: 30000 });

    const buttonText = (await googleButton.textContent()) ?? "";
    assert(
      /google/i.test(buttonText),
      `Google button text should mention Google. Got: "${buttonText.trim()}"`
    );

    assert(await googleButton.isEnabled(), "Google sign-in button should be enabled");

    await page.locator("#email").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("#password").waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("button", { name: "Sign In", exact: true }).waitFor({
      state: "visible",
      timeout: 10000,
    });

    if (!IS_PRODUCTION) {
      const navigationPromise = page
        .waitForURL(
          (url) =>
            url.hostname.includes("supabase.co") ||
            url.hostname.includes("google.com") ||
            url.hostname.includes("accounts.google"),
          { timeout: 10000 }
        )
        .then(() => "navigated")
        .catch(() => "no-navigation");

      await googleButton.click();
      const navigationResult = await navigationPromise;

      assert(
        navigationResult === "navigated",
        "Clicking Google sign-in should start OAuth navigation to Supabase or Google"
      );
    }

    const filteredErrors = consoleErrors.filter(
      (message) =>
        !message.includes("Failed to load resource") &&
        !message.includes("favicon.ico")
    );
    assert(
      filteredErrors.length === 0,
      `Unexpected console errors on /login: ${filteredErrors.join("; ")}`
    );

    console.log(`PASS — Google sign-in button visible at ${BASE_URL}/login`);
    if (IS_PRODUCTION) {
      console.log("Production mode: visibility-only check (OAuth click skipped).");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`FAIL — ${error.message}`);
  process.exit(1);
});
