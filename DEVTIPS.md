# JourneyTogether 2.0 - Development Tips

## Overview

This project uses **Test-Driven Development (TDD)** for the frontend. The workflow is:

1. **Red Phase**: Write a failing test
2. **Green Phase**: Write the minimum code to make the test pass
3. **Refactor**: Improve code while keeping tests green
4. **Verify**: Open in browser and manually verify
5. **Repeat**: Move to next test

## Prerequisites

```bash
# Install Node.js dependencies
cd frontend
npm install

# Install Playwright browsers (one-time)
npx playwright install chromium
```

## Quick Start

### Option 1: Development with Web Preview

```bash
# Terminal 1: Start the backend (if not already running)
# The v1 backend should be running at http://192.168.1.200:3000

# Terminal 2: Start Expo web dev server
cd frontend
npm run dev:web
# Opens at http://localhost:8081

# Open browser manually and start TDD cycle
```

### Option 2: Run E2E Tests (Automated)

```bash
cd frontend

# Run all E2E tests
npm run test:e2e

# Run with UI mode (watch mode + visual browser)
npm run test:e2e:ui

# Run headed (see the actual browser)
npm run test:e2e:headed
```

## The TDD Cycle

### Step 1: Write a Failing Test

Create or update a test file in `frontend/e2e/`. The test should:
- Describe the expected behavior
- Use realistic selectors (when UI is built, update selectors)
- Initially FAIL because the feature doesn't exist

```typescript
test('login: user can login with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // Should redirect to dashboard
  await expect(page).toHaveURL(/\/home/);
});
```

### Step 2: Run the Test (Watch it Fail)

```bash
npm run test:e2e
```

Expected output: **Test fails** with selector not found errors (Red phase ✓)

### Step 3: Write the Code

Implement the minimum code needed to make the test pass. Don't over-engineer yet.

### Step 4: Run the Test Again

```bash
npm run test:e2e
```

Expected output: **Test passes** (Green phase ✓)

### Step 5: Verify in Browser

```bash
npm run dev:web
# Open http://localhost:8081
```

Manually test the feature to ensure it works as expected.

### Step 6: Next Test

Repeat the cycle for the next piece of functionality.

## Running Only Specific Tests

```bash
# Run only auth tests
npx playwright test e2e/01-auth.spec.ts

# Run only journey tests
npx playwright test e2e/02-journey.spec.ts

# Run only session tests
npx playwright test e2e/03-session.spec.ts

# Run tests matching a pattern
npx playwright test -g "login"
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_BASE_URL` | `http://192.168.1.200:3000` | Backend API URL |
| `WEB_URL` | `http://localhost:8081` | Expo web preview URL |

Override with:
```bash
API_BASE_URL=http://localhost:3000 npm run test:e2e
```

## Test Structure

```
frontend/
├── e2e/
│   ├── 01-auth.spec.ts      # Registration, login, logout
│   ├── 02-journey.spec.ts   # Journey creation, listing, details
│   ├── 03-session.spec.ts  # Solo session, check-ins
│   ├── helpers/
│   │   └── auth.ts          # Auth helper functions
│   ├── global-setup.ts      # Runs before all tests
│   └── global-teardown.ts   # Runs after all tests
├── playwright.config.ts     # Playwright configuration
└── ...
```

## Current Test Status

### Phase: RED (No implementation yet)

All tests are expected to **FAIL** because:
- No frontend code has been written yet
- Routes don't exist (`/login`, `/register`, `/home`, `/journey/create`)
- No API integration

Once you implement a feature, run its corresponding tests to verify.

## Adding New Tests

1. Create a new spec file or add to existing:
   ```bash
   frontend/e2e/04-your-feature.spec.ts
   ```

2. Follow the naming convention:
   - `01-auth.spec.ts` - Authentication
   - `02-journey.spec.ts` - Journey management
   - `03-session.spec.ts` - Active sessions
   - `04-*.spec.ts` - Partner features, settings, etc.

3. Use helper functions from `e2e/helpers/` when possible

4. Add meaningful `test.beforeEach()` setup

## Troubleshooting

### Tests hang or timeout

- Check if the backend is running at `http://192.168.1.200:3000`
- Check if Expo web server is running at `http://localhost:8081`
- Increase timeout in `playwright.config.ts`

### Selectors not found

- Update selectors to match the actual UI implementation
- Use `data-testid` attributes in components for stable selectors

### Can't connect to backend

```bash
# Check if backend is reachable
curl http://192.168.1.200:3000/health

# Or use a local backend
export API_BASE_URL=http://localhost:3000
npm run test:e2e
```

## API Endpoints (Expected from Backend)

The E2E tests expect these backend endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/journeys` | List user's journeys |
| POST | `/api/journeys` | Create new journey |
| GET | `/api/journeys/:id` | Get journey details |
| PUT | `/api/journeys/:id` | Update journey |
| DELETE | `/api/journeys/:id` | Delete journey |
| POST | `/api/sessions/start` | Start solo session |
| POST | `/api/sessions/checkin` | Check in at stop |
| POST | `/api/sessions/end` | End session |

## Useful Commands

```bash
# Start Expo in web mode
npm run dev:web

# Run Playwright tests
npm run test:e2e

# Run with headed browser (see it)
npm run test:e2e:headed

# Run in UI mode (visual test runner)
npm run test:e2e:ui

# Run specific test file
npx playwright test e2e/01-auth.spec.ts

# Run tests matching text
npx playwright test -g "login"

# Update snapshots (if using snapshot testing)
npx playwright test --update-snapshots

# Show test report
npx playwright show-report
```

## Tips

1. **Start small**: Begin with auth tests before moving to complex flows
2. **One assertion at a time**: Don't try to test everything in one test
3. **Use meaningful test names**: `test('login: shows error for invalid password')`
4. **Clean up after tests**: Logout in `afterEach` to ensure clean state
5. **Use unique data**: Use timestamps in test data to avoid conflicts
6. **Check browser manually**: Automated tests passing ≠ perfect UX

---

*This is a living document. Update as the project evolves.*
