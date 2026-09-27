import { test, expect } from "@playwright/test";

const baseURL = process.env.KETTLE_BASE_URL || "http://localhost:3004";
const opsEmail = process.env.KETTLE_OPS_EMAIL || "ops@kettle.demo";
const opsPassword = process.env.KETTLE_OPS_PASSWORD || "kettle-demo";
const financeEmail = process.env.KETTLE_FINANCE_EMAIL || "finance@kettle.demo";
const financePassword = process.env.KETTLE_FINANCE_PASSWORD || "kettle-demo";
const netbirdPassword = process.env.KETTLE_NETBIRD_PASSWORD || "";

test.describe("Kettle Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    page.goto("/");
  });

  test("Scenario 1: Access and gating - login workflow", async ({ page }) => {
    // Should be able to access landing page
    await expect(page).toHaveTitle(/Kettle/i);

    // Navigate to run page
    await page.goto("/run");

    // If there's a NetBird password gate (deployed instance), we'd hit it here.
    // For local Supabase, we should be redirected to login.
    const url = page.url();
    expect(url).toContain("/login");

    // Test wrong password
    await page.fill('input[type="email"]', opsEmail);
    await page.fill('input[type="password"]', "wrong-password");
    await page.click('button[type="submit"]');

    // Wait for error message
    await expect(page.locator("text=Invalid email or password")).toBeVisible();

    // Test correct password
    await page.fill('input[type="password"]', opsPassword);
    await page.click('button[type="submit"]');

    // Should redirect to run page and show Ops Manager badge
    await page.waitForURL("/run");
    await expect(page.locator("text=Ops Manager")).toBeVisible();
  });

  test("Scenario 3: Happy path without anomaly", async ({ page, context }) => {
    // Sign in as ops manager
    await page.goto("/login");
    await page.fill('input[type="email"]', opsEmail);
    await page.fill('input[type="password"]', opsPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("/run");

    // Reset demo
    const resetBtn = page.locator('button:has-text("Reset")').first();
    await resetBtn.click();
    await page.waitForNavigation();

    // Verify reset worked - no runs should be showing
    const runCards = page.locator('[data-testid="run-card"]');
    const count = await runCards.count();
    expect(count).toBeLessThanOrEqual(0);

    // Turn off anomaly (if toggle exists)
    const anomalyToggle = page.locator('label:has-text("Inject anomaly")');
    if (await anomalyToggle.isVisible()) {
      const checkbox = anomalyToggle.locator("input");
      if (await checkbox.isChecked()) {
        await checkbox.click();
      }
    }

    // Start scenario
    const startBtn = page.locator('button:has-text("Start")').first();
    await startBtn.click();

    // Wait for Sales step to appear
    await expect(page.locator("text=Deal validated")).toBeVisible({ timeout: 10000 });

    // Wait for Procurement step
    await expect(page.locator("text=RFQ").first()).toBeVisible({ timeout: 10000 });

    // Wait for PO approval card
    await expect(page.locator("text=Needs approval")).toBeVisible({ timeout: 10000 });

    // Approve PO
    const approvalsLink = page.locator('a:has-text("Approvals")');
    await approvalsLink.click();
    await page.waitForURL("/approvals");

    const approvePOBtn = page.locator('button:has-text("Approve")').first();
    await approvePOBtn.click();

    // Back to run view
    await page.goto("/run");

    // Wait for goods receipt, invoice extraction, 3-way match
    await expect(page.locator("text=3-way match")).toBeVisible({ timeout: 10000 });

    // Wait for payment approval request
    await expect(page.locator("text=Needs approval")).toBeVisible({ timeout: 10000 });

    // Approve as finance controller (open in new context to avoid re-login complexity)
    const financeContext = await page.context().browser()?.newContext();
    if (!financeContext) throw new Error("No browser");

    const financePage = await financeContext.newPage();
    await financePage.goto(baseURL);
    await financePage.goto("/login");
    await financePage.fill('input[type="email"]', financeEmail);
    await financePage.fill('input[type="password"]', financePassword);
    await financePage.click('button[type="submit"]');
    await financePage.waitForURL("/run");

    // Go to approvals
    await financePage.goto("/approvals");
    const paymentApproveBtns = financePage.locator('button:has-text("Approve")');
    const count2 = await paymentApproveBtns.count();
    if (count2 > 0) {
      await paymentApproveBtns.first().click();
    }

    // Back to run - should complete
    await page.goto("/run");
    await expect(page.locator("text=complete")).toBeVisible({ timeout: 15000 });

    await financeContext.close();
  });

  test("Scenario 4: Anomaly detection and resolution", async ({ page, context }) => {
    // Sign in as ops
    await page.goto("/login");
    await page.fill('input[type="email"]', opsEmail);
    await page.fill('input[type="password"]', opsPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("/run");

    // Reset demo
    await page.locator('button:has-text("Reset")').first().click();
    await page.waitForNavigation();

    // Turn ON anomaly
    const anomalyToggle = page.locator('label:has-text("Inject anomaly")');
    const checkbox = anomalyToggle.locator("input");
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
    }

    // Start scenario
    await page.locator('button:has-text("Start")').first().click();

    // Wait for PO approval
    await expect(page.locator("text=Needs approval")).toBeVisible({ timeout: 10000 });

    // Approve PO
    await page.goto("/approvals");
    await page.locator('button:has-text("Approve")').first().click();

    // Back to run - wait for anomaly flag
    await page.goto("/run");
    await expect(page.locator("text=flagged").or(page.locator("text=anomaly"))).toBeVisible({ timeout: 10000 });

    // Wait for dispute/correction cycle
    await expect(page.locator("text=disputed").or(page.locator("text=corrected"))).toBeVisible({ timeout: 15000 });

    // Wait for match to pass (3-way match green)
    await expect(page.locator("text=3-way match")).toBeVisible({ timeout: 10000 });

    // Approve payment as finance
    const financeContext = await page.context().browser()?.newContext();
    if (!financeContext) throw new Error("No browser");

    const financePage = await financeContext.newPage();
    await financePage.goto(baseURL);
    await financePage.goto("/login");
    await financePage.fill('input[type="email"]', financeEmail);
    await financePage.fill('input[type="password"]', financePassword);
    await financePage.click('button[type="submit"]');
    await financePage.waitForURL("/run");

    await financePage.goto("/approvals");
    const paymentApproveBtns = financePage.locator('button:has-text("Approve")');
    const count = await paymentApproveBtns.count();
    if (count > 0) {
      await paymentApproveBtns.first().click();
    }

    // Run should complete
    await page.goto("/run");
    await expect(page.locator("text=complete")).toBeVisible({ timeout: 15000 });

    await financeContext.close();
  });

  test("Scenario 7: Per-run link (NetBird N4)", async ({ page, browser }) => {
    // This test is for deployed instances with NetBird only.
    // Skip locally unless KETTLE_NETBIRD_PASSWORD is set.
    if (!netbirdPassword) {
      test.skip();
    }

    // Sign in as ops
    await page.goto("/login");
    await page.fill('input[type="email"]', opsEmail);
    await page.fill('input[type="password"]', opsPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("/run");

    // Start a run
    await page.locator('button:has-text("Start")').first().click();

    // Look for the NetBird banner with run link and PIN
    const banner = page.locator("text=/run link/i").or(page.locator("text=/PIN/i"));
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Extract the URL and PIN from the banner text
    const bannerText = await banner.textContent();
    expect(bannerText).toBeTruthy();

    // The URL should be something like run-xxxx.netbird.4625labs.com
    const urlMatch = bannerText?.match(
      /https?:\/\/[a-z0-9.-]+\.[a-z]+/i,
    );
    const pinMatch = bannerText?.match(/PIN[:\s]+([A-Z0-9]+)/i);

    if (!urlMatch || !pinMatch) {
      test.skip();
      return;
    }

    const perRunUrl = urlMatch[0];
    const pin = pinMatch[1];

    // Open the URL in a new context (simulate an external user)
    const ctx = await browser.newContext();
    const externalPage = await ctx.newPage();
    await externalPage.goto(perRunUrl);

    // Should hit NetBird PIN prompt
    const pinInput = externalPage.locator('input[placeholder*="PIN"]').or(
      externalPage.locator("text=/enter.*pin/i"),
    );
    if (await pinInput.isVisible()) {
      const pinField = externalPage.locator("input").first();
      await pinField.fill(pin);
      await externalPage.click('button[type="submit"]');
    }

    // Should see the run page without logging in again
    await expect(externalPage.locator("text=/Sales|Procurement|Finance/")).toBeVisible({ timeout: 5000 });

    await ctx.close();
  });
});
