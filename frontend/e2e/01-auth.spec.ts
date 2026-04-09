import { test, expect } from '@playwright/test';
import {
  generateTestEmail,
  generateTestUsername,
  registerUser,
  loginUser,
  logoutUser,
  isLoggedIn,
} from './helpers/auth';

const API_BASE_URL = process.env.API_BASE_URL || 'http://192.168.1.200:3000';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies/localStorage before each test
    await page.context().clearCookies();
    await page.goto('/');
  });

  test('registration: user can navigate to registration page', async ({ page }) => {
    // Navigate to home
    await page.goto('/');
    
    // Click on sign up / register link
    await page.click('text=Sign Up');
    
    // Should land on registration page
    await expect(page).toHaveURL(/\/register/);
    
    // Should see registration form fields
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('registration: user can register with valid credentials', async ({ page }) => {
    const email = generateTestEmail();
    const username = generateTestUsername();
    const password = 'TestPassword123!';

    // Navigate to registration
    await page.goto('/register');

    // Fill out the form
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to home/dashboard after successful registration
    await page.waitForURL(/\/(home|dashboard)/, { timeout: 10000 });

    // User should be logged in (logout button should be visible)
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
  });

  test('registration: shows error for invalid email format', async ({ page }) => {
    await page.goto('/register');

    // Fill with invalid email
    await page.fill('input[name="email"]', 'notanemail');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.fill('input[name="confirmPassword"]', 'TestPassword123!');

    await page.click('button[type="submit"]');

    // Should show validation error
    await expect(page.locator('text=Invalid email')).toBeVisible();
  });

  test('registration: shows error when passwords do not match', async ({ page }) => {
    await page.goto('/register');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'DifferentPassword123!');

    await page.click('button[type="submit"]');

    // Should show password mismatch error
    await expect(page.locator('text=Passwords do not match')).toBeVisible();
  });

  test('login: user can navigate to login page', async ({ page }) => {
    await page.goto('/');

    // Click on login link
    await page.click('text=Log In');

    // Should land on login page
    await expect(page).toHaveURL(/\/login/);

    // Should see login form
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('login: user can login with valid credentials', async ({ page }) => {
    // First register a user
    const email = generateTestEmail();
    const username = generateTestUsername();
    const password = 'TestPassword123!';

    await registerUser(page, email, username, password);

    // Logout
    await logoutUser(page);

    // Should be on login page
    await expect(page).toHaveURL(/\/login/);

    // Login with the same credentials
    await loginUser(page, email, password);

    // Should be redirected to home/dashboard
    await page.waitForURL(/\/(home|dashboard)/, { timeout: 10000 });

    // Should be logged in
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
  });

  test('login: shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Login with non-existent user
    await page.fill('input[name="email"]', 'nonexistent@example.com');
    await page.fill('input[name="password"]', 'WrongPassword123!');

    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('login: shows error for wrong password', async ({ page }) => {
    // First register a user
    const email = generateTestEmail();
    const username = generateTestUsername();
    const password = 'TestPassword123!';

    await registerUser(page, email, username, password);
    await logoutUser(page);

    // Try to login with wrong password
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'WrongPassword123!');

    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('auth: logged in user can logout', async ({ page }) => {
    // Register and login
    const email = generateTestEmail();
    const username = generateTestUsername();
    const password = 'TestPassword123!';

    await registerUser(page, email, username, password);

    // Verify user is logged in
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();

    // Click logout
    await logoutUser(page);

    // Should be redirected to login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('auth: unauthenticated user cannot access protected routes', async ({ page }) => {
    // Try to access protected route without being logged in
    await page.goto('/home');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
