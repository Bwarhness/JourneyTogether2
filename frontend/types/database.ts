// Supabase Database Types for JourneyTogether 2.0 Frontend
// Generated from backend schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_url: string | null;
          role: 'user' | 'creator' | 'admin';
          completion_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          avatar_url?: string | null;
          role?: 'user' | 'creator' | 'admin';
          completion_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          avatar_url?: string | null;
          role?: 'user' | 'creator' | 'admin';
          completion_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      journeys: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          cover_image_url: string | null;
          tags: Json;
          duration_label: string | null;
          is_public: boolean;
          is_highlighted: boolean;
          created_by: string;
          forked_from_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          cover_image_url?: string | null;
          tags?: Json;
          duration_label?: string | null;
          is_public?: boolean;
          is_highlighted?: boolean;
          created_by: string;
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          cover_image_url?: string | null;
          tags?: Json;
          duration_label?: string | null;
          is_public?: boolean;
          is_highlighted?: boolean;
          created_by?: string;
          forked_from_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      stops: {
        Row: {
          id: string;
          journey_id: string;
          order: number;
          title: string;
          description: string | null;
          location_lat: number;
          location_lng: number;
          location_label: string | null;
          estimated_time: number | null;
          tips: Json;
          photo_required: boolean;
          voice_note_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          journey_id: string;
          order: number;
          title: string;
          description?: string | null;
          location_lat: number;
          location_lng: number;
          location_label?: string | null;
          estimated_time?: number | null;
          tips?: Json;
          photo_required?: boolean;
          voice_note_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          journey_id?: string;
          order?: number;
          title?: string;
          description?: string | null;
          location_lat?: number;
          location_lng?: number;
          location_label?: string | null;
          estimated_time?: number | null;
          tips?: Json;
          photo_required?: boolean;
          voice_note_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      active_sessions: {
        Row: {
          id: string;
          journey_id: string;
          owner_id: string;
          invite_code: string;
          status: 'waiting' | 'active' | 'paused' | 'completed';
          current_stop_index: number;
          is_group: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          journey_id: string;
          owner_id: string;
          invite_code: string;
          status?: 'waiting' | 'active' | 'paused' | 'completed';
          current_stop_index?: number;
          is_group?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          journey_id?: string;
          owner_id?: string;
          invite_code?: string;
          status?: 'waiting' | 'active' | 'paused' | 'completed';
          current_stop_index?: number;
          is_group?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      session_members: {
        Row: {
          session_id: string;
          user_id: string;
          role: 'owner' | 'member';
          current_stop_index: number;
          completed_stop_ids: Json;
          joined_at: string;
        };
        Insert: {
          session_id: string;
          user_id: string;
          role?: 'owner' | 'member';
          current_stop_index?: number;
          completed_stop_ids?: Json;
          joined_at?: string;
        };
        Update: {
          session_id?: string;
          user_id?: string;
          role?: 'owner' | 'member';
          current_stop_index?: number;
          completed_stop_ids?: Json;
          joined_at?: string;
        };
      };
      session_member_reactions: {
        Row: {
          session_id: string;
          user_id: string;
          stop_id: string;
          emoji: '❤️' | '🔥' | '😄';
          created_at: string;
        };
        Insert: {
          session_id: string;
          user_id: string;
          stop_id: string;
          emoji: '❤️' | '🔥' | '😄';
          created_at?: string;
        };
        Update: {
          session_id?: string;
          user_id?: string;
          stop_id?: string;
          emoji?: '❤️' | '🔥' | '😄';
          created_at?: string;
        };
      };
      session_photos: {
        Row: {
          id: string;
          session_id: string;
          stop_id: string;
          user_id: string;
          photo_url: string;
          storage_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          stop_id: string;
          user_id: string;
          photo_url: string;
          storage_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          stop_id?: string;
          user_id?: string;
          photo_url?: string;
          storage_path?: string | null;
          created_at?: string;
        };
      };
      journey_completions: {
        Row: {
          id: string;
          user_id: string;
          journey_id: string;
          session_id: string | null;
          completed_at: string;
          duration_minutes: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          journey_id: string;
          session_id?: string | null;
          completed_at?: string;
          duration_minutes?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          journey_id?: string;
          session_id?: string | null;
          completed_at?: string;
          duration_minutes?: number | null;
          notes?: string | null;
          created_at?: string;
        };
      };
      completion_photos: {
        Row: {
          id: string;
          completion_id: string;
          photo_url: string;
          stop_id: string | null;
          storage_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          completion_id: string;
          photo_url: string;
          stop_id?: string | null;
          storage_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          completion_id?: string;
          photo_url?: string;
          stop_id?: string | null;
          storage_path?: string | null;
          created_at?: string;
        };
      };
      journey_reactions: {
        Row: {
          journey_id: string;
          user_id: string;
          emoji: '❤️' | '🔥' | '🌟' | '😍' | '🚀';
          created_at: string;
        };
        Insert: {
          journey_id: string;
          user_id: string;
          emoji: '❤️' | '🔥' | '🌟' | '😍' | '🚀';
          created_at?: string;
        };
        Update: {
          journey_id?: string;
          user_id?: string;
          emoji?: '❤️' | '🔥' | '🌟' | '😍' | '🚀';
          created_at?: string;
        };
      };
      spontaneous_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          status: 'active' | 'completed' | 'abandoned';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          status?: 'active' | 'completed' | 'abandoned';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          status?: 'active' | 'completed' | 'abandoned';
          created_at?: string;
          updated_at?: string;
        };
      };
      spontaneous_stops: {
        Row: {
          id: string;
          session_id: string;
          title: string;
          location_lat: number;
          location_lng: number;
          location_label: string | null;
          checked_in_at: string | null;
          voice_note_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          title: string;
          location_lat: number;
          location_lng: number;
          location_label?: string | null;
          checked_in_at?: string | null;
          voice_note_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          title?: string;
          location_lat?: number;
          location_lng?: number;
          location_label?: string | null;
          checked_in_at?: string | null;
          voice_note_url?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Journey = Database['public']['Tables']['journeys']['Row'];
export type Stop = Database['public']['Tables']['stops']['Row'];
export type ActiveSession = Database['public']['Tables']['active_sessions']['Row'];
export type SessionMember = Database['public']['Tables']['session_members']['Row'];
export type SessionReaction = Database['public']['Tables']['session_member_reactions']['Row'];
export type SessionPhoto = Database['public']['Tables']['session_photos']['Row'];
export type JourneyCompletion = Database['public']['Tables']['journey_completions']['Row'];
export type JourneyReaction = Database['public']['Tables']['journey_reactions']['Row'];
export type SpontaneousSession = Database['public']['Tables']['spontaneous_sessions']['Row'];
export type SpontaneousStop = Database['public']['Tables']['spontaneous_stops']['Row'];
