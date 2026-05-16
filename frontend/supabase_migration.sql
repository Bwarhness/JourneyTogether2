-- ============================================================
-- JourneyTogether 2.0 — PostgreSQL Schema for Supabase
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------
-- users (managed by Supabase Auth, this is for profile extension)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'creator', 'admin')),
  completion_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------
-- journeys
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journeys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_label  TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT true,
  is_highlighted  BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  forked_from_id  UUID REFERENCES public.journeys(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journeys_created_by ON journeys(created_by);
CREATE INDEX IF NOT EXISTS idx_journeys_is_public ON journeys(is_public);
CREATE INDEX IF NOT EXISTS idx_journeys_is_highlighted ON journeys(is_highlighted);
CREATE INDEX IF NOT EXISTS idx_journeys_forked_from ON journeys(forked_from_id);

-- ----------------------------------------------------------
-- stops
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stops (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id        UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  "order"           INTEGER NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  location_lat      DOUBLE PRECISION NOT NULL,
  location_lng      DOUBLE PRECISION NOT NULL,
  location_label    TEXT,
  estimated_time    INTEGER,
  tips              JSONB NOT NULL DEFAULT '[]'::jsonb,
  photo_required    BOOLEAN NOT NULL DEFAULT false,
  voice_note_url    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (journey_id, "order")
);

CREATE INDEX IF NOT EXISTS idx_stops_journey_id ON stops(journey_id);

-- ----------------------------------------------------------
-- active_sessions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id         UUID NOT NULL REFERENCES public.journeys(id),
  owner_id           UUID NOT NULL REFERENCES public.profiles(id),
  invite_code        TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'waiting'
                       CHECK (status IN ('waiting', 'active', 'paused', 'completed')),
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  is_group           BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_journey_id ON active_sessions(journey_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_owner_id ON active_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_invite_code ON active_sessions(invite_code);
CREATE INDEX IF NOT EXISTS idx_active_sessions_status ON active_sessions(status);

-- ----------------------------------------------------------
-- session_members
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_members (
  session_id         UUID NOT NULL REFERENCES public.active_sessions(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES public.profiles(id),
  role               TEXT NOT NULL DEFAULT 'member'
                       CHECK (role IN ('owner', 'member')),
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  completed_stop_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_members_user_id ON session_members(user_id);

-- ----------------------------------------------------------
-- session_member_reactions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_member_reactions (
  session_id UUID NOT NULL REFERENCES public.active_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id),
  stop_id    UUID NOT NULL REFERENCES public.stops(id),
  emoji      TEXT NOT NULL
                CHECK (emoji IN ('❤️', '🔥', '😄')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id, stop_id)
);

-- ----------------------------------------------------------
-- session_photos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_photos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES public.active_sessions(id) ON DELETE CASCADE,
  stop_id      UUID NOT NULL REFERENCES public.stops(id),
  user_id      UUID NOT NULL REFERENCES public.profiles(id),
  photo_url    TEXT NOT NULL,
  storage_path TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_photos_session_id ON session_photos(session_id);
CREATE INDEX IF NOT EXISTS idx_session_photos_stop_id ON session_photos(stop_id);

-- ----------------------------------------------------------
-- journey_completions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journey_completions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id),
  journey_id       UUID NOT NULL REFERENCES public.journeys(id),
  session_id       UUID REFERENCES public.active_sessions(id),
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_minutes INTEGER,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_completions_user_id ON journey_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_journey_id ON journey_completions(journey_id);

-- ----------------------------------------------------------
-- completion_photos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.completion_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  completion_id UUID NOT NULL REFERENCES public.journey_completions(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  stop_id       UUID REFERENCES public.stops(id),
  storage_path  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_completion_photos_completion_id ON completion_photos(completion_id);

-- ----------------------------------------------------------
-- journey_reactions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journey_reactions (
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id),
  emoji      TEXT NOT NULL
               CHECK (emoji IN ('❤️', '🔥', '🌟', '😍', '🚀')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (journey_id, user_id)
);

-- ----------------------------------------------------------
-- spontaneous_sessions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spontaneous_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spontaneous_sessions_user_id ON spontaneous_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_spontaneous_sessions_status ON spontaneous_sessions(status);

-- ----------------------------------------------------------
-- spontaneous_stops
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spontaneous_stops (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES public.spontaneous_sessions(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  location_lat    DOUBLE PRECISION NOT NULL,
  location_lng    DOUBLE PRECISION NOT NULL,
  location_label  TEXT,
  checked_in_at   TIMESTAMPTZ,
  voice_note_url  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spontaneous_stops_session_id ON spontaneous_stops(session_id);

-- ----------------------------------------------------------
-- Enable Realtime for all tables
-- ----------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journeys;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stops;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_member_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_completions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.completion_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.spontaneous_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.spontaneous_stops;

-- ----------------------------------------------------------
-- Row Level Security Policies
-- ----------------------------------------------------------

-- Profiles: Users can read all profiles, update only their own
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Journeys: Public journeys viewable by all, users can CRUD their own
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public journeys are viewable by everyone"
  ON public.journeys FOR SELECT
  USING (is_public = true OR auth.uid() = created_by);

CREATE POLICY "Users can insert journeys"
  ON public.journeys FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own journeys"
  ON public.journeys FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own journeys"
  ON public.journeys FOR DELETE
  USING (auth.uid() = created_by);

-- Stops: Viewable if journey is accessible, CRUD by journey creator
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stops viewable if journey is accessible"
  ON public.stops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.journeys j 
      WHERE j.id = journey_id AND (j.is_public = true OR j.created_by = auth.uid())
    )
  );

CREATE POLICY "Users can insert stops for own journeys"
  ON public.stops FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journeys j 
      WHERE j.id = journey_id AND j.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update stops for own journeys"
  ON public.stops FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.journeys j 
      WHERE j.id = journey_id AND j.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete stops for own journeys"
  ON public.stops FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.journeys j 
      WHERE j.id = journey_id AND j.created_by = auth.uid()
    )
  );

-- Active Sessions: Members can view, owner can CRUD
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session members can view session"
  ON public.active_sessions FOR SELECT
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.session_members sm 
      WHERE sm.session_id = id AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own sessions"
  ON public.active_sessions FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Session owners can update"
  ON public.active_sessions FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Session owners can delete"
  ON public.active_sessions FOR DELETE
  USING (owner_id = auth.uid());

-- Session Members: Members can view, owner can manage
ALTER TABLE public.session_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session members can view members"
  ON public.session_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.active_sessions a 
      WHERE a.id = session_id AND a.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can join sessions"
  ON public.session_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Session owners can remove members"
  ON public.session_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.active_sessions a 
      WHERE a.id = session_id AND a.owner_id = auth.uid()
    )
  );

