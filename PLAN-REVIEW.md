# JourneyTogether 2.0 — Critical Plan Review

**Reviewer:** Senior Full-Stack Engineer (Subagent)
**Date:** 2026-04-09
**Plans Reviewed:** SPEC.md · PLAN-BACKEND.md · PLAN-FRONTEND.md · PLAN-INFRA.md

---

## Executive Summary

These plans are ambitious and cover most of the core functionality, but they contain a significant number of critical flaws that would block shipping. The three most dangerous problems are: (1) a health check endpoint path mismatch between backend and infra that will cause silent failure in production, (2) WebSocket architecture that cannot scale beyond a single process, and (3) SQLite used on a network-mounted volume which will perform catastrophically under concurrent load. Every issue below is tagged with severity.

---

## CRITICAL Issues (Must Fix Before Ship)

### 1. Health Check Path Mismatch — Backend Won't Start Under Docker
**Severity:** CRITICAL
**Files:** PLAN-BACKEND.md §Health Check · PLAN-INFRA.md §1.1, §2.2

The backend health check is defined as `GET /health` (no prefix):
```
app.get('/health', (req, res) => { ... })
```

The Docker HEALTHCHECK and nginx both probe `http://localhost:3000/api/health`:
```
# docker-compose.yml §1.1
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]

# nginx.conf §1.3
location /api/ {
  proxy_pass http://backend;   # backend:3000/api/* → backend:3000/api/*
```

So nginx proxies `/api/health` to `backend:3000/api/health`, but the backend only listens on `/health`. The health check will always return 404. Docker will mark the container unhealthy. Nginx will never proxy traffic. The entire stack fails silently.

**Fix:** Either add `app.get('/api/health', ...)` to the backend, or change the Docker/nhealth checks to `/health`.

---

### 2. WebSocket In-Memory State — Horizontal Scaling Impossible
**Severity:** CRITICAL
**Files:** PLAN-BACKEND.md §3 WebSocket Protocol · §6 Project Structure · PLAN-INFRA.md

The WebSocket room management is an in-memory `Map<sessionId, Set<WebSocket>>` in `src/websocket/sessionRoom.ts`. This works for a single Node.js process. It breaks completely if:
- The backend runs with PM2 cluster mode (multiple processes)
- Multiple backend containers behind the nginx load balancer in the infra plan

When members are routed to different backend processes, they won't receive each other's broadcasts. Group sync silently breaks with no error.

**Fix:** Use Redis pub/sub with `ws` + `ioredis` or a dedicated WebSocket server (e.g., Socket.IO with Redis adapter, or Piccolo). Or document that this app is single-instance only and explicitly prevent multi-instance deployment.

---

### 3. SQLite on Network Mount (NFS) — Catastrophic Performance
**Severity:** CRITICAL
**Files:** PLAN-BACKEND.md §1 Database Schema · PLAN-INFRA.md §1.2 docker-compose.yml

The SQLite file is stored at `/mnt/user/journeytogether/data.db` which is a Unraid share (backed by NFS/smb underneath). SQLite performance degrades dramatically on network-mounted filesystems because:
- Every read/write involves network round-trips
- File locking on network mounts is unreliable and slow
- WAL mode helps reads but writes still fsync over the network

The schema also uses `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` — these are per-connection. With concurrent group check-ins, you'll get lock contention and failed writes.

**Fix:** Store the SQLite file on a local container volume (`journeytogether-data` mount), not the bind mount to `/mnt/user/`. Only backup scripts should copy from the container volume to `/mnt/user/journeytogether/backups/`. The bind mount for uploads can remain on the share since photos don't need transactional integrity.

---

### 4. JWT Passed in WebSocket URL Query String
**Severity:** CRITICAL (Security)
**Files:** PLAN-BACKEND.md §3 WebSocket Protocol

```
Client opens WebSocket to `/ws/session/:sessionId?token=<jwt>`
```

JWT tokens in query parameters get:
- Logged in server access logs (every proxy hop)
- Logged in browser history
- Leaked via `document.referrer`
- Potentially leaked in CDN/access logs

For a self-hosted app where the Unraid server logs are accessible, this is a significant exposure of every active session token.

**Fix:** Pass JWT in the `Authorization` header during WebSocket upgrade via a custom header, or use a signed cookie. The `ws` library supports this via a custom header check in the `verifyClient` callback.

