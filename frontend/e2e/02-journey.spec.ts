import { test, expect } from '@playwright/test';
import {
  generateTestEmail,
  generateTestUsername,
  registerUser,
  logoutUser,
} from './helpers/auth';

test.describe('Journey Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies and login before each journey test
    await page.context().clearCookies();
    
    // Register and login
    const email = generateTestEmail();
    const username = generateTestUsername();
    const password = 'TestPassword123!';
    
    await registerUser(page, email, username, password);
  });

  test.afterEach(async ({ page }) => {
    // Logout after each test
    await logoutUser(page);
  });

  test('user can navigate to create journey page', async ({ page }) => {
    // Navigate to home/dashboard
    await page.goto('/home');

    // Click on create journey button
    await page.click('text=Create Journey');

    // Should navigate to create journey page
    await expect(page).toHaveURL(/\/journey\/create/);
  });

  test('user can create a journey with a single stop', async ({ page }) => {
    const journeyName = `My Test Journey ${Date.now()}`;
    const stopName = 'First Stop';

    // Navigate to create journey
    await page.goto('/journey/create');

    // Fill in journey name
    await page.fill('input[name="journeyName"]', journeyName);

    // Add a stop
    await page.click('text=Add Stop');
    await page.fill('input[name="stopName"]', stopName);
    
    // Fill in stop details (use a known location)
    await page.fill('input[name="stopLocation"]', 'Copenhagen, Denmark');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should navigate to the new journey's detail page
    await expect(page).toHaveURL(/\/journey\/\d+/, { timeout: 10000 });

    // Should see the journey name
    await expect(page.locator(`text=${journeyName}`)).toBeVisible();

    // Should see the stop
    await expect(page.locator(`text=${stopName}`)).toBeVisible();
  });

  test('user can view their journey list', async ({ page }) => {
    // Navigate to home/dashboard
    await page.goto('/home');

    // Should see the journeys section
    await expect(page.locator('text=My Journeys')).toBeVisible();

    // Should see "No journeys yet" or list of journeys
    const journeysSection = page.locator('[data-testid="journeys-list"]');
    await expect(journeysSection).toBeVisible();
  });

  test('user can view journey details', async ({ page }) => {
    // Create a journey first
    const journeyName = `Detail Test Journey ${Date.now()}`;
    
    await page.goto('/journey/create');
    await page.fill('input[name="journeyName"]', journeyName);
    await page.click('text=Add Stop');
    await page.fill('input[name="stopName"]', 'Test Stop');
    await page.fill('input[name="stopLocation"]', 'Berlin, Germany');
    await page.click('button[type="submit"]');

    // Wait for journey detail page
    await page.waitForURL(/\/journey\/\d+/);

    // Should see journey name
    await expect(page.locator(`text=${journeyName}`)).toBeVisible();

    // Should see start journey button
    await expect(page.locator('text=Start Journey')).toBeVisible();
  });

  test('user can delete a journey', async ({ page }) => {
    // Create a journey first
    const journeyName = `Delete Test Journey ${Date.now()}`;
    
    await page.goto('/journey/create');
    await page.fill('input[name="journeyName"]', journeyName);
    await page.click('text=Add Stop');
    await page.fill('input[name="stopName"]', 'To Delete');
    await page.fill('input[name="stopLocation"]', 'Munich, Germany');
    await page.click('button[type="submit"]');

    // Wait for journey detail page
    await page.waitForURL(/\/journey\/\d+/);

    // Click delete button
    await page.click('text=Delete Journey');

    // Confirm deletion in dialog
    await page.click('text=Confirm');

    // Should navigate back to journeys list
    await expect(page).toHaveURL(/\/home/);

    // Journey should no longer be in the list
    await expect(page.locator(`text=${journeyName}`)).not.toBeVisible();
  });
});
