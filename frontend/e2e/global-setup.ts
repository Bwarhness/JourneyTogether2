import { chromium } from '@playwright/test';

/**
 * Global setup for Playwright E2E tests
 * 
 * This runs once before all tests. It can be used to:
 * - Set up test fixtures
 * - Verify backend is reachable
 * - Set up any mocking infrastructure
 */
export default async () => {
  const apiBaseUrl = process.env.API_BASE_URL || 'http://192.168.1.200:4000';
  
  // Verify backend is reachable
  console.log(`[Global Setup] Checking backend at ${apiBaseUrl}...`);
  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      console.log('[Global Setup] Backend is reachable');
    } else {
      console.warn(`[Global Setup] Backend responded with status ${response.status} - tests may fail`);
    }
  } catch (error) {
    console.warn(`[Global Setup] Could not reach backend at ${apiBaseUrl} - tests that depend on it will fail`);
  }

  // Clean up any stale test users
  console.log('[Global Setup] Cleaning up stale test data...');
  // This would be where you'd clean up test data if needed
};