---

### 5. Invite Code Enumeration Attack
**Severity:** CRITICAL (Security)
**Files:** PLAN-BACKEND.md §Session Endpoints · PLAN-INFRA.md

Invite codes are 6-char uppercase alphanumeric from a 32-character set (BCDEFGHJKMNPQRSTUVWXYZ23456789), giving ~32^6 ≈ 1 billion combinations. However:
- The `POST /sessions/join` endpoint is not rate-limited in nginx (`limit_req zone=upload:10m rate=2r/s` only applies to `/upload/*`, not `/sessions/*`)
- An attacker can brute-force invite codes at full HTTP speed (~hundreds/second)
- Once found, they can join any active group session

**Fix:** Add `limit_req zone=sessions:10m rate=5r/s` in nginx for `/sessions/*` and implement exponential backoff on repeated failed join attempts server-side.

---

## MAJOR Issues

### 6. Frontend Hardcoded Backend URL
**Severity:** MAJOR
**Files:** PLAN-FRONTEND.md §1 React Native Project Setup · PLAN-INFRA.md §5.1

The frontend has:
```ts
export const API_BASE_URL = __DEV__
  ? 'http://192.168.1.200:3000'   // Dev
  : 'http://192.168.1.200:3000';  // Prod APK points here
```

Problems:
- Production APK hardcodes a LAN IP. If the user opens the app on cellular or a different network, it can't reach the backend.
- The app is marketed as self-hosted, meaning users will run their own backend on their own server. The backend URL must be configurable at runtime, not just build-time.

**Fix:** Store backend URL in AsyncStorage with a setup screen, or use a config file the user can edit before building. Alternatively, use Unraid's Traefik/DuckDNS for a real domain with HTTPS.

---

### 7. GPS Location Spoofing — Client Controls Truth
**Severity:** MAJOR (Security/Integrity)
**Files:** PLAN-BACKEND.md §Session Endpoints · PLAN-SPEC.md

The backend receives GPS coordinates from the client in the stop completion request:
```json
POST /sessions/:id/stops/:stopId/complete
{ "lat": 55.679, "lng": 12.588 }
```

The server has no way to verify these coordinates. Any user with a modified app or a mock location app passes the Haversine check trivially.

**Fix (partial):** Use distance from the **previous known good location** and enforce a maximum travel speed (e.g., no more than 15 m/s between check-ins). Or accept this as a known limitation and don't use check-in for anything security-critical.

---

### 8. Photos Not Compressed or Resized
**Severity:** MAJOR
**Files:** PLAN-BACKEND.md §4 File Storage

`POST /sessions/:id/photos` accepts JPEG/PNG/HEIC/HEIF up to 10MB. No image processing happens server-side. High-res photos from modern phones (50MP+) are uploaded at full resolution, consuming storage and bandwidth. Users will hit the 10MB limit with uncompressed images.

**Fix:** Use `sharp` or `jimp` in the backend to resize to max 1920px and compress to ~80% JPEG quality before storing.

---

### 9. No Journey Deletion API
**Severity:** MAJOR
**Files:** PLAN-BACKEND.md §Journey Endpoints

The spec mentions journeys can be created and edited. The API plan has `DELETE /journeys/:id` listed in §2 API Specification and §7 Dependencies as a route, but there's no controller/service implementation described. `DELETE /journeys/:id` is missing from the controller section entirely.

**Fix:** Implement the delete controller — cascade delete stops and invalidate active sessions.

---

### 10. `journey_completions.notes` Column Missing from Schema
**Severity:** MAJOR
**Files:** PLAN-BACKEND.md §1 Database Schema

The spec says users can add journey notes after completing a journey. The backend schema for `journey_completions` does NOT have a `notes` column:
```sql
CREATE TABLE journey_completions (
  id              TEXT PRIMARY KEY,
  oder_id         TEXT NOT NULL REFERENCES users(id),
  journey_id      TEXT NOT NULL REFERENCES journeys(id),
  session_id      TEXT REFERENCES active_sessions(id),
  completed_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  duration_minutes INTEGER,
  -- notes column MISSING
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (oder_id, session_id)
);
```

But `POST /sessions/:id/complete` accepts `{ "notes": "Amazing evening!" }` and the API response for history includes `notes`. The column doesn't exist in the schema.

