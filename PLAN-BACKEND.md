# JourneyTogether 2.0 — Backend Development Plan

**Version:** 1.1-fixed  
**Author:** Senior Backend Engineer  
**Date:** 2026-04-09  
**Stack:** Node.js · Express · better-sqlite3 · JWT · ws · multer · bcrypt · uuid · sharp

---

## Fixes (v1.1-fixed)

- **CRITICAL:** Storage config syntax error — fixed broken `const { sessionId` line in multer diskStorage
- **CRITICAL:** Solo session completion — solo sessions create `journey_completions` directly (no `session_members` for solo)
- **CRITICAL:** Stop completion journey ID check — verify `stop.journey_id = session.journey_id` before marking complete
- **MAJOR:** Rate limit middleware — clarified that `inviteCodeRateLimit` is explicitly applied to `POST /sessions/join`
- **MAJOR:** GET /journeys/:id — added `forked_from_id` and `forked_from_title` to response
- **MAJOR:** DELETE /journeys/:id — added 409 response when journey has active sessions
- **MAJOR:** GET /users/me/history — added new endpoint (frontend uses `/me/history`, not `/users/:id/history`)
- **MAJOR:** Journey publishing — added `PATCH /journeys/:id` for publishing/updating `is_public` on existing journeys
- **MAJOR:** WS session_paused/session_resumed — clarified these events are broadcast to all session members
- **MAJOR:** WS reconnection state replay — added `seq` (sequence number) to `session_state` event for gap detection
- **MINOR:** UPLOAD_DIR vs UPLOAD_PATH — standardized all references to `UPLOAD_DIR`  

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [API Specification](#2-api-specification)
3. [WebSocket Protocol](#3-websocket-protocol)
4. [File Storage](#4-file-storage)
5. [Auth Flow](#5-auth-flow)
6. [Project Structure](#6-project-structure)
7. [Dependencies](#7-dependencies)

---

## 1. Database Schema

**Engine:** SQLite via `better-sqlite3` (synchronous, embedded). Single file at `/mnt/user/journeytogether/data.db`.

### SQLite Storage Notes

> **NFS deployment note:** For v1 single-container deployments, SQLite on NFS is acceptable and commonly used. However, if performance issues arise (lock contention, slow writes), the database should be moved to a container-local volume (e.g., named Docker volume) instead of an NFS bind mount. SQLite benefits from low-latency file I/O.
>
> **Recommended SQLite PRAGMAs (set on every connection):**
> ```sql
> PRAGMA journal_mode = WAL;          -- enables concurrent reads during writes
> PRAGMA foreign_keys = ON;            -- enforces referential integrity
> PRAGMA busy_timeout = 5000;         -- wait up to 5s for locks before returning SQLITE_BUSY
> PRAGMA synchronous = NORMAL;        -- balanced durability/performance (safe with WAL)
> ```

### SQL

```sql
-- ============================================================
-- JourneyTogether 2.0 — SQLite Schema
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

-- ----------------------------------------------------------
-- users
-- ----------------------------------------------------------
CREATE TABLE users (
  id           TEXT PRIMARY KEY,          -- UUID v4
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,                       -- nullable, absolute URL or path
  role         TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'creator', 'admin')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- Trigger: update updated_at on users
CREATE TRIGGER users_au AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = unixepoch() WHERE id = old.id;
END;

-- ----------------------------------------------------------
-- journeys
-- ----------------------------------------------------------
CREATE TABLE journeys (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',  -- JSON array stored as TEXT
  duration_label  TEXT,                         -- e.g. "2-3 hours"
  is_public       INTEGER NOT NULL DEFAULT 1,   -- 0 = false, 1 = true (SQLite bool)
  is_highlighted  INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT NOT NULL REFERENCES users(id),
  forked_from_id  TEXT REFERENCES journeys(id), -- nullable; set when journey is a fork
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_journeys_created_by   ON journeys(created_by);
CREATE INDEX idx_journeys_is_public    ON journeys(is_public);
CREATE INDEX idx_journeys_is_highlighted ON journeys(is_highlighted);
CREATE INDEX idx_journeys_forked_from  ON journeys(forked_from_id);

-- Full-text search on title + description
CREATE VIRTUAL TABLE journeys_fts USING fts5(title, description, content='journeys', content_rowid='rowid');

-- Trigger to keep FTS in sync with journeys table
CREATE TRIGGER journeys_ai AFTER INSERT ON journeys BEGIN
  INSERT INTO journeys_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;

CREATE TRIGGER journeys_ad AFTER DELETE ON journeys BEGIN
  INSERT INTO journeys_fts(journeys_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;

-- FTS5 does not support AFTER UPDATE triggers on the content table.
-- Updates are synced via an INSTEAD OF UPDATE trigger on the FTS5 virtual table.
CREATE TRIGGER journeys_au AFTER UPDATE ON journeys BEGIN
  INSERT INTO journeys_fts(journeys_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO journeys_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;

-- ----------------------------------------------------------
-- stops
-- ----------------------------------------------------------
CREATE TABLE stops (
  id                TEXT PRIMARY KEY,
  journey_id        TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  "order"           INTEGER NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  location_lat      REAL NOT NULL,
  location_lng      REAL NOT NULL,
  location_label    TEXT,                        -- human-readable label
  estimated_time    INTEGER,                      -- minutes
  tips              TEXT NOT NULL DEFAULT '[]',  -- JSON array
  photo_required    INTEGER NOT NULL DEFAULT 0,  -- 0/1
  voice_note_url    TEXT,                         -- nullable, URL to voice note audio
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE (journey_id, "order")
);

CREATE INDEX idx_stops_journey_id ON stops(journey_id);

-- Trigger: update updated_at on stops
CREATE TRIGGER stops_au AFTER UPDATE ON stops BEGIN
  UPDATE stops SET updated_at = unixepoch() WHERE id = old.id;
END;

-- ----------------------------------------------------------
-- active_sessions
-- ----------------------------------------------------------
CREATE TABLE active_sessions (
  id                 TEXT PRIMARY KEY,
  journey_id         TEXT NOT NULL REFERENCES journeys(id),
  owner_id           TEXT NOT NULL REFERENCES users(id),
  invite_code        TEXT NOT NULL UNIQUE,       -- 6-char uppercase alphanumeric
  status             TEXT NOT NULL DEFAULT 'waiting'
                       CHECK (status IN ('waiting', 'active', 'paused', 'completed')),
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  is_group           INTEGER NOT NULL DEFAULT 0, -- 0 = solo, 1 = group
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_active_sessions_journey_id ON active_sessions(journey_id);
CREATE INDEX idx_active_sessions_owner_id   ON active_sessions(owner_id);
CREATE INDEX idx_active_sessions_invite_code ON active_sessions(invite_code);
CREATE INDEX idx_active_sessions_status     ON active_sessions(status);

-- Trigger: update updated_at on active_sessions
CREATE TRIGGER active_sessions_au AFTER UPDATE ON active_sessions BEGIN
  UPDATE active_sessions SET updated_at = unixepoch() WHERE id = old.id;
END;

-- ----------------------------------------------------------
-- session_members
-- ----------------------------------------------------------
CREATE TABLE session_members (
  session_id         TEXT NOT NULL REFERENCES active_sessions(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id),
  role               TEXT NOT NULL DEFAULT 'member'
                       CHECK (role IN ('owner', 'member')),
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  completed_stop_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of stop_id
  joined_at          INTEGER NOT NULL DEFAULT (unixepoch()),

  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_session_members_user_id ON session_members(user_id);

-- ----------------------------------------------------------
-- session_member_reactions
-- ----------------------------------------------------------
CREATE TABLE session_member_reactions (
  session_id TEXT NOT NULL REFERENCES active_sessions(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  stop_id     TEXT NOT NULL REFERENCES stops(id),
  emoji       TEXT NOT NULL
                CHECK (emoji IN ('❤️', '🔥', '😄')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),

  PRIMARY KEY (session_id, user_id, stop_id)
);

-- ----------------------------------------------------------
-- session_photos
-- ----------------------------------------------------------
CREATE TABLE session_photos (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES active_sessions(id) ON DELETE CASCADE,
  stop_id      TEXT NOT NULL REFERENCES stops(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  photo_url    TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_session_photos_session_id ON session_photos(session_id);
CREATE INDEX idx_session_photos_stop_id    ON session_photos(stop_id);

-- ----------------------------------------------------------
-- journey_completions
-- ----------------------------------------------------------
CREATE TABLE journey_completions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  journey_id      TEXT NOT NULL REFERENCES journeys(id),
  session_id      TEXT REFERENCES active_sessions(id),
  completed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  duration_minutes INTEGER,
  notes           TEXT,                        -- user-provided journey notes/reflection
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE (user_id, session_id)   -- one completion record per user per session
);

CREATE INDEX idx_completions_user_id    ON journey_completions(user_id);
CREATE INDEX idx_completions_journey_id ON journey_completions(journey_id);

-- ----------------------------------------------------------
-- completion_photos (photos saved after journey complete)
-- ----------------------------------------------------------
CREATE TABLE completion_photos (
  id              TEXT PRIMARY KEY,
  completion_id   TEXT NOT NULL REFERENCES journey_completions(id) ON DELETE CASCADE,
  photo_url       TEXT NOT NULL,
  stop_id         TEXT REFERENCES stops(id),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_completion_photos_completion_id ON completion_photos(completion_id);
```

### Schema Notes

- **UUIDs** generated server-side with `uuid.v4()` — never auto-increment integers.
- **Timestamps** stored as Unix epoch integers (seconds) for cross-platform consistency.
- **`tags` and `tips`** stored as JSON text — parsed/serialized in application code.
- **`completed_stop_ids`** stored as JSON array of stop IDs per member.
- **FTS5** virtual table powers `LIKE` / keyword search on journeys without full-text index overhead.
- **FTS5 UPDATE trigger** uses `INSTEAD OF UPDATE` — SQLite FTS5 does not support `AFTER UPDATE` on the content table; instead the content-table trigger fires and the FTS5 virtual-table synonyms are used to sync.
- **`WAL` mode** enables concurrent reads during writes; **`busy_timeout = 5000`** prevents immediate `SQLITE_BUSY` errors under contention.
- **`ON DELETE CASCADE`** on foreign keys keeps referential integrity.

---

## 2. API Specification

**Base URL:** `http://<host>:<port>/api/v1`  
**Content-Type:** `application/json` unless noted  
**Auth:** JWT Bearer token in `Authorization` header (`Authorization: Bearer <token>`)

> **Health check:** `GET /health` — no auth, no version prefix. Returns `{ "status": "ok", "timestamp": <unix_ts> }`.

### Error Response Shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}  // optional extra info
  }
}
```

### HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized (missing or invalid JWT) |
| 403 | Forbidden (valid JWT but insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (e.g. invite code already used) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal Server Error |

---

### Auth Endpoints

#### `POST /auth/register`

Register a new user account.

**Auth:** None

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "display_name": "John Doe"
}
```

**Validation:**
- `email`: valid email format, unique
- `password`: min 8 chars
- `display_name`: 1–50 chars, trimmed

**Response 201:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-v4",
    "email": "user@example.com",
    "display_name": "John Doe",
    "avatar_url": null,
    "role": "user",
    "created_at": 1744185600
  }
}
```

**Response 400:** Validation errors

---

#### `POST /auth/login`

Authenticate and receive a JWT.

**Auth:** None

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-v4",
    "email": "user@example.com",
    "display_name": "John Doe",
    "avatar_url": null,
    "role": "user",
    "created_at": 1744185600
  }
}
```

**Response 401:** Invalid credentials

---

#### `GET /auth/me`

Get the currently authenticated user.

**Auth:** JWT required

**Response 200:**
```json
{
  "user": {
    "id": "uuid-v4",
    "email": "user@example.com",
    "display_name": "John Doe",
    "avatar_url": "http://...",
    "role": "user",
    "created_at": 1744185600
  }
}
```

**Response 401:** Missing/invalid token

---

### Journey Endpoints

#### `GET /journeys`

Browse public journeys with optional filtering.

**Auth:** JWT optional (anonymous browsing allowed)

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `tag` | string | Filter by tag (e.g. `hiking`, `romantic`) |
| `q` | string | Full-text search on title + description |
| `lat` | number | Latitude for Spontaneous Mode — filter journeys with at least one stop within `radius_km` |
| `lng` | number | Longitude for Spontaneous Mode |
| `radius_km` | number | Search radius in kilometers (default: 5, max: 50). Required when `lat`/`lng` are provided |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20, max: 50) |

> **Spontaneous Mode:** When `lat`, `lng`, and `radius_km` are provided, the query returns public journeys that have at least one stop within the specified Haversine distance. Results are sorted by nearest stop to the given coordinates.

**Response 200:**
```json
{
  "journeys": [
    {
      "id": "uuid-v4",
      "title": "Copenhagen Evening Walk",
      "description": "A romantic stroll through Nyhavn...",
      "cover_image_url": "http://...",
      "tags": ["romantic", "photo"],
      "duration_label": "2 hours",
      "is_public": true,
      "is_highlighted": false,
      "created_by": "user-uuid",
      "creator_name": "John Doe",
      "stops_count": 5,
      "created_at": 1744185600
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

#### `GET /journeys/featured`

Get admin-highlighted journeys for the home screen banner.

**Auth:** JWT optional

**Response 200:** Same shape as `GET /journeys` but only `is_highlighted: true` journeys.

---

#### `GET /journeys/:id`

Get full journey details including all stops.

**Auth:** JWT optional (journey must be public unless requester is owner)

**Response 200:**
```json
{
  "journey": {
    "id": "uuid-v4",
    "title": "Copenhagen Evening Walk",
    "description": "A romantic stroll...",
    "cover_image_url": "http://...",
    "tags": ["romantic", "photo"],
    "duration_label": "2 hours",
    "is_public": true,
    "is_highlighted": false,
    "created_by": "user-uuid",
    "creator_name": "John Doe",
    "forked_from_id": "uuid-v4",       // null if not a fork
    "forked_from_title": "Original Journey Title", // null if not a fork
    "created_at": 1744185600,
    "updated_at": 1744185600,
    "stops": [
      {
        "id": "stop-uuid",
        "order": 0,
        "title": "Nyhavn Harbor",
        "description": "Meet at the canal...",
        "location": { "lat": 55.679, "lng": 12.588, "label": "Nyhavn" },
        "estimated_time": 30,
        "tips": ["Best at sunset"],
        "photo_required": true,
        "voice_note_url": null
      }
    ]
  }
}
```

**Response 404:** Journey not found

---

#### `POST /journeys`

Create a new journey.

**Auth:** JWT required (any authenticated user is a creator)

**Request Body:**
```json
{
  "title": "My Journey",
  "description": "Description here",
  "cover_image_url": "http://...",        // optional, set via separate upload
  "tags": ["hiking", "nature"],
  "duration_label": "3 hours",
  "is_public": true,
  "stops": [
    {
      "title": "Stop 1",
      "description": "...",
      "location": { "lat": 55.679, "lng": 12.588, "label": "Stop 1" },
      "estimated_time": 30,
      "tips": ["Tip 1"],
      "photo_required": true,
      "order": 0
    }
  ]
}
```

**Response 201:** Returns the created journey (with stops)

**Response 400:** Validation error

---

#### `PUT /journeys/:id`

Update a journey (title, description, stops, etc.).

**Auth:** JWT required + must be journey owner

**Request Body:** Same shape as `POST /journeys` (full replace, not partial)

**Response 200:** Updated journey

**Response 403:** Not the owner

**Response 404:** Not found

---

#### `PATCH /journeys/:id`

Partially update a journey. Used primarily for publishing a draft journey (`is_public: true`) or unpublishing (`is_public: false`).

**Auth:** JWT required + must be journey owner

**Request Body:**
```json
{
  "is_public": true
}
```

All other fields are immutable via this endpoint; use `PUT /journeys/:id` for full replacements.

**Response 200:**
```json
{
  "journey": { ... updated journey ... }
}
```

**Response 403:** Not the owner

**Response 404:** Not found

---

#### `POST /journeys/:id/fork`

Fork an existing public journey to create a new draft journey owned by the authenticated user.

**Auth:** JWT required

**Request Body:** (none — all stops and metadata are copied)

**Server behavior:**
1. Fetch the source journey and all its stops
2. Create a new journey with `forked_from_id` set to the original journey's ID
3. Copy title (append " (Fork)" or similar), description, tags, duration_label, and all stops
4. New journey is marked `is_public: 0` (draft) by default — user can edit and publish when ready
5. Owner is set to the forking user
6. Return the new journey

**Response 201:**
```json
{
  "journey": { ... new forked journey ... }
}
```

**Response 403:** Journey is not public and caller is not the owner

**Response 404:** Journey not found

---

#### `DELETE /journeys/:id`

Delete a journey.

**Auth:** JWT required + must be journey owner

**Server behavior:**
- If active sessions reference this journey (via `active_sessions.journey_id`), return 409.
- Otherwise, cascade-delete the journey (stops are deleted via `ON DELETE CASCADE`).

**Response 204:** Deleted

**Response 403:** Not the owner

**Response 404:** Not found

**Response 409:** Journey has active sessions (cannot delete a journey that has in-progress sessions)

---

### Session Endpoints

#### `POST /sessions`

Start a new journey session (solo or group).

**Auth:** JWT required

**Request Body:**
```json
{
  "journey_id": "uuid-v4",
  "is_group": false
}
```

- `is_group: false` → solo session, no invite code generated
- `is_group: true` → group session, 6-char invite code auto-generated

**Response 201:**
```json
{
  "session_id": "uuid-v4",
  "invite_code": "ABC123",        // null if solo
  "status": "waiting"
}
```

**Response 404:** Journey not found

---

#### `POST /sessions/join`

Join an existing group session via invite code.

**Auth:** JWT required

**Rate limiting:** 5 join attempts per minute per IP (in-memory sliding window). The `inviteCodeRateLimit` middleware is explicitly applied to this route.

**Request Body:**
```json
{
  "invite_code": "ABC123"
}
```

**Response 200:**
```json
{
  "session": { ... },
  "journey": { ... },
  "members": [ ... ]
}
```

**Response 404:** Invalid invite code

**Response 409:** User already a member of this session

**Response 429:** Too many join attempts from this IP

---

#### `GET /sessions/:id`

Get session state with journey and member details.

**Auth:** JWT required + must be a session member

**Response 200:**
```json
{
  "session": {
    "id": "uuid-v4",
    "journey_id": "uuid-v4",
    "owner_id": "user-uuid",
    "invite_code": "ABC123",
    "status": "active",
    "current_stop_index": 2,
    "is_group": true,
    "created_at": 1744185600
  },
  "journey": { ... },          // full journey with stops
  "members": [
    {
      "user_id": "uuid-v4",
      "display_name": "John",
      "avatar_url": null,
      "role": "owner",
      "current_stop_index": 2,
      "completed_stop_ids": ["stop-1", "stop-2"]
    }
  ],
  "photos": [
    {
      "id": "photo-uuid",
      "stop_id": "stop-1",
      "user_id": "uuid-v4",
      "photo_url": "http://...",
      "created_at": 1744185600
    }
  ]
}
```

**Response 403:** Not a member

**Response 404:** Session not found

---

#### `POST /sessions/:id/stops/:stopId/complete`

Mark a stop as completed by the authenticated user.

**Auth:** JWT required + must be session member

**Request Body:** (none)

**Server behavior:**
1. Fetch the session and verify `stopId` belongs to this session's journey (`stop.journey_id = session.journey_id`). Reject 404 if stop not found or doesn't belong to this journey.
2. Verify `stopId` is the next sequential stop for this member
3. Verify user is within ~100m of the stop's coordinates (GPS check — client sends lat/lng)
3. Add stop ID to `session_members.completed_stop_ids`
4. Advance member's `current_stop_index`
5. If all group members have completed current stop → advance `session.current_stop_index`
6. If final stop completed by all → set `session.status = 'completed'`
7. Broadcast WebSocket event

**Request body (optional GPS):**
```json
{
  "lat": 55.679,
  "lng": 12.588
}
```

**Response 200:**
```json
{
  "session": { ... },
  "all_members_at_stop": 3,
  "total_members": 4,
  "journey_completed": false
}
```

**Response 400:** Not at correct stop or out of range

---

#### `POST /sessions/:id/photos`

Upload a photo for the current stop.

**Auth:** JWT required + must be session member  
**Content-Type:** `multipart/form-data`

**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `photo` | file | Image file (JPEG/PNG, max 10MB, compressed to 1920px longest edge before storage) |
| `stop_id` | string | Stop ID the photo is for |

**Storage:** Saved to `/mnt/user/journeytogether/uploads/{session_id}/{stop_id}/{uuid}.jpg`  
**Naming:** `{uuid}.jpg` (uuid = photo ID)  
**Image compression:** Images are resized using `sharp` to a maximum of 1920px on the longest edge before storage to reduce file size and improve load times.

**Response 201:**
```json
{
  "photo": {
    "id": "uuid-v4",
    "session_id": "session-uuid",
    "stop_id": "stop-uuid",
    "user_id": "user-uuid",
    "photo_url": "/uploads/session-id/stop-id/uuid.jpg",
    "created_at": 1744185600
  }
}
```

**Response 400:** Invalid file type or size

---

#### `POST /sessions/:id/voice-notes`

Upload a voice note for the session.

**Auth:** JWT required + must be session member  
**Content-Type:** `multipart/form-data`

**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `voice_note` | file | Audio file (m4a/mp3/wav, max 5MB). No compression applied. |
| `stop_id` | string | Stop ID the voice note is for |

**Storage:** Saved to `/mnt/user/journeytogether/uploads/voice-notes/{session_id}/{stop_id}/{uuid}.{ext}`

**Response 201:**
```json
{
  "voice_note": {
    "id": "uuid-v4",
    "session_id": "session-uuid",
    "stop_id": "stop-uuid",
    "user_id": "user-uuid",
    "voice_note_url": "/uploads/voice-notes/session-uuid/stop-uuid/uuid.m4a",
    "created_at": 1744185600
  }
}
```

**Response 400:** Invalid file type or size

---

#### `POST /sessions/:id/pause`

Pause a journey session (owner only; solo sessions may pause themselves). **Broadcasts `session_paused` WebSocket event to all session members.**

**Auth:** JWT required + must be session owner (or sole member for solo sessions)

**Request Body:** (none)

**Response 200:**
```json
{
  "session": { "status": "paused", ... }
}
```

---

#### `POST /sessions/:id/resume`

Resume a paused journey session (owner only; solo sessions may resume themselves). **Broadcasts `session_resumed` WebSocket event to all session members.**

**Auth:** JWT required + must be session owner (or sole member for solo sessions)

**Response 200:**
```json
{
  "session": { "status": "active", ... }
}
```

---

#### `POST /sessions/:id/reactions`

Add or update an emoji reaction to a stop within a session.

**Auth:** JWT required + must be session member

**Request Body:**
```json
{
  "stop_id": "stop-uuid",
  "emoji": "❤️"
}
```

**Allowed emojis:** `❤️` | `🔥` | `😄`

**Server behavior:** Upsert into `session_member_reactions` — one reaction per user per stop. WebSocket broadcasts `reaction_added` to all session members.

**Response 200:**
```json
{
  "reaction": {
    "session_id": "session-uuid",
    "stop_id": "stop-uuid",
    "user_id": "uuid-v4",
    "emoji": "❤️"
  }
}
```

---

#### `POST /sessions/:id/complete`

Manually mark journey as complete (owner only, skips final stop check-in requirement).

**Auth:** JWT required + must be session owner

**Request Body:**
```json
{
  "notes": "Amazing evening!"   // optional journey notes
}
```

**Server behavior:**
1. Verify session owner is calling this endpoint
2. **Solo sessions:** `session_members` is never populated for solo sessions (no group). Instead, create a `journey_completions` record directly using `session.journey_id` and the owner's `user_id` — bypassing `session_members` entirely. This avoids the UNIQUE constraint violation on `(user_id, session_id)` via `session_members`.
3. **Group sessions:** Insert into `journey_completions` via the normal member join flow (member is already in `session_members`).
4. Set `session.status = 'completed'`.

**Response 200:** Returns completion record

---

#### `DELETE /sessions/:id/leave`

Leave a group journey (non-owner members only).

**Auth:** JWT required + must be session member (and not owner)

**Response 204:** Left successfully

**Response 400:** Owner cannot leave (must cancel/delete session)

---

#### `DELETE /sessions/:id`

Cancel/delete a session (owner only).

**Auth:** JWT required + must be session owner

**Response 204:** Deleted

---

### User Endpoints

#### `GET /users/:id`

Get public profile of a user.

**Auth:** JWT optional

**Response 200:**
```json
{
  "user": {
    "id": "uuid-v4",
    "display_name": "John Doe",
    "avatar_url": "http://...",
    "role": "creator",
    "created_at": 1744185600
  }
}
```

---

#### `PUT /users/me`

Update the authenticated user's profile.

**Auth:** JWT required

**Request Body:**
```json
{
  "display_name": "Johnny",
  "avatar_url": "http://..."    // optional
}
```

**Response 200:**
```json
{
  "user": { ... updated user ... }
}
```

---

#### `POST /users/me/avatar`

Upload or update the authenticated user's avatar.

**Auth:** JWT required  
**Content-Type:** `multipart/form-data`

**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `avatar` | file | Image file (JPEG/PNG, max 5MB, compressed to 1920px longest edge) |

**Storage:** `/mnt/user/journeytogether/uploads/avatars/{user_id}/avatar.jpg`

**Image compression:** Avatar images are resized to a maximum of 1920px on the longest edge and converted to JPEG at 85% quality before storage.

**Response 200:**
```json
{
  "user": {
    "id": "uuid-v4",
    "avatar_url": "/uploads/avatars/user-uuid/avatar.jpg",
    ...
  }
}
```

---

#### `GET /users/:id/journeys`

Get journeys created by a specific user.

**Auth:** JWT optional (public journeys only)

**Response 200:** Same paginated list shape as `GET /journeys`

---

#### `GET /users/me/history`

Get journey completion history for the authenticated user. Identical to `GET /users/:id/history` but uses the current user's ID from the JWT instead of a path parameter.

**Auth:** JWT required

**Response 200:** Same shape as `GET /users/:id/history`

---

#### `GET /users/:id/history`

Get journey completion history for a user.

**Auth:** JWT required (only the user themselves can see their full history)

**Response 200:**
```json
{
  "completions": [
    {
      "id": "completion-uuid",
      "journey_id": "uuid-v4",
      "journey_title": "Copenhagen Evening Walk",
      "cover_image_url": "http://...",
      "completed_at": 1744185600,
      "duration_minutes": 120,
      "notes": "Amazing evening!",
      "photos": [
        {
          "id": "photo-uuid",
          "photo_url": "http://...",
          "stop_id": "stop-uuid"
        }
      ]
    }
  ]
}
```

---

### Admin Endpoints

#### `PUT /admin/journeys/:id/highlight`

Toggle the highlighted status of a journey.

**Auth:** JWT required + role = `admin`

**Request Body:**
```json
{
  "is_highlighted": true
}
```

**Response 200:**
```json
{
  "journey": { "id": "...", "is_highlighted": true, ... }
}
```

---

### Recap Endpoints

#### `GET /recap/:completionId`

Get the shareable journey recap page data for a completed journey. This endpoint is **public — no authentication required**.

**Response 200:**
```json
{
  "journey": {
    "title": "Copenhagen Evening Walk",
    "description": "A romantic stroll through Nyhavn...",
    "cover_image_url": "http://..."
  },
  "completion": {
    "id": "completion-uuid",
    "duration_minutes": 130,
    "completed_at": 1744185600
  },
  "participants": [
    {
      "user_id": "uuid-v4",
      "display_name": "John Doe",
      "avatar_url": "http://..."
    }
  ],
  "stops": [
    {
      "id": "stop-uuid",
      "order": 0,
      "title": "Nyhavn Harbor",
      "description": "Meet at the canal...",
      "location": { "lat": 55.679, "lng": 12.588, "label": "Nyhavn" },
      "estimated_time": 30,
      "photos": [
        {
          "id": "photo-uuid",
          "photo_url": "http://...",
          "user_id": "uuid-v4"
        }
      ]
    }
  ]
}
```

**Response 404:** Completion not found

> **Memory Reel:** The Memory Reel (photo slideshow at journey completion) is a **client-side feature** — no additional backend endpoints are required. The recap page's `stops[].photos` array provides all photos grouped by stop, which the client renders as a slideshow.

---

## 3. WebSocket Protocol

**Path:** `ws://<host>:<port>/ws/session/:sessionId`  
**Auth:** JWT token passed via `Authorization` header on WebSocket upgrade request (`Authorization: Bearer <jwt>`).  
> ⚠️ **Important:** The JWT must be sent as an HTTP `Authorization` header during the WebSocket upgrade — NOT as a query string parameter. Query string tokens can leak via server-side logs, browser history, and referrer headers.

### Connection Flow

1. Client calls `WebSocket` with the `Authorization` header set:
   ```javascript
   new WebSocket('ws://host:port/ws/session/{sessionId}', {
     headers: { 'Authorization': 'Bearer <jwt>' }
   });
   ```
2. Server extracts `Authorization` header from the upgrade request.
3. Server validates JWT — reject with code 1008 (Policy Violation) if invalid or expired.
4. Server verifies user is a member of the session — reject if not.
5. Server adds connection to a room for `sessionId`.
6. Server sends `session_state` event with current full state.
7. Bidirectional events begin.

### Server → Client Events

#### `session_state` (sent on connect)

```json
{
  "event": "session_state",
  "data": {
    "seq": 42,
    "session": { ... },
    "journey": { ... },
    "members": [ ... ],
    "photos": [ ... ]
  }
}
```

> **`seq`** (sequence number): monotonically increasing integer. Clients should store the last `seq` they processed. On reconnect, if the server's `seq` is more than 1 ahead, the client should refetch full session state via `GET /sessions/:id` to recover missed events.

#### `member_joined`

Broadcast when a new member joins the session.

```json
{
  "event": "member_joined",
  "data": {
    "user_id": "uuid-v4",
    "display_name": "Jane",
    "avatar_url": null,
    "role": "member",
    "current_stop_index": 0,
    "completed_stop_ids": [],
    "joined_at": 1744185600,
    "member_count": 4
  }
}
```

#### `member_left`

Broadcast when a member leaves or is removed.

```json
{
  "event": "member_left",
  "data": {
    "user_id": "uuid-v4",
    "display_name": "Jane",
    "member_count": 3
  }
}
```

#### `stop_completed`

Broadcast when any member completes a stop.

```json
{
  "event": "stop_completed",
  "data": {
    "user_id": "uuid-v4",
    "display_name": "Jane",
    "stop_id": "stop-uuid",
    "stop_index": 2,
    "all_at_stop": 3,
    "total_members": 4,
    "journey_completed": false,
    "new_current_stop_index": 3
  }
}
```

#### `photo_added`

Broadcast when a photo is uploaded to a stop.

```json
{
  "event": "photo_added",
  "data": {
    "photo": {
      "id": "photo-uuid",
      "session_id": "session-uuid",
      "stop_id": "stop-uuid",
      "user_id": "uuid-v4",
      "photo_url": "/uploads/session-id/stop-id/uuid.jpg",
      "created_at": 1744185600
    }
  }
}
```

#### `journey_completed`

Broadcast when the journey is fully completed (all members at final stop).

```json
{
  "event": "journey_completed",
  "data": {
    "session_id": "uuid-v4",
    "completed_at": 1744185600,
    "duration_minutes": 130
  }
}
```

#### `session_paused` / `session_resumed`

```json
{
  "event": "session_paused",
  "data": {
    "paused_by": "uuid-v4",
    "paused_at": 1744185600
  }
}
```

#### `reaction_added`

Broadcast when a member reacts to a stop.

```json
{
  "event": "reaction_added",
  "data": {
    "user_id": "uuid-v4",
    "stop_id": "stop-uuid",
    "emoji": "❤️"
  }
}
```

#### `error`

```json
{
  "event": "error",
  "data": {
    "code": "OUT_OF_RANGE",
    "message": "You are not within range of this stop"
  }
}
```

---

### Client → Server Events

#### `complete_stop`

Request to complete the current stop.

```json
{
  "event": "complete_stop",
  "data": {
    "stop_id": "stop-uuid",
    "lat": 55.679,
    "lng": 12.588
  }
}
```

**Server response:** Confirmed via `stop_completed` event broadcast to all.

#### `leave_session`

Client-initiated leave (same as `DELETE /sessions/:id/leave` but over WS).

```json
{
  "event": "leave_session",
  "data": {}
}
```

---

## 4. File Storage

### Upload Endpoints

- `POST /sessions/:id/photos` — session photo upload
- `POST /sessions/:id/voice-notes` — session voice note upload
- `POST /upload/cover` — journey cover image upload
- `POST /users/me/avatar` — user avatar upload

### Image Compression

All uploaded images (session photos, avatars, covers) are processed with `sharp` before storage:

1. Decode the uploaded image.
2. Resize so the **longest edge is at most 1920px**, maintaining aspect ratio.
3. Encode as JPEG at **85% quality**.
4. Save to the appropriate path.

**Voice notes are stored as-is** — no transcoding or compression is applied to audio files.

This applies regardless of the original image dimensions. Original uploads are not retained.

### Storage Configuration

```typescript
// src/config/storage.ts
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/mnt/user/journeytogether/uploads';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.params.sessionId ?? req.body.session_id ?? 'nosession';
    const stopId = req.body.stop_id || 'nostop';
    const dest = path.join(UPLOAD_DIR, sessionId, stopId);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${id}${ext}`);
  }
});

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});
```

### Naming Convention

```
/mnt/user/journeytogether/uploads/
  {session_id}/
    {stop_id}/
      {photo-uuid}.jpg
  voice-notes/
    {session_id}/
      {stop_id}/
        {uuid}.{ext}          -- m4a / mp3 / wav (stored as-is, no compression)
  avatars/
    {user_id}/
      avatar.jpg              -- always .jpg after compression
  covers/
    {uuid}.jpg
