// Journey and Stop types from PLAN-FRONTEND.md

export interface JourneyLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface Stop {
  id: string;
  journey_id: string;
  order: number;
  title: string;
  description: string;
  location: JourneyLocation;
  estimated_time: number; // minutes
  tips: string[];
  photo_requirement: boolean;
  voice_note_url: string | null;
}

export interface Journey {
  id: string;
  journey_id: string; // denormalized, matches id
  title: string;
  description: string;
  cover_image_url: string | null;
  tags: string[];
  duration_label: string;
  is_public: boolean;
  is_highlighted: boolean;
  created_by: string;
  forked_from_id: string | null;
  forked_from_title?: string | null; // populated when journey is forked
  stops: Stop[];
  created_at: string;
  updated_at: string;
}

export interface CreateJourneyInput {
  title: string;
  description?: string;
  cover_image_url?: string;
  tags?: string[];
  duration_label?: string;
  is_public?: boolean;
  stops?: Omit<Stop, 'id' | 'journey_id'>[];
}

// Session types (Sprint 3: Active Journey)
export interface SessionStop {
  id: string;
  title: string;
  description?: string;
  location?: JourneyLocation;
  estimated_time: number;
  tips: string[];
  checked_in_at: string | null; // ISO timestamp when checked in, null if not yet
}

export interface Session {
  id: string;
  journey: Journey;
  stops: SessionStop[];
  current_stop_index: number;
  status: 'active' | 'completed' | 'abandoned';
  started_at: string;
  updated_at: string;
}