-- Session Photos: Members can view, participants can insert
ALTER TABLE public.session_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session members can view photos"
  ON public.session_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_members sm 
      WHERE sm.session_id = session_id AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Session members can insert photos"
  ON public.session_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_members sm 
      WHERE sm.session_id = session_id AND sm.user_id = auth.uid()
    )
  );

-- Journey Completions: Users can view own, insert own
ALTER TABLE public.journey_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completions"
  ON public.journey_completions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own completions"
  ON public.journey_completions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Journey Reactions: Everyone can view, authenticated users can react
ALTER TABLE public.journey_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Journey reactions are viewable by everyone"
  ON public.journey_reactions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can react to journeys"
  ON public.journey_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions"
  ON public.journey_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Spontaneous Sessions: Owner can CRUD
ALTER TABLE public.spontaneous_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own spontaneous sessions"
  ON public.spontaneous_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own spontaneous sessions"
  ON public.spontaneous_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own spontaneous sessions"
  ON public.spontaneous_sessions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own spontaneous sessions"
  ON public.spontaneous_sessions FOR DELETE
  USING (user_id = auth.uid());

-- Spontaneous Stops: Viewable/CRUD by session owner
ALTER TABLE public.spontaneous_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own spontaneous stops"
  ON public.spontaneous_stops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.spontaneous_sessions ss 
      WHERE ss.id = session_id AND ss.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert stops for own sessions"
  ON public.spontaneous_stops FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.spontaneous_sessions ss 
      WHERE ss.id = session_id AND ss.user_id = auth.uid()
    )
  );
