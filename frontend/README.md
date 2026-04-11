# JourneyTogether

A mobile app for shared travel experiences — create journeys, check in at stops, and relive adventures together.

## Tech Stack

- **Framework:** Expo SDK 54 / React Native 0.81
- **Navigation:** expo-router (file-based routing)
- **State:** Zustand
- **HTTP:** Axios with JWT interceptors
- **Voice:** expo-av
- **Images:** expo-image, expo-image-picker

## Project Structure

```
app/                    # expo-router pages (file-based routing)
├── (tabs)/             # Bottom tab navigator
│   ├── index.tsx       # Home — journey list
│   ├── explore.tsx     # Explore — discover public journeys
│   └── profile.tsx     # Profile — user stats + settings
├── auth/
│   ├── login.tsx       # Login screen
│   └── register.tsx   # Registration screen
├── journey/
│   ├── [id].tsx        # Journey detail + stops
│   ├── [id]/edit.tsx  # Edit journey
│   └── create.tsx      # Create new journey
└── session/
    ├── active.tsx      # Solo active session (check-in flow)
    ├── group.tsx       # Multiplayer group session
    └── spontaneous.tsx # Quick session without a plan

api/                    # API client + endpoint methods
components/            # Reusable UI components
constants/              # Theme + config
hooks/                  # Custom React hooks
stores/                 # Zustand state stores
types/                  # TypeScript types
e2e/                    # Playwright E2E tests
```

## Screens

| Route | Description |
|---|---|
| `/` | Redirect → `/home` or `/auth/login` |
| `/auth/login` | Email + password login |
| `/auth/register` | Account creation |
| `/home` | My journeys list |
| `/explore` | Discover public journeys |
| `/profile` | User profile, stats, logout |
| `/journey/create` | Create a new journey with stops |
| `/journey/:id` | Journey detail with stop list |
| `/journey/:id/edit` | Edit journey (owner only) |
| `/session/active` | Active solo session — check in at stops |
| `/session/group` | Multiplayer group session (WebSocket) |
| `/session/spontaneous` | Ad-hoc session without a plan |

## API Configuration

The app connects to a backend at the URL defined by `API_BASE_URL` (defaults to `http://192.168.1.200:3000`).

For production builds, set `API_BASE_URL` at build time to your server's public URL.

```bash
API_BASE_URL=https://your-server.com npx expo prebuild --platform android
```

## Setup

```bash
cd frontend
npm install
npx expo start
```

## E2E Tests

Tests use Playwright with the `chromium` browser.

> **Note:** Chromium requires system libs (`libnspr4.so`, etc.) not available in Docker/Unraid environments. Run on a Linux host or Mac.

```bash
cd frontend
npm run test:e2e
```

## Build

### Android (EAS)

```bash
eas build --platform android --profile preview
eas credentials  # configure signing
```

### Local Android (Expo prebuild)

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## Backend

The companion backend is in `../backend/` (Express + better-sqlite3 + JWT). See `../PLAN-BACKEND.md` for full API docs.

### Key endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/register | — | Create account |
| POST | /auth/login | — | Login |
| GET | /auth/me | JWT | Current user |
| GET | /journeys | JWT | List user's journeys |
| POST | /journeys | JWT | Create journey |
| GET | /journeys/:id | JWT | Journey detail |
| PATCH | /journeys/:id | JWT | Update journey |
| DELETE | /journeys/:id | JWT | Delete journey |
| POST | /sessions/solo/start | JWT | Start solo session |
| POST | /sessions/solo/:id/stops/:stopId/complete | JWT | Check in at stop |
| POST | /sessions/solo/:id/end | JWT | End solo session |
