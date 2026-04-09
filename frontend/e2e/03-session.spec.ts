import { test, expect } from '@playwright/test';
import {
  generateTestEmail,
  generateTestUsername,
  registerUser,
  logoutUser,
} from './helpers/auth';

test.describe('Solo Journey Session', () => {
  let journeyId: string;

  test.beforeEach(async ({ page }) => {
    // Clear cookies and login
    await page.context().clearCookies();
    
    const email = generateTestEmail();
    const username = generateTestUsername();
    const password = 'TestPassword123!';
    
    await registerUser(page, email, username, password);

    // Create a journey with at least one stop
    const journeyName = `Session Test Journey ${Date.now()}`;
    
    await page.goto('/journey/create');
    await page.fill('input[name="journeyName"]', journeyName);
    await page.click('text=Add Stop');
    await page.fill('input[name="stopName"]', 'First Stop');
    await page.fill('input[name="stopLocation"]', 'Hamburg, Germany');
    await page.click('button[type="submit"]');

    // Wait for journey detail page and extract journey ID
    await page.waitForURL(/\/journey\/(\d+)/);
    const url = page.url();
    const match = url.match(/\/journey\/(\d+)/);
    if (match) {
      journeyId = match[1];
    }
  });

  test.afterEach(async ({ page }) => {
    // Logout after each test
    await logoutUser(page);
  });

  test('user can start a solo journey session', async ({ page }) => {
    // Navigate to the journey detail page
    await page.goto(`/journey/${journeyId}`);

    // Should see the journey details
    await expect(page.locator(`text=First Stop`)).toBeVisible();

    // Click start journey button
    await page.click('text=Start Journey');

    // Should see active session state
    await expect(page.locator('text=Active Journey')).toBeVisible();
    await expect(page.locator('text=First Stop')).toBeVisible();
  });

  test('user can check in at a stop during solo session', async ({ page }) => {
    // Start the journey
    await page.goto(`/journey/${journeyId}`);
    await page.click('text=Start Journey');

    // Should be in active session
    await expect(page.locator('text=Active Journey')).toBeVisible();

    // Check in button should be visible for the current stop
    const checkInButton = page.locator('text=Check In').first();
    await expect(checkInButton).toBeVisible();

    // Click check in
    await checkInButton.click();

    // Should show checked in state
    await expect(page.locator('text=Checked In')).toBeVisible();

    // Should show next stop or completion state
    const currentPage = page.url();
    // Either shows next stop or journey completed
    const hasNextStop = await page.locator('text=Next Stop').count() > 0;
    const isComplete = await page.locator('text=Journey Complete').count() > 0;
    expect(hasNextStop || isComplete).toBeTruthy();
  });

  test('user can view active session status', async ({ page }) => {
    // Start the journey
    await page.goto(`/journey/${journeyId}`);
    await page.click('text=Start Journey');

    // Should see active session indicator
    await expect(page.locator('text=Active Journey')).toBeVisible();

    // Should see current stop with location
    await expect(page.locator('text=First Stop')).toBeVisible();

    // Should see progress indicator (e.g., "1/1 stops")
    await expect(page.locator('text=1\\/1')).toBeVisible();
  });

  test('user can end a solo journey session early', async ({ page }) => {
    // Start the journey
    await page.goto(`/journey/${journeyId}`);
    await page.click('text=Start Journey');

    // Should be in active session
    await expect(page.locator('text=Active Journey')).toBeVisible();

    // Click end session button
    await page.click('text=End Journey');

    // Confirm in dialog if present
    const confirmButton = page.locator('text=Confirm');
    if (await confirmButton.count() > 0) {
      await confirmButton.click();
    }

    // Should return to journey detail (not active session)
    await page.waitForURL(`/journey/${journeyId}`);
    await expect(page.locator('text=Start Journey')).toBeVisible();
  });

  test('user can complete a solo journey and see celebration', async ({ page }) => {
    // Start the journey
    await page.goto(`/journey/${journeyId}`);
    await page.click('text=Start Journey');

    // Check in at the stop
    await page.click('text=Check In');

    // Wait for journey completion (may show celebration)
    await page.waitForSelector('text=Journey Complete', { timeout: 10000 });

    // Should see completion message
    await expect(page.locator('text=Journey Complete')).toBeVisible();

    // Should see option to view summary or return home
    const viewSummary = page.locator('text=View Summary');
    const returnHome = page.locator('text=Return Home');
    expect(await viewSummary.count() > 0 || await returnHome.count() > 0).toBeTruthy();
  });
});
