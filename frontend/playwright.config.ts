import { defineConfig, devices } from '@playwright/test';

// Backend API URL - change this to match your running backend
const API_BASE_URL = process.env.API_BASE_URL || 'http://192.168.1.200:4000';

// Expo web server URL
const WEB_URL = process.env.WEB_URL || 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use the web preview URL
        baseURL: WEB_URL,
      },
    },
  ],

  webServer: {
    // Start Expo dev server before tests
    command: 'expo start --web --no-dev',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  globalSetup: require.resolve('./e2e/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),
});
