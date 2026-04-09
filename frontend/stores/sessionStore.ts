import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { Session, SpontaneousSession, SpontaneousStop } from '../types/journey';

interface SessionState {
  activeSession: Session | null;
  spontaneousSession: SpontaneousSession | null;
  loading: boolean;
  error: string | null;
  voiceNoteUploading: boolean;

  // Journey-based session actions
  fetchActiveSession: () => Promise<void>;
  startSession: (journeyId: string) => Promise<Session>;
  completeStop: (sessionId: string, stopId: string) => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  attachVoiceNote: (sessionId: string, stopId: string, uri: string) => Promise<void>;
  clearSession: () => void;
  clearError: () => void;

  // Spontaneous session actions (Sprint 7)
  fetchSpontaneousSession: () => Promise<void>;
  startSpontaneousSession: (title: string) => Promise<SpontaneousSession>;
  addSpontaneousStop: (sessionId: string, input: { title: string; description?: string; location?: { lat: number; lng: number; label: string } }) => Promise<SpontaneousStop>;
  completeSpontaneousStop: (sessionId: string, stopId: string) => Promise<void>;
  endSpontaneousSession: (sessionId: string) => Promise<void>;
  clearSpontaneousSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  spontaneousSession: null,
  loading: false,
  error: null,
  voiceNoteUploading: false,

  fetchActiveSession: async () => {
    set({ loading: true, error: null });
    try {
      const session: Session = await apiClient.getActiveSession();
      set({ activeSession: session, loading: false });
    } catch (error) {
      const session = get().activeSession;
      // If no active session, that's fine - just clear
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        set({ activeSession: null, loading: false });
      } else {
        const message =
          error instanceof Error
            ? error.message
            : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
            || 'Failed to fetch active session';
        set({ loading: false, error: message });
      }
    }
  },

  startSession: async (journeyId: string) => {
    set({ loading: true, error: null });
    try {
      const session: Session = await apiClient.startSoloSession(journeyId);
      set({ activeSession: session, loading: false });
      return session;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to start session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  completeStop: async (sessionId: string, stopId: string) => {
    set({ loading: true, error: null });
    try {
      const updatedSession: Session = await apiClient.completeStop(sessionId, stopId);
      set({ activeSession: updatedSession, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to check in at stop';
      set({ loading: false, error: message });
      throw error;
    }
  },

  endSession: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      await apiClient.endSession(sessionId);
      set({ activeSession: null, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to end session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  attachVoiceNote: async (sessionId: string, stopId: string, uri: string) => {
    set({ voiceNoteUploading: true, error: null });
    try {
      const { voice_note_url } = await apiClient.uploadVoiceNote(sessionId, uri, stopId);
      // Update the stop in active session with the voice note URL
      set((state) => {
        if (!state.activeSession) return state;
        const updatedStops = state.activeSession.stops.map((stop) =>
          stop.id === stopId ? { ...stop, voice_note_url } : stop
        );
        return {
          activeSession: { ...state.activeSession, stops: updatedStops },
          voiceNoteUploading: false,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to upload voice note';
      set({ voiceNoteUploading: false, error: message });
      throw error;
    }
  },

  clearSession: () => set({ activeSession: null }),
  clearError: () => set({ error: null }),

  // ── Spontaneous sessions ───────────────────────────────────────────────

  fetchSpontaneousSession: async () => {
    set({ loading: true, error: null });
    try {
      const session = await apiClient.getSpontaneousSession();
      set({ spontaneousSession: session, loading: false });
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        set({ spontaneousSession: null, loading: false });
      } else {
        const message =
          error instanceof Error
            ? error.message
            : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
            || 'Failed to fetch spontaneous session';
        set({ loading: false, error: message });
      }
    }
  },

  startSpontaneousSession: async (title: string) => {
    set({ loading: true, error: null });
    try {
      const session: SpontaneousSession = await apiClient.startSpontaneousSession(title);
      set({ spontaneousSession: session, loading: false });
      return session;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to start spontaneous session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  addSpontaneousStop: async (sessionId, input) => {
    set({ loading: true, error: null });
    try {
      const stop: SpontaneousStop = await apiClient.addSpontaneousStop(sessionId, input);
      set((state) => ({
        spontaneousSession: state.spontaneousSession
          ? { ...state.spontaneousSession, stops: [...state.spontaneousSession.stops, stop] }
          : null,
        loading: false,
      }));
      return stop;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to add stop';
      set({ loading: false, error: message });
      throw error;
    }
  },

  completeSpontaneousStop: async (sessionId, stopId) => {
    set({ loading: true, error: null });
    try {
      const updated: SpontaneousSession = await apiClient.completeSpontaneousStop(sessionId, stopId);
      set({ spontaneousSession: updated, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to check in';
      set({ loading: false, error: message });
      throw error;
    }
  },

  endSpontaneousSession: async (sessionId) => {
    set({ loading: true, error: null });
    try {
      await apiClient.endSpontaneousSession(sessionId);
      set({ spontaneousSession: null, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to end session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  clearSpontaneousSession: () => set({ spontaneousSession: null }),
}));
