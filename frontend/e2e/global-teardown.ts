/**
 * Global teardown for Playwright E2E tests
 * 
 * This runs once after all tests complete. It can be used to:
 * - Clean up test data
 * - Reset any mock state
 * - Close connections
 */
export default async () => {
  console.log('[Global Teardown] E2E tests complete');
  // Add any cleanup logic here if needed
};
