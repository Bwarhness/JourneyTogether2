/**
 * JourneyTogether 2.0 - Supabase API Client
 * 
 * Direct Supabase integration - no backend needed!
 * All operations use Supabase Auth, Database, Realtime, and Storage.
 */

import { getSupabaseClient } from '../lib/supabase';
import type { Database, Json, Journey, Stop, Profile, ActiveSession, SessionMember } from '../types/database';

const STORAGE_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET || 'journey-uploads';

// ─────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string, displayName: string) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getUser() {
  const supabase = getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function resetPassword(email: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'journeytogether://auth/reset-password', // Deep link for mobile
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateProfile(updates: { display_name?: string; avatar_url?: string }) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserProfileWithStats(userId: string) {
  const supabase = getSupabaseClient();
  
  // Get profile
  const profile = await getProfile(userId);
  
  // Get journey count
  const { count: journeyCount } = await supabase
    .from('journeys')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', userId);

  return {
    ...profile,
    journey_count: journeyCount || 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Journeys
// ─────────────────────────────────────────────────────────────

export async function getJourneys(filters?: {
  created_by?: string;
  is_public?: boolean;
  is_highlighted?: boolean;
  tag?: string;
  search?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
}) {
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('journeys')
    .select(`
      *,
      profiles!journeys_created_by_fkey(display_name, avatar_url)
    `);

  if (filters?.created_by) {
    query = query.eq('created_by', filters.created_by);
  }
  if (filters?.is_public !== undefined) {
    query = query.eq('is_public', filters.is_public);
  }
  if (filters?.is_highlighted) {
    query = query.eq('is_highlighted', true);
  }
  if (filters?.tag) {
    query = query.contains('tags', [filters.tag]);
  }
  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getJourneyById(journeyId: string) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('journeys')
    .select(`
      *,
      profiles!journeys_created_by_fkey(display_name, avatar_url),
      stops(*)
    `)
    .eq('id', journeyId)
    .single();

  if (error) throw error;
  return data;
}

export async function createJourney(input: {
  title: string;
  description?: string;
  cover_image_url?: string;
  tags?: string[];
  duration_label?: string;
  is_public?: boolean;
  stops?: Array<{
    title: string;
    description?: string;
    location: { lat: number; lng: number; label?: string };
    estimated_time?: number;
    tips?: string[];
    photo_required?: boolean;
  }>;
}) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  const { data: journey, error } = await supabase
    .from('journeys')
    .insert({
      title: input.title,
      description: input.description,
      cover_image_url: input.cover_image_url,
      tags: (input.tags || []) as Json,
      duration_label: input.duration_label,
      is_public: input.is_public ?? true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;

  // Create stops if provided
  if (input.stops && input.stops.length > 0) {
    const stopsToInsert = input.stops.map((stop, index) => ({
      journey_id: journey.id,
      order: index,
      title: stop.title,
      description: stop.description,
      location_lat: stop.location.lat,
      location_lng: stop.location.lng,
      location_label: stop.location.label,
      estimated_time: stop.estimated_time,
      tips: (stop.tips || []) as Json,
      photo_required: stop.photo_required ?? false,
    }));

    const { error: stopsError } = await supabase
      .from('stops')
      .insert(stopsToInsert);

    if (stopsError) throw stopsError;
  }

  return getJourneyById(journey.id);
}

export async function updateJourney(journeyId: string, updates: {
  title?: string;
  description?: string;
  cover_image_url?: string;
  tags?: string[];
  duration_label?: string;
  is_public?: boolean;
}) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('journeys')
    .update(updates)
    .eq('id', journeyId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteJourney(journeyId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('journeys')
    .delete()
    .eq('id', journeyId);

  if (error) throw error;
}

export async function forkJourney(journeyId: string) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  // Get original journey
  const original = await getJourneyById(journeyId);

  // Create forked journey
  const { data: forked } = await supabase
    .from('journeys')
    .insert({
      title: `${original.title} (Fork)`,
      description: original.description,
      cover_image_url: original.cover_image_url,
      tags: original.tags,
      duration_label: original.duration_label,
      is_public: true,
      created_by: user.id,
      forked_from_id: journeyId,
    })
    .select()
    .single();

  // Copy stops
  if (original.stops && Array.isArray(original.stops)) {
    const stopsToInsert = original.stops.map((stop: any, index: number) => ({
      journey_id: forked.id,
      order: index,
      title: stop.title,
      description: stop.description,
      location_lat: stop.location_lat,
      location_lng: stop.location_lng,
      location_label: stop.location_label,
      estimated_time: stop.estimated_time,
      tips: stop.tips,
      photo_required: stop.photo_required,
    }));

    await supabase.from('stops').insert(stopsToInsert);
  }

  return getJourneyById(forked.id);
}

// ─────────────────────────────────────────────────────────────
// Stops
// ─────────────────────────────────────────────────────────────

export async function updateJourneyStops(journeyId: string, stops: Array<{
  id?: string;
  title: string;
  description?: string;
  location: { lat: number; lng: number; label?: string };
  estimated_time?: number;
  tips?: string[];
  photo_required?: boolean;
  order?: number;
}>) {
  const supabase = getSupabaseClient();

  // Delete existing stops
  await supabase.from('stops').delete().eq('journey_id', journeyId);

  // Insert new stops
  const stopsToInsert = stops.map((stop, index) => ({
    journey_id: journeyId,
    order: stop.order ?? index,
    title: stop.title,
    description: stop.description,
    location_lat: stop.location.lat,
    location_lng: stop.location.lng,
    location_label: stop.location.label,
    estimated_time: stop.estimated_time,
    tips: (stop.tips || []) as Json,
    photo_required: stop.photo_required ?? false,
  }));

  const { data, error } = await supabase
    .from('stops')
    .insert(stopsToInsert)
    .select();

  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function startSoloSession(journeyId: string) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  // Check for existing active session
  const { data: existing } = await supabase
    .from('active_sessions')
    .select('id')
    .eq('owner_id', user.id)
    .eq('journey_id', journeyId)
    .neq('status', 'completed')
    .eq('is_group', false)
    .limit(1)
    .single();

  if (existing) {
    throw new Error('Active session already exists');
  }

  const sessionId = crypto.randomUUID();
  const inviteCode = generateInviteCode();

  // Create session
  const { data: session } = await supabase
    .from('active_sessions')
    .insert({
      id: sessionId,
      journey_id: journeyId,
      owner_id: user.id,
      invite_code: inviteCode,
      status: 'active',
      current_stop_index: 0,
      is_group: false,
    })
    .select()
    .single();

  // Add owner as member
  await supabase
    .from('session_members')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      role: 'owner',
      current_stop_index: 0,
      completed_stop_ids: [],
    });

  // Get stops
  const { data: stops } = await supabase
    .from('stops')
    .select('*')
    .eq('journey_id', journeyId)
    .order('order', { ascending: true });

  return { ...session, stops };
}

export async function getActiveSession() {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  const { data: session } = await supabase
    .from('active_sessions')
    .select(`
      *,
      journeys!inner(title)
    `)
    .eq('owner_id', user.id)
    .eq('is_group', false)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!session) return null;

  const { data: stops } = await supabase
    .from('stops')
    .select('*')
    .eq('journey_id', session.journey_id)
    .order('order', { ascending: true });

  const { data: member } = await supabase
    .from('session_members')
    .select('*')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .single();

  return { ...session, stops, member };
}

export async function completeStop(sessionId: string, stopId: string) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  // Get session
  const { data: session } = await supabase
    .from('active_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) throw new Error('Session not found');
  if (session.owner_id !== user.id) throw new Error('Access denied');

  // Update completed stops
  const { data: member } = await supabase
    .from('session_members')
    .select('completed_stop_ids')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .single();

  const completedIds = Array.isArray(member?.completed_stop_ids)
    ? member.completed_stop_ids
    : [];

  if (!completedIds.includes(stopId)) {
    completedIds.push(stopId);
    await supabase
      .from('session_members')
      .update({ completed_stop_ids: completedIds })
      .eq('session_id', sessionId)
      .eq('user_id', user.id);
  }

  // Advance to next stop
  const { data: updatedSession } = await supabase
    .from('active_sessions')
    .update({ current_stop_index: session.current_stop_index + 1 })
    .eq('id', sessionId)
    .select()
    .single();

  return updatedSession;
}

export async function endSession(sessionId: string) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  // Get session
  const { data: session } = await supabase
    .from('active_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (!session) throw new Error('Session not found');

  // Mark as completed
  await supabase
    .from('active_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);

  // Create completion record
  const startTime = new Date(session.created_at).getTime();
  const durationMinutes = Math.floor((Date.now() - startTime) / 60000);

  await supabase
    .from('journey_completions')
    .insert({
      user_id: user.id,
      journey_id: session.journey_id,
      session_id: sessionId,
      duration_minutes: durationMinutes,
    });

  return { success: true, duration_minutes: durationMinutes };
}

// ─────────────────────────────────────────────────────────────
// Journey Reactions
// ─────────────────────────────────────────────────────────────

export async function getJourneyReactions(journeyId: string) {
  const supabase = getSupabaseClient();
  
  const { data } = await supabase
    .from('journey_reactions')
    .select('emoji, user_id')
    .eq('journey_id', journeyId);

  // Group by emoji
  const grouped: Record<string, { emoji: string; count: number; user_ids: string[] }> = {};
  data?.forEach(r => {
    if (!grouped[r.emoji]) {
      grouped[r.emoji] = { emoji: r.emoji, count: 0, user_ids: [] };
    }
    grouped[r.emoji].count++;
    grouped[r.emoji].user_ids.push(r.user_id);
  });

  return Object.values(grouped);
}

export async function addJourneyReaction(journeyId: string, emoji: string) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  const { data } = await supabase
    .from('journey_reactions')
    .upsert({
      journey_id: journeyId,
      user_id: user.id,
      emoji,
    })
    .select()
    .single();

  return data;
}

export async function removeJourneyReaction(journeyId: string) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');

  await supabase
    .from('journey_reactions')
    .delete()
    .eq('journey_id', journeyId)
    .eq('user_id', user.id);
}