**Fix:** Add `notes TEXT` column to `journey_completions`.

---

### 11. Frontend WS Message Type Names Mismatch Backend
**Severity:** MAJOR
**Files:** PLAN-BACKEND.md §3 · PLAN-FRONTEND.md §8

The frontend defines:
```ts
type WSMessage =
  | { type: 'stop_completed'; payload: { member_id: string; stop_id: string } }
  | { type: 'member_joined'; payload: SessionMember }
  | { type: 'member_left'; payload: { member_id: string } }
```

The backend sends:
```json
{ "event": "stop_completed", "data": { "user_id": "...", "stop_id": "...", "stop_index": 2, ... } }
```

The backend uses `event` + `data` envelope. The frontend uses `type` + `payload` (flat structure). The backend sends `user_id`, the frontend expects `member_id`. The backend sends `stop_index` (number) and `new_current_stop_index`; the frontend only uses `stop_id`. The frontend will silently fail to handle these events.

**Fix:** Normalize on one format. The backend's `event`/`data` envelope with a top-level `event` field is standard. Align frontend WSMessage type to match.

---

### 12. FTS5 Update Trigger is Broken
**Severity:** MAJOR
**Files:** PLAN-BACKEND.md §1 Database Schema

```sql
CREATE TRIGGER journeys_au AFTER UPDATE ON journeys BEGIN
  INSERT INTO journeys_fts(journeys_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO journeys_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;
```

This is wrong. The FTS5 `INSERT INTO ... VALUES` syntax doesn't use the table name as the first value. For a delete operation in FTS5, you use `INSERT INTO ...(rowid, ...) VALUES(...)` with `WHERE rowid = old.rowid` or use the `('delete', ...)` special syntax correctly. The actual correct syntax for FTS5 delete triggers is:
```sql
DELETE FROM journeys_fts WHERE rowid = old.rowid;
```
And for insert:
```sql
INSERT INTO journeys_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
```

The current trigger will throw a SQLite syntax error on every journey UPDATE.

**Fix:** Rewrite the FTS5 triggers to use proper `DELETE FROM ... WHERE rowid = ?` and `INSERT INTO ... VALUES (?, ?, ?)` without the special `'delete'` pseudo-table syntax.

---

### 13. Backend Dev Docker Image Doesn't Work
**Severity:** MAJOR
**Files:** PLAN-BACKEND.md §7 Dependencies · PLAN-INFRA.md §1.1

The Dockerfile does:
```dockerfile
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

But `dist/` is the TypeScript compilation output. The build step (compile TypeScript) is never run in Docker. `npm ci --only=production` only installs deps — no `npm run build`. The `dist/` directory won't exist when the image is first built. The container will fail immediately.

**Fix:** Either compile TypeScript before the `COPY dist/` step, or mount the source code as a volume for development. The Dockerfile comment says "Build happens on CI" but the CI workflow doesn't show a TypeScript build step either.

---

### 14. `npm run bundle:android` Script Doesn't Exist
**Severity:** MAJOR
**Files:** PLAN-FRONTEND.md §10 Dependencies

The infra plan references `npm run bundle:android` in the Android CI build, but this script is not in the frontend `package.json` dependencies §10. The scripts section only has: `android`, `ios`, `lint`, `start`, `build:android`, `build:android:debug`. The bundle script is missing.

**Fix:** Add `"bundle:android": "react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/"` to package.json.

---

### 15. No Test Suite Defined
**Severity:** MAJOR
**Files:** PLAN-BACKEND.md §7 Dependencies · PLAN-FRONTEND.md §10 · PLAN-INFRA.md §3.1

The CI/CD pipeline has `npm test` in the jobs, but:
- No test framework is in either `package.json` (no `jest`, `@testing-library/react-native`, etc.)
- No test files are described in the project structure
- No test script in the frontend package.json

The pipeline will fail or pass vacuously because there's nothing to run.

**Fix:** Add Jest for backend, `@testing-library/react-native` + Jest for frontend. Write at least basic happy-path tests.

---

## MINOR Issues

### 16. `oder_id` Typo Throughout
**Severity:** MINOR
**Files:** PLAN-BACKEND.md §1 (schema) · PLAN-FRONTEND.md §2, §8

Both the backend schema and frontend types have `oder_id` which appears to be a misspelling of `user_id` or `owner_id` (referencing the user who created something). The context suggests it means "user ID" (from the `users` table foreign key). It should be `user_id` for clarity and consistency with the frontend `SessionMember.user_id`.

Note: The frontend has `SessionMember.oder_id` but `sessionStore` WS handler uses `message.payload.member_id` which maps to `m.oder_id` — a confusing and inconsistent chain.

**Fix:** Rename to `user_id` in schema and frontend types.

---

### 17. `UPLOAD_DIR` vs `UPLOAD_PATH` Environment Variable Name Inconsistency
**Severity:** MINOR
**Files:** PLAN-BACKEND.md §4 File Storage · PLAN-INFRA.md §1.2 docker-compose.yml

Backend references `process.env.UPLOAD_DIR`:
```typescript
const UPLOAD_BASE = process.env.UPLOAD_DIR || '/mnt/user/journeytogether/uploads';
```

Docker Compose uses `UPLOAD_PATH`:
```yaml
environment:
  - UPLOAD_PATH=/uploads