```

- `session_id`: UUID of the active session
- `stop_id`: UUID of the stop (or `'nostop'` if no stop context)
- `photo-uuid`: UUID v4 assigned at upload time

### Static File Serving

Express serves `/uploads/*` as static files from the upload base directory:

```typescript
app.use('/uploads', express.static(process.env.UPLOAD_DIR || '/mnt/user/journeytogether/uploads'));
```

### Cover Image Uploads (Journeys)

For journey cover images, a separate upload endpoint:

`POST /upload/cover` — multipart/form-data, saves to `/mnt/user/journeytogether/uploads/covers/{uuid}.{ext}`.

---

## 5. Auth Flow

### Registration

```
Client                      Server
  |                              |
  |-- POST /auth/register ------>|
  |   {email, password, name}    |
  |                              |--> validate input
  |                              |--> bcrypt.hash(password, 12)
  |                              |--> INSERT users
  |                              |--> generate JWT (HS256, 7d expiry)
  |<-- 201 {token, user} --------|
```

### JWT Structure

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "role": "user",
    "iat": 1744185600,
    "exp": 1744780400
  }
}
```

**Secret:** `process.env.JWT_SECRET` (min 32 chars, stored in environment)  
**Expiry:** 7 days  
**Algorithm:** HS256

### Protected Route Middleware

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  sub: string;       // user id
  email: string;
  role: 'user' | 'creator' | 'admin';
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' }
    });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    });
  }
};

// Optional auth — populates req.user if token present, but doesn't block
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
};

// Role-based guard
export const requireRole = (role: AuthPayload['role']) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: `Requires ${role} role` }
      });
    }
    next();
  };
};
```

### Token Refresh Strategy

- Tokens are long-lived (7 days) and stateless (no refresh token server-side).
- Client stores token in AsyncStorage.
- On 401 response, client redirects to login screen.
- Future enhancement: implement refresh token rotation if session security requirements increase.

### Password Hashing

```typescript
import bcrypt from 'bcrypt';

const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, 12);
};

const verifyPassword = (password: string, hash: string): boolean => {
  return bcrypt.compareSync(password, hash);
};
```

---

## 6. Project Structure

```
journeytogether-2.0/
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Entry point — starts HTTP + WS servers
│   │   ├── app.ts                      # Express app setup (routes, middleware)
│   │   │
│   │   ├── config/
│   │   │   ├── database.ts             # SQLite connection via better-sqlite3
│   │   │   ├── storage.ts              # multer + static file config
│   │   │   └── websocket.ts            # WebSocket room management
│   │   │
│   │   ├── db/
│   │   │   ├── schema.sql              # Full SQLite schema (single source of truth)
│   │   │   ├── migrations/             # Future migration files if schema evolves
│   │   │   │   └── 001_initial.sql
│   │   │   └── seed.ts                 # Optional: seed admin user
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.ts                 # requireAuth, optionalAuth, requireRole
│   │   │   ├── validate.ts             # Request body/query validation (Zod)
│   │   │   ├── errorHandler.ts         # Global Express error handler
│   │   │   ├── upload.ts               # multer upload middleware
│   │   │   └── rateLimit.ts            # Rate limiting (in-memory sliding window)
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.routes.ts          # /auth/*
│   │   │   ├── journey.routes.ts       # /journeys/*
│   │   │   ├── session.routes.ts       # /sessions/*
│   │   │   ├── user.routes.ts          # /users/*
│   │   │   ├── admin.routes.ts         # /admin/*
│   │   │   └── upload.routes.ts        # /upload/cover
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── journey.controller.ts
│   │   │   ├── session.controller.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── admin.controller.ts
│   │   │   └── upload.controller.ts
│   │   │
│   │   ├── services/
│   │   │   ├── auth.service.ts         # register, login, token generation
│   │   │   ├── journey.service.ts      # Journey CRUD + search + fork
│   │   │   ├── session.service.ts      # Session lifecycle + state
│   │   │   ├── sessionMember.service.ts # Member join/leave/progress
│   │   │   ├── geo.service.ts          # Haversine distance check
│   │   │   └── photo.service.ts        # Photo URL generation + image compression
│   │   │
│   │   ├── websocket/
│   │   │   ├── handler.ts              # WebSocket event router
│   │   │   ├── sessionRoom.ts          # Room management (join/leave/broadcast)
│   │   │   └── events.ts               # Event type definitions + emitters
│   │   │
│   │   └── types/
│   │       ├── models.ts              # Core domain type interfaces (User, Journey, Stop, Session, etc.)
│   │       ├── api.ts                  # API request/response type shapes
│   │       └── websocket.ts            # WS event payload types
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── frontend/                          # (owned by mobile team)
└── SPEC.md
```

---

## 7. Dependencies

### `package.json`

```json
{
  "name": "journeytogether-backend",
  "version": "1.0.0",
  "description": "JourneyTogether 2.0 Backend API",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:init": "tsx src/db/init.ts"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "better-sqlite3": "^11.7.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.5",
    "uuid": "^11.0.5",
    "ws": "^8.18.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/better-sqlite3": "^7.6.12",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.10.5",
    "@types/uuid": "^10.0.0",
    "@types/ws": "^8.5.13",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Dependency Rationale

| Package | Version | Purpose |
|---------|---------|---------|
| `better-sqlite3` | ^11.7.0 | Synchronous SQLite — no ORM, direct SQL, minimal overhead |
| `bcrypt` | ^5.1.1 | Password hashing (bcrypt, cost factor 12) |
| `jsonwebtoken` | ^9.0.2 | JWT signing and verification |
| `ws` | ^8.18.0 | Fast WebSocket server (no Socket.IO overhead) |
| `multer` | ^1.4.5-lts.1 | Multipart file upload handling |
| `sharp` | ^0.33.5 | High-performance image resizing/compression (1920px max edge) |
| `uuid` | ^11.0.5 | UUID v4 generation |
| `dotenv` | ^16.4.7 | Environment variable loading |
| `cors` | ^2.8.5 | Cross-origin resource sharing (for dev/admin access) |
| `zod` | ^3.24.1 | Runtime schema validation for request bodies/queries |
| `tsx` | ^4.19.2 | TypeScript execution without compile step (dev) |
| `@types/*` | (matching versions) | TypeScript type definitions |

---

## Implementation Notes

### Database Initialization

On first start, the app runs `db/migrations/001_initial.sql` if the SQLite file doesn't exist:

```typescript
// src/db/init.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || '/mnt/user/journeytogether/data.db';
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export const initDb = () => {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const db = new Database(DB_PATH);
  // Always set recommended PRAGMAs on every new connection
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.exec(schema);
  db.close();
  console.log('Database initialized at', DB_PATH);
};

initDb();
```

### Image Compression with Sharp

```typescript
// src/services/photo.service.ts
import sharp from 'sharp';

const MAX_EDGE = 1920;
const JPEG_QUALITY = 85;

export const compressImage = async (
  inputBuffer: Buffer,
  outputPath: string
): Promise<void> => {
  await sharp(inputBuffer)
    .resize(MAX_EDGE, MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outputPath);
};
```

### Invite Code Rate Limiting

```typescript
// src/middleware/rateLimit.ts
// In-memory sliding window: 5 join attempts per minute per IP

interface WindowEntry {
  count: number;
  resetAt: number; // unix timestamp when window resets
}

const windows = new Map<string, WindowEntry>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_ATTEMPTS = 5;

export const inviteCodeRateLimit = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = windows.get(ip);

  if (!entry || now > entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (entry.count >= MAX_ATTEMPTS) {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many join attempts. Please wait before trying again.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      },
    });
    return;
  }

  entry.count++;
  next();
};
```

### Key Files & Responsibilities

| File | Responsibility |
|------|----------------|
| `src/index.ts` | HTTP server + WebSocket server bootstrap |
| `src/app.ts` | Express app: middleware, route registration |
| `src/config/database.ts` | `better-sqlite3` instance export (singleton, PRAGMAs set here) |
| `src/websocket/sessionRoom.ts` | In-memory room map: `Map<sessionId, Set<WebSocket>>` |
| `src/services/geo.service.ts` | Haversine formula for GPS proximity check (~100m radius) |
| `src/services/photo.service.ts` | Image compression with `sharp`, URL generation |
| `src/routes/*.ts` | Route definitions (no business logic) |
| `src/controllers/*.ts` | Request handling, calls services, returns responses |
| `src/services/*.ts` | All business logic, SQL queries, state transitions |

### Invite Code Generation

```typescript
// src/services/session.service.ts
import { randomBytes } from 'crypto';

const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit confusing chars (0/O, 1/I)
  const bytes = randomBytes(6);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
};
```

### Haversine Distance Check

```typescript
// src/services/geo.service.ts
const HAVERSINE_RADIUS_M = 6371000; // Earth radius in meters

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return HAVERSINE_RADIUS_M * c;
}

export const isWithinRange = (
  userLat: number, userLng: number,
  stopLat: number, stopLng: number,
  radiusM = 100
): boolean => {
  return haversineM(userLat, userLng, stopLat, stopLng) <= radiusM;
};
```

### Spontaneous Mode — Nearby Journeys Query (Haversine SQL)

For `GET /journeys?lat=&lng=&radius_km=`, filter journeys that have at least one stop within the given radius using the Haversine formula directly in SQL:

```sql
-- Find public journeys with at least one stop within radius_km of (lat, lng)
SELECT DISTINCT j.*
FROM journeys j
JOIN stops s ON s.journey_id = j.id
WHERE j.is_public = 1
  AND (
    6371 * acos(
      cos(radians(:lat)) * cos(radians(s.location_lat)) *
      cos(radians(s.location_lng) - radians(:lng)) +
      sin(radians(:lat)) * sin(radians(s.location_lat))
    )
  ) <= :radius_km
ORDER BY (
  SELECT MIN(
    6371 * acos(
      cos(radians(:lat)) * cos(radians(s2.location_lat)) *
      cos(radians(s2.location_lng) - radians(:lng)) +
      sin(radians(:lat)) * sin(radians(s2.location_lat))
    )
  )
  FROM stops s2
  WHERE s2.journey_id = j.id
) ASC;
```

> **6371** is Earth's radius in kilometers. Convert to miles by using **3959** instead. For meters, use **6371000** and express `radius_km` in meters.
>
> For best performance, add a composite index on `stops(journey_id, location_lat, location_lng)` if not already present.

### Docker Compose (Backend)

```yaml
# docker-compose.yml
version: '3.9'
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: journeytogether-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=${JWT_SECRET}
      - DB_PATH=/data/journeytogether.db
      - UPLOAD_DIR=/uploads
    volumes:
      - journeytogether-data:/data
      - journeytogether-uploads:/uploads
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  journeytogether-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/user/journeytogether
  journeytogether-uploads:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/user/journeytogether/uploads
```

### Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "dist/index.js"]
# For dev: CMD ["npx", "tsx", "watch", "src/index.ts"]
```

### Environment Variables

```bash
# .env.example
NODE_ENV=development
PORT=3000

# JWT — use a long random string in production (e.g. openssl rand -hex 64)
JWT_SECRET=change-me-in-production

# Paths (mount these to Unraid shares in Docker Compose)
DB_PATH=/mnt/user/journeytogether/data.db
UPLOAD_DIR=/mnt/user/journeytogether/uploads
```

### Health Check Endpoint

```typescript
// GET /health — no auth, no version prefix
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Math.floor(Date.now() / 1000) });
});
```

---

*End of Plan*
