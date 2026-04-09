# Dev Tips — JourneyTogether 2.0

## TDD + Playwright E2E Workflow

**Every feature must follow this cycle — no exceptions.**

```
1. Write a Playwright E2E test first
   → Test FAILS (red). This is the starting state.

2. Implement the feature
   → Write only the code needed to make the test pass.

3. Run: npm run test:e2e
   → Test PASSES (green).

4. Open http://localhost:8081 in browser
   → Manual QA verification.

5. Repeat for next feature.
```

## Golden Rules

- **No code without a failing test first.**
- **All tests must be green before committing** to a feature branch.
- **Never disable or skip tests** to make a build pass.
- **One feature per branch.** Small PRs, fast reviews.

## Running the Dev Environment

```bash
cd frontend

# Terminal 1 — Expo web preview
npm run dev:web
# Opens at http://localhost:8081

# Terminal 2 — Playwright E2E tests
npm run test:e2e         # headless
npm run test:e2e:headed  # visible browser
```

## Writing a New Test

1. Add a new `.spec.ts` file in `frontend/e2e/`
2. Follow the naming convention: `{section}-{flow}.spec.ts`
3. Use the auth helper in `e2e/helpers/auth.ts` for auth flows
4. Import page objects from `@e2e/pages/` if they exist

## Test Structure

```ts
// frontend/e2e/example.spec.ts
import { test, expect } from '@playwright/test';

test('user can register with valid credentials', async ({ page }) => {
  await page.goto('/auth');
  // ...
});
```

## Backend

The backend doesn't exist yet in v2. For E2E tests, either:
- Use the existing v1 backend at `http://192.168.1.200:3000` (if endpoints match)
- Mock responses until the v2 backend is built

## Branch Naming

```
feature/auth-login-screen
feature/journey-creation
fix/check-in-button-disabled
```