```

The variable names don't match. The container will use the hardcoded fallback path instead of the configured volume mount.

**Fix:** Use consistent name: `UPLOAD_DIR` in both backend and docker-compose.

---

### 18. CORS Origin Defaults to localhost
**Severity:** MINOR (Security)
**Files:** PLAN-INFRA.md §4.2

```bash
CORS_ORIGIN=http://localhost:8081
```

This is the Expo/RN default but `http://localhost:8081` will not work for a real device on the same network. For a React Native app connecting to a LAN IP, CORS should at minimum allow the LAN IP.

**Fix:** Default to `*` or document that users must configure this before deployment.

---

### 19. No `dev` Script in Backend package.json
**Severity:** MINOR
**Files:** PLAN-BACKEND.md §7 Dependencies

The scripts section only has: `dev`, `build`, `start`, `db:init`. Wait — the scripts ARE listed in §7:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "db:init": "tsx src/db/init.ts"
}
```

So `dev` exists. My concern is addressed. Disregard.

---

### 20. No Mechanism for Avatar Upload
**Severity:** MINOR
**Files:** PLAN-BACKEND.md §User Endpoints · PLAN-SPEC.md

`PUT /users/me` accepts `{ "avatar_url": "http://..." }` but there's no upload endpoint for avatars. Users must host their own image and paste a URL — terrible UX.

**Fix:** Add `POST /upload/avatar` multipart endpoint mirroring the cover image upload pattern.

---

### 21. Frontend `stop_completed` WS Handler has Incorrect Member ID Logic
**Severity:** MINOR
**Files:** PLAN-FRONTEND.md §8 WebSocket Client

```ts
case 'stop_completed':
  const updatedMembers = state.activeSession.members.map((m) =>
    m.oder_id === message.payload.member_id  // 'member_id' doesn't exist in payload
```

The backend `stop_completed` payload has `user_id`, not `member_id`. The frontend type says `payload: { member_id: string; stop_id: string }` which matches neither the backend schema (`user_id`) nor the backend event (`user_id` + `stop_index` + `all_at_stop` + etc.). The handler will never match because `m.oder_id === undefined`.

**Fix:** Align the WS event schema between backend and frontend.

---

### 22. Solo Sessions vs WebSocket Connection
**Severity:** MINOR
**Files:** PLAN-FRONTEND.md §8 · PLAN-BACKEND.md §3

Solo sessions have `is_group=false` and the backend may not join solo users to a WebSocket room. But the frontend `sessionStore` doesn't differentiate — `ActiveSession` always has `wsConnection: WebSocket | null`. When `connectWS` is called for a solo session, the backend should either reject the connection or handle it gracefully. This isn't specified.

**Fix:** Add `is_group: boolean` to `ActiveSession` type and only call `connectWS` for group sessions.

---

### 23. Stop Ordering Has No Integrity Constraint
**Severity:** MINOR
**Files:** PLAN-BACKEND.md §1 Database Schema

```sql
UNIQUE (journey_id, "order")
```

This prevents duplicate order values but doesn't enforce that stops within a journey have sequential orders (0, 1, 2). A buggy insert could create stops with orders 0, 2, 5 skipping 1. The frontend drag-and-drop reordering in `DraggableStopList` could produce this.

**Fix:** Add a trigger or application-level check to ensure `order` values are sequential when stops are inserted/updated.

---

### 24. Nginx Upstream Has No Healthcheck
**Severity:** MINOR
**Files:** PLAN-INFRA.md §1.3 nginx.conf

The nginx upstream block:
```nginx
upstream backend {
  server backend:3000;
  keepalive 32;
}
```

If the backend container becomes unhealthy (but Docker still routes to it), nginx will keep sending requests until the container fully dies. There's no `server backend:3000 max_fails=3 fail_timeout=30s` to detect failing backends.

**Fix:** Add passive health checks to the upstream directive.

---

### 25. Journey Editor Reordering Doesn't Update `order` Field on Backend
**Severity:** MINOR
**Files:** PLAN-FRONTEND.md §4 Screens · PLAN-BACKEND.md §Journey Endpoints

The frontend `DraggableStopList` allows reordering stops. `PUT /journeys/:id` sends the full journey with stops. But if the client only sends the new order of stop IDs without the `order` field values, the backend has no way to know what the new order is. The spec for `PUT /journeys/:id` says "full replace, not partial" but doesn't specify how reorder is represented.

**Fix:** Ensure frontend sends `order: number` on every stop in the PUT payload, and the backend updates all stop orders transactionally.

---

### 26. Backend Logs to stdout but No Log Drain Configured
**Severity:** MINOR
**Files:** PLAN-INFRA.md §7.2

The pino logger is configured with `pino/file` targets writing to files. But the container runs as non-root user (`nodeapp:nodejs`) and the log directory (`/var/log/journeytogether`) isn't mounted. The container will fail to create log files silently.

**Fix:** Mount `/mnt/user/journeytogether/logs/` to `/var/log/journeytogether` in the docker-compose volume section.

---

## SPEC GAPS (Things That Need Clarification)

### G1. Cover Image Upload Flow Is Undefined
The spec says `cover_image_url` is set "via separate upload" but there's no description of the flow. Does the user pick an image → app uploads to `POST /upload/cover` → gets URL → includes in `POST /journeys`? Or does the user paste a URL directly? The UX for cover image upload needs to be defined.

### G2. How Are Completion Photos Retrieved?
`GET /users/:id/history` returns `photos[]` in the completion response. But the `completion_photos` table exists and stores post-journey photos. Is `history` supposed to include photos taken *during* the journey (`session_photos`) plus photos added *after* (`completion_photos`)? Or just `completion_photos`? The response shape says `photos[]` but doesn't specify which table(s) they're from.

### G3. Maximum Group Size Not Defined
Multiplayer journeys have no stated member limit. With the in-memory WebSocket room approach, very large groups (20+ people) would create many concurrent connections and broadcast storms.

### G4. Journey Editing After Start
The spec explicitly says "Journey editing after journey has started" is out of scope. But there's no enforcement of this in the backend (no `session_id` check on `PUT /journeys/:id`). An owner could modify a journey while members are actively in it, causing state divergence.

### G5. What Happens When a Group Has 1 Member After Someone Leaves?
If a group journey has 2 members and 1 leaves, the session becomes effectively solo. Does `is_group` flip to `false`? Or does the session remain `is_group=true` with 1 member? This affects UI display and whether WebSocket is required.

### G6. Solo Journey Pause/Resume — No API
The spec lists "Pause/resume journey" for the active journey (solo) feature. But `POST /sessions/:id/pause` and `POST /sessions/:id/resume` are described as "owner only" (group journeys). There's no solo pause/resume API defined. Does solo pause just update `session.status` to `paused` with no owner check?

### G7. Role Escalation Not Possible
Every registered user starts as `role='user'`. There's no way to become a creator (except the spec says "any user can create") and no way to become an admin. The spec contradicts itself — it says "any user can create journeys" but the backend assigns `role='user'` by default. Either everyone is a creator by default (role distinction is meaningless for journey creation) or there needs to be a role upgrade mechanism.

### G8. `updated_at` Never Updated
The schema defines `updated_at INTEGER NOT NULL DEFAULT (unixepoch())` on `users`, `journeys`, `stops`, `active_sessions` tables, but there's no trigger or application code to actually update this column on row changes. It will always equal `created_at`.

### G9. Stop Completion — What if Location Permission Is Denied?
If a user denies location permission,