// ─────────────────────────────────────────────────────────────
// Storage (Photos, Avatars, Voice Notes)
// ─────────────────────────────────────────────────────────────

export async function uploadFile(uri: string, path: string, contentType: string) {
  const supabase = getSupabaseClient();
  
  // Convert local URI to blob
  const response = await fetch(uri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, {
      contentType,
      upsert: true,
    });

  if (error) throw error;

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return { path: data.path, url: publicUrl };
}

export async function uploadCoverImage(uri: string) {
  const { data: { user } } = await getUser();
  if (!user) throw new Error('Not authenticated');

  const path = `covers/${user.id}/${crypto.randomUUID()}.jpg`;
  return uploadFile(uri, path, 'image/jpeg');
}

export async function uploadAvatar(uri: string) {
  const { data: { user } } = await getUser();
  if (!user) throw new Error('Not authenticated');

  const path = `avatars/${user.id}/avatar.jpg`;
  const result = await uploadFile(uri, path, 'image/jpeg');

  // Update profile with avatar URL
  await updateProfile({ avatar_url: result.url });

  return result;
}

export async function uploadSessionPhoto(sessionId: string, uri: string, stopId: string) {
  const { data: { user } } = await getUser();
  if (!user) throw new Error('Not authenticated');

  const path = `sessions/${sessionId}/photos/${crypto.randomUUID()}.jpg`;
  const result = await uploadFile(uri, path, 'image/jpeg');

  // Save to database
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('session_photos')
    .insert({
      session_id: sessionId,
      stop_id: stopId,
      user_id: user.id,
      photo_url: result.url,
      storage_path: result.path,
    })
    .select()
    .single();

  return data;
}

export async function uploadVoiceNote(uri: string, sessionId: string, stopId: string) {
  const { data: { user } } = await getUser();
  if (!user) throw new Error('Not authenticated');

  const path = `sessions/${sessionId}/voice/${crypto.randomUUID()}.m4a`;
  const result = await uploadFile(uri, path, 'audio/mp4');

  // Update stop with voice note URL
  const supabase = getSupabaseClient();
  await supabase
    .from('stops')
    .update({ voice_note_url: result.url })
    .eq('id', stopId);

  return result;
}
