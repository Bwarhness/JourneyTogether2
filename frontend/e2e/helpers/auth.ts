import { Page } from '@playwright/test';

/**
 * Generate a unique test email for registration
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  return `test+${timestamp}@journeytogether.dev`;
}

/**
 * Generate a unique test username
 */
export function generateTestUsername(): string {
  const timestamp = Date.now();
  return `testuser${timestamp}`;
}

/**
 * Register a new user via the UI
 * Note: This function will need to be updated as the UI is built
 */
export async function registerUser(
  page: Page,
  email: string,
  username: string,
  password: string
): Promise<void> {
  // Navigate to registration page
  await page.goto('/register');
  
  // Fill in the registration form
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  
  // Submit the form
  await page.click('button[type="submit"]');
  
  // Wait for navigation or success state
  await page.waitForURL(/\/(home|dashboard)?/);
}

/**
 * Login with existing user via the UI
 * Note: This function will need to be updated as the UI is built
 */
export async function loginUser(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  // Navigate to login page
  await page.goto('/login');
  
  // Fill in the login form
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  
  // Submit the form
  await page.click('button[type="submit"]');
  
  // Wait for navigation or success state
  await page.waitForURL(/\/(home|dashboard)?/);
}

/**
 * Logout the current user
 * Note: This function will need to be updated as the UI is built
 */
export async function logoutUser(page: Page): Promise<void> {
  // Find and click the logout button/menu
  await page.click('[data-testid="logout-button"]');
  await page.waitForURL('/login');
}

/**
 * Check if user is logged in (by looking for logout button or auth-dependent content)
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  // If we can find a logout button, user is logged in
  const logoutButton = page.locator('[data-testid="logout-button"]');
  return await logoutButton.count() > 0;
}
