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
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'creator', 'admin')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

CREATE TRIGGER IF NOT EXISTS users_au AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = unixepoch() WHERE id = old.id;
END;

-- ----------------------------------------------------------
-- journeys
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS journeys (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',
  duration_label  TEXT,
  is_public       INTEGER NOT NULL DEFAULT 1,
  is_highlighted  INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT NOT NULL REFERENCES users(id),
  forked_from_id  TEXT REFERENCES journeys(id),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_journeys_created_by   ON journeys(created_by);
CREATE INDEX IF NOT EXISTS idx_journeys_is_public    ON journeys(is_public);
CREATE INDEX IF NOT EXISTS idx_journeys_is_highlighted ON journeys(is_highlighted);
CREATE INDEX IF NOT EXISTS idx_journeys_forked_from  ON journeys(forked_from_id);

-- ----------------------------------------------------------
-- stops
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS stops (
  id                TEXT PRIMARY KEY,
  journey_id        TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  "order"           INTEGER NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  location_lat      REAL NOT NULL,
  location_lng      REAL NOT NULL,
  location_label    TEXT,
  estimated_time    INTEGER,
  tips              TEXT NOT NULL DEFAULT '[]',
  photo_required    INTEGER NOT NULL DEFAULT 0,
  voice_note_url    TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (journey_id, "order")
);

CREATE INDEX IF NOT EXISTS idx_stops_journey_id ON stops(journey_id);

CREATE TRIGGER IF NOT EXISTS stops_au AFTER UPDATE ON stops BEGIN
  UPDATE stops SET updated_at = unixepoch() WHERE id = old.id;
END;

-- ----------------------------------------------------------
-- active_sessions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_sessions (
  id                 TEXT PRIMARY KEY,
  journey_id         TEXT NOT NULL REFERENCES journeys(id),
  owner_id           TEXT NOT NULL REFERENCES users(id),
  invite_code        TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'waiting'
                       CHECK (status IN ('waiting', 'active', 'paused', 'completed')),
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  is_group           INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_journey_id ON active_sessions(journey_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_owner_id   ON active_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_invite_code ON active_sessions(invite_code);
CREATE INDEX IF NOT EXISTS idx_active_sessions_status     ON active_sessions(status);

CREATE TRIGGER IF NOT EXISTS active_sessions_au AFTER UPDATE ON active_sessions BEGIN
  UPDATE active_sessions SET updated_at = unixepoch() WHERE id = old.id;
END;

-- ----------------------------------------------------------
-- session_members
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_members (
  session_id         TEXT NOT NULL REFERENCES active_sessions(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id),
  role               TEXT NOT NULL DEFAULT 'member'
                       CHECK (role IN ('owner', 'member')),
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  completed_stop_ids TEXT NOT NULL DEFAULT '[]',
  joined_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_members_user_id ON session_members(user_id);

-- ----------------------------------------------------------
-- session_member_reactions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_member_reactions (
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
CREATE TABLE IF NOT EXISTS session_photos (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES active_sessions(id) ON DELETE CASCADE,
  stop_id      TEXT NOT NULL REFERENCES stops(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  photo_url    TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_session_photos_session_id ON session_photos(session_id);
CREATE INDEX IF NOT EXISTS idx_session_photos_stop_id    ON session_photos(stop_id);

-- ----------------------------------------------------------
-- journey_completions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS journey_completions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  journey_id      TEXT NOT NULL REFERENCES journeys(id),
  session_id      TEXT REFERENCES active_sessions(id),
  completed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  duration_minutes INTEGER,
  notes           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_completions_user_id    ON journey_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_journey_id ON journey_completions(journey_id);

-- ----------------------------------------------------------
-- completion_photos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS completion_photos (
  id              TEXT PRIMARY KEY,
  completion_id   TEXT NOT NULL REFERENCES journey_completions(id) ON DELETE CASCADE,
  photo_url       TEXT NOT NULL,
  stop_id         TEXT REFERENCES stops(id),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_completion_photos_completion_id ON completion_photos(completion_id);

-- ----------------------------------------------------------
-- journey_reactions (frontend expects journey-level reactions)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS journey_reactions (
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  emoji      TEXT NOT NULL
               CHECK (emoji IN ('❤️', '🔥', '🌟', '😍', '🚀')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (journey_id, user_id)
);

-- ----------------------------------------------------------
-- spontaneous_sessions (sessions without a predefined journey)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS spontaneous_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_spontaneous_sessions_user_id ON spontaneous_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_spontaneous_sessions_status ON spontaneous_sessions(status);

CREATE TRIGGER IF NOT EXISTS spontaneous_sessions_au AFTER UPDATE ON spontaneous_sessions BEGIN
  UPDATE spontaneous_sessions SET updated_at = unixepoch() WHERE id = old.id;
END;

-- ----------------------------------------------------------
-- spontaneous_stops
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS spontaneous_stops (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES spontaneous_sessions(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  location_lat     REAL NOT NULL,
  location_lng     REAL NOT NULL,
  location_label   TEXT,
  checked_in_at    INTEGER,
  voice_note_url   TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_spontaneous_stops_session_id ON spontaneous_stops(session_id);
